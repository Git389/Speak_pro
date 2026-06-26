import { useState } from 'react';
import { getTests, saveTest, deleteTest, newTestTemplate, getCandidates, saveCandidate, deleteCandidate, getResults } from './store.js';
import { bandLabel } from './bands.js';

export default function Admin({ onExit }) {
  const [tab, setTab] = useState('tests');
  const [, force] = useState(0); const refresh = () => force((n) => n + 1);
  return (
    <div className="wrap">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Admin console</h1>
        <button className="ghost" onClick={onExit}>← Exit admin</button>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        {['tests', 'candidates', 'results'].map((t) => (
          <button key={t} className={tab === t ? 'blue' : 'ghost'} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>
      {tab === 'tests' && <Tests refresh={refresh} />}
      {tab === 'candidates' && <Candidates refresh={refresh} />}
      {tab === 'results' && <Results />}
    </div>
  );
}

function Tests({ refresh }) {
  const [editing, setEditing] = useState(null);   // the test object being edited
  const [json, setJson] = useState('');
  const [err, setErr] = useState('');
  function open(t) { setEditing(t); setJson(JSON.stringify(t, null, 2)); setErr(''); }
  function save() {
    try {
      const obj = JSON.parse(json);
      if (!obj.id || !obj.listening || !obj.reading || !obj.writing) throw new Error('Test must have id, listening, reading and writing.');
      saveTest(obj); setEditing(null); setErr(''); refresh();
    } catch (e) { setErr('Invalid JSON: ' + e.message); }
  }
  if (editing) {
    return (
      <div className="card">
        <h2>Edit test</h2>
        <p className="muted">Edit the test definition (sections, items, answer keys, writing tasks). Answers are matched case-insensitively. Item types: <code>mcq</code> (needs <code>options</code>), <code>tfng</code>, <code>gap</code>.</p>
        <textarea rows="20" style={{ width: '100%', fontFamily: 'monospace', fontSize: 13 }} value={json} onChange={(e) => setJson(e.target.value)} />
        {err && <p style={{ color: 'var(--red)' }}>{err}</p>}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="primary" onClick={save}>Save test</button>
          <button className="ghost" onClick={() => setEditing(null)}>Cancel</button>
        </div>
      </div>
    );
  }
  const tests = getTests();
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Test sets</h2>
        <button className="primary" onClick={() => open(newTestTemplate())}>+ New test</button>
      </div>
      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Title</th><th>Listening</th><th>Reading</th><th>Writing</th><th></th></tr></thead>
        <tbody>
          {tests.map((t) => (
            <tr key={t.id}>
              <td><b>{t.title}</b></td>
              <td>{t.listening?.items?.length || 0} Q</td>
              <td>{t.reading?.items?.length || 0} Q</td>
              <td>{t.writing?.tasks?.length || 0} tasks</td>
              <td style={{ textAlign: 'right' }}>
                <button className="ghost" onClick={() => open(t)}>Edit</button>{' '}
                <button className="ghost" style={{ color: 'var(--red)' }} onClick={() => { if (confirm('Delete this test?')) { deleteTest(t.id); refresh(); } }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Candidates({ refresh }) {
  const [name, setName] = useState(''); const [testId, setTestId] = useState(''); const [slot, setSlot] = useState('');
  const tests = getTests(); const cands = getCandidates(); const results = getResults();
  function add() { if (!name.trim()) return; saveCandidate({ name: name.trim(), testId: testId || tests[0]?.id, slot }); setName(''); setSlot(''); refresh(); }
  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Add / assign candidate</h2>
        <div className="row">
          <div className="field" style={{ flex: 1, minWidth: 160 }}><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}><label>Assigned test</label>
            <select value={testId} onChange={(e) => setTestId(e.target.value)}>{tests.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}><label>Time slot (optional)</label><input value={slot} onChange={(e) => setSlot(e.target.value)} placeholder="e.g. 25 Jun 2026, 10:00" /></div>
        </div>
        <button className="primary" onClick={add}>Add candidate</button>
      </div>
      <div className="card">
        <h2>Candidates</h2>
        <table><thead><tr><th>Name</th><th>Test</th><th>Slot</th><th>Status</th><th></th></tr></thead>
          <tbody>{cands.map((c) => {
            const t = tests.find((x) => x.id === c.testId); const done = results.some((r) => r.candidate === c.name);
            return (
              <tr key={c.id}><td><b>{c.name}</b></td><td>{t ? t.title : '-'}</td><td>{c.slot || '-'}</td>
                <td>{done ? <span className="pill">Completed</span> : <span className="pill" style={{ background: '#fff4e0', color: '#9a6b00' }}>Pending</span>}</td>
                <td style={{ textAlign: 'right' }}><button className="ghost" style={{ color: 'var(--red)' }} onClick={() => { deleteCandidate(c.id); refresh(); }}>Remove</button></td></tr>
            );
          })}</tbody></table>
      </div>
    </>
  );
}

function Results() {
  const [sel, setSel] = useState(null);
  const results = getResults();
  if (sel) {
    const s = sel.sections;
    return (
      <div className="card">
        <button className="ghost" onClick={() => setSel(null)}>← Back to results</button>
        <h2 style={{ marginTop: 12 }}>{sel.candidate} — overall band {Number(sel.overall).toFixed(1)} ({bandLabel(sel.overall)})</h2>
        <p className="muted">{sel.testTitle} · {new Date(sel.date).toLocaleString()}{sel.violations ? ` · ${sel.violations} proctoring event(s)` : ''}</p>
        <table><thead><tr><th>Section</th><th>Band</th><th>Detail</th></tr></thead><tbody>
          <tr><td>Listening</td><td><b>{s.listening.band.toFixed(1)}</b></td><td>{s.listening.note}</td></tr>
          <tr><td>Reading</td><td><b>{s.reading.band.toFixed(1)}</b></td><td>{s.reading.note}</td></tr>
          <tr><td>Writing</td><td><b>{s.writing.band.toFixed(1)}</b></td><td>{s.writing.note}</td></tr>
          <tr><td>Speaking</td><td><b>{s.speaking.band.toFixed(1)}</b></td><td>{s.speaking.note}</td></tr>
        </tbody></table>
        {s.speaking.feedback?.length > 0 && (<><h3 style={{ marginTop: 14 }}>Speaking feedback</h3><ul style={{ lineHeight: 1.7 }}>{s.speaking.feedback.map((f, i) => <li key={i}>{f}</li>)}</ul></>)}
      </div>
    );
  }
  return (
    <div className="card">
      <h2>Results dashboard</h2>
      {results.length === 0 ? <p className="empty muted">No completed attempts yet.</p> : (
        <table><thead><tr><th>Candidate</th><th>Test</th><th>L</th><th>R</th><th>W</th><th>S</th><th>Overall</th><th>Date</th><th></th></tr></thead>
          <tbody>{results.map((r) => (
            <tr key={r.id}><td><b>{r.candidate}</b></td><td>{r.testTitle}</td>
              <td>{r.sections.listening.band.toFixed(1)}</td><td>{r.sections.reading.band.toFixed(1)}</td>
              <td>{r.sections.writing.band.toFixed(1)}</td><td>{r.sections.speaking.band.toFixed(1)}</td>
              <td><b>{Number(r.overall).toFixed(1)}</b></td><td className="muted">{new Date(r.date).toLocaleDateString()}</td>
              <td style={{ textAlign: 'right' }}><button className="ghost" onClick={() => setSel(r)}>View</button></td></tr>
          ))}</tbody></table>
      )}
    </div>
  );
}
