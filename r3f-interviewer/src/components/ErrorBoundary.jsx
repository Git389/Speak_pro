import { Component } from 'react';

// Dual-purpose error boundary:
//  - inside <Canvas>: pass `fallback` (e.g. the procedural head) so a bad GLB never blanks the app.
//  - at the app root: pass `showError` to render the actual error on screen instead of a white page.
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(err) { console.error('[ErrorBoundary]', err); }
  render() {
    if (this.state.error) {
      if (this.props.showError) {
        const e = this.state.error;
        return (
          <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 820, margin: '0 auto' }}>
            <h2 style={{ color: '#c0392b' }}>The app hit an error</h2>
            <p>This replaces the blank/white screen so you can see what went wrong. Please copy this (and anything red in the browser console, F12):</p>
            <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', border: '1px solid #ddd', padding: 12, borderRadius: 8, fontSize: 13 }}>
{String((e && (e.stack || e.message)) || e)}
            </pre>
            <button onClick={() => location.reload()} style={{ marginTop: 12, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#1f3864', color: '#fff', cursor: 'pointer' }}>Reload</button>
          </div>
        );
      }
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
