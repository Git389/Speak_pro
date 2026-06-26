# Epsilon Speak Pro — Conversational Interviewer (React Three Fiber)

A **conversational, LLM-driven IELTS speaking interviewer** rendered as a 3D avatar in the browser
with **React Three Fiber**. The avatar greets the candidate, asks dynamic follow-up questions
(LLM), listens (speech-to-text), speaks aloud (TTS) with **lip-sync**, and at the end scores the
whole interview against the official **IELTS Speaking band descriptors**.

No plugins, no Unreal, no GPU server required for the base experience — it runs entirely in the
browser. Optionally connect a local/cloud LLM and a neural TTS for higher quality.

## Run

```bash
cd r3f-interviewer
npm install
npm run dev        # opens http://localhost:5173
```

Use **Google Chrome** (Web Speech API for the microphone) and allow mic access.

## Configure (on the Setup screen)

- **Avatar URL** — any glTF/GLB head **with ARKit blendshapes** (`jawOpen`, `eyeBlink*`, `viseme_*`).
  The camera auto-frames whatever you load. Options:
  - **Default (no signup, works out of the box):** the three.js *facecap* head, already pre-filled —
    `https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/facecap.glb`
  - **Ready Player Me** (if reachable for you): `https://models.readyplayer.me/<ID>.glb?morphTargets=ARKit,Oculus Visemes`
  - **Avaturn / Character Creator** exports, or any GLB with ARKit-named morphs.
  - **Local file:** drop a `.glb` into `r3f-interviewer/public/` and set the URL to `/yourhead.glb`
    (no CORS, works fully offline).
  If a URL fails to load, the app shows a hint and the spoken interview still runs without the
  visual.
- **AI model** — an OpenAI-compatible endpoint:
  - Local Ollama: `http://localhost:11434/v1/chat/completions`, model `llama3.1`
    (start Ollama with `OLLAMA_ORIGINS=*`).
  - Or the Epsilon backend proxy in `../metahuman-server` (`/v1/chat/completions`).
  - Or any cloud key.
  - *Without a model*, a built-in question set + heuristic scorer are used so it still runs.
- **TTS URL** (optional) — the backend `/tts` (returns wav). When set, lips are driven by the
  actual audio waveform; otherwise the browser's speech voice is used with procedural lip-sync.
- **Questions** — how many turns before scoring.

## How it works

```
 Setup ─▶ Interview loop ─▶ Report
            │
            ├─ nextInterviewerTurn(history)  → LLM picks the next question/follow-up
            ├─ speak(text)                   → TTS + viseme.open drives avatar mouth (useFrame)
            ├─ listen()                      → Web Speech API transcribes the answer
            └─ scoreInterview(transcript)    → LLM returns IELTS bands + feedback
```

- `src/components/Avatar.jsx` — `useGLTF` model; `useFrame` sets `jawOpen`/viseme + blink morphs.
- `src/lib/speech.js` — STT, TTS, and the shared `viseme.open` value (audio-analyser or procedural).
- `src/lib/llm.js` — OpenAI-compatible client + interviewer & examiner prompts.
- `src/lib/ielts.js` — official band descriptors, `descFor`, and a heuristic fallback scorer.

## Notes

- The avatar framing (`camera` position in `Interview.jsx`) is tuned for Ready Player Me
  half-body models; adjust if your model sits differently.
- For audio-accurate lip-sync, set the **TTS URL** — browser SpeechSynthesis can't be routed into
  the Web Audio analyser, so without a TTS URL the mouth uses a natural procedural motion while
  speaking.
- This R3F app is a standalone, conversational alternative to the structured single-file
  `EpsilonSpeakPro.html`. They can share the same backend (`../metahuman-server`).
