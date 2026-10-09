import hashlib
import math
import re
from dataclasses import replace
import pytest

from handbook_assistant.config import Settings


class FakeLocalModel:
    """Deterministic test embeddings, not a substitute for Ollama in the app."""
    def __init__(self):
        self.calls = []
        self.output = '{"supported":false,"passages":[]}'
        self.fail = False

    def embed(self, texts, model):
        self.calls.append(("embed", texts))
        if self.fail:
            raise RuntimeError("synthetic model failure")
        vectors = []
        for text in texts:
            vector = [0.0] * 64
            for word in re.findall(r"\w+", text.lower()):
                vector[int(hashlib.sha256(word.encode()).hexdigest()[:8], 16) % 64] += 1
            norm = math.sqrt(sum(v * v for v in vector)) or 1
            vectors.append([v / norm for v in vector])
        return vectors

    def chat(self, *args, **kwargs):
        self.calls.append(("chat", args))
        return self.output


@pytest.fixture
def settings(tmp_path):
    return replace(Settings(), data_dir=tmp_path, chunk_size=400, chunk_overlap=50, min_similarity=0)


@pytest.fixture
def model():
    return FakeLocalModel()
