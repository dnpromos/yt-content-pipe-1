import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { Film, Loader, CheckCircle, Download } from 'lucide-react';

export function StepAssemble() {
  const { script, config, runId, stage, setStage, setTaskId, addLog, videoPath } = useStore();
  const busy = stage === 'assembling';

  if (!script) {
    return (
      <div className="flex-1 flex items-center justify-center text-ink-4 text-sm">
        No script available. Go to Step 1 to generate one.
      </div>
    );
  }

  const handleAssemble = async () => {
    if (!runId) return;
    addLog('assembling video...');
    setStage('assembling');
    try {
      const res = await api.assembleVideo(config, runId);
      setTaskId(res.task_id);
    } catch (e) {
      addLog(`error: ${e}`);
      setStage('media_done');
    }
  };

  const totalDuration = script.sections.reduce((acc, s) => acc + (s.duration || 0), 0)
    + (script.intro_duration || 0) + (script.outro_duration || 0);

  return (
    <div className="max-w-5xl mx-auto w-full px-8 space-y-6">
      {/* Video settings summary */}
      <div className="bg-card border border-edge rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-ink-2 flex items-center gap-2">
          <Film size={16} className="text-accent" />
          Video Settings
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <SettingPill label="Resolution" value={`${config.video_resolution[0]}×${config.video_resolution[1]}`} />
          <SettingPill label="FPS" value={String(config.video_fps)} />
          <SettingPill label="Transition" value={config.video_transition} />
          <SettingPill label="Preset" value={config.video_preset} />
          <SettingPill label="Captions" value={config.captions_enabled ? 'On' : 'Off'} />
        </div>
        {totalDuration > 0 && (
          <div className="text-xs text-ink-3">
            Estimated duration: <span className="text-ink font-medium">{Math.floor(totalDuration / 60)}m {Math.round(totalDuration % 60)}s</span>
          </div>
        )}
      </div>

      {/* Video player */}
      {stage === 'video_done' && videoPath && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle size={16} />
            <span className="font-medium">Video ready!</span>
          </div>
          <div className="bg-black rounded-xl overflow-hidden border border-edge">
            <video
              key={videoPath}
              src={api.fileUrl(videoPath)}
              controls
              className="w-full max-h-[60vh]"
            />
          </div>
          <p className="text-xs text-ink-4 text-center">{videoPath}</p>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="flex items-center gap-3 pt-2">
        {stage === 'video_done' && (
          <button onClick={handleAssemble} disabled={busy}
            className="flex items-center gap-2 px-5 py-2.5 bg-mist hover:bg-edge disabled:opacity-40 rounded-lg text-xs text-ink-2 cursor-pointer transition-colors">
            <Film size={14} /> Reassemble
          </button>
        )}
        <div className="flex-1" />
        {stage === 'video_done' && videoPath && (
          <a href={api.fileUrl(videoPath)} download
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium text-white cursor-pointer transition-all shadow-lg shadow-emerald-500/20">
            <Download size={14} /> Download Video
          </a>
        )}
        {stage !== 'video_done' && (
          <button onClick={handleAssemble} disabled={busy || !runId}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white cursor-pointer transition-all shadow-lg shadow-accent/20">
            {busy ? (
              <><Loader size={14} className="animate-spin" /> Assembling Video...</>
            ) : (
              <><Film size={14} /> Assemble Video</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function SettingPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-mist/50 rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-ink-4">{label}</div>
      <div className="text-sm text-ink-2 font-medium">{value}</div>
    </div>
  );
}
