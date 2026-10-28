# Optional integration lab: install chromadb in a separate environment.
# The vectors are invented coordinates, not semantic embeddings.
import chromadb

client = chromadb.EphemeralClient()
collection = client.create_collection('inventory-demo', embedding_function=None)
collection.upsert(
    ids=['doc-a', 'doc-b'],
    embeddings=[[1.0, 0.0], [0.0, 1.0]],
    documents=['Invented team A policy', 'Invented team B policy'],
    metadatas=[{'team': 'A'}, {'team': 'B'}],
)
# A real service derives the permitted team from its authenticated user.
result = collection.query(
    query_embeddings=[[0.9, 0.1]], n_results=1, where={'team': 'A'}
)
print(result['ids'])
