"""Read-only, bounded Confluence Cloud ingestion.

Only the requested page, explicit child-page relationships, and supported page
attachments are followed. Credentials come exclusively from environment variables
and are never written to a snapshot. Authentication is sent only to the configured
HTTPS Atlassian tenant. Off-origin attachment redirects deliberately fail closed.

Official API references (verified 2026-10-09):
https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/
https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-children/
https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-attachment/
https://developer.atlassian.com/cloud/confluence/basic-auth-for-rest-apis/
"""

from __future__ import annotations

import hashlib
import os
import re
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import PurePosixPath
from typing import Callable, Iterator
from urllib.parse import parse_qs, quote, unquote, urljoin, urlsplit, urlunsplit

import requests
from requests.auth import HTTPBasicAuth

from .extract import parse_file, parse_html
from .models import Source

SUPPORTED_ATTACHMENTS = frozenset({".pdf", ".docx", ".txt"})
_ID = re.compile(r"[1-9][0-9]*\Z")
_ATTACHMENT_ID = re.compile(r"(?:att)?[1-9][0-9]*\Z")
_RETRYABLE = {429, 500, 502, 503, 504}


@dataclass
class Snapshot:
    """A refresh result; only complete snapshots may authorize pruning.

    ``sources`` contains only freshly fetched, readable, nonempty sources.
    ``seen_ids`` also includes identified sources that failed extraction/access.
    ``failed_ids`` may name a page whose subtree/list could not be verified.
    Callers should quarantine previous scope entries before each refresh and
    reactivate only verified sources, including when this snapshot is incomplete.
    """

    sources: list[Source]
    complete: bool
    failed_ids: list[str]
    warnings: list[str]
    scope_id: str
    seen_ids: list[str] = field(default_factory=list)


class ConfluenceError(RuntimeError):
    """A sanitized error that never embeds response bodies or credential URLs."""

    def __init__(self, message: str, *, status: int | None = None):
        super().__init__(message)
        self.status = status


class ConfluenceConfigurationError(ConfluenceError):
    """Missing environment credentials or unsafe/unsupported tenant settings."""


def _identifier(value: object) -> str:
    value = str(value)
    if not _ID.fullmatch(value):
        raise ConfluenceError("The API returned an invalid numeric content ID.")
    return value


def _page_key(page_id: str) -> str:
    return f"confluence:page:{page_id}"


def _attachment_key(attachment_id: str) -> str:
    return f"confluence:attachment:{attachment_id}"


def _attachment_identifier(value: object) -> str:
    # Attachment IDs are strings in the v2 schema. Accept both numeric IDs and
    # Confluence's att-prefixed representation, without accepting path syntax.
    value = str(value)
    if not _ATTACHMENT_ID.fullmatch(value):
        raise ConfluenceError("The API returned an invalid attachment ID.")
    return value


def normalized_base_url(value: str | None = None) -> str:
    """Validate the explicitly configured tenant without sending credentials."""
    base_url = os.getenv("CONFLUENCE_BASE_URL", "").strip() if value is None else value
    if not base_url:
        raise ConfluenceConfigurationError(
            "Set CONFLUENCE_BASE_URL in your local .env, or import a local export."
        )
    try:
        base = urlsplit(base_url)
        port = base.port
    except (TypeError, ValueError):
        raise ConfluenceConfigurationError("Invalid Confluence base URL.") from None
    if (
        base.scheme != "https"
        or not base.hostname
        or not re.fullmatch(r"[a-z0-9-]+\.atlassian\.net", base.hostname)
        or port not in (None, 443)
        or base.username is not None
        or base.password is not None
        or base.path.rstrip("/") != "/wiki"
        or base.query
        or base.fragment
        or any(c.isspace() or c == "\\" for c in base_url)
    ):
        raise ConfluenceConfigurationError(
            "Use an HTTPS Confluence Cloud tenant URL such as "
            "https://your-company.atlassian.net/wiki."
        )
    return f"https://{base.hostname}/wiki"


def configured_target() -> tuple[str, str]:
    """Resolve the tenant and root from local configuration; no real defaults."""
    base_url = normalized_base_url()
    root_id = os.getenv("CONFLUENCE_ROOT_ID", "").strip()
    if not _ID.fullmatch(root_id):
        raise ConfluenceConfigurationError(
            "Set CONFLUENCE_ROOT_ID to the numeric page ID in your local .env."
        )
    return base_url, root_id


