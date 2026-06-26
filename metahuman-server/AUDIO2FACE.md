# Realistic interviewer with NVIDIA Audio2Face — **no Unreal Engine**

This is the recommended "realistic interviewer" setup: a 3D avatar rendered in the browser
(Ready Player Me + three.js, already built into `EpsilonSpeakPro.html`) with its lips driven by
**NVIDIA Audio2Face-3D**. You get phoneme-accurate, emotion-aware mouth movement on a realistic
3D human **without Unreal Engine and without Pixel Streaming** — only one NVIDIA GPU running the
Audio2Face microservice.

Audio2Face-3D was open-sourced by NVIDIA in September 2025 (models + SDK + NIM microservice), so
there is no licensing fee — you pay only for the GPU.

---

## How it fits together

```
 Browser (EpsilonSpeakPro.html)            YOUR GPU SERVER
 ┌───────────────────────────┐      ┌──────────────────────────────────────┐
 │ 3D avatar (three.js)       │      │  Backend (FastAPI)   POST /a2f         │
 │  • plays audio             │◀──── │   text ─► TTS ─► wav                    │
 │  • applies blendshape      │ JSON │   wav  ─► Audio2Face-3D NIM (gRPC)      │
 │    frames per audio frame  │      │          ─► ARKit blendshape frames     │
 └───────────────────────────┘      │   returns {audio_b64, fps, names,frames}│
                                     │                                        │
                                     │  Audio2Face-3D NIM (GPU, gRPC)         │
                                     └──────────────────────────────────────┘
```

1. The interviewer's line (question / encouragement / reaction) is sent to `POST /a2f`.
2. The backend turns it into speech (TTS), sends the audio to the **Audio2Face-3D NIM**, and gets
   back per-frame **ARKit blendshape weights** (jawOpen, mouthSmileLeft, …).
3. The browser plays the audio and, each animation frame, applies `frames[floor(t*fps)]` to the
   matching morph targets on the 3D avatar → realistic, in-sync lips. No Unreal, no video stream.

> **Works before you have the GPU.** If `A2F_GRPC_URL` is unset, `/a2f` returns the audio plus a
> simple loudness-based `jawOpen` envelope, so the avatar's mouth still moves in time. Swap in the
> real NIM for phoneme accuracy with zero app changes.

---

## Setup

### 1. Run the Audio2Face-3D microservice (GPU)

- Repo / docs: `github.com/NVIDIA/Audio2Face-3D` and
  `docs.nvidia.com/ace/audio2face-3d-microservice`.
- Pull and run the A2F-3D NIM container on a machine with an NVIDIA RTX / data-center GPU. It
  exposes a gRPC endpoint (default port `52000`).
- Vendor the sample client (`a2f_3d`) from `github.com/NVIDIA/Audio2Face-3D-Samples` next to
  `backend/app.py` so `_a2f_grpc()` can call it.

### 2. Point the backend at it

In `backend/.env`:
```
A2F_GRPC_URL=localhost:52000      # or your A2F host:port
# PIPER_VOICE=/path/to/voice.onnx # optional: nicer TTS than the default
```
Restart the backend (`uvicorn app:app --host 0.0.0.0 --port 8000`).

### 3. Configure the web app

In **Epsilon Speak Pro → Admin → AI & Avatar**:
- **Avatar GLB URL** → your Ready Player Me URL with `?morphTargets=ARKit`
  (create free at readyplayer.me — append the morphTargets so the ARKit blendshapes exist).
- **Audio2Face endpoint** → `http://YOUR_SERVER:8000/a2f`.
- Click **Preview avatar** to confirm the head renders, then run a test — the interviewer now
  speaks with Audio2Face-driven lips.

---

## Notes

- **Blendshape names must match.** A2F-3D outputs ARKit-named blendshapes; Ready Player Me avatars
  exported with `morphTargets=ARKit` expose the same names, so they map directly. The browser
  matches names case-insensitively; unmatched names are ignored.
- **Emotion (optional).** A2F's Audio2Emotion can also output expression blendshapes — those flow
  through the same `frames` array and animate automatically if your avatar has them.
- **Scaling.** One GPU can serve many A2F requests (it's per-utterance inference, not a continuous
  video stream like Pixel Streaming), so this scales far more cheaply than the MetaHuman path.
- **Fallback chain.** A2F endpoint set → A2F lips. Avatar URL only → lightweight browser lip-sync.
  Neither → 2D presenter. The app never breaks if a piece is missing.
