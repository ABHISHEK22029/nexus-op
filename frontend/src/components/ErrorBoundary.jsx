/* ══════════════════════════════════════════════════════════
   ErrorBoundary — a screen that crashes shows a way out, not a blank page.

   Without one, any error while drawing a screen unmounted the whole app:
   a white page, no menu, nothing to click. Now the screen is replaced by a
   short message with "Try again" and "Go to Dashboard", and the menu stays.

   The commonest cause is not a bug at all. Each screen is a separate file;
   after a new version is deployed, a tab left open still asks for the old
   file names, which no longer exist. That is recognised and the page is
   reloaded once, quietly, so the person gets the new version.

   It resets when the address changes, so moving to another screen works.
   ══════════════════════════════════════════════════════════ */
import React from 'react';

const RELOADED_KEY = 'maks_chunk_reload';
const isStaleChunk = (err) => /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically imported module|ChunkLoadError/i
  .test(String(err?.message || err));

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) {
    if (isStaleChunk(error)) {
      let last = 0;
      try { last = Number(sessionStorage.getItem(RELOADED_KEY)) || 0; } catch { /* storage blocked */ }
      /* Once a minute at most, so a file that is really missing can't loop. */
      if (Date.now() - last > 60000) {
        try { sessionStorage.setItem(RELOADED_KEY, String(Date.now())); } catch { /* storage blocked */ }
        window.location.reload();
        return;
      }
    }
    console.error('Screen crashed:', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = isStaleChunk(error);
    return (
      <div role="alert" style={{
        minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', color: 'var(--text-primary)',
      }}>
        <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>
          {stale ? 'A newer version of Maks Ops is available' : 'This screen ran into a problem'}
        </div>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: 440 }}>
          {stale
            ? 'Reload to get it. Nothing you saved is lost.'
            : 'Nothing you saved is lost. Try again, or go to another screen. If it keeps happening, tell us what you clicked just before.'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn-primary" onClick={() => (stale ? window.location.reload() : this.setState({ error: null }))}>
            {stale ? 'Reload' : 'Try again'}
          </button>
          <a href="/dashboard" className="btn-secondary" style={{ textDecoration: 'none' }}>Go to Dashboard</a>
        </div>
      </div>
    );
  }
}
