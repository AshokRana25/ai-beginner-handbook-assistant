from dataclasses import replace
from types import SimpleNamespace

from handbook_assistant.models import Source
from handbook_assistant.store import Index


def source(id="page:1", text="The synthetic Lavender team labels all demo material as synthetic.", version="1"):
    return Source(id, "page", "Synthetic test page", "https://example.invalid/fixture", text, version=version)


def snapshot(sources, complete=True, scope="test-scope"):
    return SimpleNamespace(sources=sources, complete=complete, scope_id=scope, warnings=[])


def test_repeat_sync_no_duplicates_and_persists(settings, model):
    index = Index(settings, model)
    first = index.sync_snapshot(snapshot([source()]))
    count = index.collection.count()
    calls = len(model.calls)
    second = index.sync_snapshot(snapshot([source()]))
    assert first["updated"] == 1 and second["unchanged"] == 1
    assert index.collection.count() == count == 1 and len(model.calls) == calls
    reopened = Index(settings, model)
    assert reopened.stats()["sources"] == 1
    assert reopened.retrieve("Lavender")[0].metadata["version"] == "1"


def test_change_replaces_old_chunks(settings, model):
    index = Index(settings, model)
    index.upsert(source(text="old content " * 80), "scope")
    index.upsert(source(text="new content with enough useful text.", version="2"), "scope")
    assert index.collection.count() == 1
    hits = index.retrieve("new content")
    assert hits[0].metadata["version"] == "2" and "old content" not in hits[0].text


def test_inaccessible_and_partial_snapshot_quarantine_without_deletes(settings, model):
    index = Index(settings, model)
    index.sync_snapshot(snapshot([source("page:1"), source("page:2")]))
    last_sync = index.stats()["last_sync"]
    result = index.sync_snapshot(snapshot([source("page:1")], complete=False))
    assert not result["complete"] and len(index.rows()) == 2
    assert index.stats()["quarantined"] == 1 and index.stats()["sources"] == 1
    assert {h.metadata["source_id"] for h in index.retrieve("Lavender")} == {"page:1"}
    assert index.stats()["last_sync"] == last_sync
    index.sync_snapshot(snapshot([], complete=False))
    assert not index.retrieve("Lavender") and len(index.rows()) == 2


def test_complete_snapshot_removes_missing_in_scope_only(settings, model):
    index = Index(settings, model)
    index.sync_snapshot(snapshot([source("page:1"), source("page:2")]))
    index.upsert(source("manual:1"), "manual")
    result = index.sync_snapshot(snapshot([source("page:1")]))
    assert result["removed"] == 1 and len(index.rows()) == 2
    assert index.collection.count() == 2


def test_failed_embedding_quarantines_and_never_partial_deletes(settings, model):
    index = Index(settings, model)
    index.sync_snapshot(snapshot([source("page:1"), source("page:2")]))
    model.fail = True
    result = index.sync_snapshot(snapshot([source("page:1", "Changed synthetic text.", "2")]))
    assert not result["complete"] and len(index.rows()) == 2
    assert index.stats()["quarantined"] == 2 and index.retrieve("text") == []


def test_settings_change_requires_rebuild(settings, model):
    index = Index(settings, model)
    index.upsert(source(), "manual")
    changed = Index(replace(settings, chunk_size=500), model)
    assert changed.stats()["needs_rebuild"] and not changed.retrieve("Lavender")
    assert changed.rebuild() == 1
    assert not changed.stats()["needs_rebuild"] and changed.retrieve("Lavender")


def test_rebuild_does_not_reactivate_quarantined_sources(settings, model):
    index = Index(settings, model)
    index.upsert(source(), "scope")
    index.quarantine_scope("scope")
    assert index.rebuild() == 0 and not index.retrieve("Lavender")


def test_quarantine_one_manual_replacement_preserves_other_sources(settings, model):
    index = Index(settings, model)
    index.upsert(source("manual:1"), "manual")
    index.upsert(source("manual:2"), "manual")
    index.quarantine_source("manual:1")
    assert {h.metadata["source_id"] for h in index.retrieve("Lavender")} == {"manual:2"}
    assert index.upsert(source("manual:1"), "manual") is False
    assert index.stats()["sources"] == 2
