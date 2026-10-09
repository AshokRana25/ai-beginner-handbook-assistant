from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse
import ipaddress
import os

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


def local_url(value: str) -> str:
    """Do not permit a cloud inference endpoint or credential-bearing URLs."""
    parsed = urlparse(value)
    if parsed.scheme != "http" or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Ollama URL must be a plain HTTP loopback URL, such as http://127.0.0.1:11434.")
    host = parsed.hostname or ""
    try:
        loopback = ipaddress.ip_address(host).is_loopback
    except ValueError:
        loopback = host == "localhost"
    if not loopback or parsed.path not in ("", "/"):
        raise ValueError("Only a loopback Ollama server is allowed. Remote/cloud endpoints are blocked.")
    return value.rstrip("/")


@dataclass(frozen=True)
class Settings:
    ollama_url: str = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    chat_model: str = os.getenv("CHAT_MODEL", "qwen3:4b")
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "qwen3-embedding:0.6b")
    data_dir: Path = Path(os.getenv("DATA_DIR", str(ROOT / "data")))
    chunk_size: int = int(os.getenv("CHUNK_SIZE", "1600"))
    chunk_overlap: int = int(os.getenv("CHUNK_OVERLAP", "200"))
    top_k: int = int(os.getenv("TOP_K", "5"))
    min_similarity: float = float(os.getenv("MIN_SIMILARITY", "0.30"))
    context_tokens: int = int(os.getenv("CONTEXT_TOKENS", "8192"))
    max_context_chars: int = 14000

    def validate(self):
        local_url(self.ollama_url)
        if not (300 <= self.chunk_size <= 6000):
            raise ValueError("Chunk size must be 300–6000 characters.")
        if not (0 <= self.chunk_overlap < self.chunk_size // 2):
            raise ValueError("Chunk overlap must be nonnegative and less than half the chunk size.")
        if not (1 <= self.top_k <= 12 and 0 <= self.min_similarity <= 1):
            raise ValueError("Invalid retrieval settings.")
        if not (4096 <= self.context_tokens <= 32768):
            raise ValueError("Context must be between 4096 and 32768 tokens.")
