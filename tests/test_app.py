"""Streamlit runtime regression tests; no network, real credentials, or real models."""
from pathlib import Path
from io import BytesIO
import json
import pytest
from streamlit.testing.v1 import AppTest
from handbook_assistant.ollama_client import OllamaClient
from handbook_assistant.rag import INSUFFICIENT

APP = Path(__file__).parents[1] / "app.py"


@pytest.fixture
def app(monkeypatch, settings, model):
    monkeypatch.setattr("handbook_assistant.config.Settings", lambda: settings)
    monkeypatch.setattr(OllamaClient, "model_names", lambda self: [settings.chat_model, settings.embedding_model])
    monkeypatch.setattr(OllamaClient, "chat", lambda self, *a, **kw: "Synthetic general answer")
    monkeypatch.setattr(OllamaClient, "embed", lambda self, *a, **kw: model.embed(*a, **kw))
    monkeypatch.setenv("CONFLUENCE_BASE_URL", "https://example-tenant.atlassian.net/wiki")
    monkeypatch.setenv("CONFLUENCE_ROOT_ID", "123456")
    monkeypatch.delenv("CONFLUENCE_EMAIL", raising=False)
    monkeypatch.delenv("CONFLUENCE_API_TOKEN", raising=False)
    at = AppTest.from_file(str(APP), default_timeout=20).run()
    assert not at.exception
    return at


def button(app, label):
    return next(item for item in app.button if item.label == label)


def test_startup_empty_index_exact_fallback_and_clear_chat(app):
    assert app.title[0].value == "AI Beginner Handbook Assistant"
    assert app.metric[0].value == "0"
    app.chat_input[0].set_value("What does the handbook say?").run()
    assert not app.exception
    assert any(t.value == INSUFFICIENT for t in app.text)
    button(app, "Clear Chat").click().run()
    assert not app.exception and not app.chat_message


def test_general_and_handbook_histories_are_separate(app):
    app.radio[0].set_value("General Chat").run()
    app.chat_input[0].set_value("Hello").run()
    assert any(t.value == "Synthetic general answer" for t in app.text)
    app.radio[0].set_value("Handbook Q&A").run()
    assert not app.chat_message and not app.exception
    app.radio[0].set_value("General Chat").run()
    assert len(app.chat_message) == 2


def test_missing_credentials_are_sanitized_and_do_not_crash(app):
    button(app, "Sync Confluence").click().run()
    assert not app.exception
    assert any("CONFLUENCE_EMAIL" in item.value for item in app.text)
    assert app.metric[0].value == "0"


def test_invalid_overlap_settings_show_error_without_crash(app):
    next(n for n in app.number_input if n.label == "Overlap (characters)").set_value(300)
    button(app, "Apply settings").click().run()
    assert not app.exception
    assert any("overlap" in item.value for item in app.error)


def test_upload_repeat_citation_and_failed_replacement(app, monkeypatch):
    text = "The fictional Lavender team labels every generated demo as synthetic."
    upload = BytesIO(text.encode())
    upload.name = "synthetic-fixture.txt"
    monkeypatch.setattr("streamlit.file_uploader", lambda *a, **kw: [upload])
    app.run()
    button(app, "Index uploaded files").click().run()
    assert not app.exception and app.metric[0].value == "1"
    button(app, "Index uploaded files").click().run()
    assert app.metric[0].value == "1" and any("unchanged" in item.value for item in app.text)
    monkeypatch.setattr(OllamaClient, "chat", lambda *a, **kw: json.dumps({"supported": True, "passages": [{"source": 1, "quote": text}]}))
    app.chat_input[0].set_value("How are generated demos labeled?").run()
    assert not app.exception and any(item.value == text + " [1]" for item in app.text)
    assert any(item.label == "[1] Supporting source and passage" for item in app.expander)
    empty = BytesIO(b"")
    empty.name = upload.name
    monkeypatch.setattr("streamlit.file_uploader", lambda *a, **kw: [empty])
    button(app, "Index uploaded files").click().run()
    assert not app.exception and app.metric[0].value == "0"
    assert not app.chat_message  # Corpus changes clear potentially stale handbook history.
    app.chat_input[0].set_value("How are demos labeled?").run()
    assert any(item.value == INSUFFICIENT for item in app.text)


def test_missing_target_keeps_manual_import_available(app, monkeypatch):
    monkeypatch.delenv("CONFLUENCE_BASE_URL")
    monkeypatch.delenv("CONFLUENCE_ROOT_ID")
    app.run()
    assert not app.exception
    button(app, "Sync Confluence").click().run()
    assert not app.exception
    assert any("CONFLUENCE_BASE_URL" in item.value for item in app.text)
    upload = BytesIO(b"The fictional test handbook says to label samples as synthetic.")
    upload.name = "synthetic-fixture.txt"
    monkeypatch.setattr("streamlit.file_uploader", lambda *a, **kw: [upload])
    app.run()
    button(app, "Index uploaded files").click().run()
    assert not app.exception and app.metric[0].value == "1"
