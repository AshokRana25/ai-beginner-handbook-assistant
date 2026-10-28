import re

doc = {
    "id": "warranty-v2",
    "text": "Coverage lasts two years from purchase.\n\n"
            "Water damage is excluded from coverage.\n\n"
            "Returns require the original receipt.",
}


def chunk_by_paragraph(doc):
    parts = [p.strip() for p in doc["text"].split("\n\n") if p.strip()]
    return [{"source": doc["id"], "position": i, "text": p} for i, p in enumerate(parts)]


def tokens(text):
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def keyword_search(chunks, query, k=2):
    terms = tokens(query)
    scored = [(len(terms & tokens(c["text"])), c) for c in chunks]
    scored = [pair for pair in scored if pair[0] > 0]
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [c for _, c in scored[:k]]


chunks = chunk_by_paragraph(doc)
for hit in keyword_search(chunks, "Is water damage covered?"):
    print(hit["source"], hit["position"], hit["text"])
