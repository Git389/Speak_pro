"""
Epsilon Speak Pro - Talking-head backend (free, local, photoreal).

Turns the interviewer's spoken line into a lip-synced video of a single portrait photo,
using open-source SadTalker (higher quality) or Wav2Lip (faster). Returns an MP4 the web app
plays in place of the 3D avatar.

Pipeline:   POST /talk {text}  ->  TTS (wav)  ->  SadTalker/Wav2Lip(portrait, wav)  ->  MP4

Requires (on a machine with an NVIDIA GPU):
  - ffmpeg on PATH
  - ONE of:
      SadTalker  cloned + weights  (https://github.com/OpenTalker/SadTalker)   -> set SADTALKER_DIR
      Wav2Lip    cloned + checkpoint(https://github.com/Rudrabha/Wav2Lip)      -> set WAV2LIP_DIR, WAV2LIP_CKPT
  - a portrait photo of your interviewer  -> set PORTRAIT (jpg/png, front-facing, ~512px)
  - a TTS option: PIPER_VOICE (.onnx) or pyttsx3 fallback

Run:  uvicorn app:app --host 0.0.0.0 --port 8100
"""
import os, io, glob, time, hashlib, tempfile, subprocess, wave, shutil, threading

from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse

ENGINE        = os.getenv("ENGINE", "sadtalker")          # "sadtalker" | "wav2lip"
PORTRAIT      = os.getenv("PORTRAIT", "portrait.jpg")
SADTALKER_DIR = os.getenv("SADTALKER_DIR", "")
WAV2LIP_DIR   = os.getenv("WAV2LIP_DIR", "")
WAV2LIP_CKPT  = os.getenv("WAV2LIP_CKPT", "checkpoints/wav2lip_gan.pth")
PIPER_VOICE   = os.getenv("PIPER_VOICE", "")
PYTHON        = os.getenv("PYTHON_BIN", "")
CACHE_DIR     = os.getenv("CACHE_DIR", os.path.abspath("./cache"))
ALLOW_ORIGINS = os.getenv("ALLOW_ORIGINS", "*").split(",")
SADTALKER_PREPROCESS = os.getenv("SADTALKER_PREPROCESS", "crop")
SADTALKER_ENHANCER = os.getenv("SADTALKER_ENHANCER", "").strip()
SADTALKER_STILL = os.getenv("SADTALKER_STILL", "1").strip().lower() not in {"0", "false", "no"}
TTS_RATE = int(os.getenv("TTS_RATE", "190"))

os.makedirs(CACHE_DIR, exist_ok=True)
GEN_LOCK = threading.Lock()
app = FastAPI(title="Epsilon talking-head backend")
app.add_middleware(CORSMiddleware, allow_origins=ALLOW_ORIGINS, allow_methods=["*"], allow_headers=["*"])


@app.get("/", response_class=HTMLResponse)
def index():
    return """
    <html>
      <head>
        <title>Epsilon Talking-Head API</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background: #0f172a; color: #e2e8f0; }
          a { color: #93c5fd; }
          code { background: #1e293b; padding: 2px 6px; border-radius: 6px; }
          .card { max-width: 860px; padding: 24px; border: 1px solid #334155; border-radius: 16px; background: #111827; }
          li { margin: 8px 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Epsilon Talking-Head Backend</h1>
          <p>This port is the photoreal video API. It does not serve the interview UI.</p>
          <ul>
            <li><a href="/health">Health check</a></li>
            <li><a href="/portrait">Current portrait</a></li>
          </ul>
          <p>Use <code>POST /talk</code> with JSON like <code>{"text":"Hello"}</code> to generate a talking video clip.</p>
          <p>Important ports for this project:</p>
          <ul>
            <li><code>5173</code> = React interview frontend</li>
            <li><code>8000</code> = AI backend API</li>
            <li><code>8100</code> = talking-head video API</li>
          </ul>
        </div>
      </body>
    </html>
    """


@app.get("/health")
def health():
    return {"ok": True, "engine": ENGINE, "portrait": PORTRAIT,
            "sadtalker": bool(SADTALKER_DIR), "wav2lip": bool(WAV2LIP_DIR),
            "python_bin": _python_bin(),
            "sadtalker_preprocess": SADTALKER_PREPROCESS,
            "sadtalker_enhancer": SADTALKER_ENHANCER,
            "sadtalker_still": SADTALKER_STILL,
            "tts_rate": TTS_RATE}


@app.get("/portrait")
def portrait():
    if not PORTRAIT or not os.path.exists(PORTRAIT):
        return JSONResponse({"error": "portrait not found"}, status_code=404)
    return FileResponse(PORTRAIT)


