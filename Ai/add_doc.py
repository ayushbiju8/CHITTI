import chromadb
import requests
import pdfplumber
import pandas as pd
from bs4 import BeautifulSoup
import os

# Initialize ChromaDB
chroma_client = chromadb.PersistentClient(path="./crime_safety_db")
collection = chroma_client.get_or_create_collection(name="crime_reports")

# Function to add a document to ChromaDB
def add_document(doc_id, text, metadata={}):
    if not text.strip():
        print(f"Skipping empty document: {doc_id}")
        return
    collection.add(
        ids=[doc_id],
        documents=[text],
        metadatas=[metadata]
    )
    print(f"Added document to ChromaDB: {doc_id}")

# Function to extract text from a TXT file
def extract_text_from_txt(file_path):
    with open(file_path, "r", encoding="utf-8") as file:
        return file.read()

# Function to extract text from a PDF file
def extract_text_from_pdf(file_path):
    text = ""
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            text += page.extract_text() + "\n"
    return text.strip()

# Function to extract data from a CSV file (assuming a "text" column)
def extract_text_from_csv(file_path):
    df = pd.read_csv(file_path)
    return "\n".join(df["text"].dropna().tolist())

# Function to extract text from a webpage URL
def extract_text_from_url(url):
    try:
        response = requests.get(url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        return soup.get_text(separator="\n", strip=True)
    except requests.RequestException as e:
        print(f"Error fetching URL: {url} - {e}")
        return None

# Function to process and store document
def process_and_store(input_path):
    doc_id = os.path.basename(input_path)  # Use filename as ID

    if input_path.startswith("http"):  # Check if it's a URL
        text = extract_text_from_url(input_path)
        metadata = {"source": "url", "url": input_path}
    elif input_path.endswith(".txt"):
        text = extract_text_from_txt(input_path)
        metadata = {"source": "file", "file_type": "txt"}
    elif input_path.endswith(".pdf"):
        text = extract_text_from_pdf(input_path)
        metadata = {"source": "file", "file_type": "pdf"}
    elif input_path.endswith(".csv"):
        text = extract_text_from_csv(input_path)
        metadata = {"source": "file", "file_type": "csv"}
    else:
        print(f"Unsupported file type: {input_path}")
        return

    if text:
        add_document(doc_id, text, metadata)
        print(f"Successfully added: {input_path}")
    else:
        print(f"No valid content extracted from: {input_path}")

# ----------------- MAIN EXECUTION -----------------
if __name__ == "__main__":
    user_input = input("Enter the file path or URL: ").strip()
    process_and_store(user_input)