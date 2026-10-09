"""Offline tests: no credentials or live Confluence calls are needed."""

from types import SimpleNamespace

import pytest
import requests

from handbook_assistant import confluence
from handbook_assistant.confluence import (
    ConfluenceClient,
    ConfluenceConfigurationError,
    ConfluenceError,
)


ROOT = "123456"
BASE = "https://example-tenant.atlassian.net/wiki"


def page_url(page_id=ROOT):
    return f"{BASE}/api/v2/pages/{page_id}?body-format=storage&include-version=true"


def children_url(page_id=ROOT):
    return f"{BASE}/api/v2/pages/{page_id}/direct-children?limit=100"


def attachments_url(page_id=ROOT):
    return f"{BASE}/api/v2/pages/{page_id}/attachments?limit=100"


def page(page_id=ROOT, text="<h1>Handbook</h1><p>Use approved releases.</p>", **kwargs):
    return {
        "id": str(page_id),
        "status": "current",
        "title": f"Handbook {page_id}",
        "body": {"storage": {"value": text}},
        "version": {"number": 7, "createdAt": "2026-10-01T12:00:00Z"},
        **kwargs,
    }


def listing(items=(), next_link=None):
    data = {"results": list(items), "_links": {}}
    if next_link:
        data["_links"]["next"] = next_link
    return data


def attachment(attachment_id="123", filename="guide.txt", page_id=ROOT, **kwargs):
    return {
        "id": attachment_id,
        "pageId": page_id,
        "title": filename,
        "status": "current",
        "downloadLink": f"/download/attachments/{page_id}/{filename}",
        "version": {"number": 2, "createdAt": "2026-10-02T12:00:00Z"},
        **kwargs,
    }


class Response:
    def __init__(self, data=None, *, status=200, headers=None, content=b"", chunks=None):
        self.data = data
        self.status_code = status
        self.headers = headers or {}
        self.content = content
        self.chunks = chunks
        self.closed = False

    def json(self):
        if isinstance(self.data, Exception):
            raise self.data
        return self.data

    def iter_content(self, chunk_size):
        for chunk in self.chunks if self.chunks is not None else [self.content]:
            if isinstance(chunk, Exception):
                raise chunk
            yield chunk

    def close(self):
        self.closed = True


class Session:
    def __init__(self, routes):
        self.routes = {url: (list(value) if isinstance(value, list) else [value]) for url, value in routes.items()}
        self.calls = []
        self.closed = False

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        assert kwargs["allow_redirects"] is False
        assert kwargs["timeout"] == (5.0, 30.0)
        assert url.startswith(BASE + "/")
        if url not in self.routes or not self.routes[url]:
            raise AssertionError(f"Unexpected request: {url}")
        response = self.routes[url].pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    def close(self):
        self.closed = True


@pytest.fixture(autouse=True)
def environment(monkeypatch):
    monkeypatch.setenv("CONFLUENCE_BASE_URL", BASE)
    monkeypatch.setenv("CONFLUENCE_ROOT_ID", ROOT)
    monkeypatch.setenv("CONFLUENCE_EMAIL", "test@example.invalid")
    monkeypatch.setenv("CONFLUENCE_API_TOKEN", "test-token-never-print")


def client(routes, **kwargs):
    session = Session(routes)
    sleeps = []
    instance = ConfluenceClient.from_env(session=session, sleep=sleeps.append, **kwargs)
    return instance, session, sleeps


def test_page_only_is_the_default_and_never_crawls_body_links():
    instance, session, _ = client({page_url(): Response(page(text='<p>Read <a href="https://example.com/private">this guide</a>.</p>'))})
    snapshot = instance.fetch_snapshot()
    assert snapshot.complete
    assert snapshot.failed_ids == []
    assert len(snapshot.sources) == 1
    source = snapshot.sources[0]
    assert source.source_id == f"confluence:page:{ROOT}"
    assert source.kind == "confluence_page"
    assert source.text == "Read this guide."
    assert source.version == "7"
    assert source.modified == "2026-10-01T12:00:00Z"
    assert len(source.content_hash) == 64
    assert source.url == f"{BASE}/pages/viewpage.action?pageId={ROOT}"
    assert [call[0] for call in session.calls] == [page_url()]
    assert session.auth.username == "test@example.invalid"
    assert session.auth.password == "test-token-never-print"
    assert session.trust_env is False
    assert "test-token" not in repr(snapshot)


