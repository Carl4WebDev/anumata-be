"""
Runs the Amumata AI service (FastAPI + FER/SER/LER + Whisper + Ollama) on Modal.

    One-time setup (from the anumata-be folder):
      modal volume create anumata-models
      modal volume put anumata-models src/ai/models/fer_best_model.pth /fer_best_model.pth
      modal volume put anumata-models src/ai/models/ser_best_model.pt  /ser_best_model.pt
      modal volume put anumata-models src/ai/models/ler_best_model.pt  /ler_best_model.pt
      modal run src/ai/modal_app.py::download_models     # Whisper, base models, Llama → the Volume

    Deploy (again after every change to the AI code):
      modal deploy src/ai/modal_app.py

The printed URL becomes the backend's AI_SERVICE_URL. The endpoint requires a
Modal proxy token (sent by the backend as AI_SERVICE_KEY / AI_SERVICE_SECRET).
"""

import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import modal

AI_DIR = Path(__file__).parent
MODELS = "/models"  # where the Volume is mounted
GPU = "L4"
OLLAMA_VERSION = "0.40.5"  # pinned on purpose: change deliberately, then redeploy
OLLAMA_MODEL = "llama3.2:3b"
WHISPER_MODEL = "large-v3"
# Hugging Face base models the SER / LER heads are built on (see ser_service / ler_service).
BASE_MODELS = ["facebook/wav2vec2-base", "FacebookAI/xlm-roberta-base"]
TRAINED_MODELS = ["fer_best_model.pth", "ser_best_model.pt", "ler_best_model.pt"]

volume = modal.Volume.from_name("anumata-models", create_if_missing=True)

image = (
    # CUDA 12 + cuDNN 9: what faster-whisper (CTranslate2) needs on the GPU.
    modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04", add_python="3.11")
    .apt_install("curl", "zstd", "ffmpeg", "libgl1", "libglib2.0-0")
    .run_commands(f"curl -fsSL https://ollama.com/install.sh | OLLAMA_VERSION={OLLAMA_VERSION} sh")
    .pip_install_from_requirements(str(AI_DIR / "requirements.txt"))
    .env(
        {
            # Everything big lives in the Volume, downloaded once (download_models).
            "MODELS_DIR": MODELS,
            "HF_HOME": f"{MODELS}/huggingface",
            "OLLAMA_MODELS": f"{MODELS}/ollama",
            "OLLAMA_MODEL": OLLAMA_MODEL,
            "WHISPER_MODEL": WHISPER_MODEL,
            "WHISPER_DEVICE": "cuda",
        }
    )
    # The AI code itself (the trained models come from the Volume instead).
    .add_local_dir(
        AI_DIR,
        remote_path="/root/ai",
        ignore=["models/*.pt", "models/*.pth", "**/__pycache__", "**/test_*.py", "modal_app.py"],
    )
)

app = modal.App("anumata-ai", image=image)


def _start_ollama() -> None:
    """Start the local Ollama server (reports, translation, question-set AI) and wait until it answers."""
    subprocess.Popen(["ollama", "serve"])
    for _ in range(60):
        try:
            urllib.request.urlopen("http://127.0.0.1:11434", timeout=1)
            return
        except OSError:
            time.sleep(1)
    raise RuntimeError("Ollama did not start within 60 s")


@app.function(volumes={MODELS: volume}, timeout=60 * 60)
def download_models() -> None:
    """One-time: put Whisper, the SER/LER base models and Llama into the Volume (no GPU needed)."""
    from faster_whisper import download_model
    from huggingface_hub import snapshot_download

    _start_ollama()
    subprocess.run(["ollama", "pull", OLLAMA_MODEL], check=True)
    download_model(WHISPER_MODEL)
    for name in BASE_MODELS:
        snapshot_download(name)
    volume.commit()

    missing = [f for f in TRAINED_MODELS if not (Path(MODELS) / f).exists()]
    if missing:
        print("Still to upload with `modal volume put anumata-models ...`:", ", ".join(missing))
    else:
        print("All models are in the Volume. Next: modal deploy src/ai/modal_app.py")


@app.function(
    gpu=GPU,
    volumes={MODELS: volume},
    timeout=30 * 60,  # longest single request: analysing a long interview
    scaledown_window=5 * 60,  # stay warm 5 min after the last request, then shut down (no cost while off)
    max_containers=1,  # one GPU; analysis progress is kept in this container's memory
)
@modal.concurrent(max_inputs=16)  # captions, progress and health checks keep working during an analysis
@modal.asgi_app(requires_proxy_auth=True)
def web():
    """The existing FastAPI app (src/ai/main.py), unchanged. Its startup preloads every model."""
    _start_ollama()
    sys.path.insert(0, "/root/ai")
    from main import app as fastapi_app

    return fastapi_app
