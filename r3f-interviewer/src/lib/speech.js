// Speech I/O for the conversational interviewer.
//  - `viseme.open` (0..1) is read every frame by the 3D avatar to drive its mouth.
//  - listen(onText, onError, opts): browser STT. opts.onEndOfSpeech enables hands-free turn-taking
//    (auto-ends the turn after a pause).
//  - speak() / cancelSpeak(): speak a line (lip-synced); cancelSpeak interrupts it (for barge-in).

export const viseme = { open: 0, mood: 'neutral' };

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const sttSupported = !!SR;

export function listen(onText, onError, opts = {}) {
  const { onEndOfSpeech, silenceMs = 1800, minWords = 2 } = opts;
  if (!SR) { if (onError) onError('not-supported'); return { stop: () => ({ text: '', confidence: 0 }), supported: false }; }
  const rec = new SR();
  rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
  let finalText = '', conf = 0, cc = 0, active = true, silence = null, ended = false;
  const wc = (s) => (s || '').trim().split(/\s+/).filter(Boolean).length;
  function armSilence(curText) {
    if (!onEndOfSpeech) return;
    if (silence) clearTimeout(silence);
    silence = setTimeout(() => {
      if (!active || ended) return;
      const text = finalText.trim() || (curText || '').trim();
      if (wc(text) >= minWords) endTurn(text);
    }, silenceMs);
  }
  function endTurn(text) {
    if (ended) return; ended = true; active = false;
    if (silence) clearTimeout(silence);
    try { rec.stop(); } catch {}
    onEndOfSpeech && onEndOfSpeech(text || finalText.trim());
  }
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) { finalText += r[0].transcript + ' '; if (r[0].confidence > 0) { conf += r[0].confidence; cc++; } }
      else interim += r[0].transcript;
    }
    const full = (finalText + interim).trim();
    onText && onText(full);
    armSilence(full);
  };
  rec.onerror = (e) => { if (onError) onError((e && e.error) ? e.error : 'error'); };
  rec.onend = () => { if (active && !ended) { try { rec.start(); } catch {} } };
  try { rec.start(); } catch (e) { if (onError) onError('start-failed'); }
  return {
    supported: true,
    stop: () => { active = false; ended = true; if (silence) clearTimeout(silence); try { rec.stop(); } catch {} return { text: finalText.trim(), confidence: cc ? conf / cc : 0 }; },
  };
}

let audioCtx = null;
let _activeCancel = null;   // set while speaking; called by cancelSpeak() for barge-in

export function cancelSpeak() {
  try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch {}
  if (_activeCancel) { const c = _activeCancel; _activeCancel = null; c(); }
}

export function speak(text, { ttsUrl } = {}) {
  if (ttsUrl) return speakWithAudio(text, ttsUrl).catch(() => speakWithTTS(text));
  return speakWithTTS(text);
}

async function speakWithAudio(text, ttsUrl) {
  const form = new URLSearchParams({ text });
  const res = await fetch(ttsUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  if (!res.ok) throw new Error('tts http ' + res.status);
  const buf = await res.arrayBuffer();
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioCtx.decodeAudioData(buf.slice(0));
  const src = audioCtx.createBufferSource(); src.buffer = decoded;
  const analyser = audioCtx.createAnalyser(); analyser.fftSize = 256;
  const data = new Uint8Array(analyser.frequencyBinCount);
  src.connect(analyser); analyser.connect(audioCtx.destination);
  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0; for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
    viseme.open = Math.min(1, Math.sqrt(sum / data.length) * 3.2);
    raf = requestAnimationFrame(tick);
  };
  return new Promise((resolve) => {
    const finish = () => { cancelAnimationFrame(raf); viseme.open = 0; _activeCancel = null; try { src.stop(); } catch {} resolve(); };
    _activeCancel = finish;
    src.onended = finish;
    tick(); src.start();
  });
}

function speakWithTTS(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) { setTimeout(resolve, 400); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.97; u.pitch = 1.05; u.lang = 'en-US';
    const vs = speechSynthesis.getVoices();
    const v = vs.find((x) => /en-(US|GB)/.test(x.lang) && /female|woman|samantha|zira|aria|jenny|google us/i.test(x.name)) || vs.find((x) => /en/i.test(x.lang));
    if (v) u.voice = v;
    let raf = 0, speaking = true;
    const tick = () => { viseme.open = speaking ? 0.25 + 0.5 * Math.abs(Math.sin(performance.now() / 90)) : 0; raf = requestAnimationFrame(tick); };
    const done = () => { if (!speaking) return; speaking = false; cancelAnimationFrame(raf); viseme.open = 0; _activeCancel = null; resolve(); };
    _activeCancel = done;
    u.onend = done; u.onerror = done;
    tick(); speechSynthesis.speak(u);
    if (!vs.length) setTimeout(done, Math.min(9000, 1200 + text.length * 55));
  });
}