def test_credentials_are_required_only_from_environment(monkeypatch):
    monkeypatch.delenv("CONFLUENCE_API_TOKEN")
    with pytest.raises(ConfluenceConfigurationError, match="CONFLUENCE_API_TOKEN"):
        ConfluenceClient()


@pytest.mark.parametrize("base", [
    "http://example-tenant.atlassian.net/wiki",
    "https://example-tenant.atlassian.net.evil.invalid/wiki",
    "https://example-tenant.atlassian.net:444/wiki",
    "https://user:secret@example-tenant.atlassian.net/wiki",
    "https://example-tenant.atlassian.net/wiki?token=secret",
    "https://example-tenant.atlassian.net/wiki#fragment",
    "https://example-tenant.atlassian.net/jira",
    "https://example-tenant.atlassian.net\\evil.invalid/wiki",
])
def test_rejects_unsafe_base_url_without_echoing_it(base):
    with pytest.raises(ConfluenceConfigurationError) as error:
        ConfluenceClient(base)
    assert "secret" not in str(error.value)


def test_root_id_must_be_numeric():
    instance, session, _ = client({})
    with pytest.raises(ConfluenceError):
        instance.fetch_snapshot("../pages")
    assert session.calls == []


@pytest.mark.parametrize("status, explanation", [(401, "Unauthorized"), (403, "Forbidden"), (404, "Not found or not visible")])
def test_access_failures_are_distinct_and_sanitized(status, explanation):
    response = Response({"secret": "never-expose-response-body"}, status=status)
    instance, session, _ = client({page_url(): response})
    snapshot = instance.fetch_snapshot(include_descendants=True, include_attachments=True)
    assert not snapshot.complete
    assert snapshot.sources == []
    assert snapshot.failed_ids == [f"confluence:page:{ROOT}"]
    assert snapshot.seen_ids == snapshot.failed_ids
    assert f"HTTP {status}" in snapshot.warnings[0]
    assert explanation in snapshot.warnings[0]
    assert "never-expose" not in repr(snapshot)
    assert "test-token" not in repr(snapshot)
    assert len(session.calls) == 1
    assert response.closed


@pytest.mark.parametrize("html", ["", "  ", "<script>secret()</script>"])
def test_empty_root_is_an_incomplete_failure(html):
    instance, _, _ = client({page_url(): Response(page(text=html))})
    snapshot = instance.fetch_snapshot()
    assert not snapshot.complete
    assert snapshot.sources == []
    assert snapshot.failed_ids == [f"confluence:page:{ROOT}"]


def test_missing_storage_body_is_not_a_success():
    instance, _, _ = client({page_url(): Response(page(body={}))})
    snapshot = instance.fetch_snapshot()
    assert not snapshot.complete
    assert "empty or missing" in snapshot.warnings[0]


def test_rejects_wrong_page_and_noncurrent_page():
    for data in [page("999"), page(status="draft")]:
        instance, _, _ = client({page_url(): Response(data)})
        snapshot = instance.fetch_snapshot()
        assert not snapshot.complete
        assert snapshot.sources == []


