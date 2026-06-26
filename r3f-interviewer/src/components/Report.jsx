import { descFor, bandLabel } from '../lib/ielts.js';

function Crit({ name, k, val }) {
  return (
    <div className="crit">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b>{name}</b>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="meter"><i style={{ width: `${(val / 9) * 100}%` }} /></span>
          <b style={{ width: 34, textAlign: 'right' }}>{val.toFixed(1)}</b>
        </span>
      </div>
      <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>{descFor(k, val)}</p>
    </div>
  );
}

export default function Report({ result, onRestart }) {
  const { band, crit, feedback, transcript, candidate, engine, noData } = result;

  if (noData) {
    return (
      <div className="wrap">
        <div className="card" style={{ marginBottom: 18, borderLeft: '5px solid #c98a00' }}>
          <h2 style={{ color: '#c98a00' }}>No speech was captured</h2>
          <p className="muted">We couldn't score this attempt because no spoken answers were recorded.</p>
          <ul style={{ lineHeight: 1.7 }}>{(feedback || []).map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>Quick checklist</h3>
          <ul style={{ lineHeight: 1.7, margin: 0, paddingLeft: 20 }}>
            <li>Open the app in <b>Google Chrome</b> at its <code>http://localhost</code> address (not a file:// path).</li>
            <li>When prompted, <b>Allow</b> microphone access (or click the mic icon in the address bar &rarr; Allow).</li>
            <li>Press <b>mic</b>, speak, watch your words appear in "Your answer (live)", then press <b>stop</b>.</li>
          </ul>
        </div>
        <button className="primary" onClick={onRestart}>Try again</button>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="card center" style={{ background: 'linear-gradient(135deg,#1f3864,#2e75b6)', color: '#fff', marginBottom: 18 }}>
        <p style={{ opacity: 0.85, margin: 0, letterSpacing: 1 }}>OVERALL BAND</p>
        <div className="band">{band.toFixed(1)}</div>
        <p style={{ opacity: 0.9, margin: '6px 0 0' }}>{bandLabel(band)} · {candidate}</p>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2>Speaking criteria - IELTS band descriptors</h2>
        <Crit name="Fluency & Coherence" k="fluency" val={crit.fluency} />
        <Crit name="Lexical Resource" k="lexical" val={crit.lexical} />
        <Crit name="Grammatical Range & Accuracy" k="grammar" val={crit.grammar} />
        <Crit name="Pronunciation" k="pron" val={crit.pron} />
        <p className="muted" style={{ marginTop: 12, fontSize: 12.5 }}>Scored by: {engine}</p>
      </div>

      {feedback?.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2>Feedback &amp; tips</h2>
          <ul style={{ lineHeight: 1.7, margin: 0, paddingLeft: 20 }}>{feedback.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}

      <div className="card" style={{ marginBottom: 18 }}>
        <h2>Transcript</h2>
        {transcript.map((t, i) => (
          <div className="turn" key={i}><b>Q{i + 1}.</b> {t.q}<br />{t.a || <span className="muted">(no answer)</span>}</div>
        ))}
      </div>

      <button className="primary" onClick={onRestart}>New interview</button>
    </div>
  );
}
