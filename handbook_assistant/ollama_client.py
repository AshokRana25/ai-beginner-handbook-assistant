import math
import re
import requests

from .config import local_url


class OllamaError(RuntimeError):
    pass


class OllamaClient:
    def __init__(self, base_url="http://127.0.0.1:11434", timeout=240):
        self.base_url = local_url(base_url)
        self.timeout = timeout
        self.session = requests.Session()
        self.session.trust_env = False  # Do not forward local evidence to HTTP proxy environment settings.

    def _call(self, method, endpoint, payload=None):
        try:
            response = self.session.request(method, self.base_url + endpoint, json=payload,
                                            timeout=(3, self.timeout), allow_redirects=False)
        except requests.RequestException:
            raise OllamaError("Local Ollama is unavailable or timed out. Start Ollama and check the configured loopback port.") from None
        if response.status_code != 200:
            raise OllamaError(f"Ollama returned HTTP {response.status_code}. Check that the model is downloaded and sufficient memory is available.")
        try:
            return response.json()
        except ValueError:
            raise OllamaError("Ollama returned an invalid response.") from None

    def model_names(self):
        return [row["name"] for row in self._call("GET", "/api/tags").get("models", [])]

    def verify_local_model(self, model):
        if not re.fullmatch(r"[A-Za-z0-9_./:-]+", model) or "cloud" in model.lower():
            raise OllamaError("Cloud model tags are blocked. Choose a downloaded local Ollama model.")
        result = self._call("POST", "/api/show", {"model": model})
        if (result.get("remote_host") or result.get("remote_model") or
                result.get("details", {}).get("format") != "gguf" or not result.get("model_info")):
            raise OllamaError("This model could not be verified as a local GGUF model. Remote models are blocked.")
        return result

    def embed(self, texts, model):
        self.verify_local_model(model)
        vectors = []
        for start in range(0, len(texts), 16):
            batch = texts[start:start + 16]
            result = self._call("POST", "/api/embed", {"model": model, "input": batch,
                                "truncate": False, "keep_alive": "0"})
            output = result.get("embeddings", [])
            if len(output) != len(batch) or any(not v or not all(math.isfinite(x) for x in v) for v in output):
                raise OllamaError("Ollama returned invalid embedding vectors.")
            vectors.extend(output)
        return vectors

    def chat(self, model, messages, schema=None, context_tokens=8192):
        self.verify_local_model(model)
        payload = {"model": model, "messages": messages, "stream": False, "think": False,
                   "keep_alive": "0", "options": {"temperature": 0, "num_ctx": context_tokens, "num_predict": 1400}}
        if schema is not None:
            payload["format"] = schema
        result = self._call("POST", "/api/chat", payload)
        if not result.get("done"):
            raise OllamaError("Ollama did not complete the response. Try a shorter question.")
        return result.get("message", {}).get("content", "")
