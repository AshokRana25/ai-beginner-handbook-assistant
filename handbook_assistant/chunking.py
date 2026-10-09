import re
from .models import Chunk


def chunk_text(text: str, size: int = 1600, overlap: int = 200) -> list[Chunk]:
    """Keep heading context. Prefer paragraph/line/word boundaries; bound every chunk."""
    if size < 100 or overlap < 0 or overlap >= size // 2:
        raise ValueError("Invalid chunk size/overlap.")
    sections, lines, heading = [], [], "Document"
    in_code = False
    for line in text.splitlines():
        if line.strip().startswith("```"):
            in_code = not in_code
        if not in_code and re.match(r"^#{1,6}\s", line):
            if lines:
                sections.append((heading, "\n".join(lines)))
            heading, lines = line.lstrip("# ").strip(), [line]
        else:
            lines.append(line)
    if lines:
        sections.append((heading, "\n".join(lines)))
    chunks = []
    for heading, body in sections:
        body = body.strip()
        start = 0
        while start < len(body):
            end = min(start + size, len(body))
            if end < len(body):
                floor = start + size // 2
                for sep in ("\n\n", "\n", " "):
                    boundary = body.rfind(sep, floor, end)
                    if boundary != -1:
                        end = boundary
                        break
            content = body[start:end].strip()
            if content:
                chunks.append(Chunk(content, heading, len(chunks)))
            if end >= len(body):
                break
            start = max(start + 1, end - overlap)
    return chunks
