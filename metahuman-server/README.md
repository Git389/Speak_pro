# Epsilon Speak Pro — MetaHuman + AI Examiner Server

This folder is the **server-side build** that powers two things the single-file web app
(`EpsilonSpeakPro.html`) cannot do on its own:

1. **A real AI examiner** — Whisper (speech-to-text) + an Ollama LLM scoring answers against the
   official IELTS band descriptors.
2. **A photoreal Unreal MetaHuman interviewer** — rendered by Unreal Engine and delivered to the
   browser as live video via **Pixel Streaming**, with lips driven by the spoken audio
   (NVIDIA Audio2Face or Unreal's runtime lip-sync).

The web app connects to this server through two settings in **Admin → AI & Avatar**:

| Web app setting        | Point it at                                                            |
|------------------------|-----------------------------------------------------------------------|
| **API URL**            | `http://YOUR_SERVER:8000/v1/chat/completions` (this backend, CORS-ok) |
| **Model name**         | e.g. `llama3.1`                                                        |
| **Pixel Streaming URL**| `http://YOUR_SERVER/`  (the Unreal Pixel Streaming web client)         |

---

## Architecture

```
                          ┌──────────────────────────────────────────────┐
   Browser (student)      │                 YOUR GPU SERVER                │
 ┌───────────────────┐    │                                               │
 │ EpsilonSpeakPro    │    │  ┌────────────┐   text/score  ┌────────────┐ │
 │  .html             │    │  │  Backend   │──────────────▶│   Ollama   │ │
 │                    │    │  │ (FastAPI)  │◀──────────────│  (LLM)     │ │
 │  • mic capture     │──audio──▶│ /stt /score│              └────────────┘ │
 │  • IELTS report    │◀──JSON──│ /v1/chat.. │   transcribe ┌────────────┐ │
 │                    │    │  │            │──────────────▶│  Whisper   │ │
 │  ┌──────────────┐  │    │  │   /tts     │──audio──┐     └────────────┘ │
 │  │ <iframe>     │◀─video stream (Pixel Streaming) │                      │
 │  │ MetaHuman    │  │    │  ┌────────────────────▼─────────────────────┐ │
 │  └──────────────┘  │    │  │ Unreal Engine + MetaHuman                 │ │
 └───────────────────┘    │  │  • Audio2Face / runtime lip-sync          │ │
                          │  │  • Pixel Streaming signalling + WebRTC    │ │
                          │  └───────────────────────────────────────────┘ │
                          └──────────────────────────────────────────────┘
```

**Interview loop**

1. Student speaks in the browser → audio posted to `POST /stt` → Whisper returns the transcript.
2. The interviewer's next line (question / encouragement / reaction) is sent to `POST /tts` →
   audio is generated **and** forwarded to Unreal, which drives the MetaHuman's lips (Audio2Face)
   while Pixel Streaming streams the talking face into the browser `<iframe>`.
3. At the end, all answers go to `POST /score` (or the `/v1/chat/completions` proxy) → the LLM
   returns IELTS band scores + descriptor-based feedback as JSON → shown in the report.

---

## Quick start (AI examiner only — no Unreal yet)

You can run the AI examiner first and add the MetaHuman later.

```bash
# 1. Install Ollama and pull a model
#    https://ollama.com  →  then:
ollama pull llama3.1
OLLAMA_ORIGINS=* ollama serve        # OLLAMA_ORIGINS=* allows browser calls

# 2. Start the backend
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                    # edit if needed
uvicorn app:app --host 0.0.0.0 --port 8000
```

Then in the web app **Admin → AI & Avatar**:
- API URL → `http://localhost:8000/v1/chat/completions`
- Model → `llama3.1`
- Click **Test connection** → should say "Model responded".

Now student speaking tests are graded by the real model against the IELTS descriptors.

### Docker (backend + Ollama together)

```bash
docker compose up -d        # starts ollama + backend; then: docker compose exec ollama ollama pull llama3.1
```

---

## Adding the Unreal MetaHuman

See [`unreal/INTEGRATION.md`](unreal/INTEGRATION.md) for the full walkthrough:
creating the MetaHuman, wiring Audio2Face lip-sync, enabling Pixel Streaming, and pointing the
web app's **Pixel Streaming URL** at the Unreal web client.

> **Hardware:** Unreal + MetaHuman + Pixel Streaming needs an NVIDIA RTX GPU (cloud: AWS g5 / Azure
> NV-series). Whisper + a small Ollama model run on CPU but are much faster on the same GPU.
> Budget GPU server time as the main running cost.

---

## Files

```
metahuman-server/
├── README.md                ← this file
├── AUDIO2FACE.md            ← realistic 3D interviewer with Audio2Face, NO Unreal (recommended)
├── docker-compose.yml       ← Ollama + backend
├── backend/
│   ├── app.py               ← FastAPI: /stt /score /tts /a2f /v1/chat/completions
│   ├── requirements.txt
│   └── .env.example
└── unreal/
    └── INTEGRATION.md       ← MetaHuman + Pixel Streaming + Audio2Face setup (Unreal path)
```

## Ways to get a realistic interviewer

- **In-browser 3D + Audio2Face (recommended):** three.js avatar with NVIDIA Audio2Face lips.
  One GPU, no Unreal, no video streaming. See [`AUDIO2FACE.md`](AUDIO2FACE.md).
- **Unity WebGL avatar:** build the interviewer in Unity (uLipSync / SALSA / A2F), export to
  WebGL, embed it. No Unreal, no GPU server. See [`../unity-avatar/INTEGRATION.md`](../unity-avatar/INTEGRATION.md).
- **Photoreal MetaHuman:** Unreal Engine + Pixel Streaming. Highest fidelity, heaviest setup.
  See [`unreal/INTEGRATION.md`](unreal/INTEGRATION.md).

All four avatar modes share one fallback chain in the app:
**Pixel Streaming → Unity WebGL → three.js 3D → 2D presenter.**
