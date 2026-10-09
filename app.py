"""Run with: python -m streamlit run app.py --server.address 127.0.0.1"""
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json

import streamlit as st

from handbook_assistant.config import Settings
from handbook_assistant.confluence import ConfluenceClient, ConfluenceError, configured_target, safe_source_url
from handbook_assistant.extract import parse_file
from handbook_assistant.models import Source
from handbook_assistant.ollama_client import OllamaClient, OllamaError
from handbook_assistant.rag import handbook_answer, general_answer
from handbook_assistant.store import Index

st.set_page_config(page_title="AI Beginner Handbook Assistant", page_icon="📚", layout="wide")
st.title("AI Beginner Handbook Assistant")
st.caption("Local Ollama + local Chroma • single-user demo • no cloud AI")


@st.cache_resource
def resources(settings):
    client = OllamaClient(settings.ollama_url)
    return client, Index(settings, client)


@st.cache_data(ttl=15, show_spinner=False)
def available_models(url):
    try:
        return OllamaClient(url).model_names(), ""
    except OllamaError as error:
        return [], str(error)


def report_error(error, context):
    # Never render raw HTTP exceptions, response bodies, request headers, tokens, or file contents.
    if isinstance(error, (OllamaError, ConfluenceError, ValueError)):
        st.error(f"{context} could not be completed.")
        st.text(str(error))
    else:
        st.error(f"{context} failed ({type(error).__name__}). Check local setup and retry. Private request details are not displayed.")


def render_answer(message, key):
    st.text(message["content"])
    for citation in message.get("citations", []):
        n = citation["number"]
        with st.expander(f"[{n}] Supporting source and passage"):
            st.text(f"{citation['title']} · {citation['heading']}")
            st.text(f"Version: {citation.get('version') or 'manual export'} | Modified: {citation.get('modified') or 'not provided'} | Similarity: {citation['similarity']:.2f}")
            st.text(citation["passage"])
            if safe_source_url(citation.get("url", "")):
                st.link_button(f"Open source [{n}]", citation["url"])
            else:
                st.text("Local source: " + (citation.get("filename") or citation["title"]))
            st.download_button("Download supporting passage", citation["passage"],
                               file_name=f"evidence-{n}.txt", mime="text/plain", key=f"{key}-download-{n}")


if "settings" not in st.session_state:
    st.session_state.settings = Settings()
if "chats" not in st.session_state:
    st.session_state.chats = {"Handbook Q&A": [], "General Chat": []}

with st.sidebar:
    st.subheader("Workspace")
    mode = st.radio("Mode", ["Handbook Q&A", "General Chat"])
    with st.expander("Local model & retrieval settings"):
        with st.form("settings_form"):
            old = st.session_state.settings
            chat_model = st.text_input("Generation model", old.chat_model)
            embedding_model = st.text_input("Embedding model", old.embedding_model)
            base_url = st.text_input("Ollama loopback URL", old.ollama_url)
            chunk_size = st.number_input("Chunk size (characters)", 300, 6000, old.chunk_size, 100)
            overlap = st.number_input("Overlap (characters)", 0, 2000, old.chunk_overlap, 50)
            top_k = st.slider("Retrieved passages", 1, 12, old.top_k)
            similarity = st.slider("Minimum cosine similarity", 0.0, 1.0, float(old.min_similarity), .05)
            context = st.number_input("Context tokens (higher uses more RAM)", 4096, 32768, int(old.context_tokens), 1024)
            if st.form_submit_button("Apply settings"):
                try:
                    candidate = replace(old, chat_model=chat_model, embedding_model=embedding_model,
                                        ollama_url=base_url, chunk_size=int(chunk_size), chunk_overlap=int(overlap),
                                        top_k=top_k, min_similarity=similarity, context_tokens=context)
                    candidate.validate()
                    st.session_state.settings = candidate
                    st.rerun()
                except ValueError as error:
                    st.error(str(error))

settings = st.session_state.settings
try:
    client, index = resources(settings)
except Exception as error:
    report_error(error, "Local index initialization")
    st.stop()

with st.sidebar:
    names, model_error = available_models(settings.ollama_url)
    if model_error:
        st.warning(model_error)
    for label, name in [("Chat", settings.chat_model), ("Embeddings", settings.embedding_model)]:
        st.caption(f"{label}: {name} {'✓ installed' if name in names else '· not detected'}")
    stats = index.stats()
    source_count_slot = st.empty()
    storage_stats_slot = st.empty()
    sync_time_slot = st.empty()
    source_count_slot.metric("Indexed sources", stats["sources"])
    storage_stats_slot.caption(f"Stored chunks: {stats['chunks']} • Quarantined sources: {stats['quarantined']}")
    sync_time_slot.caption("Last successful Confluence sync (UTC): " + stats["last_sync"])
    try:
        target_base, target_root = configured_target()
    except ConfluenceError:
        st.caption("To enable Confluence, set CONFLUENCE_BASE_URL and CONFLUENCE_ROOT_ID in your local .env. File import works without them.")
    else:
        st.link_button("Open configured handbook", f"{target_base}/pages/viewpage.action?pageId={target_root}")
    if stats["needs_rebuild"]:
        st.warning("Embedding/chunk settings changed. Rebuild the index before asking about older sources.")
    include_descendants = st.checkbox("Include descendant pages", value=False)
    include_attachments = st.checkbox("Include PDF, DOCX and TXT attachments", value=False)
    st.caption("Default: the specified handbook page only. Child/attachment scope is opt-in.")
    if st.button("Sync Confluence", use_container_width=True):
        st.session_state.chats["Handbook Q&A"] = []
        # Quarantine before authentication/network work, including interrupted/failed syncs.
        with st.status("Syncing the handbook…", expanded=True) as status:
            try:
                target_base, target_root = configured_target()
                scope = f"confluence:{target_base}:page:{target_root}"
                index.quarantine_scope(scope)
                source = ConfluenceClient.from_env(base_url=target_base)
                snapshot = source.fetch_snapshot(root_id=target_root,
                           include_descendants=include_descendants, include_attachments=include_attachments,
                           progress=st.text)
                result = index.sync_snapshot(snapshot, progress=st.text)
                for warning in result["warnings"]:
                    st.text("Warning: " + warning)
                status.update(label=("Sync complete" if result["complete"] else "Partial sync: unverified sources quarantined"),
                              state="complete" if result["complete"] else "error")
                st.session_state.sync_notice = result
            except Exception as error:
                status.update(label="Sync failed: review local setup and source status", state="error")
                report_error(error, "Confluence sync")
    if st.button("Rebuild Index", use_container_width=True):
        st.session_state.chats["Handbook Q&A"] = []
        with st.status("Rebuilding local embeddings…", expanded=True) as status:
            try:
                count = index.rebuild(progress=st.text)
                status.update(label=f"Rebuilt {count} active sources", state="complete")
                st.info("Quarantined sources require a successful Confluence sync; rebuild does not reactivate them.")
            except Exception as error:
                status.update(label="Rebuild interrupted", state="error")
                report_error(error, "Index rebuild")
    if st.button("Clear Chat", use_container_width=True):
        st.session_state.chats = {"Handbook Q&A": [], "General Chat": []}
        st.rerun()

