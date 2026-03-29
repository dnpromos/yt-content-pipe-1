import { useState, useRef, useEffect } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { Key, Save, Download } from 'lucide-react';

export function CredentialsPopover() {
  const { config, setConfig } = useStore();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    api.loadConfig().then((data) => {
      if (data && Object.keys(data).length > 0) setConfig(data);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      await api.saveConfig(config);
      setSaved(true);
      setTimeout(() => { setSaved(false); setOpen(false); }, 800);
    } catch { /* ignore */ }
  };

  const handleLoad = async () => {
    try {
      const data = await api.loadConfig();
      if (data && Object.keys(data).length > 0) setConfig(data);
    } catch { /* ignore */ }
  };

  const hasKeys = config.wiro_api_key.length > 0 && config.wiro_api_secret.length > 0;

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors ${
          hasKeys
            ? 'text-emerald-600 hover:text-emerald-500 hover:bg-mist'
            : 'text-amber-600 hover:text-amber-500 hover:bg-mist'
        }`}>
        <Key size={14} />
        <span className="hidden sm:inline">{hasKeys ? 'API Connected' : 'Set API Keys'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-edge rounded-xl shadow-2xl shadow-black/10 z-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-ink-3 font-medium flex items-center gap-1.5">
              <Key size={12} className="text-accent" /> API Credentials
            </div>
            <a href="https://wiro.ai/panel/project/new" target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-accent hover:text-accent-hover transition-colors">
              Get API Key →
            </a>
          </div>

          <div className="space-y-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-ink-3 mb-1">API Key</label>
              <input type="password" value={config.wiro_api_key}
                onChange={(e) => setConfig({ wiro_api_key: e.target.value })}
                placeholder="WIRO_API_KEY"
                className="w-full bg-cream border border-edge rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-edge-strong" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-ink-3 mb-1">API Secret</label>
              <input type="password" value={config.wiro_api_secret}
                onChange={(e) => setConfig({ wiro_api_secret: e.target.value })}
                placeholder="WIRO_API_SECRET"
                className="w-full bg-cream border border-edge rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-edge-strong" />
            </div>
          </div>

          <div className="rounded-lg bg-accent/10 border border-accent/20 px-3 py-2 text-[11px] text-accent">
            Use coupon <span className="font-bold text-accent-hover">WIRO10</span> at <a href="https://wiro.ai" target="_blank" rel="noopener noreferrer" className="underline hover:text-accent-hover">wiro.ai</a> for <span className="font-semibold">$10 free AI credits</span>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-mist hover:bg-edge rounded-lg text-xs text-ink-2 cursor-pointer transition-colors">
              <Save size={10} /> {saved ? 'Saved!' : 'Save'}
            </button>
            <button onClick={handleLoad}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-mist hover:bg-edge rounded-lg text-xs text-ink-2 cursor-pointer transition-colors">
              <Download size={10} /> Load
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
