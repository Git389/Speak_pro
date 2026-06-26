import { useEffect, useRef, useState } from 'react';
import { EXAM } from './examData.js';
import QuestionItem from './QuestionItem.jsx';
import ExamResults from './ExamResults.jsx';
import Interview from '../components/Interview.jsx';
import { objectiveBand, scoreWriting, overallBand, halfRound } from './bands.js';
import { startLockdown } from './lockdown.js';
import { addResult } from './store.js';
import { speak } from '../lib/speech.js';

const norm = (s) => (s == null ? '' : String(s)).trim().toLowerCase();
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const TIMED = ['listening', 'reading', 'writing'];
const ORDER = ['intro', 'listening', 'reading', 'writing', 'speaking'];
const SECTION_NAME = { listening: 'Listening', reading: 'Reading', writing: 'Writing', speaking: 'Speaking' };

export default function ExamShell({ candidate, onExit, test }) {
  const E = test || EXAM;
  const [phase, setPhase] = useState('intro');
  const [answers, setAnswers] = useState(() => { try { return JSON.parse(localStorage.getItem('esp_exam_answers') || '{}'); } catch { return {}; } });
  const [flags, setFlags] = useState({});
  const [secs, setSecs] = useState(-1);
  const [played, setPlayed] = useState(false);
  const [result, setResult] = useState(null);
  const violations = useRef(0);
  const stopLock = useRef(null);

  useEffect(() => { localStorage.setItem('esp_exam_answers', JSON.stringify(answers)); }, [answers]);
  useEffect(() => () => { if (stopLock.current) stopLock.current(); }, []);

  // section countdown
  useEffect(() => {
    if (!TIMED.includes(phase)) return;
    setSecs(E[phase].minutes * 60); setPlayed(false);
    const id = setInterval(() => setSecs((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [phase]);
  useEffect(() => { if (secs === 0 && TIMED.includes(phase)) advance(); }, [secs, phase]);

  function advance() {
    setPhase((p) => ORDER[Math.min(ORDER.indexOf(p) + 1, ORDER.length - 1)]);
  }
  function setAns(id, v) { setAnswers((a) => ({ ...a, [id]: v })); }
  function toggleFlag(id) { setFlags((f) => ({ ...f, [id]: !f[id] })); }

  function beginExam() {
    setAnswers({}); localStorage.removeItem('esp_exam_answers');
    stopLock.current = startLockdown(() => { violations.current += 1; });
    setPhase('listening');
  }

  function computeResults(spk) {
    const L = E.listening.items, R = E.reading.items;
    const lc = L.filter((it) => norm(answers[it.id]) === norm(it.answer)).length;
    const rc = R.filter((it) => norm(answers[it.id]) === norm(it.answer)).length;
    const lBand = objectiveBand(lc, L.length, 'listening');
    const rBand = objectiveBand(rc, R.length, 'reading');
    const t1 = scoreWriting(answers.W1, E.writing.tasks[0].minWords);
    const t2 = scoreWriting(answers.W2, E.writing.tasks[1].minWords);
    const wBand = halfRound((t1 + 2 * t2) / 3);
    const sBand = spk ? spk.band : 0;
    const sections = {
      listening: { band: lBand, note: `${lc}/${L.length} correct` },
      reading: { band: rBand, note: `${rc}/${R.length} correct` },
      writing: { band: wBand, note: `Task 1 ${t1.toFixed(1)}, Task 2 ${t2.toFixed(1)}` },
      speaking: { band: sBand, note: spk ? (spk.engine || '') : 'not completed', feedback: spk ? spk.feedback : [] },
    };
    const overall = overallBand({ listening: lBand, reading: rBand, writing: wBand, speaking: sBand });
    if (stopLock.current) { stopLock.current(); stopLock.current = null; }
    const rec = { candidate, testTitle: E.title, overall, sections, violations: violations.current };
    addResult(rec);
    setResult(rec);
    setPhase('results');
  }

  if (phase === 'results' && result) return <ExamResults result={result} onRestart={onExit} />;

  if (phase === 'speaking') {
    return (
      <div>
        <div className="exam-bar"><b>{E.title}</b><span>Section 4 of 4: Speaking</span></div>
        <Interview kind="ielts" onDone={(r) => computeResults(r)} />
      </div>
    );
  }

  if (phase === 'intro') {
    return (
      <div className="wrap">
        <div className="card">
          <h1>{E.title}</h1>
          <p className="muted">A full four-module IELTS test in a locked exam shell. Sections are timed and run in order:</p>
          <ol style={{ lineHeight: 1.8 }}>
            <li><b>Listening</b> - {E.listening.minutes} min ({E.listening.items.length} questions; audio plays once)</li>
            <li><b>Reading</b> - {E.reading.minutes} min ({E.reading.items.length} questions)</li>
            <li><b>Writing</b> - {E.writing.minutes} min (2 tasks)</li>
            <li><b>Speaking</b> - ~{E.speaking.minutes} min (spoken interview with the photoreal talking-head examiner when available, otherwise the 3D examiner)</li>
          </ol>
          <p className="muted" style={{ fontSize: 13 }}>The exam enters fullscreen and blocks copy/paste; leaving the tab is recorded. Use Google Chrome and allow the microphone for Speaking.</p>
          <div className="row">
            <button className="primary" onClick={beginExam}>Begin exam</button>
            <button className="ghost" onClick={onExit}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // ----- timed objective / writing sections -----
  const isWriting = phase === 'writing';
  const items = !isWriting ? E[phase].items : [];
  const lowTime = secs >= 0 && secs <= 60;

  return (
    <div className="exam">
      <div className="exam-bar">
        <b>{E.title}</b>
        <span>Section: {SECTION_NAME[phase]}</span>
        <span className={'timer' + (lowTime ? ' low' : '')}>{secs >= 0 ? fmt(secs) : '--:--'}</span>
        <button className="primary" style={{ padding: '7px 14px' }} onClick={advance}>
          {phase === 'writing' ? 'Finish Writing' : 'Submit section'} &rarr;
        </button>
      </div>

      <div className="exam-body">
        <div className="exam-main">
          {phase === 'listening' && (
            <div className="card" style={{ marginBottom: 14 }}>
              <h3>Listening</h3>
              <p className="muted">You may play the recording <b>once</b>. Answer the questions as you listen.</p>
              <button className="ghost" disabled={played} onClick={() => { setPlayed(true); speak(E.listening.audioText); }}>{played ? 'Recording played' : '▶ Play recording (once)'}</button>
            </div>
          )}
          {phase === 'reading' && (
            <div className="card passage-card"><h3>Reading passage</h3><p style={{ lineHeight: 1.7 }}>{E.reading.passage}</p></div>
          )}

          {!isWriting && (
            <div className="card">
              <h3>Questions</h3>
              {items.map((it, i) => (
                <QuestionItem key={it.id} item={it} index={i} value={answers[it.id]} onChange={(v) => setAns(it.id, v)} flagged={!!flags[it.id]} onFlag={() => toggleFlag(it.id)} />
              ))}
            </div>
          )}

          {isWriting && E.writing.tasks.map((task) => {
            const n = (answers[task.id] || '').trim().split(/\s+/).filter(Boolean).length;
            return (
              <div className="card" key={task.id} style={{ marginBottom: 14 }}>
                <h3>{task.title} <span className="muted" style={{ fontSize: 13 }}>(min {task.minWords} words)</span></h3>
                <p style={{ lineHeight: 1.6 }}>{task.prompt}</p>
                <textarea rows="10" style={{ width: '100%' }} value={answers[task.id] || ''} onChange={(e) => setAns(task.id, e.target.value)} placeholder="Write your response here..." />
                <p className="muted" style={{ fontSize: 13, color: n >= task.minWords ? 'var(--green)' : 'var(--muted)' }}>{n} words {n >= task.minWords ? '✓' : `(need ${task.minWords})`}</p>
              </div>
            );
          })}
        </div>

        {!isWriting && (
          <div className="exam-nav card">
            <b style={{ fontSize: 13 }}>Questions</b>
            <div className="palette">
              {items.map((it, i) => (
                <button key={it.id}
                  className={'pal' + (answers[it.id] ? ' done' : '') + (flags[it.id] ? ' flag' : '')}
                  onClick={() => { const el = document.getElementById('item-' + it.id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>
                  {i + 1}
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Green = answered, amber = flagged.</p>
          </div>
        )}
      </div>
    </div>
  );
}
