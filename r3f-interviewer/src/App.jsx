import { useState } from 'react';
import Setup from './components/Setup.jsx';
import Interview from './components/Interview.jsx';
import Report from './components/Report.jsx';
import ExamShell from './exam/ExamShell.jsx';
import Admin from './exam/Admin.jsx';
import { activeTest } from './exam/store.js';
import { getConfig } from './lib/config.js';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [result, setResult] = useState(null);
  const cfg = getConfig();
  return (
    <>
      <div className="topbar">EPSILON SPEAK PRO - IELTS Test System</div>
      {screen === 'home' && (
        <div className="wrap">
          <div className="card">
            <h1>Welcome{cfg.candidate ? ', ' + cfg.candidate : ''}</h1>
            <p className="muted">Choose what you'd like to do.</p>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="primary" onClick={() => setScreen('exam')}>Full IELTS Test - 4 modules</button>
              <button className="blue" onClick={() => setScreen('practice')}>Speaking Practice (conversation)</button>
              <button className="ghost" onClick={() => setScreen('setup')}>Settings</button>
              <button className="ghost" onClick={() => setScreen('admin')}>Admin console</button>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
              The Full Test runs Listening, Reading, Writing and Speaking in a timed, locked exam shell and saves the result to the Admin results dashboard.
              Authoring of tests, candidates and results is under Admin console. Best in Google Chrome with a microphone and headphones.
            </p>
          </div>
        </div>
      )}
      {screen === 'setup' && <Setup onStart={() => setScreen('home')} />}
      {screen === 'admin' && <Admin onExit={() => setScreen('home')} />}
      {screen === 'exam' && <ExamShell candidate={getConfig().candidate} test={activeTest()} onExit={() => setScreen('home')} />}
      {screen === 'practice' && <Interview onDone={(r) => { setResult(r); setScreen('report'); }} />}
      {screen === 'report' && result && <Report result={result} onRestart={() => setScreen('home')} />}
    </>
  );
}
