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
      setTimeout(() => setSaved(false), 2000);
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
            ? 'text-emerald-500 hover:text-emerald-400 hover:bg-neutral-800'
            : 'text-amber-500 hover:text-amber-400 hover:bg-neutral-800'
        }`}>
        <Key size={14} />
        <span className="hidden sm:inline">{hasKeys ? 'API Connected' : 'Set API Keys'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl shadow-black/50 z-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-neutral-400 font-medium flex items-center gap-1.5">
              <Key size={12} className="text-indigo-400" /> API Credentials
            </div>
            <a href="https://wiro.ai/panel/project/new" target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors">
              Get API Key →
            </a>
          </div>

          <div className="space-y-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">API Key</label>
              <input type="password" value={config.wiro_api_key}
                onChange={(e) => setConfig({ wiro_api_key: e.target.value })}
                placeholder="WIRO_API_KEY"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-1">API Secret</label>
              <input type="password" value={config.wiro_api_secret}
                onChange={(e) => setConfig({ wiro_api_secret: e.target.value })}
                placeholder="WIRO_API_SECRET"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600" />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs text-neutral-300 cursor-pointer transition-colors">
              <Save size={10} /> {saved ? 'Saved!' : 'Save'}
            </button>
            <button onClick={handleLoad}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs text-neutral-300 cursor-pointer transition-colors">
              <Download size={10} /> Load
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
