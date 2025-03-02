import chromadb

# Initialize ChromaDB client
chroma_client = chromadb.PersistentClient(path="./crime_safety_db")

def retrieve_relevant_documents(query: str, top_k: int = 3):
    """
    Searches the RAG database and retrieves the most relevant documents.
    """
    try:
        collection = chroma_client.get_collection("crime_reports")
        results = collection.query(
            query_texts=[query],
            n_results=top_k
        )
        print(f"Retrieved documents: {results['documents']}")  # Log retrieved documents
        return results["documents"][0] if results["documents"] else []
    except Exception as e:
        print(f"Error retrieving documents: {e}")
        return []