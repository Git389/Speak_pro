# Epsilon Speak Pro

Epsilon Speak Pro is an interview and IELTS-speaking app with three main layers:

1. `r3f-interviewer/`
   React + Vite frontend with the browser interview flow, webcam PiP, speech recognition, 3D avatar mode, and talking-head video mode.
2. `metahuman-server/backend/`
   FastAPI backend for Whisper speech-to-text, Ollama-compatible chat scoring, TTS, and optional Audio2Face / Unreal hooks.
3. `talkinghead-server/`
   FastAPI backend that turns interviewer text into a lip-synced MP4 using SadTalker or Wav2Lip.

## Current Architecture

- The default interactive UI is the React app in [`r3f-interviewer`](./r3f-interviewer).
- The project is not currently using Lightning AI directly.
- The project is not currently using Meta AI directly.
- The `metahuman-server` name refers to an optional Unreal MetaHuman path, not a live dependency of the current React app.
- The current photoreal interviewer path is the local `talkinghead-server` plus SadTalker/Wav2Lip.

## What Fits Lightning AI Best

Best fit for a Lightning AI GPU Studio:

- `talkinghead-server/` for SadTalker or Wav2Lip rendering
- `metahuman-server/backend/` if you want GPU-backed Whisper or other inference

Usually keep local or host separately:

- `r3f-interviewer/` static frontend

Not a great fit for the free tier:

- Unreal MetaHuman + Pixel Streaming in `metahuman-server/unreal/`

That path generally needs a stronger, more persistent GPU setup than the lightweight Studio workflow.

## Recommended Repo Layout For GitHub

Push the app code and setup files, but do not push:

- `node_modules`
- Python virtual environments
- local runtime logs
- SadTalker model checkout
- generated talking-head cache videos
- personal portrait images

This repo already includes a top-level `.gitignore` for that.

## Lightning Setup

See [LIGHTNING_AI_SETUP.md](./LIGHTNING_AI_SETUP.md).
