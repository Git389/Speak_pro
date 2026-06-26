import { useState } from 'react';
import { getConfig, setConfig } from '../lib/config.js';

export default function Setup({ onStart }) {
  const [c, setC] = useState(() => {
    const cfg = getConfig();
    return { ...cfg, talkUrl: (cfg.talkUrl || 'http://127.0.0.1:8100/talk'), talkMode: cfg.talkMode || 'prerendered' };
  });
  const f = (k) => (e) => setC({ ...c, [k]: e.target.value });
  const save = () => {
    const maxTurns = c.talkMode === 'prerendered' ? 6 : 15;
    const turns = Math.max(3, Math.min(Number(c.turns) || 6, maxTurns));
    setConfig({
      ...c,
      turns,
      talkMode: c.talkMode || 'prerendered',
      talkUrl: (c.talkUrl || 'http://127.0.0.1:8100/talk').trim(),
    });
    onStart();
  };
  return (
    <div className="wrap">
      <div className="card" style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1>Interview settings</h1>
        <p className="muted">Set up the virtual interview. Best in Google Chrome with a microphone, webcam, and headphones.</p>

        <div className="field"><label>Your name</label><input value={c.candidate} onChange={f('candidate')} /></div>

        <div className="field"><label>Interview type</label>
          <select value={c.interviewKind} onChange={f('interviewKind')}>
            <option value="job">Job interview (hiring screen)</option>
            <option value="ielts">IELTS speaking exam</option>
          </select>
        </div>
        {c.interviewKind === 'job' && (
          <div className="field"><label>Role being interviewed for</label><input value={c.jobRole} onChange={f('jobRole')} placeholder="e.g. Customer Support Representative" /></div>
        )}

        <div className="field"><label><input type="checkbox" checked={!!c.webcam} onChange={(e) => setC({ ...c, webcam: e.target.checked })} /> Show my webcam (like a real video interview)</label></div>

        <div className="field"><label>3D interviewer avatar URL (optional - glTF/GLB with ARKit morphs)</label><input value={c.avatarUrl} onChange={f('avatarUrl')} placeholder="leave blank for the built-in 3D head" /></div>
        <div className="field"><label>Number of questions</label><input type="number" min="3" max="15" value={c.turns} onChange={f('turns')} /></div>

        <h3 style={{ marginTop: 18 }}>AI model (optional, OpenAI-compatible)</h3>
        <p className="muted" style={{ marginTop: 0 }}>Local Ollama / LM Studio or a cloud key makes the questions and follow-ups fully dynamic. Without it, a responsive built-in script is used.</p>
        <div className="field"><label>API URL (chat completions)</label><input value={c.llmUrl} onChange={f('llmUrl')} placeholder="http://localhost:11434/v1/chat/completions" /></div>
        <div className="field"><label>Model</label><input value={c.llmModel} onChange={f('llmModel')} placeholder="llama3.1" /></div>
        <div className="field"><label>API key (optional)</label><input value={c.llmKey} onChange={f('llmKey')} placeholder="leave blank for local" /></div>
        <div className="field"><label>TTS URL (optional - backend /tts for audio-driven lips)</label><input value={c.ttsUrl} onChange={f('ttsUrl')} placeholder="http://localhost:8000/tts" /></div>
        <div className="field"><label>Talking-head URL (local default - SadTalker/Wav2Lip /talk for a photoreal video interviewer)</label><input value={c.talkUrl} onChange={f('talkUrl')} placeholder="http://127.0.0.1:8100/talk" /></div>
        <div className="field"><label>Talking-head playback mode</label>
          <select value={c.talkMode} onChange={f('talkMode')}>
            <option value="prerendered">Fast photoreal mode (saved MP4 clips, recommended)</option>
            <option value="dynamic">Dynamic photoreal mode (render every line live, slower)</option>
          </select>
        </div>
        <p className="muted" style={{ marginTop: -6, marginBottom: 14, fontSize: 13 }}>Leave the default value to use the local `talkinghead-server`. Fast photoreal mode uses saved interviewer clips so the face moves immediately; dynamic mode asks SadTalker to render each new line live.</p>

        <button className="primary" onClick={save}>Save settings</button>
      </div>
    </div>
  );
}
