// Renders one exam item (multiple-choice, True/False/Not Given, or gap-fill) with a review flag.
export default function QuestionItem({ item, index, value, onChange, flagged, onFlag }) {
  return (
    <div id={'item-' + item.id} className="qitem">
      <div className="qitem-head">
        <b>{index + 1}.</b>
        <button className={'flag' + (flagged ? ' on' : '')} title="Flag for review" onClick={onFlag}>{flagged ? '⚑ flagged' : '⚐ flag'}</button>
      </div>
      <p style={{ margin: '4px 0 8px' }}>{item.q}</p>
      {item.type === 'mcq' && item.options.map((opt) => (
        <label key={opt} className="opt"><input type="radio" name={item.id} checked={value === opt} onChange={() => onChange(opt)} /> {opt}</label>
      ))}
      {item.type === 'tfng' && ['True', 'False', 'Not Given'].map((opt) => (
        <label key={opt} className="opt"><input type="radio" name={item.id} checked={value === opt} onChange={() => onChange(opt)} /> {opt}</label>
      ))}
      {item.type === 'gap' && (
        <input type="text" style={{ maxWidth: 320 }} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Type your answer" />
      )}
    </div>
  );
}