def test_descendants_use_breadth_first_traversal_body_and_header_pagination():
    next_url = f"{BASE}/api/v2/pages/{ROOT}/direct-children?cursor=second"
    next_child_url = f"{BASE}/api/v2/pages/11/direct-children?cursor=last"
    routes = {
        page_url(): Response(page()),
        children_url(): Response(listing([{"id": "11", "type": "page"}], f"/wiki/api/v2/pages/{ROOT}/direct-children?cursor=second")),
        next_url: Response(listing([{"id": "12", "type": "page"}, {"id": ROOT, "type": "page"}])),
        page_url("11"): Response(page("11")),
        children_url("11"): Response(listing(), headers={"Link": '</wiki/api/v2/pages/11/direct-children?cursor=last>; rel="next"'}),
        next_child_url: Response(listing([{"id": "13", "type": "page"}])),
        page_url("12"): Response(page("12")),
        children_url("12"): Response(listing()),
        page_url("13"): Response(page("13")),
        children_url("13"): Response(listing()),
    }
    instance, session, _ = client(routes)
    messages = []
    snapshot = instance.fetch_snapshot(include_descendants=True, progress=messages.append)
    assert snapshot.complete
    assert [s.source_id for s in snapshot.sources] == [f"confluence:page:{i}" for i in [ROOT, "11", "12", "13"]]
    assert snapshot.sources[-1].parent_id == "confluence:page:11"
    page_calls = [url for url, _ in session.calls if "body-format" in url]
    assert page_calls == [page_url(i) for i in [ROOT, "11", "12", "13"]]
    assert len(messages) == 4


def test_scope_id_is_stable_when_options_narrow():
    instance, _, _ = client({page_url(): [Response(page()), Response(page())], children_url(): Response(listing()), attachments_url(): Response(listing())})
    expanded = instance.fetch_snapshot(include_descendants=True, include_attachments=True)
    narrowed = instance.fetch_snapshot()
    assert expanded.scope_id == narrowed.scope_id == f"confluence:{BASE}:page:{ROOT}"


def test_child_access_failure_retains_other_verified_sources_but_is_incomplete():
    instance, _, _ = client({
        page_url(): Response(page()),
        children_url(): Response(listing([{"id": "11", "type": "page"}, {"id": "12", "type": "page"}])),
        page_url("11"): Response(status=403),
        page_url("12"): Response(page("12")),
        children_url("12"): Response(listing()),
    })
    snapshot = instance.fetch_snapshot(include_descendants=True)
    assert not snapshot.complete
    assert snapshot.failed_ids == ["confluence:page:11"]
    assert [s.source_id for s in snapshot.sources] == [f"confluence:page:{ROOT}", "confluence:page:12"]


def test_nonpage_containers_are_disclosed_without_following_them():
    instance, session, _ = client({page_url(): Response(page()), children_url(): Response(listing([{"id": "99", "type": "folder"}]))})
    snapshot = instance.fetch_snapshot(include_descendants=True)
    assert not snapshot.complete
    assert "non-page child 99" in " ".join(snapshot.warnings)
    assert len(session.calls) == 2


@pytest.mark.parametrize("next_link", [
    "https://evil.invalid/wiki/api/v2/pages/1?token=secret",
    "/wiki/api/v2/pages?cursor=all",
    f"http://example-tenant.atlassian.net/wiki/api/v2/pages/{ROOT}/direct-children?cursor=x",
])
def test_unsafe_or_unrelated_pagination_is_never_requested(next_link):
    instance, session, _ = client({page_url(): Response(page()), children_url(): Response(listing(next_link=next_link))})
    snapshot = instance.fetch_snapshot(include_descendants=True)
    assert not snapshot.complete
    assert len(session.calls) == 2
    assert "secret" not in repr(snapshot)


def test_repeated_pagination_and_page_limit_are_incomplete():
    instance, session, _ = client({page_url(): Response(page()), children_url(): Response(listing(next_link=children_url()))})
    snapshot = instance.fetch_snapshot(include_descendants=True)
    assert not snapshot.complete
    assert "repeated a cursor" in " ".join(snapshot.warnings)
    assert len(session.calls) == 2

    instance, session, _ = client({page_url(): Response(page()), children_url(): Response(listing([{"id": "11", "type": "page"}]))}, max_pages=1)
    snapshot = instance.fetch_snapshot(include_descendants=True)
    assert not snapshot.complete
    assert "Page count limit" in " ".join(snapshot.warnings)
    assert len(session.calls) == 2


