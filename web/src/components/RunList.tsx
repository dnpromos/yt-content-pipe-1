import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { Clock } from 'lucide-react';
import type { ScriptData } from '../lib/store';
import type { ConfigPayload } from '../lib/api';

type Run = { id: string; title: string };

export function RunList({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setScript, setRunId, setStage, setVideoPath, setConfig, addLog, setUiStep } = useStore();
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setError(false);
      api.listRuns().then((data) => setRuns(data.runs)).catch(() => setError(true));
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  const loadRun = async (runId: string) => {
    try {
      const data = await api.getRun(runId);
      const script = data.script as unknown as ScriptData;
      setScript(script);
      setRunId(runId);

      if (data.config) {
        setConfig(data.config as Partial<ConfigPayload>);
      }

      const hasAssets = script.sections.some((s) => s.audio_path || s.image_path);
      if (hasAssets) {
        setStage('assets_done');
        setUiStep(3);
      } else {
        setStage('scripted');
        setUiStep(2);
      }
      setVideoPath(null);
      addLog(`loaded run: ${runId}`);
      onClose();
    } catch (e) {
      addLog(`error loading run: ${e}`);
    }
  };

  if (!open) return null;

  return (
    <div ref={ref} className="absolute top-full right-0 mt-1 w-80 bg-card border border-edge rounded-xl shadow-2xl shadow-black/10 z-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-edge text-[10px] uppercase tracking-wider text-ink-3 font-medium">
        Recent Runs
      </div>
      <div className="max-h-64 overflow-y-auto">
        {error && (
          <div className="px-3 py-4 text-xs text-red-400 text-center">Failed to load runs</div>
        )}
        {!error && runs.length === 0 && (
          <div className="px-3 py-4 text-xs text-ink-4 text-center">No runs found</div>
        )}
        {runs.map((run) => (
          <button
            key={run.id}
            onClick={() => loadRun(run.id)}
            className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-mist text-xs text-ink-2 cursor-pointer transition-colors border-b border-edge/50 last:border-b-0"
          >
            <Clock size={10} className="text-ink-4 flex-shrink-0" />
            <span className="text-ink-3 font-mono flex-shrink-0">{run.id.replace('run_', '')}</span>
            <span className="truncate">{run.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
