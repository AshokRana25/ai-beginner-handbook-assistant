import pytest
import requests
from handbook_assistant.ollama_client import OllamaClient, OllamaError


class Response:
    def __init__(self, data, status=200):
        self.data, self.status_code = data, status
    def json(self):
        return self.data


def test_exact_embed_endpoint_payload_and_local_show(monkeypatch):
    client = OllamaClient()
    calls = []
    def request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        if url.endswith("/api/show"):
            return Response({"details": {"format": "gguf"}, "model_info": {"general.parameter_count": 600000000}})
        return Response({"embeddings": [[1.0, 0.0]]})
    monkeypatch.setattr(client.session, "request", request)
    assert client.embed(["synthetic evidence"], "qwen3-embedding:0.6b") == [[1.0, 0.0]]
    assert calls[-1][1].endswith("/api/embed")
    assert calls[-1][2]["json"]["truncate"] is False
    assert calls[-1][2]["json"]["keep_alive"] == "0"
    assert calls[-1][2]["allow_redirects"] is False


def test_chat_schema_and_nonstreaming(monkeypatch):
    client = OllamaClient()
    monkeypatch.setattr(client, "verify_local_model", lambda model: {})
    calls = []
    def call(method, path, payload):
        calls.append(payload)
        return {"done": True, "message": {"content": '{"supported":false}'}}
    monkeypatch.setattr(client, "_call", call)
    assert client.chat("qwen3:4b", [], {"type": "object"}) == '{"supported":false}'
    assert calls[0]["think"] is False and calls[0]["stream"] is False
    assert calls[0]["format"] == {"type": "object"} and calls[0]["keep_alive"] == "0"


def test_model_locality_is_rechecked_after_tag_changes(monkeypatch):
    client = OllamaClient()
    responses = iter([{"details": {"format": "gguf"}, "model_info": {"count": 1}},
                      {"remote_model": "upstream", "remote_host": "https://example.invalid"}])
    monkeypatch.setattr(client, "_call", lambda *args: next(responses))
    client.verify_local_model("example:local")
    with pytest.raises(OllamaError, match="Remote"):
        client.verify_local_model("example:local")


def test_connection_errors_do_not_echo_request_secrets(monkeypatch):
    client = OllamaClient()
    def failure(*args, **kwargs):
        raise requests.ConnectionError("token=synthetic-secret")
    monkeypatch.setattr(client.session, "request", failure)
    with pytest.raises(OllamaError) as error:
        client.model_names()
    assert "synthetic-secret" not in str(error.value)


@pytest.mark.parametrize("embeddings", [[], [[float('nan')]], [[]]])
def test_invalid_vectors_rejected(embeddings, monkeypatch):
    client = OllamaClient()
    monkeypatch.setattr(client, "verify_local_model", lambda model: {})
    monkeypatch.setattr(client, "_call", lambda *args: {"embeddings": embeddings})
    with pytest.raises(OllamaError, match="invalid embedding"):
        client.embed(["sample"], "qwen3-embedding:0.6b")
