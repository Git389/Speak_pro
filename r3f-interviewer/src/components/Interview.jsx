import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import Avatar from './Avatar.jsx';
import ProceduralHead from './ProceduralHead.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { getConfig } from '../lib/config.js';
import { listen, speak, cancelSpeak, sttSupported, viseme } from '../lib/speech.js';
import { nextInterviewerTurn, scoreInterview, assessAnswer, overlapScore, prewarm, talkingHeadLine } from '../lib/llm.js';
import { heuristicScore, halfRound } from '../lib/ielts.js';

function micErrorMsg(err) {
  if (err === 'not-allowed' || err === 'service-not-allowed') return 'Microphone blocked - click the mic icon in the address bar and Allow, then reload.';
  if (err === 'not-supported') return 'Speech recognition needs Google Chrome.';
  if (err === 'audio-capture') return 'No microphone found - check your mic is connected.';
  if (err === 'no-speech') return '';
  return 'Microphone problem (' + err + ') - check permissions and use Chrome.';
}
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function talkHealthUrl(talkUrl) {
  try {
    const u = new URL(talkUrl);
    if (/\/talk\/?$/.test(u.pathname)) u.pathname = u.pathname.replace(/\/talk\/?$/, '/health');
    else u.pathname = '/health';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return '';
  }
}

function talkPortraitUrl(talkUrl) {
  try {
    const u = new URL(talkUrl);
    if (/\/talk\/?$/.test(u.pathname)) u.pathname = u.pathname.replace(/\/talk\/?$/, '/portrait');
    else u.pathname = '/portrait';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return '';
  }
}

