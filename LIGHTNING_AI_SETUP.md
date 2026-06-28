# Lightning AI Setup

This guide is for running the GPU-heavy parts of Epsilon Speak Pro on Lightning AI.

## Recommended Deployment Shape

### Best option

- Keep `r3f-interviewer/` as the frontend.
- Run `talkinghead-server/` on a Lightning GPU Studio.
- Optionally run `metahuman-server/backend/` in the same Studio if you also want Whisper / model inference there.

### Why

- SadTalker and Wav2Lip are the parts that benefit most from a free GPU.
- The React frontend does not need a GPU.
- The Unreal MetaHuman path is much heavier and is not the best first target for a free Studio.

## What The Project Uses Right Now

- `r3f-interviewer/src/lib/config.js` points the app at chat, TTS, and talking-head endpoints.
- `r3f-interviewer/src/components/Interview.jsx` plays either the 3D interviewer or the talking-head MP4 clips.
- `talkinghead-server/app.py` renders the photoreal face clips.
- `metahuman-server/backend/app.py` handles STT, scoring, chat proxying, TTS, and Audio2Face fallback logic.

## Frontend Environment Variables

The frontend now supports Vite environment variables through `r3f-interviewer/.env.example`.

Useful variables:

- `VITE_LLM_URL`
- `VITE_LLM_MODEL`
- `VITE_TTS_URL`
- `VITE_TALK_URL`
- `VITE_INTERVIEW_KIND`
- `VITE_JOB_ROLE`

That makes it easier to build the frontend against Lightning-hosted backend URLs instead of hardcoded localhost values.

## GitHub First

Lightning works best when the code lives in GitHub first.

### Local commands

Run these from the project root after creating your GitHub repo:

```bash
git init -b main
git add .
git commit -m "Initial Epsilon Speak Pro import"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

If you already have a GitHub repo, skip `git init` and just add the remote.

## Lightning AI Workflow

Based on the current Lightning AI docs and site:

- Lightning Studio is the main workspace model.
- Lightning advertises 1 Studio free 24/7 and monthly free GPU hours.
- Lightning docs mention GitHub/GitLab integration for Studios.
- Lightning docs also mention connecting a local IDE like VSCode or SSH to a Studio.
- Lightning docs mention exposing web apps or APIs through public links / public ports.

## How To Connect GitHub To Lightning

1. Push this project to GitHub.
2. Log into Lightning AI.
3. During onboarding or from Studio setup, connect your GitHub account.
4. Create a new Studio from the GitHub repository.
5. Open the repo inside the Studio.
6. Use a GPU machine only when you need SadTalker, Wav2Lip, or GPU-backed inference.

## How To Connect VSCode To Lightning

The Lightning docs say Studios support connecting a local IDE such as VSCode, Cursor, Windsurf, PyCharm, or plain SSH.

Typical flow:

1. Open the Studio.
2. Open the IDE / SSH connection option in Lightning.
3. Copy the connection details Lightning provides.
4. Connect from local VSCode using the Remote SSH workflow.

## What To Run In The Studio

### Talking-head backend

Use the Studio GPU for:

- SadTalker
- Wav2Lip
- any clip pre-rendering

### AI backend

Use the same Studio if you want:

- Whisper on GPU
- a hosted FastAPI backend
- a single public endpoint for `/tts`, `/stt`, `/score`, and `/v1/chat/completions`

## Commands That Match Lightning Studio

The earlier local Windows commands are not the best fit for Lightning Studio.
Lightning gives you one main conda environment, so do not create `.venv` or `.venv310` inside the Studio.

### Clone the repo

```bash
git clone https://github.com/Git389/Speak_pro.git
cd Speak_pro
```

### Start the talking-head backend in Lightning

1. Upload your interviewer portrait to:

```bash
talkinghead-server/portrait.jpg
```

2. Run:

```bash
bash scripts/lightning-start-talkinghead.sh
```

### Start the AI backend in Lightning

```bash
bash scripts/lightning-start-ai-backend.sh
```

## Lightning Troubleshooting

### If `nvidia-smi` says command not found

That usually means the current Studio is not attached to a GPU machine yet, or the container image does not expose the tool.
Use the Lightning machine selector to attach a GPU-backed Studio before expecting SadTalker to render.

### If Lightning says venv creation is not allowed

That is expected in Studio.
Use the built-in conda environment and the `scripts/lightning-start-*.sh` scripts instead of:

```bash
python -m venv ...
source .venv/bin/activate
```

### If SadTalker fails on Python 3.12

SadTalker's pinned dependency stack is old and does not install cleanly on the default Python 3.12 Studio image.
Run this once in the Studio terminal, then open a fresh terminal:

```bash
conda install -y python=3.10
```

Then rerun:

```bash
bash scripts/lightning-start-talkinghead.sh
```

### If `/talk` starts but generation fails later

Make sure `PYTHON_BIN` points to a real interpreter.
The Lightning script now sets:

```bash
export PYTHON_BIN="$(command -v python)"
```

That is important because the older local Windows setup used `.venv310`, which does not exist in Lightning Studio.

## Important Limits

### Good fit for Lightning free GPU

- clip rendering
- batch pre-generation
- short inference jobs
- development and testing

### Risky for Lightning free GPU

- full-time Unreal MetaHuman Pixel Streaming
- always-on heavy real-time video generation
- long-running multi-service GPU workloads

## Suggested Next Move

For this project, the cleanest path is:

1. Put the repo on GitHub.
2. Create one Lightning Studio from that repo.
3. Run `talkinghead-server/` there first.
4. Point the frontend's `talkUrl` at the Lightning public URL.
5. Move `metahuman-server/backend/` after that if you want cloud STT / scoring too.

This gives you the biggest quality gain with the least setup pain.
