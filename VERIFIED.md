# Verification record

Date: **2026-10-09**. Build/test environment: Linux, Python **3.12.14**. Intended user target: Windows 11 x64 with approximately 32 GB RAM; CPU-first local inference. Windows execution and hardware performance have **not** been measured.

## Passed against the delivered source

Commands were run from the project folder using its isolated virtual environment:

```text
python -m pytest -q
125 passed, 1 skipped in 2.46s

python -m ruff check . --exclude .venv
All checks passed!

python -m compileall -q app.py check_setup.py handbook_assistant tests
Exit code 0

python -m pip check
No broken requirements found.
```

The pip cache ownership notice was nonfatal; it did not indicate a dependency conflict.

A separate real Streamlit process was started on **127.0.0.1:18501** with a temporary data directory. Its HTTP health endpoint returned **200 / ok**, and the process was then stopped. The shipped configuration uses 127.0.0.1:8501. No service was published or left running.

The public-source pass additionally verified absent and custom tenant configuration, numeric root validation, manual import without a Confluence target, and safe citation links restricted to the configured tenant. All identifiers used by these tests are synthetic.

### Automated coverage

- **74 mocked Confluence/configuration tests:** default root-only scope, optional child/attachment traversal, current REST v2 routes, pagination, exact-source download boundaries, attachment identifiers, status handling, retries, missing credentials, bounded downloads, redirects/origin restrictions, partial failures, unsupported containers, extraction, and complete-snapshot behavior.
- **Real persistent Chroma with synthetic embeddings:** duplicate-free repeat sync, persistent reopen, changed-source replacement, scoped pruning, incomplete-sync quarantine, embedding failure quarantine, settings-change/rebuild behavior, quarantined-source exclusion, and same-filename manual replacement.
- **Extraction:** HTML headings/paragraphs/lists/tables/code, removal of active content and hidden comments, DOCX document order, UTF-8 text, scanned/empty PDF OCR warning, size overflow rejection, heading-aware chunk bounds/overlap.
- **Q&A:** exact insufficient answer, fabricated/malformed citation rejection, literal quote/source validation, fresh follow-up retrieval, prior assistant text excluded from evidence, separate General Chat, document-instruction isolation, and context-budget failures surfaced without silent truncation.
- **Local inference boundary:** loopback endpoint validation, remote/cloud model rejection, locality recheck after tag changes, exact Ollama request payloads, nonstreaming structured answers, sanitized connection errors, and invalid-vector rejection.
- **Streamlit AppTest:** startup, empty-index response, mode separation, Clear Chat, missing-credential error, settings validation, upload/repeat upload, current sidebar counts, citation rendering, failed replacement quarantine, and clearing stale Handbook history on corpus changes.

Additional focused UI checks verified page and attachment source buttons, literal rendering of malicious Markdown in source titles, and remote endpoint rejection. These checks used synthetic data and patched local-model replies.

## Deliberate answer behavior

Handbook mode is **strictly extractive**. The local generation model selects short quotations through a JSON schema. Application code verifies each quotation is a literal substring of a currently retrieved passage and that the citation ID exists, then displays only those passages with citations. It does **not** display free-form model-written factual summaries. General Chat remains a separate local-model conversation.

The exact unsupported response is:

> I couldn’t find this information in the indexed documents.

This reduces unsupported wording but does not prove relevance, truth, completeness, or resistance to every adversarial document. A genuine quote can still be misleading or unrelated. Review supporting passages. The system has no model-driven tools, browser actions, or external communications.

## Explicitly unverified / remaining local validation

1. **Real Qwen3 inference:** Ollama and the model weights were not available in the build environment. One opt-in live test is skipped by design. Download the models locally, run `check_setup.py`, then run the `RUN_LIVE_OLLAMA=1` test described in the README. No latency, RAM peak, or answer-quality benchmark is claimed.
2. **Authenticated Confluence API:** no application API-token sync was run against a live tenant. REST interactions were validated with offline fixtures against official API documentation. Configure your own approved tenant and root in a private local `.env`. The importer expects published pages with storage-format bodies; use an authorized manual export when drafts, live documents, or another content type are unsupported. No real handbook content, organization tenant URL, or organization page ID is bundled or indexed in this public source.
3. **Actual handbook questions:** no real handbook-derived examples or answers are claimed. The included Lavender fixture and example questions are fictional and labeled synthetic. Importing a real export or successful app API result is still required to validate actual content, citations, missing-information behavior, and repeat sync.
4. **Windows runtime:** commands are Windows-first and avoid PowerShell activation/execution-policy changes, but dependency install and UI/model execution on the target Windows computer were not performed.
5. **Intel GPU/NPU acceleration:** not verified or assumed. CPU-first is the default expectation.
6. **Confluence edge cases:** off-origin CDN attachment downloads are intentionally blocked; non-page child containers are not traversed; dynamic/include macros are not expanded; scoped tokens requiring the Atlassian gateway are unsupported. These cases produce warnings or partial snapshots, with prior unverified entries excluded from retrieval.
7. **Local snapshots and storage:** manual exports do not automatically reflect Confluence permissions/deletions. Cached source text and vectors are not application-encrypted. Use approved disk encryption and private local storage, and sync/re-export before relying on freshness.
8. **Model replacement:** a changed embedding model tag/config requires rebuild. Replacing weights under the same tag also requires explicit rebuild; the stored fingerprint does not include the model digest.

## Version-pinned direct dependencies actually installed

```text
streamlit==1.50.0
chromadb==1.5.9
requests==2.32.5
beautifulsoup4==4.14.3
pypdf==6.1.1
python-docx==1.2.0
python-dotenv==1.1.1
filelock==3.20.0
pytest==8.4.2
ruff==0.14.0
```

Transitive dependencies were resolved successfully in the Linux build environment. This is not a platform-independent fully locked transitive environment; the Windows installer resolves compatible wheels from the pinned direct requirements.

## Delivery boundary

Deliver source, README, this record, configuration examples, tests, and the labeled synthetic example only. Exclude `.venv`, caches, `.env`, uploaded/exported documents, databases, logs, and `data/`. No actual credentials or organization document contents are included. No application service has been deployed. Repository publication, when performed, shares this source-only payload rather than document data or a running service.
