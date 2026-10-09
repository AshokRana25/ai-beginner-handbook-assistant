"""Read-only local model check. Does not call Confluence or index documents."""
import sys
from handbook_assistant.config import Settings
from handbook_assistant.ollama_client import OllamaClient, OllamaError


def main():
    settings = Settings()
    settings.validate()
    print("Python:", sys.version.split()[0])
    print("Ollama endpoint:", settings.ollama_url)
    client = OllamaClient(settings.ollama_url)
    try:
        names = client.model_names()
        for model in [settings.chat_model, settings.embedding_model]:
            if model not in names:
                print("MISSING:", model, "— download it with: ollama pull", model)
                return 1
            client.verify_local_model(model)
            print("Local model verified:", model)
        vector = client.embed(["Synthetic setup check."], settings.embedding_model)[0]
        print("Embedding dimensions:", len(vector))
        print("Ready to launch the app on http://127.0.0.1:8501")
        return 0
    except OllamaError as error:
        print(str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