def test_collection_limit_is_incomplete():
    instance, session, _ = client({page_url(): Response(page()), children_url(): Response(listing(next_link="?cursor=next"))}, max_pagination_pages=1)
    snapshot = instance.fetch_snapshot(include_descendants=True)
    assert not snapshot.complete
    assert "Pagination limit" in " ".join(snapshot.warnings)
    assert len(session.calls) == 2


def test_supported_attachments_are_downloaded_and_unsupported_files_skipped():
    instance, session, _ = client({
        page_url(): Response(page()),
        attachments_url(): Response(listing([attachment(filename="Guide.TXT"), attachment("124", "image.png")])),
        f"{BASE}/download/attachments/{ROOT}/Guide.TXT": Response(content=b"Always verify the release manifest.", headers={"Content-Type": "text/plain"}),
    })
    snapshot = instance.fetch_snapshot(include_attachments=True)
    assert snapshot.complete
    assert len(snapshot.sources) == 2
    source = snapshot.sources[1]
    assert source.source_id == "confluence:attachment:123"
    assert source.kind == "confluence_attachment"
    assert source.filename == "Guide.TXT"
    assert source.parent_id == f"confluence:page:{ROOT}"
    assert source.version == "2"
    assert "unsupported" in " ".join(snapshot.warnings)
    assert len(session.calls) == 3


def test_prefixed_attachment_ids_are_supported():
    instance, _, _ = client({
        page_url(): Response(page()),
        attachments_url(): Response(listing([attachment("att123")])),
        f"{BASE}/download/attachments/{ROOT}/guide.txt": Response(content=b"Handbook attachment."),
    })
    snapshot = instance.fetch_snapshot(include_attachments=True)
    assert snapshot.complete
    assert snapshot.sources[-1].source_id == "confluence:attachment:att123"


@pytest.mark.parametrize("extension", ["pdf", "docx"])
def test_pdf_docx_bytes_use_the_local_extractor(monkeypatch, extension):
    filename = f"guide.{extension}"
    recorded = []
    def extract(name, data):
        recorded.append((name, data))
        return SimpleNamespace(text="Extracted policy text", warnings=["Extraction notice"])
    monkeypatch.setattr(confluence, "parse_file", extract)
    instance, _, _ = client({
        page_url(): Response(page()),
        attachments_url(): Response(listing([attachment(filename=filename)])),
        f"{BASE}/download/attachments/{ROOT}/{filename}": Response(content=b"file-bytes"),
    })
    snapshot = instance.fetch_snapshot(include_attachments=True)
    assert recorded == [(filename, b"file-bytes")]
    assert snapshot.sources[-1].text == "Extracted policy text"
    assert "Extraction notice" in " ".join(snapshot.warnings)


@pytest.mark.parametrize("link", [
    "https://evil.invalid/file.txt?token=secret",
    f"https://example-tenant.atlassian.net:0/wiki/download/attachments/{ROOT}/guide.txt",
    "/wiki/download/attachments/999/guide.txt",
    "https://test:secret@example-tenant.atlassian.net/wiki/download/attachments/123456/guide.txt",
])
def test_download_link_is_limited_to_this_page_and_tenant(link):
    instance, session, _ = client({page_url(): Response(page()), attachments_url(): Response(listing([attachment(downloadLink=link)]))})
    snapshot = instance.fetch_snapshot(include_attachments=True)
    assert not snapshot.complete
    assert snapshot.failed_ids == ["confluence:attachment:123"]
    assert len(session.calls) == 2
    assert "secret" not in repr(snapshot)


def test_off_origin_redirect_never_receives_credentials_or_a_request():
    download = f"{BASE}/download/attachments/{ROOT}/guide.txt"
    redirect = Response(status=302, headers={"Location": "https://api.media.atlassian.com/private?token=secret"})
    instance, session, _ = client({page_url(): Response(page()), attachments_url(): Response(listing([attachment()])), download: redirect})
    snapshot = instance.fetch_snapshot(include_attachments=True)
    assert not snapshot.complete
    assert len(session.calls) == 3
    assert "off-origin" in " ".join(snapshot.warnings)
    assert "secret" not in repr(snapshot)
    assert redirect.closed


