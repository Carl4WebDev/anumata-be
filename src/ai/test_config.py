"""Model locations come from settings, so the AI service can run on Modal (models in a Volume)."""

import json
import os
import subprocess
import sys
from pathlib import Path

AI_DIR = Path(__file__).parent


def _paths(**env: str) -> dict:
    """Import config in a fresh interpreter (it reads the environment once) and report its paths."""
    code = (
        "import json, config as c; print(json.dumps({"
        "'models': c.MODELS_DIR.as_posix(), 'ser': c.SER_MODEL_PATH.as_posix(), "
        "'fer': c.FER_MODEL_PATH.name, 'cascade': c.CASCADE_PATH.exists()}))"
    )
    run_env = {**os.environ, "WHISPER_DEVICE": "cpu", **env}
    for name in ("MODELS_DIR", "SER_MODEL_FILE", "FER_MODEL_FILE", "LER_MODEL_FILE"):
        if name not in env:
            run_env.pop(name, None)
    out = subprocess.run([sys.executable, "-c", code], cwd=AI_DIR, env=run_env, capture_output=True, text=True, check=True)
    return json.loads(out.stdout.strip().splitlines()[-1])


def test_defaults_to_the_local_models_folder() -> None:
    paths = _paths()
    assert paths["models"] == (AI_DIR / "models").resolve().as_posix()
    assert paths["ser"].endswith("/models/ser_best_model.pt")


def test_models_can_live_in_a_modal_volume_and_be_versioned() -> None:
    paths = _paths(MODELS_DIR="/models", SER_MODEL_FILE="ser_v2.pt")
    assert paths["models"] == "/models"
    assert paths["ser"] == "/models/ser_v2.pt"
    assert paths["fer"] == "fer_best_model.pth"  # unchanged unless asked


def test_face_cascade_always_ships_with_the_code() -> None:
    assert _paths(MODELS_DIR="/somewhere/else")["cascade"] is True
