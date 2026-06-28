"""
Epsilon Speak Pro — AI examiner + MetaHuman backend (FastAPI).

Endpoints
  GET  /health                 liveness + active model
  POST /stt                    multipart audio -> {text, language, avg_confidence}   (Whisper)
  POST /score                  {answers:[...], asr_confidence} -> IELTS bands JSON    (Ollama)
  POST /v1/chat/completions    OpenAI-compatible proxy to Ollama (so the browser app
                               can use THIS server as its 'API URL' with CORS allowed)
  POST /tts                    form 'text' -> audio/wav, and (optionally) pushes the
                               audio to Unreal so the MetaHuman lip-syncs while speaking

Run:  uvicorn app:app --host 0.0.0.0 --port 8000
"""
import os, io, json, tempfile, wave

import requests
from fastapi import FastAPI, UploadFile, File, Form, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, HTMLResponse

OLLAMA_URL    = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL  = os.getenv("OLLAMA_MODEL", "llama3.1")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base.en")
WHISPER_DEV   = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMP  = os.getenv("WHISPER_COMPUTE", "int8")
UNREAL_WS     = os.getenv("UNREAL_WS", "")
ALLOW_ORIGINS = os.getenv("ALLOW_ORIGINS", "*").split(",")

# Official IELTS Speaking band descriptors are the grading rubric. The model is told to
# apply them strictly and return only JSON.
IELTS_SYSTEM = (
    "You are a certified IELTS Speaking examiner. Score strictly using the official IELTS "
    "Speaking band descriptors (public version), bands 1-9 with half-bands allowed, on four "
    "criteria: fluency_coherence, lexical_resource, grammatical_range_accuracy, pronunciation. "
    "Judge only the candidate's own language; the reference answer is a guide to a strong "
    "response, not a required match. The candidate text comes from automatic speech recognition, "
    "so judge pronunciation conservatively using the asr_confidence value (0-1) provided. "
    "Return ONLY valid minified JSON, no commentary."
)
JSON_SHAPE = (
    '{"answers":[{"fluency_coherence":0,"lexical_resource":0,'
    '"grammatical_range_accuracy":0,"pronunciation":0,"band":0,"comment":""}],'
    '"overall":{"fluency_coherence":0,"lexical_resource":0,'
    '"grammatical_range_accuracy":0,"pronunciation":0,"band":0},"feedback":["",""]}'
)

app = FastAPI(title="Epsilon Speak Pro backend")
app.add_middleware(
    CORSMiddleware, allow_origins=ALLOW_ORIGINS, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)


@app.api_route("/", methods=["GET", "HEAD"], response_class=HTMLResponse)
def index():
    return """
    <html>
      <head>
        <title>Epsilon Speak Pro API</title>
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
          <h1>Epsilon Speak Pro Backend</h1>
          <p>This port is the FastAPI backend API, not the React interview UI.</p>
          <p>If you want the actual interview screen in Lightning, run the frontend on <code>5173</code>.</p>
          <ul>
            <li><a href="/docs">Open API test interface</a></li>
            <li><a href="/health">Health check</a></li>
            <li><a href="/openapi.json">OpenAPI schema</a></li>
          </ul>
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

# ---- Whisper (lazy load so the server starts instantly) --------------------
_whisper = None
def whisper():
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel
        _whisper = WhisperModel(WHISPER_MODEL, device=WHISPER_DEV, compute_type=WHISPER_COMP)
    return _whisper


@app.get("/health")
def health():
    return {"ok": True, "ollama_model": OLLAMA_MODEL, "whisper_model": WHISPER_MODEL,
            "piper_voice": os.getenv("PIPER_VOICE", "")}


@app.post("/stt")
async def stt(audio: UploadFile = File(...)):
    """Transcribe an uploaded audio clip. avg_confidence is derived from Whisper's
    average log-probability and is used by the examiner to judge pronunciation."""
    data = await audio.read()
    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(data)
        path = f.name
    try:
        segments, info = whisper().transcribe(path, language="en", vad_filter=True)
        parts, logprobs = [], []
        for s in segments:
            parts.append(s.text.strip())
            if getattr(s, "avg_logprob", None) is not None:
                logprobs.append(s.avg_logprob)
        # map avg log-prob (~ -1.0..0) to a 0..1 confidence
        import math
        conf = 0.0
        if logprobs:
            conf = max(0.0, min(1.0, math.exp(sum(logprobs) / len(logprobs))))
        return {"text": " ".join(parts).strip(), "language": info.language,
                "avg_confidence": round(conf, 3)}
    finally:
        try: os.remove(path)
        except OSError: pass


def _ollama_chat(messages, want_json=True):
    body = {"model": OLLAMA_MODEL, "stream": False, "messages": messages}
    if want_json:
        body["format"] = "json"
    r = requests.post(f"{OLLAMA_URL}/api/chat", json=body, timeout=180)
    r.raise_for_status()
    return r.json()["message"]["content"]


@app.post("/score")
def score(payload: dict = Body(...)):
    """payload = {answers:[{question, reference, answer}], asr_confidence}"""
    user = ("Return JSON exactly in this shape (all numbers are IELTS bands 1-9):\n"
            + JSON_SHAPE + "\n\nScore this candidate:\n" + json.dumps(payload))
    try:
        content = _ollama_chat(
            [{"role": "system", "content": IELTS_SYSTEM}, {"role": "user", "content": user}])
        return json.loads(content)
    except json.JSONDecodeError:
        return JSONResponse({"error": "model_returned_invalid_json"}, status_code=502)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@app.post("/v1/chat/completions")
def chat_completions(body: dict = Body(...)):
    """Minimal OpenAI-compatible proxy so the browser app can call this server directly
    (CORS is enabled here, unlike most cloud LLM APIs)."""
    try:
        content = _ollama_chat(body.get("messages", []),
                               want_json=False)
        return {"id": "esp-1", "object": "chat.completion",
                "model": body.get("model", OLLAMA_MODEL),
                "choices": [{"index": 0, "finish_reason": "stop",
                             "message": {"role": "assistant", "content": content}}]}
    except Exception as e:
        return JSONResponse({"error": {"message": str(e)}}, status_code=502)


@app.post("/tts")
def tts(text: str = Form(...)):
    """Generate speech for the interviewer. Tries Piper, then pyttsx3. If UNREAL_WS is set,
    the same audio is pushed to Unreal so the MetaHuman lip-syncs (see unreal/INTEGRATION.md)."""
    wav_bytes = _synthesize(text)
    if UNREAL_WS:
        try:
            _push_to_unreal(text, wav_bytes)
        except Exception:
            pass  # streaming the face is best-effort; audio still returns to the browser
    return Response(content=wav_bytes, media_type="audio/wav")


def _synthesize(text: str) -> bytes:
    # Option A: Piper (neural). pip install piper-tts and set PIPER_VOICE to a .onnx path.
    voice = os.getenv("PIPER_VOICE")
    if voice:
        import subprocess
        p = subprocess.run(["piper", "--model", voice, "--output_file", "-"],
                           input=text.encode(), capture_output=True)
        if p.returncode == 0 and p.stdout:
            return p.stdout
    # Option B: pyttsx3 (offline system voices)
    try:
        import pyttsx3
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            out = f.name
        eng = pyttsx3.init(); eng.save_to_file(text, out); eng.runAndWait()
        with open(out, "rb") as fh:
            data = fh.read()
        os.remove(out)
        return data
    except Exception:
        # Last resort: 0.5s of silence so the client doesn't error
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
            w.writeframes(b"\x00\x00" * 8000)
        return buf.getvalue()


def _push_to_unreal(text: str, wav_bytes: bytes):
    """Send the line + audio to Unreal over a websocket. Unreal feeds the audio into
    Audio2Face (or runtime lip-sync) to animate the MetaHuman's mouth in real time."""
    import base64
    from websocket import create_connection   # pip install websocket-client
    ws = create_connection(UNREAL_WS, timeout=5)
    ws.send(json.dumps({"type": "speak", "text": text,
                        "audio_wav_b64": base64.b64encode(wav_bytes).decode()}))
    ws.close()