def safe_source_url(url: str, base_url: str | None = None) -> bool:
    """Display links only to the validated tenant selected by this local user."""
    try:
        configured = urlsplit(normalized_base_url(base_url))
        parsed = urlsplit(url)
        if (any(c.isspace() or c == "\\" for c in url)
                or parsed.scheme != "https" or parsed.netloc != configured.netloc
                or parsed.username or parsed.password):
            return False
        if parsed.fragment and parsed.path != "/wiki/pages/viewpageattachments.action":
            return False
        if not parsed.query:
            return parsed.path.startswith("/wiki/")
        query = parse_qs(parsed.query, keep_blank_values=True, strict_parsing=True)
        return (parsed.path in {"/wiki/pages/viewpage.action", "/wiki/pages/viewpageattachments.action"}
                and set(query) == {"pageId"} and len(query["pageId"]) == 1
                and bool(_ID.fullmatch(query["pageId"][0])))
    except (ConfluenceError, TypeError, ValueError):
        return False


class ConfluenceClient:
    """Confluence Cloud client using CONFLUENCE_EMAIL / CONFLUENCE_API_TOKEN.

    Use an API token supported by the tenant REST API (email/token Basic auth).
    Scoped tokens requiring api.atlassian.com are not supported by this client.
    ``session`` and ``sleep`` are injectable for completely offline tests.
    """

    def __init__(
        self,
        base_url: str | None = None,
        *,
        session: requests.Session | None = None,
        timeout: tuple[float, float] = (5.0, 30.0),
        max_retries: int = 3,
        max_pages: int = 500,
        max_pagination_pages: int = 100,
        max_attachments: int = 2000,
        max_attachment_bytes: int = 25 * 1024 * 1024,
        max_redirects: int = 3,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.base_url = normalized_base_url(base_url)
        base = urlsplit(self.base_url)
        email = os.environ.get("CONFLUENCE_EMAIL", "").strip()
        token = os.environ.get("CONFLUENCE_API_TOKEN", "").strip()
        if not email or not token:
            raise ConfluenceConfigurationError(
                "Set CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN in the environment."
            )
        if min(max_pages, max_pagination_pages, max_attachments, max_attachment_bytes) < 1:
            raise ConfluenceConfigurationError("Ingestion limits must be positive.")
        if max_retries < 0 or max_redirects < 0 or any(t <= 0 for t in timeout):
            raise ConfluenceConfigurationError("Invalid timeout or retry limit.")
        self._origin = ("https", base.hostname, 443)
        self._session = session if session is not None else requests.Session()
        self._session.auth = HTTPBasicAuth(email, token)
        # Do not silently load alternate .netrc credentials or proxy credentials.
        self._session.trust_env = False
        self._timeout = timeout
        self._max_retries = max_retries
        self._max_pages = max_pages
        self._max_pagination_pages = max_pagination_pages
        self._max_attachments = max_attachments
        self._max_attachment_bytes = max_attachment_bytes
        self._max_redirects = max_redirects
        self._sleep = sleep

    @classmethod
    def from_env(cls, base_url: str | None = None, **kwargs) -> ConfluenceClient:
        return cls(base_url=base_url, **kwargs)

    def close(self) -> None:
        self._session.close()

    def __enter__(self) -> ConfluenceClient:
        return self

    def __exit__(self, *exc_info) -> None:
        self.close()

    def _safe_url(self, url: str) -> str:
        """Validate before every request, including redirects and pagination."""
        if not isinstance(url, str) or any(c.isspace() or c == "\\" for c in url):
            raise ConfluenceError("Refused an unsafe API or attachment URL.")
        try:
            parsed = urlsplit(url)
            origin = (parsed.scheme, parsed.hostname, parsed.port if parsed.port is not None else 443)
        except ValueError:
            raise ConfluenceError("Refused an invalid API or attachment URL.") from None
        if (
            origin != self._origin
            or parsed.username is not None
            or parsed.password is not None
            or parsed.fragment
            or not parsed.path.startswith("/wiki/")
        ):
            raise ConfluenceError(
                "Refused an off-origin or unsafe URL; credentials were not sent. "
                "Off-origin CDN attachment downloads are intentionally unsupported."
            )
        decoded_path = unquote(parsed.path)
        if (
            any(part in (".", "..") for part in decoded_path.split("/"))
            or "\\" in decoded_path
            or any(ord(c) < 32 or ord(c) == 127 for c in decoded_path)
        ):
            raise ConfluenceError("Refused path traversal in an API or attachment URL.")
        return urlunsplit(parsed)

    def _link_url(self, link: str, *, context: str | None = None) -> str:
        if not isinstance(link, str) or not link:
            raise ConfluenceError("The API returned an empty or invalid link.")
        # Confluence often returns context-relative /download/... and /api/...
        # links, whereas Link headers normally include the /wiki context.
        if link.startswith(("/download/", "/api/")):
            link = "/wiki" + link
        return self._safe_url(urljoin(context or self.base_url + "/", link))

    def _retry_delay(self, value: str | None, attempt: int) -> float:
        delay = min(0.5 * 2**attempt, 8.0)
        if value:
            try:
                delay = max(0.0, float(value))
            except (ValueError, OverflowError):
                try:
                    then = parsedate_to_datetime(value)
                    if then.tzinfo is None:
                        then = then.replace(tzinfo=timezone.utc)
                    delay = max(0.0, (then - datetime.now(timezone.utc)).total_seconds())
                except (ValueError, OverflowError, TypeError):
                    pass
        if delay > 60 or not delay < float("inf"):
            raise ConfluenceError("Server requested a long retry delay; retry the sync later.", status=429)
        return delay

    def _request(self, url: str, *, download: bool = False) -> requests.Response:
        url = self._safe_url(url)
        for attempt in range(self._max_retries + 1):
            try:
                response = self._session.get(
                    url,
                    timeout=self._timeout,
                    allow_redirects=False,
                    stream=download,
                    headers={"Accept": "*/*" if download else "application/json"},
                )
            except requests.RequestException:
                if attempt < self._max_retries:
                    self._sleep(self._retry_delay(None, attempt))
                    continue
                raise ConfluenceError("Network or TLS error while reading Confluence.") from None
            status = response.status_code
            if status == 200 or (download and status in (301, 302, 303, 307, 308)):
                return response
            retry_after = response.headers.get("Retry-After")
            response.close()
            if status in _RETRYABLE and attempt < self._max_retries:
                self._sleep(self._retry_delay(retry_after, attempt))
                continue
            explanations = {
                401: "Unauthorized; check the email and API token.",
                403: "Forbidden; this account cannot read the requested content.",
                404: "Not found or not visible to this account.",
                429: "Rate limited; retry the sync later.",
            }
            message = explanations.get(status, "The Confluence request failed.")
            if 300 <= status < 400:
                message = "Unexpected API redirect; verify authentication and the tenant URL."
            raise ConfluenceError(f"HTTP {status}: {message}", status=status)
        raise AssertionError("Retry loop must return or raise")

    def _json(self, url: str) -> tuple[dict, str]:
        response = self._request(url)
        try:
            try:
                data = response.json()
            except ValueError:
                raise ConfluenceError("Confluence returned invalid JSON, possibly a login page.") from None
            if not isinstance(data, dict):
                raise ConfluenceError("Confluence returned an unexpected JSON structure.")
            return data, response.headers.get("Link", "")
        finally:
            response.close()

    def _items(self, url: str) -> Iterator[dict]:
        """Only paginate this exact collection; never follow unrelated API links."""
        path = urlsplit(url).path
        visited: set[str] = set()
        for _ in range(self._max_pagination_pages):
            url = self._safe_url(url)
            if url in visited:
                raise ConfluenceError("Pagination repeated a cursor; the list is incomplete.")
            if urlsplit(url).path != path:
                raise ConfluenceError("Refused pagination outside the requested collection.")
            visited.add(url)
            data, link_header = self._json(url)
            items = data.get("results")
            if not isinstance(items, list) or any(not isinstance(i, dict) for i in items):
                raise ConfluenceError("Confluence returned an invalid collection.")
            yield from items
            links = data.get("_links") or {}
            if not isinstance(links, dict):
                raise ConfluenceError("Confluence returned invalid pagination links.")
            next_link = links.get("next")
            if not next_link and link_header:
                for link in requests.utils.parse_header_links(link_header):
                    if "next" in link.get("rel", "").split():
                        next_link = link.get("url")
                        break
            if not next_link:
                return
            url = self._link_url(next_link, context=url)
        raise ConfluenceError("Pagination limit reached; the list is incomplete.")

    def _download(self, url: str, *, page_id: str) -> bytes:
        visited: set[str] = set()
        for _ in range(self._max_redirects + 1):
            url = self._safe_url(url)
            if not urlsplit(url).path.startswith(f"/wiki/download/attachments/{page_id}/"):
                raise ConfluenceError("Refused a download outside the requested page's attachments.")
            if url in visited:
                raise ConfluenceError("Attachment download redirected in a loop.")
            visited.add(url)
            response = self._request(url, download=True)
            try:
                if response.status_code != 200:
                    location = response.headers.get("Location", "")
                    url = self._link_url(location, context=url)
                    continue
                content_type = response.headers.get("Content-Type", "").lower().split(";", 1)[0]
                if content_type in ("text/html", "application/xhtml+xml"):
                    raise ConfluenceError("Attachment download returned HTML, possibly a login page.")
                try:
                    declared_size = int(response.headers.get("Content-Length", 0))
                except (ValueError, TypeError):
                    declared_size = 0
                if declared_size > self._max_attachment_bytes:
                    raise ConfluenceError("Attachment exceeds the configured download size limit.")
                chunks: list[bytes] = []
                size = 0
                try:
                    for chunk in response.iter_content(chunk_size=64 * 1024):
                        size += len(chunk)
                        if size > self._max_attachment_bytes:
                            raise ConfluenceError("Attachment exceeds the configured download size limit.")
                        chunks.append(chunk)
                except requests.RequestException:
                    raise ConfluenceError("Attachment download was interrupted; retry the sync.") from None
                return b"".join(chunks)
            finally:
                response.close()
        raise ConfluenceError("Attachment redirect limit reached.")

    @staticmethod
    def _version(data: dict) -> tuple[str, str]:
        version = data.get("version") or {}
        if not isinstance(version, dict):
            raise ConfluenceError("Confluence returned invalid version metadata.")
        return str(version.get("number", "")), str(version.get("createdAt", ""))

    def fetch_snapshot(
        self,
        root_id: str | None = None,
        *,
        include_descendants: bool = False,
        include_attachments: bool = False,
        progress: Callable[[str], None] | None = None,
    ) -> Snapshot:
        """Fetch a fresh bounded snapshot without touching existing local data.

        Descendants are reached only through direct child-page relationships.
        Non-page containers are reported as incomplete rather than silently
        claiming coverage of any pages nested below them. Unsupported attachment
        types are excluded deliberately and do not make the snapshot incomplete.
        """
        if root_id is None:
            root_id = os.getenv("CONFLUENCE_ROOT_ID", "").strip()
        root_id = _identifier(root_id)
        result = Snapshot([], True, [], [], f"confluence:{self.base_url}:page:{root_id}")
        seen: set[str] = set()
        failed: set[str] = set()
        discovered = {root_id}
        queue = deque([(root_id, "")])
        attachment_count = 0
        page_count = 0

        def note_seen(source_id: str) -> None:
            if source_id not in seen:
                seen.add(source_id)
                result.seen_ids.append(source_id)

        def fail(source_id: str, error: Exception) -> None:
            result.complete = False
            if source_id not in failed:
                failed.add(source_id)
                result.failed_ids.append(source_id)
            result.warnings.append(f"{source_id}: {error}")

        while queue:
            page_id, parent_id = queue.popleft()
            source_id = _page_key(page_id)
            note_seen(source_id)
            page_count += 1
            api_url = f"{self.base_url}/api/v2/pages/{page_id}"
            try:
                page, _ = self._json(api_url + "?body-format=storage&include-version=true")
                if _identifier(page.get("id")) != page_id:
                    raise ConfluenceError("The API returned a different page than requested.")
                if page.get("status", "current") != "current":
                    raise ConfluenceError("Page is not in current published status.")
            except ConfluenceError as error:
                fail(source_id, error)
                continue

            try:
                body = page.get("body") or {}
                storage = body.get("storage") if isinstance(body, dict) else None
                html = storage.get("value") if isinstance(storage, dict) else None
                if not isinstance(html, str) or not html.strip():
                    raise ConfluenceError("Page storage body is empty or missing; it was not indexed.")
                try:
                    text = parse_html(html).strip()
                except Exception:
                    raise ConfluenceError("Page text extraction failed; it was not indexed.") from None
                if not text:
                    raise ConfluenceError("Page has no extractable text; it was not indexed.")
                version, modified = self._version(page)
                result.sources.append(Source(
                    source_id=source_id,
                    kind="confluence_page",
                    title=str(page.get("title") or f"Page {page_id}"),
                    url=f"{self.base_url}/pages/viewpage.action?pageId={page_id}",
                    text=text,
                    version=version,
                    modified=modified,
                    parent_id=_page_key(parent_id) if parent_id else "",
                    content_hash=hashlib.sha256(text.encode("utf-8")).hexdigest(),
                ))
                if progress:
                    progress(f"Read page {page_id} ({page_count} pages checked).")
            except ConfluenceError as error:
                fail(source_id, error)

            if include_attachments:
                try:
                    for attachment in self._items(api_url + "/attachments?limit=100"):
                        attachment_id = _attachment_identifier(attachment.get("id"))
                        attachment_source_id = _attachment_key(attachment_id)
                        if attachment_source_id in seen:
                            continue
                        note_seen(attachment_source_id)
                        filename = str(attachment.get("title") or "")
                        if PurePosixPath(filename).suffix.lower() not in SUPPORTED_ATTACHMENTS:
                            result.warnings.append(
                                f"{attachment_source_id}: Skipped unsupported attachment type "
                                "(only PDF, DOCX and TXT are enabled)."
                            )
                            continue
                        attachment_count += 1
                        if attachment_count > self._max_attachments:
                            raise ConfluenceError("Attachment count limit reached; the list is incomplete.")
                        try:
                            if str(attachment.get("pageId", page_id)) != page_id:
                                raise ConfluenceError("Attachment does not belong to the requested page.")
                            if attachment.get("status", "current") != "current":
                                raise ConfluenceError("Attachment is not in current published status.")
                            links = attachment.get("_links") or {}
                            if not isinstance(links, dict):
                                raise ConfluenceError("Attachment has invalid download metadata.")
                            link = attachment.get("downloadLink") or links.get("download")
                            download_url = self._link_url(link)
                            if not urlsplit(download_url).path.startswith(f"/wiki/download/attachments/{page_id}/"):
                                raise ConfluenceError("Refused a download outside the requested page's attachments.")
                            data = self._download(download_url, page_id=page_id)
                            try:
                                extraction = parse_file(filename, data)
                            except Exception:
                                raise ConfluenceError("Attachment text extraction failed; it was not indexed.") from None
                            text = extraction.text.strip()
                            for warning in extraction.warnings:
                                result.warnings.append(f"{attachment_source_id}: {warning}")
                            if not text:
                                raise ConfluenceError("Attachment has no extractable text; it was not indexed.")
                            version, modified = self._version(attachment)
                            result.sources.append(Source(
                                source_id=attachment_source_id,
                                kind="confluence_attachment",
                                title=filename,
                                url=f"{self.base_url}/pages/viewpageattachments.action?pageId={page_id}#{quote(filename, safe='')}",
                                text=text,
                                version=version,
                                modified=modified,
                                parent_id=source_id,
                                filename=filename,
                                content_hash=hashlib.sha256(text.encode("utf-8")).hexdigest(),
                            ))
                            if progress:
                                progress(f"Read attachment {attachment_id} ({attachment_count} supported attachments checked).")
                        except ConfluenceError as error:
                            fail(attachment_source_id, error)
                except ConfluenceError as error:
                    fail(source_id, error)

            if include_descendants:
                try:
                    for child in self._items(api_url + "/direct-children?limit=100"):
                        child_id = _identifier(child.get("id"))
                        if child.get("type") != "page":
                            fail(source_id, ConfluenceError(
                                f"Skipped non-page child {child_id}; pages nested under non-page containers are not followed."
                            ))
                            continue
                        if child_id in discovered:
                            continue
                        if len(discovered) >= self._max_pages:
                            raise ConfluenceError("Page count limit reached; descendants are incomplete.")
                        discovered.add(child_id)
                        note_seen(_page_key(child_id))
                        queue.append((child_id, page_id))
                except ConfluenceError as error:
                    fail(source_id, error)
        return result
