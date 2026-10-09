from io import BytesIO
import pytest
from docx import Document
from pypdf import PdfWriter

from handbook_assistant.extract import parse_file, parse_html
from handbook_assistant.chunking import chunk_text


def test_html_preserves_structure_and_discards_active_or_hidden_text():
    raw = '''<!DOCTYPE html><!-- hidden injection --><h1>Overview</h1><p>Useful paragraph.</p>
    <ul><li>First step</li><li>Second step</li></ul><table><tr><th>Item</th><th>Value</th></tr>
    <tr><td>Demo</td><td>7</td></tr></table><pre>print("example")</pre><script>secret()</script>'''
    result = parse_html(raw)
    for expected in ("# Overview", "Useful paragraph.", "- First step", "Item | Value", "Demo | 7", 'print("example")'):
        assert expected in result
    assert "secret" not in result and "hidden injection" not in result and "DOCTYPE" not in result


def test_docx_order_headings_tables_lists():
    document = Document()
    document.add_heading("Synthetic heading", 1)
    document.add_paragraph("First paragraph")
    table = document.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "Left"
    table.cell(0, 1).text = "Right"
    document.add_paragraph("Last item", style="List Bullet")
    stream = BytesIO()
    document.save(stream)
    text = parse_file("fixture.docx", stream.getvalue()).text
    assert "# Synthetic heading" in text and "Left | Right" in text and "- Last item" in text
    assert text.index("First paragraph") < text.index("Left") < text.index("Last item")


def test_scanned_pdf_requires_ocr():
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    stream = BytesIO()
    writer.write(stream)
    with pytest.raises(ValueError, match="OCR"):
        parse_file("scan.pdf", stream.getvalue())


def test_txt_utf8_and_invalid_encoding_warning():
    assert parse_file("x.txt", "Résumé".encode()).text == "Résumé"
    assert parse_file("x.txt", b"bad\xff encoding").warnings


def test_chunking_headings_bounds_overlap_and_code():
    body = "# First\n\n" + "alpha bravo charlie. " * 80 + "\n# Second\n\nExample second paragraph.\n```\n# not a heading\n```"
    chunks = chunk_text(body, 300, 50)
    assert len(chunks) > 2 and all(len(c.text) <= 300 for c in chunks)
    assert all(c.index == n for n, c in enumerate(chunks))
    assert chunks[-1].heading == "Second"
    assert chunks[0].text[-35:] in chunks[1].text


def test_overlarge_html_raises_instead_of_silently_truncating(monkeypatch):
    monkeypatch.setattr("handbook_assistant.extract.MAX_TEXT_CHARS", 20)
    with pytest.raises(ValueError, match="exceeds"):
        parse_html("<p>" + "x" * 21 + "</p>")