export default function Interview({ onDone, kind }) {
  const cfg = useRef(getConfig()).current;
  const interviewKind = kind || cfg.interviewKind || 'ielts';
  const talkUrl = (cfg.talkUrl || 'http://127.0.0.1:8100/talk').trim();
  const [talkState, setTalkState] = useState(() => ({
    ready: false,
    checked: !talkUrl,
    message: talkUrl ? 'Checking talking-head backend...' : '',
  }));
  const [idlePortraitUrl, setIdlePortraitUrl] = useState(() => talkPortraitUrl(talkUrl));
  const useTalkingHead = talkState.ready;
  const usePrerenderedTalkingHead = cfg.talkMode === 'prerendered';
  const [started, setStarted] = useState(false);
  const [history, setHistory] = useState([]);
  const [currentQ, setCurrentQ] = useState('');
  const [status, setStatus] = useState('Press Start to begin');
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const turnIndex = useRef(0);
  const mic = useRef(null);
  const histRef = useRef([]);
  const retried = useRef(0);
  const interrupted = useRef(false);
  const listeningRef = useRef(false);
  const speakingRef = useRef(false);
  const processing = useRef(false);
  const curQRef = useRef('');
  const videoRef = useRef(null);       // candidate webcam
  const streamRef = useRef(null);
  const talkVideoRef = useRef(null);   // interviewer talking-head video
  const talkResolve = useRef(null);

  useEffect(() => () => { stopAll(); }, []);
  useEffect(() => {
    let cancelled = false;
    async function probeTalkingHead() {
      if (!talkUrl) {
        setTalkState({ ready: false, checked: true, message: '' });
        return;
      }
      const healthUrl = talkHealthUrl(talkUrl);
      if (!healthUrl) {
        setTalkState({ ready: false, checked: true, message: 'Talking-head URL is invalid. Falling back to the 3D interviewer.' });
        return;
      }
      setIdlePortraitUrl(talkPortraitUrl(talkUrl));
      setTalkState({ ready: false, checked: false, message: 'Checking talking-head backend...' });
      try {
        const res = await fetch(healthUrl);
        if (!res.ok) throw new Error('health ' + res.status);
        const info = await res.json();
        const hasEngine = !!(info.sadtalker || info.wav2lip);
        if (cancelled) return;
        if (info.ok && hasEngine && info.portrait) {
          setTalkState({
            ready: true,
            checked: true,
            message: usePrerenderedTalkingHead
              ? 'Photoreal talking-head interviewer ready in fast saved-video mode.'
              : 'Photoreal talking-head interviewer ready.',
          });
          return;
        }
        const detail = !info.portrait
          ? 'portrait photo is missing'
          : 'no SadTalker/Wav2Lip engine is configured yet';
        setTalkState({
          ready: false,
          checked: true,
          message: `Talking-head backend found, but ${detail}. Falling back to the 3D interviewer.`,
        });
      } catch {
        if (cancelled) return;
        setTalkState({
          ready: false,
          checked: true,
          message: 'Talking-head backend unavailable. Falling back to the 3D interviewer.',
        });
      }
    }
    probeTalkingHead();
    return () => { cancelled = true; };
  }, [talkUrl]);

  function stopAll() {
    try { mic.current && mic.current.stop(); } catch {}
    cancelSpeak(); cancelTalk();
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }
  function setQ(q) { curQRef.current = q; setCurrentQ(q); }

  async function startCamera() {
    if (!cfg.webcam || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
      streamRef.current = s;
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
    } catch {}
  }

  function begin() {
    setStarted(true); prewarm(); startCamera();
    setInterval(() => setElapsed((e) => e + 1), 1000);
    askNext();
  }

  async function askNext() {
    retried.current = 0; interrupted.current = false;
    setStatus('Preparing question...'); setTranscript('');
    let q = await nextInterviewerTurn(histRef.current, { turnIndex: turnIndex.current, totalTurns: cfg.turns, candidate: cfg.candidate, kind: interviewKind, role: cfg.jobRole });
    if (!q) q = 'Could you tell me a little about yourself?';
    setQ(q);
    await sayThenListen(q);
  }

  // ----- interviewer speaking (talking-head video OR 3D avatar) + barge-in -----
  function cancelTalk() {
    const v = talkVideoRef.current;
    if (v) {
      try { v.pause(); } catch {}
      try {
        v.removeAttribute('src');
        v.load();
      } catch {}
    }
    if (talkResolve.current) { const r = talkResolve.current; talkResolve.current = null; r(); }
  }
  async function speakVideo(text) {
    try {
      setStatus(usePrerenderedTalkingHead ? 'Loading saved interviewer clip...' : 'Rendering talking-head clip... this can take a while on this GPU');
      const r = await fetch(talkUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!r.ok) throw new Error('talk ' + r.status);
      const url = URL.createObjectURL(await r.blob());
      const v = talkVideoRef.current; if (!v) { URL.revokeObjectURL(url); return; }
      v.src = url;
      await new Promise((res) => {
        talkResolve.current = () => { URL.revokeObjectURL(url); res(); };
        v.onended = () => cancelTalk(); v.onerror = () => cancelTalk();
        setStatus('Interviewer is speaking... (start talking to interrupt)');
        v.play().catch(() => cancelTalk());
      });
    } catch (e) {
      console.warn('talking-head failed -> audio fallback:', e && e.message);
      await speak(text, { ttsUrl: cfg.ttsUrl });
    }
  }

  async function sayOnly(text) {
    speakingRef.current = true;
    const detector = startBargeDetector(text);
    if (useTalkingHead) { await speakVideo(text); }
    else { setStatus('Interviewer is speaking... (start talking to interrupt)'); await speak(text, { ttsUrl: cfg.ttsUrl }); }
    speakingRef.current = false; detector.stop();
  }

  async function sayThenListen(text) {
    await sayOnly(text);
    startListening();
  }

  function startBargeDetector(guardLine) {
    if (!sttSupported) return { stop: () => {} };
    return listen(
      (t) => {
        if (!speakingRef.current) return;
        const n = t.trim().split(/\s+/).filter(Boolean).length;
        if (n >= 3 && (!guardLine || overlapScore(guardLine, t) < 0.45)) { speakingRef.current = false; cancelSpeak(); cancelTalk(); setStatus('Listening - go ahead'); }
      }, () => {}, {});
  }

  function startListening() {
    if (!sttSupported) { setStatus('Type your answer below, then press Send'); return; }
    if (listeningRef.current) return;
    setTranscript(''); setMicError(''); processing.current = false;
    listeningRef.current = true; setListening(true);
    setStatus('Listening - speak naturally; I respond when you pause');
    mic.current = listen(
      (t) => { setTranscript(t); checkInterrupt(t); },
      (err) => { const m = micErrorMsg(err); if (m) { setMicError(m); setStatus(m); } },
      { onEndOfSpeech: (text) => handleUserAnswer(text), silenceMs: 1800, minWords: 2 }
    );
  }
  function stopListening() { try { mic.current && mic.current.stop(); } catch {} listeningRef.current = false; setListening(false); }

  async function checkInterrupt(t) {
    if (interrupted.current || !listeningRef.current || retried.current >= 1) return;
    const n = t.trim().split(/\s+/).filter(Boolean).length;
    if (n < 40 || overlapScore(curQRef.current, t) > 0.05) return;
    interrupted.current = true; retried.current = 1; processing.current = true;
    stopListening(); viseme.mood = 'concern';
    if (useTalkingHead && usePrerenderedTalkingHead) {
      await sayOnly(talkingHeadLine(interviewKind, 'refocus'));
      await sayThenListen(curQRef.current);
    } else {
      await sayThenListen("Sorry to jump in - let's stay with the question. " + curQRef.current);
    }
    viseme.mood = 'neutral';
  }

  async function handleUserAnswer(rawText) {
    if (processing.current) return; processing.current = true;
    stopListening();
    const ans = (rawText || '').trim();
    setStatus('Listening to your answer...');
    let v = { verdict: 'ok', reaction: '' };
    if (retried.current < 1) v = await assessAnswer(curQRef.current, ans);
    if (v.verdict !== 'ok' && retried.current < 1) {
      retried.current += 1; viseme.mood = 'concern';
      setStatus(v.verdict === 'offtopic' ? "Let's refocus" : 'Tell me a bit more');
      if (useTalkingHead && usePrerenderedTalkingHead) {
        if (v.verdict === 'offtopic') {
          await sayOnly(talkingHeadLine(interviewKind, 'refocus'));
          await sayThenListen(curQRef.current);
        } else {
          await sayThenListen(talkingHeadLine(interviewKind, 'expand'));
        }
      } else {
        const line = v.reaction || (v.verdict === 'offtopic' ? ('Let me ask again. ' + curQRef.current) : 'Could you tell me a bit more about that?');
        await sayThenListen(line);
      }
      viseme.mood = 'neutral';
      return;
    }
    retried.current = 0; interrupted.current = false;
    const nextHist = [...histRef.current, { q: curQRef.current, a: ans }];
    histRef.current = nextHist; setHistory(nextHist);
    turnIndex.current += 1;
    if (turnIndex.current >= cfg.turns) return finish(nextHist);
    askNext();
  }

  async function finish(hist) {
    stopListening(); setQ(''); setStatus('Preparing your results...');
    const totalWords = hist.reduce((s, t) => s + (t.a || '').trim().split(/\s+/).filter(Boolean).length, 0);
    if (totalWords < 3) {
      stopAll();
      onDone({ candidate: cfg.candidate, band: 0, crit: { fluency: 0, lexical: 0, grammar: 0, pron: 0 },
        feedback: ['No speech was captured.', 'Use Google Chrome, allow the microphone, then just speak - your words appear live as you talk.'],
        transcript: hist, engine: 'No speech captured', noData: true });
      return;
    }
    if (useTalkingHead) await speakVideo(usePrerenderedTalkingHead ? talkingHeadLine(interviewKind, 'closing') : 'Thank you, that is the end of the interview. Let me prepare your results.');
    else await speak('Thank you, that is the end of the interview. Let me prepare your results.', { ttsUrl: cfg.ttsUrl });
    let result = await scoreInterview(hist);
    let engine = 'AI examiner - ' + cfg.llmModel;
    if (!result || !result.overall) {
      const h = heuristicScore(hist);
      result = { overall: { fluency_coherence: h.fluency, lexical_resource: h.lexical, grammatical_range_accuracy: h.grammar, pronunciation: h.pron, band: h.band }, feedback: h.feedback };
      engine = 'Built-in engine';
    }
    const o = result.overall;
    const crit = {
      fluency: halfRound(Number(o.fluency_coherence) || 0), lexical: halfRound(Number(o.lexical_resource) || 0),
      grammar: halfRound(Number(o.grammatical_range_accuracy) || 0), pron: halfRound(Number(o.pronunciation) || 0),
    };
    const band = halfRound(Number(o.band) || (crit.fluency + crit.lexical + crit.grammar + crit.pron) / 4);
    stopAll();
    onDone({ candidate: cfg.candidate, band, crit, feedback: result.feedback || [], transcript: hist, engine });
  }

  return (
    <div className="wrap">
      <div className="stage">
        <div className="canvas-wrap">
          {useTalkingHead ? (
            <video ref={talkVideoRef} className="talk-video" playsInline poster={idlePortraitUrl || undefined} />
          ) : (
            <Canvas camera={{ position: [0, 0.15, 3.4], fov: 30 }} dpr={[1, 2]}>
              <ambientLight intensity={0.9} />
              <hemisphereLight intensity={0.6} groundColor="#222244" />
              <directionalLight position={[2, 3, 2]} intensity={1.1} />
              {cfg.avatarUrl ? (
                <ErrorBoundary fallback={<ProceduralHead />}>
                  <Suspense fallback={null}><Avatar url={cfg.avatarUrl} /></Suspense>
                </ErrorBoundary>
              ) : (<ProceduralHead />)}
            </Canvas>
          )}
          {started && <div className="rec-badge"><span className="rec-dot" />REC {clock(elapsed)}</div>}
          {started && cfg.webcam && (<div className="webcam-pip"><video ref={videoRef} muted playsInline /><span>You</span></div>)}
          <div className="statuschip"><span className="dot" style={{ background: listening ? '#ffd166' : '#37d67a' }} />{status}</div>
        </div>

        <div className="panel card">
          <h2>{interviewKind === 'job' ? 'Interview - ' + (cfg.jobRole || 'Role') : 'Speaking interview'}</h2>
          {micError && <div style={{ background: '#fdecea', border: '1px solid #f0c4be', color: '#c0392b', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 14 }}>{micError}</div>}
          {!started ? (
            <>
              <p className="muted">{interviewKind === 'job'
              ? 'A live, two-way video interview. The interviewer asks, listens while you answer, and you can interrupt naturally; your webcam shows in the corner.'
                : 'A hands-free, two-way IELTS speaking interview.'} {useTalkingHead ? (usePrerenderedTalkingHead ? 'Photoreal talking-head interviewer enabled in fast saved-video mode.' : 'Photoreal talking-head interviewer enabled.') : ''} Use Google Chrome with headphones; allow camera and microphone.</p>
              {talkState.message && <p className="muted" style={{ marginTop: -4, marginBottom: 14 }}>{talkState.message}</p>}
              <button className="primary" onClick={begin}>Start interview</button>
            </>
          ) : (
            <>
              {currentQ && <div className="bubble"><b>Interviewer:</b> {currentQ}</div>}
              {sttSupported ? (
                <>
                  <p className="muted" style={{ margin: '10px 0 6px' }}>You{listening ? ' (listening - pause when done)' : ''}:</p>
                  <div className="transcript">{transcript || <span className="muted">{listening ? 'speak now...' : 'the interviewer is speaking - start talking to interrupt'}</span>}</div>
                  {listening && <button className="ghost" style={{ marginTop: 10 }} onClick={() => handleUserAnswer(transcript)}>I'm done answering</button>}
                </>
              ) : (
                <>
                  <p className="muted">Speech recognition needs Chrome - type your answer:</p>
                  <textarea rows="3" style={{ width: '100%' }} value={transcript} onChange={(e) => setTranscript(e.target.value)} />
                  <button className="primary" style={{ marginTop: 10 }} onClick={() => handleUserAnswer(transcript)}>Send</button>
                </>
              )}
              <div className="log">
                {history.map((t, i) => (<div className="turn" key={i}><b>Q{i + 1}:</b> {t.q}<br />{t.a || <span className="muted">(no answer)</span>}</div>))}
              </div>
              <p className="muted" style={{ fontSize: 13 }}>Question {Math.min(turnIndex.current + 1, cfg.turns)} of {cfg.turns}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
