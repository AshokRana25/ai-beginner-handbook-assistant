"""Persistent local Chroma + a SQLite source catalog; active generations gate retrieval."""
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os
import sqlite3

os.environ["ANONYMIZED_TELEMETRY"] = "False"
from chromadb import PersistentClient
from chromadb.config import Settings as ChromaSettings
from filelock import FileLock

from .chunking import chunk_text
from .models import Source, Hit


class Index:
    def __init__(self, settings, embedder):
        settings.validate()
        self.settings, self.embedder = settings, embedder
        self.directory = Path(settings.data_dir)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.lock = FileLock(str(self.directory / "index.lock"), timeout=300)
        self.db_path = self.directory / "catalog.sqlite3"
        spec = {"embedding_model": settings.embedding_model, "chunk_size": settings.chunk_size,
                "overlap": settings.chunk_overlap, "schema": 1}
        self.fingerprint = hashlib.sha256(json.dumps(spec, sort_keys=True).encode()).hexdigest()[:20]
        self.collection_name = "handbook_" + self.fingerprint
        self.client = PersistentClient(path=str(self.directory / "chroma"),
                                       settings=ChromaSettings(anonymized_telemetry=False))
        self.collection = self.client.get_or_create_collection(name=self.collection_name, embedding_function=None,
                                                                 metadata={"hnsw:space": "cosine"})
        with self._db() as db:
            db.execute("CREATE TABLE IF NOT EXISTS sources (source_id TEXT PRIMARY KEY, scope TEXT NOT NULL, payload TEXT NOT NULL, generation TEXT NOT NULL, collection_name TEXT NOT NULL, status TEXT NOT NULL)")
            db.execute("CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)")

    def _db(self):
        return sqlite3.connect(self.db_path, timeout=30)

    def rows(self):
        with self._db() as db:
            return [dict(zip(["source_id", "scope", "payload", "generation", "collection_name", "status"], row))
                    for row in db.execute("SELECT * FROM sources ORDER BY source_id")]

    def set_state(self, key, value):
        with self._db() as db:
            db.execute("INSERT OR REPLACE INTO state VALUES (?,?)", (key, value))

    def get_state(self, key, default="Never"):
        with self._db() as db:
            row = db.execute("SELECT value FROM state WHERE key=?", (key,)).fetchone()
            return row[0] if row else default

    def stats(self):
        rows = self.rows()
        active = [r for r in rows if r["status"] == "active" and r["collection_name"] == self.collection_name]
        return {"sources": len(active), "stored": len(rows), "quarantined": sum(r["status"] == "quarantined" for r in rows),
                "needs_rebuild": any(r["status"] == "active" and r["collection_name"] != self.collection_name for r in rows),
                "chunks": self.collection.count(), "last_sync": self.get_state("last_sync")}

    def quarantine_scope(self, scope):
        # Commit before making any remote request. Interrupted sync fails closed.
        with self.lock, self._db() as db:
            db.execute("UPDATE sources SET status='quarantined' WHERE scope=?", (scope,))

    def quarantine_source(self, source_id):
        with self.lock, self._db() as db:
            db.execute("UPDATE sources SET status='quarantined' WHERE source_id=?", (source_id,))

    def _clean_generation(self, collection_name, generation):
        try:
            collection = self.client.get_collection(collection_name, embedding_function=None)
            collection.delete(where={"generation": generation})
        except Exception:
            # Unreferenced chunks cannot be retrieved; cleanup can be retried by rebuild.
            pass

    def upsert(self, source: Source, scope: str):
        payload = json.dumps(asdict(source), ensure_ascii=False, sort_keys=True)
        generation = hashlib.sha256((payload + self.fingerprint).encode()).hexdigest()
        with self.lock:
            previous = next((r for r in self.rows() if r["source_id"] == source.source_id), None)
            if previous and previous["generation"] == generation and previous["collection_name"] == self.collection_name:
                with self._db() as db:
                    db.execute("UPDATE sources SET status='active', scope=? WHERE source_id=?", (scope, source.source_id))
                return False
            chunks = chunk_text(source.text, self.settings.chunk_size, self.settings.chunk_overlap)
            if not chunks:
                raise ValueError("No text chunks were produced.")
            inputs = [f"{source.title}\n{chunk.heading}\n{chunk.text}" for chunk in chunks]
            vectors = self.embedder.embed(inputs, self.settings.embedding_model)
            for start in range(0, len(chunks), 100):
                batch = chunks[start:start + 100]
                metadata = [{"source_id": source.source_id, "kind": source.kind, "title": source.title,
                             "url": source.url, "version": source.version, "modified": source.modified,
                             "parent_id": source.parent_id, "filename": source.filename, "heading": c.heading,
                             "chunk_index": c.index, "content_hash": source.content_hash, "generation": generation} for c in batch]
                self.collection.upsert(ids=[f"{generation}:{c.index}" for c in batch],
                                       documents=[c.text for c in batch], metadatas=metadata,
                                       embeddings=vectors[start:start + len(batch)])
            # Readers only use catalog-committed generations, so interrupted writes remain invisible.
            with self._db() as db:
                db.execute("INSERT OR REPLACE INTO sources VALUES (?,?,?,?,?,?)",
                           (source.source_id, scope, payload, generation, self.collection_name, "active"))
            if previous and previous["generation"] != generation:
                self._clean_generation(previous["collection_name"], previous["generation"])
            return True

    def sync_snapshot(self, snapshot, progress=None):
        updated = unchanged = 0
        warnings = list(snapshot.warnings)
        complete = snapshot.complete
        with self.lock:
            self.quarantine_scope(snapshot.scope_id)
            for n, source in enumerate(snapshot.sources, 1):
                if progress:
                    progress(f"Indexing {n}/{len(snapshot.sources)}: {source.title}")
                try:
                    changed = self.upsert(source, snapshot.scope_id)
                    updated += int(changed)
                    unchanged += int(not changed)
                except Exception:
                    complete = False
                    warnings.append(f"Could not index source {source.source_id}. Its previous version remains quarantined; check local Ollama and retry.")
            removed = 0
            if complete:
                verified = {s.source_id for s in snapshot.sources}
                for row in self.rows():
                    if row["scope"] == snapshot.scope_id and row["source_id"] not in verified:
                        # Catalog deletion is safe only after the whole bounded traversal succeeds.
                        with self._db() as db:
                            db.execute("DELETE FROM sources WHERE source_id=?", (row["source_id"],))
                        self._clean_generation(row["collection_name"], row["generation"])
                        removed += 1
                self.set_state("last_sync", datetime.now(timezone.utc).isoformat(timespec="seconds"))
            return {"complete": complete, "updated": updated, "unchanged": unchanged, "removed": removed, "warnings": warnings}

    def rebuild(self, progress=None):
        # Re-embed active sources. Quarantined documents require a successful source sync.
        with self.lock:
            rows = [r for r in self.rows() if r["status"] == "active"]
            for n, row in enumerate(rows, 1):
                if progress:
                    progress(f"Rebuilding {n}/{len(rows)}")
                source = Source(**json.loads(row["payload"]))
                # A forced generation salt is unnecessary: remove catalog reference first,
                # then upsert deterministically. If interrupted, source stays quarantined.
                with self._db() as db:
                    db.execute("UPDATE sources SET status='quarantined', generation='' WHERE source_id=?", (source.source_id,))
                self.upsert(source, row["scope"])
                if row["generation"]:
                    # Do not delete newly upserted deterministic generation.
                    new = next(r for r in self.rows() if r["source_id"] == source.source_id)
                    if (row["generation"], row["collection_name"]) != (new["generation"], new["collection_name"]):
                        self._clean_generation(row["collection_name"], row["generation"])
            return len(rows)

    def retrieve(self, query, top_k=None, min_similarity=None):
        with self.lock:
            active = [r["generation"] for r in self.rows() if r["status"] == "active" and r["collection_name"] == self.collection_name]
            if not active:
                return []
            vector = self.embedder.embed(["Instruct: Retrieve evidence that answers the question.\nQuery: " + query], self.settings.embedding_model)[0]
            result = self.collection.query(query_embeddings=[vector], n_results=min(top_k or self.settings.top_k, self.collection.count()),
                                           where={"generation": {"$in": active}}, include=["documents", "metadatas", "distances"])
            threshold = self.settings.min_similarity if min_similarity is None else min_similarity
            return [Hit(cid, text, meta, 1 - float(distance)) for cid, text, meta, distance in
                    zip(result["ids"][0], result["documents"][0], result["metadatas"][0], result["distances"][0])
                    if 1 - float(distance) >= threshold]
