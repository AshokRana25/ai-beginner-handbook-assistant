"""Text extraction only. Never execute macros, scripts, links, or embedded files."""
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
import re
import zipfile

from bs4 import BeautifulSoup, Comment, Doctype, NavigableString, Tag
from docx import Document
from pypdf import PdfReader

MAX_BYTES = 25 * 1024 * 1024
MAX_TEXT_CHARS = 2_000_000


@dataclass
class Extraction:
    text: str
    warnings: list[str] = field(default_factory=list)


def parse_html(raw: str) -> str:
    soup = BeautifulSoup(raw, "html.parser")
    for node in soup(["script", "style", "noscript", "iframe", "object", "form", "svg"]):
        node.decompose()

    def render(node):
        if isinstance(node, (Comment, Doctype)):
            return ""
        if isinstance(node, NavigableString):
            return str(node)
        if not isinstance(node, Tag):
            return ""
        name = node.name.lower()
        if name == "pre":
            return "\n\n```\n" + node.get_text().strip() + "\n```\n\n"
        if name == "ac:structured-macro":
            # Code macro bodies are literal evidence; dynamic macros are not expanded.
            body = node.find("ac:plain-text-body")
            if body:
                return "\n\n```\n" + body.get_text().strip() + "\n```\n\n"
        if name == "table":
            rows = []
            for row in node.find_all("tr"):
                rows.append(" | ".join(cell.get_text(" ", strip=True).replace("|", "\\|") for cell in row.find_all(["th", "td"], recursive=False)))
            return "\n\n" + "\n".join(rows) + "\n\n"
        inner = "".join(render(child) for child in node.children)
        if re.fullmatch(r"h[1-6]", name):
            return "\n\n" + "#" * int(name[1]) + " " + inner.strip() + "\n\n"
        if name == "li":
            return "\n- " + inner.strip() + "\n"
        if name == "br":
            return "\n"
        if name in {"p", "div", "section", "article", "ul", "ol", "blockquote"}:
            return "\n\n" + inner.strip() + "\n\n"
        return inner

    text = render(soup)
    text = re.sub(r"\n[ \t]*\n(?:[ \t]*\n)+", "\n\n", text).strip()
    if len(text) > MAX_TEXT_CHARS:
        raise ValueError("Extracted HTML exceeds 2 million characters. Split the export.")
    return text


def parse_file(filename: str, data: bytes) -> Extraction:
    if len(data) > MAX_BYTES:
        raise ValueError("File exceeds the 25 MB local extraction limit.")
    suffix = Path(filename).suffix.lower()
    if suffix in {".html", ".htm"}:
        result = Extraction(parse_html(data.decode("utf-8-sig", errors="replace")))
    elif suffix in {".txt", ".md"}:
        try:
            text = data.decode("utf-8-sig")
            result = Extraction(text)
        except UnicodeDecodeError:
            result = Extraction(data.decode("utf-8-sig", errors="replace"), ["Some characters could not be decoded. Export UTF-8 text for best results."])
    elif suffix == ".pdf":
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            raise ValueError("Encrypted PDF: provide an unlocked export.")
        if len(reader.pages) > 500:
            raise ValueError("PDF exceeds the 500-page limit. Split the export first.")
        pages, scanned = [], []
        for n, page in enumerate(reader.pages, 1):
            text = (page.extract_text() or "").strip()
            if len(text) < 30:
                scanned.append(str(n))
            if text:
                pages.append(f"## PDF page {n}\n\n{text}")
        warnings = []
        if scanned:
            warnings.append("PDF pages with little/no extractable text (possibly scanned): " + ", ".join(scanned) + ". Run trusted local OCR and re-upload; OCR is not performed by this app.")
        result = Extraction("\n\n".join(pages), warnings)
    elif suffix == ".docx":
        with zipfile.ZipFile(BytesIO(data)) as archive:
            if sum(info.file_size for info in archive.infolist()) > 100 * 1024 * 1024:
                raise ValueError("Expanded DOCX exceeds 100 MB.")
        doc = Document(BytesIO(data))
        lines = []
        # iter_inner_content preserves paragraph/table document order.
        for item in doc.iter_inner_content():
            if hasattr(item, "rows"):
                lines.append("\n".join(" | ".join(cell.text for cell in row.cells) for row in item.rows))
            else:
                text = item.text.strip()
                style = item.style.name if item.style else ""
                match = re.match(r"Heading ([1-6])", style)
                if match:
                    text = "#" * int(match[1]) + " " + text
                elif "List" in style:
                    text = "- " + text
                lines.append(text)
        result = Extraction("\n\n".join(lines))
    else:
        raise ValueError("Supported files: HTML, PDF, DOCX, UTF-8 TXT, and Markdown.")
    if len(result.text) > MAX_TEXT_CHARS:
        raise ValueError("Extracted text exceeds 2 million characters. Split the file.")
    if not result.text.strip():
        detail = " ".join(result.warnings)
        raise ValueError("No extractable text was found. " + detail)
    return result
