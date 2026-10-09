from dataclasses import dataclass, field
import hashlib


@dataclass
class Source:
    source_id: str
    kind: str
    title: str
    url: str
    text: str
    version: str = ""
    modified: str = ""
    parent_id: str = ""
    filename: str = ""
    content_hash: str = ""

    def __post_init__(self):
        self.version = str(self.version)
        self.content_hash = hashlib.sha256(self.text.encode("utf-8")).hexdigest()


@dataclass
class Chunk:
    text: str
    heading: str
    index: int


@dataclass
class Hit:
    chunk_id: str
    text: str
    metadata: dict
    similarity: float


@dataclass
class Answer:
    text: str
    citations: list[dict] = field(default_factory=list)
    retrieved_count: int = 0