def test_same_origin_redirect_is_checked_and_followed_manually():
    download = f"{BASE}/download/attachments/{ROOT}/guide.txt"
    instance, session, _ = client({
        page_url(): Response(page()), attachments_url(): Response(listing([attachment()])),
        download: Response(status=302, headers={"Location": "?version=2"}),
        download + "?version=2": Response(content=b"Handbook attachment."),
    })
    snapshot = instance.fetch_snapshot(include_attachments=True)
    assert snapshot.complete
    assert len(snapshot.sources) == 2
    assert len(session.calls) == 4


@pytest.mark.parametrize("location", [
    "/wiki/api/v2/pages/999",
    "/wiki/download/attachments/999/guide.txt",
    f"/wiki/download/attachments/{ROOT}/%2e%2e/999/guide.txt",
])
def test_same_origin_redirect_cannot_escape_attachment_scope(location):
    download = f"{BASE}/download/attachments/{ROOT}/guide.txt"
    instance, session, _ = client({
        page_url(): Response(page()), attachments_url(): Response(listing([attachment()])),
        download: Response(status=302, headers={"Location": location}),
    })
    snapshot = instance.fetch_snapshot(include_attachments=True)
    assert not snapshot.complete
    assert len(session.calls) == 3


@pytest.mark.parametrize("response", [
    Response(content=b"<html>Sign in</html>", headers={"Content-Type": "text/html; charset=utf-8"}),
    Response(content=b"too large", headers={"Content-Length": "99999999"}),
    Response(chunks=[b"x" * 4, b"x" * 4]),
    Response(chunks=[b"first", requests.ConnectionError("secret-body")]),
])
def test_bad_or_oversized_attachment_is_quarantinable(response):
    instance, _, _ = client({
        page_url(): Response(page()), attachments_url(): Response(listing([attachment()])),
        f"{BASE}/download/attachments/{ROOT}/guide.txt": response,
    }, max_attachment_bytes=6)
    snapshot = instance.fetch_snapshot(include_attachments=True)
    assert not snapshot.complete
    assert snapshot.failed_ids == ["confluence:attachment:123"]
    assert len(snapshot.sources) == 1
    assert "secret-body" not in repr(snapshot)
    assert response.closed


def test_download_or_extraction_errors_do_not_disclose_library_exceptions(monkeypatch):
    def fail(*args):
        raise ValueError("secret parsed content")
    monkeypatch.setattr(confluence, "parse_file", fail)
    instance, _, _ = client({page_url(): Response(page()), attachments_url(): Response(listing([attachment()])), f"{BASE}/download/attachments/{ROOT}/guide.txt": Response(content=b"data")})
    snapshot = instance.fetch_snapshot(include_attachments=True)
    assert not snapshot.complete
    assert "secret" not in repr(snapshot)
    assert "extraction failed" in " ".join(snapshot.warnings)


def test_rate_limit_and_transient_server_errors_retry_with_bounded_delay():
    first = Response(status=429, headers={"Retry-After": "2"})
    second = Response(status=503)
    instance, session, sleeps = client({page_url(): [first, second, Response(page())]})
    snapshot = instance.fetch_snapshot()
    assert snapshot.complete
    assert sleeps == [2.0, 1.0]
    assert len(session.calls) == 3
    assert first.closed and second.closed


def test_network_errors_are_retried_without_disclosing_error_details():
    instance, session, sleeps = client({page_url(): [requests.ConnectionError("test-token-never-print"), Response(page())]})
    snapshot = instance.fetch_snapshot()
    assert snapshot.complete
    assert sleeps == [0.5]
    assert len(session.calls) == 2