with st.expander("Add handbook exports or view indexed sources", expanded=not bool(index.stats()["sources"])):
    st.write("Import a Confluence HTML export, PDF, DOCX, or UTF-8 TXT file. Extraction and embeddings stay on this computer.")
    st.caption("Upload only documents you are authorized to process. Scanned PDFs require local OCR first. Embedded links and dynamic macros are not fetched.")
    uploads = st.file_uploader("Choose local exports", type=["html", "htm", "pdf", "docx", "txt", "md"], accept_multiple_files=True)
    if st.button("Index uploaded files", disabled=not uploads):
        st.session_state.chats["Handbook Q&A"] = []
        with st.status("Extracting and indexing locally…", expanded=True) as status:
            errors = 0
            for upload in uploads:
                try:
                    identity = hashlib.sha256(Path(upload.name).name.casefold().encode()).hexdigest()[:24]
                    index.quarantine_source(f"manual:{identity}")
                    extraction = parse_file(upload.name, upload.getvalue())
                    for warning in extraction.warnings:
                        st.text("Warning: " + warning)
                    source = Source(f"manual:{identity}", "manual", Path(upload.name).name, "", extraction.text,
                                    modified=datetime.now(timezone.utc).isoformat(timespec="seconds"), filename=Path(upload.name).name)
                    # Repeated identical uploads must remain idempotent, including metadata.
                    prior = next((r for r in index.rows() if r["source_id"] == source.source_id), None)
                    if prior and json.loads(prior["payload"])["content_hash"] == source.content_hash:
                        source.modified = json.loads(prior["payload"])["modified"]
                    changed = index.upsert(source, "manual")
                    st.text(f"{upload.name}: {'indexed' if changed else 'unchanged'}")
                except Exception as error:
                    errors += 1
                    report_error(error, "File import")
                    st.warning("If this filename was already indexed, its old version is now quarantined. Re-upload a valid file to restore it.")
            status.update(label="Import complete" if not errors else "Import completed with errors", state="complete" if not errors else "error")
    rows = index.rows()
    if rows:
        for row in rows:
            source = json.loads(row["payload"])
            st.text(f"{source['title']} | {row['status']} | version {source['version'] or 'manual export'} | {len(source['text']):,} characters")
    else:
        st.info("No documents indexed. Sync Confluence with your own credentials or upload an export.")

latest_stats = index.stats()
source_count_slot.metric("Indexed sources", latest_stats["sources"])
storage_stats_slot.caption(f"Stored chunks: {latest_stats['chunks']} • Quarantined sources: {latest_stats['quarantined']}")
sync_time_slot.caption("Last successful Confluence sync (UTC): " + latest_stats["last_sync"])

if mode == "Handbook Q&A":
    st.info("Answers contain verified verbatim excerpts from freshly retrieved passages. Click each numbered citation to inspect its context. Similarity is a retrieval score, not a confidence guarantee.")
    st.caption("The app has no built-in handbook content. Chat history helps interpret follow-up questions but is never treated as evidence.")
else:
    st.warning("General Chat uses the local model’s general knowledge. It does not retrieve or cite the handbook and can be wrong.")

history = st.session_state.chats[mode]
for n, message in enumerate(history):
    with st.chat_message(message["role"]):
        if message["role"] == "assistant":
            render_answer(message, f"history-{mode}-{n}")
        else:
            st.text(message["content"])

question = st.chat_input("Ask about the indexed handbook…" if mode == "Handbook Q&A" else "Ask the local model…", max_chars=4000)
if question:
    with st.chat_message("user"):
        st.text(question)
    with st.chat_message("assistant"):
        try:
            with st.spinner("Retrieving fresh evidence…" if mode == "Handbook Q&A" else "Thinking locally…"):
                answer = (handbook_answer(question, history, index, client, settings) if mode == "Handbook Q&A"
                          else general_answer(question, history, client, settings))
            message = {"role": "assistant", "content": answer.text, "citations": answer.citations}
            render_answer(message, f"new-{mode}-{len(history)}")
            history.extend([{"role": "user", "content": question}, message])
        except Exception as error:
            report_error(error, "Answer generation")
