import { bandLabel } from './bands.js';

function Row({ name, band, note }) {
  return (
    <div className="crit" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span><b>{name}</b>{note ? <span className="muted" style={{ fontSize: 13 }}> - {note}</span> : null}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="meter"><i style={{ width: `${(band / 9) * 100}%` }} /></span>
        <b style={{ width: 34, textAlign: 'right' }}>{Number(band).toFixed(1)}</b>
      </span>
    </div>
  );
}

export default function ExamResults({ result, onRestart }) {
  const { overall, sections, candidate, violations } = result;
  return (
    <div className="wrap">
      <div className="card center" style={{ background: 'linear-gradient(135deg,#1f3864,#2e75b6)', color: '#fff', marginBottom: 18 }}>
        <p style={{ opacity: 0.85, margin: 0, letterSpacing: 1 }}>OVERALL BAND</p>
        <div className="band">{Number(overall).toFixed(1)}</div>
        <p style={{ opacity: 0.9, margin: '6px 0 0' }}>{bandLabel(overall)} - {candidate}</p>
      </div>
      <div className="card" style={{ marginBottom: 18 }}>
        <h2>Section bands</h2>
        <Row name="Listening" band={sections.listening.band} note={sections.listening.note} />
        <Row name="Reading" band={sections.reading.band} note={sections.reading.note} />
        <Row name="Writing" band={sections.writing.band} note={sections.writing.note} />
        <Row name="Speaking" band={sections.speaking.band} note={sections.speaking.note} />
      </div>
      {sections.speaking.feedback && sections.speaking.feedback.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h2>Speaking feedback &amp; tips</h2>
          <ul style={{ lineHeight: 1.7, margin: 0, paddingLeft: 20 }}>{sections.speaking.feedback.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}
      {violations > 0 && (
        <div className="card" style={{ marginBottom: 18, borderLeft: '5px solid #c98a00' }}>
          <b style={{ color: '#c98a00' }}>Proctoring note:</b> {violations} focus/tab-switch event(s) were recorded during the exam.
        </div>
      )}
      <button className="primary" onClick={onRestart}>Finish</button>
    </div>
  );
}
