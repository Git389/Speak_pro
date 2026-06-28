# Talking-head backend (free, local, photoreal) - SadTalker / Wav2Lip

Turns the AI interviewer's spoken line into a **lip-synced video of one portrait photo** and serves
it to the web app, in place of the 3D avatar. 100% local and free — you only need an NVIDIA GPU.

```
 Web app                              This backend (your GPU box)
 ┌───────────────┐  POST /talk        ┌───────────────────────────────────────────┐
 │ Interview      │ {text} ──────────▶ │ text → TTS (wav) → SadTalker/Wav2Lip(photo)│
 │  plays the mp4 │ ◀────── mp4 ────── │  → lip-synced talking-head MP4              │
 └───────────────┘                    └───────────────────────────────────────────┘
```

## Two engines

| Engine | Quality | Speed | Repo |
|--------|---------|-------|------|
| **SadTalker** (default) | High - natural head + face | Slower (a few sec/sentence on GPU) | https://github.com/OpenTalker/SadTalker |
| **Wav2Lip** | Lips only on a still photo | Faster | https://github.com/Rudrabha/Wav2Lip |

Both generate a **video per utterance** (not real-time streaming), so each interviewer line takes a
few seconds to render on a GPU. Results are **cached by text**, so repeated lines are instant.

## Setup

### 1. Prerequisites
- NVIDIA GPU + recent driver, **ffmpeg** on PATH, Python 3.10.
- A **portrait photo** of your interviewer (front-facing, ~512px), saved as `portrait.jpg` here.

### 2. Install a generator (pick one)

**SadTalker:**
```bash
git clone https://github.com/OpenTalker/SadTalker
cd SadTalker && pip install -r requirements.txt
bash scripts/download_models.sh        # downloads the model weights
```

**Wav2Lip:**
```bash
git clone https://github.com/Rudrabha/Wav2Lip
# download wav2lip_gan.pth into Wav2Lip/checkpoints/ (see the repo README)
pip install -r Wav2Lip/requirements.txt
```

### 3. Install this backend
```bash
cd talkinghead-server
pip install -r requirements.txt
pip install piper-tts          # or: pip install pyttsx3
```

### 4. Configure with environment variables and run
```bash
export ENGINE=sadtalker                       # or wav2lip
export PORTRAIT=$(pwd)/portrait.jpg
export SADTALKER_DIR=/path/to/SadTalker       # for sadtalker
# export WAV2LIP_DIR=/path/to/Wav2Lip         # for wav2lip
# export WAV2LIP_CKPT=checkpoints/wav2lip_gan.pth
export PIPER_VOICE=/path/to/voice.onnx        # optional; else pyttsx3
uvicorn app:app --host 0.0.0.0 --port 8100
```

### 5. Point the web app at it
In **Epsilon Speak Pro -> Settings**, set **Talking-head URL** to:
```
http://localhost:8100/talk
```
The Speaking interview will then show the **photoreal talking head** instead of the 3D avatar.
If the backend is unreachable or a line fails, the app falls back to the 3D avatar automatically.

## Endpoints
- `GET /health` - shows engine + whether the generator dir is set.
- `POST /talk` `{ "text": "..." }` - returns an `video/mp4` of the portrait speaking the text.

## Batch-generate the Speak Pro intro video

If you want a ready-made narrated product intro instead of generating one line at a time, run this from the repo root:

```bash
bash scripts/lightning-generate-intro-video.sh
```

It reads `scripts/intro/speak-ai-app-intro.txt`, renders each line through `POST /talk`, and combines the clips into:

```bash
.epsilon-runtime/speak-ai-app-intro-5min.mp4
```

## Notes & honest limits
- **Latency:** per-utterance generation means a short pause before each interviewer line (a few
  seconds on a good GPU; longer on weak hardware). Caching makes repeats instant. For truly
  real-time photoreal you'd need a streaming service (D-ID/HeyGen) or NVIDIA ACE - not free.
- **One face:** SadTalker/Wav2Lip animate the single portrait you provide. Use a neutral,
  well-lit, front-facing photo for the best lip-sync.
- Keep the portrait you have rights to use.
