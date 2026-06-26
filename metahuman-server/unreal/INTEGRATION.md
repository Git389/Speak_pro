# Unreal MetaHuman interviewer — integration guide

This delivers the **photoreal interviewer**: an Unreal Engine MetaHuman whose face is streamed
into the web app via **Pixel Streaming**, with lips driven in real time by the interviewer's
speech. There are three pieces to set up: the MetaHuman, the lip-sync, and Pixel Streaming.

> **Why this can't live in the HTML file:** a MetaHuman is rendered by Unreal Engine on a GPU and
> delivered as a live WebRTC video stream. The browser only receives that video — it never runs
> Unreal. So this is a separate server application; the web app simply embeds its stream.

---

## 0. Prerequisites

- Windows or Linux machine with an **NVIDIA RTX GPU** (local, or cloud: AWS `g5`, Azure `NV`,
  GCP `g2`). Pixel Streaming needs hardware H.264/AV1 encoding.
- **Unreal Engine 5.4+** (Epic Games Launcher).
- The backend in `../backend` running (for STT, scoring, and TTS).

---

## 1. Create the MetaHuman

1. Open **MetaHuman Creator** (web) or the **MetaHuman plugin** in Unreal → design the interviewer
   (the demo presenter is a professional woman; match your brand).
2. In Unreal: **Window → Quixel Bridge → MetaHumans** → download your MetaHuman → **Add to project**.
3. Drag the MetaHuman Blueprint into a clean level. Add a camera framed on the head/shoulders
   (this is what gets streamed).

## 2. Lip-sync (make the MetaHuman speak)

Pick one:

**A. NVIDIA Audio2Face (best quality)**
- Install **Audio2Face** + the **Audio2Face → Unreal Live Link** plugin.
- Route incoming audio (from the backend `/tts`) into Audio2Face; it outputs ARKit blendshape
  curves over Live Link that drive the MetaHuman's face.

**B. Runtime audio-to-lipsync plugin (simpler)**
- Use a runtime viseme/OVR-Lipsync style plugin that maps an audio buffer to the MetaHuman's
  mouth blendshapes (`jawOpen`, `mouth*` ARKit curves) each frame.

**Driving it from the backend:** set `UNREAL_WS` in the backend `.env` to a websocket your Unreal
project hosts. On each interviewer line, the backend pushes `{type:"speak", text, audio_wav_b64}`.
A small Unreal **Web Remote Control** / websocket actor decodes the audio, plays it on the
MetaHuman's audio component, and feeds it to the lip-sync system (A or B).

## 3. Enable Pixel Streaming

1. **Edit → Plugins** → enable **Pixel Streaming** (and **Pixel Streaming Player**). Restart.
2. Launch the packaged build (or editor) with:
   ```
   MyProject.exe -PixelStreamingIP=0.0.0.0 -PixelStreamingPort=8888 -RenderOffscreen -Unattended
   ```
3. Run the **Signalling Web Server** that ships with the plugin
   (`Samples/PixelStreaming/WebServers/SignallingWebServer/`):
   ```
   ./platform_scripts/cmd/run_local   (Windows: run_local.bat)
   ```
   It serves the player web client (default `http://YOUR_SERVER:80/`). That URL is what you paste
   into the web app.

## 4. Connect the web app

In **Epsilon Speak Pro → Admin → AI & Avatar**:

- **Pixel Streaming URL** → `http://YOUR_SERVER/` (the signalling web server's player page).
- **API URL** → `http://YOUR_SERVER:8000/v1/chat/completions`, **Model** → `llama3.1`.

The interview screen then embeds the live MetaHuman in place of the 2D presenter, scores answers
with the LLM, and (when `UNREAL_WS` is set) makes the MetaHuman actually speak the questions.

---

## Recommended interview loop (server-authoritative)

For the most natural result, drive the whole loop from Unreal/back end rather than the browser:

1. Browser captures the student's mic, posts the clip to `POST /stt`.
2. Backend decides the interviewer's next line (question / encouragement / reaction).
3. Backend `/tts` → audio → pushed to Unreal (`UNREAL_WS`) → MetaHuman speaks with lip-sync,
   streamed to the browser via Pixel Streaming.
4. Repeat. At the end, `POST /score` returns IELTS bands + descriptor feedback for the report.

## Production notes

- **One Unreal instance per concurrent student.** Pixel Streaming is 1:1. For many students use a
  **Matchmaker** + an autoscaling pool of GPU instances (or a managed service such as Azure /
  Vagon / Eagle3D pixel-streaming hosting). This is the main scaling cost — size it to peak
  simultaneous test-takers (your staggered time slots help a lot here).
- **Latency:** keep the GPU server geographically near your students; aim for sub-200ms RTT.
- **Fallback:** if no Pixel Streaming URL is set, the web app automatically uses the built-in
  animated 2D presenter — so the product keeps working without the GPU fleet.
