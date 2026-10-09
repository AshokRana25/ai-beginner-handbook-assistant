import pytest
from handbook_assistant.config import local_url
from handbook_assistant.ollama_client import OllamaClient, OllamaError


@pytest.mark.parametrize("url", ["https://api.example.com", "http://192.168.1.20:11434", "http://127.0.0.1:11434@evil.test", "http://localhost:11434/proxy", "http://user:secret@localhost:11434", "http://localhost:11434?x=y"])
def test_nonlocal_or_unsafe_endpoint_blocked(url):
    with pytest.raises(ValueError):
        local_url(url)


@pytest.mark.parametrize("url", ["http://127.0.0.1:11434", "http://localhost:11434", "http://[::1]:11434"])
def test_loopback_allowed(url):
    assert local_url(url) == url


def test_cloud_tag_and_remote_model_blocked(monkeypatch):
    client = OllamaClient()
    with pytest.raises(OllamaError, match="Cloud"):
        client.verify_local_model("qwen3:cloud")
    monkeypatch.setattr(client, "_call", lambda *args: {"remote_host": "https://cloud.example", "details": {"format": "gguf"}, "model_info": {"n": 1}})
    with pytest.raises(OllamaError, match="Remote"):
        client.verify_local_model("local-name")
    assert client.session.trust_env is False
