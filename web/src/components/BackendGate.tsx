import { useState, useEffect, type ReactNode } from 'react';

const BASE = import.meta.env.DEV ? '' : 'http://localhost:8000';
const IS_TAURI = !import.meta.env.DEV;

export function BackendGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!IS_TAURI);
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!IS_TAURI) return;

    let cancelled = false;

    async function poll() {
      while (!cancelled) {
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
    if (ready) return;
    const id = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 400);
    return () => clearInterval(id);
  }, [ready]);

  if (ready) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-neutral-950 gap-4">
      <div className="text-lg font-bold text-neutral-300 tracking-wide">
        clipmatic<span className="text-neutral-500 font-normal">.video</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <svg className="animate-spin h-4 w-4 text-indigo-500" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Starting backend{dots}
      </div>
      <p className="text-xs text-neutral-600 mt-2">This may take a few seconds on first launch</p>
    </div>
  );
}
