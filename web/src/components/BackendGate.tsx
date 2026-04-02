import { useState, useEffect, type ReactNode } from 'react';

const BASE = import.meta.env.DEV ? '' : 'http://localhost:8000';
const IS_TAURI = !import.meta.env.DEV;
const TIMEOUT_MS = 30_000;

export function BackendGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!IS_TAURI);
  const [timedOut, setTimedOut] = useState(false);
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!IS_TAURI) return;

    let cancelled = false;
    const deadline = Date.now() + TIMEOUT_MS;

    async function poll() {
      while (!cancelled) {
        if (Date.now() > deadline) { setTimedOut(true); return; }
        try {
          const res = await fetch(`${BASE}/api/health`);
          if (res.ok) { setReady(true); return; }
        } catch { /* backend not up yet */ }
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    poll();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (ready || timedOut) return;
    const id = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 400);
    return () => clearInterval(id);
  }, [ready, timedOut]);

  if (ready) return <>{children}</>;

  if (timedOut) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-cream gap-4 px-6 text-center">
        <div className="text-lg font-bold text-ink-2 tracking-wide">
          clipmatic<span className="text-accent font-normal">.video</span>
        </div>
        <p className="text-sm text-red-600 font-medium">Backend failed to start</p>
        <p className="text-xs text-ink-4 max-w-sm">
          The Python backend did not respond within {TIMEOUT_MS / 1000}s.
          This can happen if port 8000 is in use by another application or the
          sidecar binary crashed on startup.
        </p>
        <button
          onClick={() => { setTimedOut(false); setReady(false); window.location.reload(); }}
          className="mt-2 px-4 py-1.5 text-xs rounded-md bg-accent text-white hover:opacity-90 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-cream gap-4">
      <div className="text-lg font-bold text-ink-2 tracking-wide">
        clipmatic<span className="text-accent font-normal">.video</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-ink-3">
        <svg className="animate-spin h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Starting backend{dots}
      </div>
      <p className="text-xs text-ink-4 mt-2">This may take a few seconds on first launch</p>
    </div>
  );
}