def test_long_retry_after_is_a_clear_failure_without_early_retry():
    instance, session, sleeps = client({page_url(): Response(status=429, headers={"Retry-After": "3600"})})
    snapshot = instance.fetch_snapshot()
    assert not snapshot.complete
    assert "long retry delay" in " ".join(snapshot.warnings)
    assert len(session.calls) == 1
    assert sleeps == []


@pytest.mark.parametrize("data", [ValueError("sensitive body"), [], {"results": "wrong"}])
def test_invalid_json_and_collection_shapes_fail_cleanly(data):
    if isinstance(data, dict):
        instance, _, _ = client({page_url(): Response(page()), children_url(): Response(data)})
        snapshot = instance.fetch_snapshot(include_descendants=True)
    else:
        instance, _, _ = client({page_url(): Response(data)})
        snapshot = instance.fetch_snapshot()
    assert not snapshot.complete
    assert "sensitive" not in repr(snapshot)


def test_context_manager_closes_session():
    instance, session, _ = client({})
    with instance:
        pass
    assert session.closed


def test_missing_tenant_blocks_before_a_session_is_created(monkeypatch):
    monkeypatch.delenv("CONFLUENCE_BASE_URL")
    monkeypatch.setattr(requests, "Session", lambda: pytest.fail("No HTTP session should be created"))
    with pytest.raises(ConfluenceConfigurationError, match="CONFLUENCE_BASE_URL"):
        ConfluenceClient.from_env()


def test_target_uses_only_local_configuration(monkeypatch):
    monkeypatch.setenv("CONFLUENCE_BASE_URL", "https://another-example.atlassian.net/wiki/")
    monkeypatch.setenv("CONFLUENCE_ROOT_ID", "987654")
    assert confluence.configured_target() == ("https://another-example.atlassian.net/wiki", "987654")
    assert confluence.safe_source_url("https://another-example.atlassian.net/wiki/pages/viewpage.action?pageId=987654")
    assert not confluence.safe_source_url(BASE + "/pages/viewpage.action?pageId=" + ROOT)


@pytest.mark.parametrize("root_id", ["", "0", "not-a-page", "../123", "123?secret=value"])
def test_invalid_configured_root_is_rejected_without_echo(monkeypatch, root_id):
    monkeypatch.setenv("CONFLUENCE_ROOT_ID", root_id)
    with pytest.raises(ConfluenceConfigurationError, match="CONFLUENCE_ROOT_ID") as error:
        confluence.configured_target()
    assert "secret" not in str(error.value)


@pytest.mark.parametrize("suffix", [
    "/spaces/EXAMPLE/pages/123456/Synthetic+Handbook",
    "/pages/viewpage.action?pageId=123456",
    "/pages/viewpageattachments.action?pageId=123456#synthetic.txt",
])
def test_citation_links_allow_only_configured_tenant_pages(suffix):
    assert confluence.safe_source_url(BASE + suffix)


@pytest.mark.parametrize("url", [
    "https://other-example.atlassian.net/wiki/pages/viewpage.action?pageId=123456",
    "https://example-tenant.atlassian.net.evil.invalid/wiki/pages/123456",
    "https://user:secret@example-tenant.atlassian.net/wiki/pages/123456",
    "https://example-tenant.atlassian.net:444/wiki/pages/123456",
    "http://example-tenant.atlassian.net/wiki/pages/123456",
    "https://example-tenant.atlassian.net/wiki/pages/viewpage.action?pageId=123456&secret=",
    "https://example-tenant.atlassian.net/wiki/pages/viewpage.action?pageId=123456&pageId=2",
    "https://example-tenant.atlassian.net/wiki/pages/123456#unexpected",
    "https://example-tenant.atlassian.net\\evil.invalid/wiki/pages/123456",
    "https://example-tenant.atlassian.net/elsewhere",
])
def test_citation_links_reject_unsafe_or_unrelated_urls(url):
    assert not confluence.safe_source_url(url)


def test_citation_links_disabled_when_tenant_is_unconfigured(monkeypatch):
    monkeypatch.delenv("CONFLUENCE_BASE_URL")
    assert not confluence.safe_source_url(BASE + "/pages/123456")