# ===========================================================================
# Audio2Face (no Unreal): interviewer text -> TTS -> ARKit blendshape frames
# Browser 3D avatar plays the returned audio + frames in sync.
# ===========================================================================
import base64, array, wave as _wave

A2F_GRPC_URL = os.getenv("A2F_GRPC_URL", "")   # e.g. "localhost:52000" for the A2F-3D NIM.
                                               # Empty -> amplitude fallback (works without a GPU).

def _a2f_grpc(wav_bytes):
    """Real path: send the wav to the NVIDIA Audio2Face-3D NIM (gRPC) and return
    (fps, blendshape_names, frames). Requires:
      1) the A2F-3D NIM running on a GPU (docs.nvidia.com/ace/audio2face-3d-microservice),
      2) the sample client vendored next to this file from NVIDIA/Audio2Face-3D-Samples
         (the `a2f_3d` python package).
    """
    if not A2F_GRPC_URL:
        raise RuntimeError("A2F_GRPC_URL not configured")
    from a2f_3d.client import A2F3DClient          # from NVIDIA/Audio2Face-3D-Samples
    client = A2F3DClient(A2F_GRPC_URL)
    res = client.process_wav(wav_bytes)            # -> object with .fps, .names, .frames
    return res.fps, list(res.names), [list(f) for f in res.frames]


def _amplitude_frames(wav_bytes, fps=30):
    """Fallback when no A2F GPU is attached: derive a simple `jawOpen` envelope from audio
    loudness so the avatar's mouth still moves in time with speech."""
    try:
        with _wave.open(io.BytesIO(wav_bytes), "rb") as w:
            sr, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
            raw = w.readframes(w.getnframes())
    except Exception:
        return fps, ["jawOpen"], [[0.0]]
    if sw != 2:                       # only 16-bit PCM is handled; otherwise flat
        return fps, ["jawOpen"], [[0.0]]
    samples = array.array("h"); samples.frombytes(raw)
    if ch > 1:
        samples = samples[0::ch]
    total = len(samples)
    dur = total / float(sr) if sr else 0.0
    nframes = max(1, int(dur * fps))
    win = max(1, total // nframes)
    frames = []
    for i in range(nframes):
        seg = samples[i * win:(i + 1) * win] or samples[-win:]
        rms = (sum(s * s for s in seg) / len(seg)) ** 0.5 if len(seg) else 0.0
        frames.append([round(min(1.0, rms / 8000.0), 3)])
    return fps, ["jawOpen"], frames


@app.post("/a2f")
def a2f(body: dict = Body(...)):
    """Input: {text} (the interviewer line) or {audio_b64}.
    Output: {audio_b64, fps, blendshape_names, frames, engine}.
    The browser avatar plays audio_b64 and applies frames[i] (named ARKit blendshapes)
    at time i/fps for realistic, audio-driven lips."""
    wav = base64.b64decode(body["audio_b64"]) if body.get("audio_b64") else _synthesize(body.get("text", ""))
    try:
        fps, names, frames = _a2f_grpc(wav)
        engine = "audio2face-3d"
    except Exception:
        fps, names, frames = _amplitude_frames(wav)
        engine = "amplitude_fallback"
    return {"audio_b64": base64.b64encode(wav).decode(),
            "fps": fps, "blendshape_names": names, "frames": frames, "engine": engine}
