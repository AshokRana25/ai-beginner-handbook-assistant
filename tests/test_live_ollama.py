"""Opt-in real-model smoke tests. Never run by default; no Confluence access."""
import os
from dataclasses import replace
import pytest

from handbook_assistant.config import Settings
from handbook_assistant.models import Source
from handbook_assistant.ollama_client import OllamaClient
from handbook_assistant.rag import handbook_answer, INSUFFICIENT
from handbook_assistant.store import Index

pytestmark = [pytest.mark.live, pytest.mark.skipif(os.getenv("RUN_LIVE_OLLAMA") != "1", reason="Requires explicit RUN_LIVE_OLLAMA=1 and local models")]


def test_real_local_models_and_grounded_answer(tmp_path):
    settings = replace(Settings(), data_dir=tmp_path)
    client = OllamaClient(settings.ollama_url)
    index = Index(settings, client)
    text = "The fictional Lavender team labels every generated demo as synthetic."
    index.upsert(Source("manual:live-fixture", "manual", "Synthetic fixture", "", text), "manual")
    result = handbook_answer("How does the fictional Lavender team label every generated demo?", [], index, client, settings)
    assert result.text != INSUFFICIENT
    assert result.citations and all(c["quote"] in text for c in result.citations)
    unrelated = handbook_answer("What was the exact revenue of the company in 1907?", [], index, client, settings)
    assert unrelated.text == INSUFFICIENT