def _python_bin() -> str:
    """Use an explicit generator interpreter when available, otherwise fall back to PATH."""
    if PYTHON and os.path.exists(PYTHON):
        return PYTHON

    candidates = []
    if SADTALKER_DIR:
        candidates.extend([
            os.path.join(SADTALKER_DIR, ".venv310", "bin", "python"),
            os.path.join(SADTALKER_DIR, ".venv", "bin", "python"),
            os.path.join(SADTALKER_DIR, "venv", "bin", "python"),
            os.path.join(SADTALKER_DIR, ".venv310", "Scripts", "python.exe"),
            os.path.join(SADTALKER_DIR, ".venv", "Scripts", "python.exe"),
            os.path.join(SADTALKER_DIR, "venv", "Scripts", "python.exe"),
        ])
    if WAV2LIP_DIR:
        candidates.extend([
            os.path.join(WAV2LIP_DIR, ".venv310", "bin", "python"),
            os.path.join(WAV2LIP_DIR, ".venv", "bin", "python"),
            os.path.join(WAV2LIP_DIR, "venv", "bin", "python"),
            os.path.join(WAV2LIP_DIR, ".venv310", "Scripts", "python.exe"),
            os.path.join(WAV2LIP_DIR, ".venv", "Scripts", "python.exe"),
            os.path.join(WAV2LIP_DIR, "venv", "Scripts", "python.exe"),
        ])

    for path in candidates:
        if path and os.path.exists(path):
            return path
    return shutil.which("python") or "python"


def _tts(text: str, out_wav: str):
    """Render the line to a 16-bit wav (Piper if configured, else pyttsx3, else silence)."""
    if PIPER_VOICE:
        with open(out_wav, "wb") as f:
            p = subprocess.run(["piper", "--model", PIPER_VOICE, "--output_file", out_wav],
                               input=text.encode(), capture_output=True)
        if p.returncode == 0 and os.path.getsize(out_wav) > 0:
            return
    try:
        import pyttsx3
        eng = pyttsx3.init(); eng.setProperty("rate", TTS_RATE); eng.save_to_file(text, out_wav); eng.runAndWait()
        if os.path.getsize(out_wav) > 0:
            return
    except Exception:
        pass
    with wave.open(out_wav, "wb") as w:           # last resort so the pipeline still runs
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        w.writeframes(b"\x00\x00" * 16000)


def _newest_mp4(folder: str):
    vids = glob.glob(os.path.join(folder, "**", "*.mp4"), recursive=True)
    return max(vids, key=os.path.getmtime) if vids else None


def _run_sadtalker(wav: str, out_dir: str) -> str:
    # https://github.com/OpenTalker/SadTalker  -- still + full preprocess = stable head, talking mouth
    cmd = [_python_bin(), "inference.py", "--driven_audio", wav, "--source_image", os.path.abspath(PORTRAIT),
           "--result_dir", out_dir, "--preprocess", SADTALKER_PREPROCESS]
    if SADTALKER_STILL:
        cmd.append("--still")
    if SADTALKER_ENHANCER:
        cmd.extend(["--enhancer", SADTALKER_ENHANCER])
    subprocess.run(cmd, cwd=SADTALKER_DIR, check=True)
    mp4 = _newest_mp4(out_dir)
    if not mp4:
        raise RuntimeError("SadTalker produced no mp4")
    return mp4


def _run_wav2lip(wav: str, out_mp4: str) -> str:
    # https://github.com/Rudrabha/Wav2Lip  -- faster, lips-only
    subprocess.run([_python_bin(), "inference.py", "--checkpoint_path", WAV2LIP_CKPT,
                    "--face", os.path.abspath(PORTRAIT), "--audio", wav, "--outfile", out_mp4],
                   cwd=WAV2LIP_DIR, check=True)
    if not os.path.exists(out_mp4):
        raise RuntimeError("Wav2Lip produced no mp4")
    return out_mp4


def _cache_key(text: str) -> str:
    parts = [
        ENGINE,
        os.path.abspath(PORTRAIT),
        SADTALKER_PREPROCESS,
        SADTALKER_ENHANCER,
        "still" if SADTALKER_STILL else "motion",
        str(TTS_RATE),
        WAV2LIP_CKPT if ENGINE == "wav2lip" else "",
        text,
    ]
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:16]


@app.post("/talk")
def talk(body: dict = Body(...)):
    """Input {text}. Returns an MP4 of the portrait speaking that text (lip-synced)."""
    text = (body or {}).get("text", "").strip()
    if not text:
        return JSONResponse({"error": "no text"}, status_code=400)
    key = _cache_key(text)
    cached = os.path.join(CACHE_DIR, key + ".mp4")
    if os.path.exists(cached):
        return FileResponse(cached, media_type="video/mp4")
    try:
        with GEN_LOCK:
            if os.path.exists(cached):
                return FileResponse(cached, media_type="video/mp4")
            with tempfile.TemporaryDirectory() as tmp:
                wav = os.path.join(tmp, "line.wav"); _tts(text, wav)
                if ENGINE == "wav2lip":
                    if not WAV2LIP_DIR:
                        return JSONResponse({"error": "WAV2LIP_DIR not set"}, status_code=503)
                    mp4 = _run_wav2lip(wav, os.path.join(tmp, "out.mp4"))
                else:
                    if not SADTALKER_DIR:
                        return JSONResponse({"error": "SADTALKER_DIR not set"}, status_code=503)
                    mp4 = _run_sadtalker(wav, os.path.join(tmp, "out"))
                shutil.move(mp4, cached)
        return FileResponse(cached, media_type="video/mp4")
    except subprocess.CalledProcessError as e:
        return JSONResponse({"error": "generator failed", "detail": str(e)}, status_code=500)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
