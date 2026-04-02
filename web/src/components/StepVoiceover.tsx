import { useRef } from 'react';
import { useStore, type UiStep } from '../lib/store';
import { api } from '../lib/api';
import { VoicePicker } from './VoicePicker';
import { CaptionSettings } from './CaptionSettings';
import { Mic, Loader, ArrowRight, Clock, CheckCircle, Captions } from 'lucide-react';

export function StepVoiceover() {
  const { script, config, setConfig, runId, stage, setStage, setTaskId, addLog, clearLogs, setUiStep } = useStore();
  const busy = stage === 'generating_voiceovers' || stage === 'generating_media' || stage === 'assembling';
  const topRef = useRef<HTMLDivElement>(null);

  if (!script) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-ink-4 text-sm">
        {stage === 'generating_voiceovers' ? (
          <>
            <div className="flex items-center gap-3">
              <Loader size={14} className="animate-spin text-accent" />
              Generating voiceovers...
            </div>
            <button
              onClick={() => { setStage('scripted'); setUiStep(1 as UiStep); setTaskId(null); }}
              className="px-4 py-2 bg-mist hover:bg-edge rounded-lg text-xs text-ink-3 cursor-pointer transition-colors"
            >
              Cancel &amp; go back
            </button>
          </>
        ) : (
          <>
            <span>No script available. Generate a script first.</span>
            <button onClick={() => setUiStep(0 as UiStep)}
              className="px-4 py-2 bg-mist hover:bg-edge rounded-lg text-xs text-ink-2 cursor-pointer transition-colors">
              Go to Topic
            </button>
          </>
        )}
      </div>
    );
  }

  const handleGenerateVoiceovers = async () => {
    if (!runId) return;
    clearLogs();
    addLog(`starting voiceover generation (${config.voice_provider})...`);
    setStage('generating_voiceovers');
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    try {
      const res = await api.generateVoiceovers(config, runId);
      setTaskId(res.task_id);
    } catch (e) {
      addLog(`error: ${e}`);
      setStage('scripted');
    }
  };

  const VOICE_DONE_STAGES = ['voiceovers_done', 'generating_media', 'media_done', 'generating_assets', 'assets_done', 'assembling', 'video_done'];

  const totalSections = script.sections.length;
  const sectionsWithAudio = script.sections.filter((s) => s.audio_path).length;
  const hasIntroAudio = !!script.intro_audio_path;
  const hasOutroAudio = !!script.outro_audio_path;
  const allPathsReady = sectionsWithAudio === totalSections && hasIntroAudio && hasOutroAudio;
  const voiceoversComplete = allPathsReady && VOICE_DONE_STAGES.includes(stage);
  const isGenerating = stage === 'generating_voiceovers';

  const totalDuration = script.sections.reduce((acc, s) => acc + (s.duration || 0), 0)
    + (script.intro_duration || 0) + (script.outro_duration || 0);

  const formatDuration = (s: number) => {
    if (!s) return '—';
    return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  };

  const totalItems = totalSections + 2;
  const doneItems = sectionsWithAudio + (hasIntroAudio ? 1 : 0) + (hasOutroAudio ? 1 : 0);
  const overallPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto w-full px-8 space-y-4">
      <div ref={topRef} />
      {/* Progress (visible when generating or complete) */}
      {(isGenerating || voiceoversComplete) && (
        <div className="bg-card border border-edge rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-2 flex items-center gap-2">
              <Mic size={16} className="text-accent" />
              Voiceover Progress
            </h3>
            <div className="flex items-center gap-3">
              {isGenerating && (
                <div className="flex items-center gap-2 text-xs text-amber-500">
                  <Loader size={12} className="animate-spin" />
                  Generating...
                </div>
              )}
              {voiceoversComplete && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle size={12} /> All voiceovers ready
                </div>
              )}
            </div>
          </div>

          {/* Overall progress */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] text-ink-3">
              <span>Overall ({doneItems}/{totalItems})</span>
              <span className="font-mono">{overallPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-mist overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${voiceoversComplete ? 'bg-emerald-400' : 'bg-accent'}`} style={{ width: `${overallPct}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <VoiceBar label="Intro" done={hasIntroAudio} duration={script.intro_duration} />
            <VoiceBar label={`Sections (${sectionsWithAudio}/${totalSections})`} done={sectionsWithAudio === totalSections} pct={totalSections > 0 ? Math.round((sectionsWithAudio / totalSections) * 100) : 0} />
            <VoiceBar label="Outro" done={hasOutroAudio} duration={script.outro_duration} />
          </div>

          {voiceoversComplete && totalDuration > 0 && (
            <div className="space-y-2 pt-2 border-t border-edge/50">
              <div className="flex items-center justify-between">
                <h4 className="text-xs uppercase tracking-wider text-ink-3 font-medium flex items-center gap-2">
                  <Clock size={12} className="text-accent" /> Section Durations
                </h4>
                <span className="text-xs text-ink font-semibold">{formatDuration(totalDuration)} total</span>
              </div>
              <div className="space-y-1">
                <DurationRow label="Intro" duration={script.intro_duration} />
                {script.sections.map((sec) => (
                  <DurationRow key={sec.number} label={sec.heading || `Section ${sec.number}`} duration={sec.duration} />
                ))}
                <DurationRow label="Outro" duration={script.outro_duration} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Voice Settings — tabbed picker */}
      <div className="bg-card border border-edge rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-ink-2 flex items-center gap-2">
          <Mic size={16} className="text-accent" />
          Voice Settings
        </h3>
        <VoicePicker />
      </div>

      {/* Captions */}
      <div className="bg-card border border-edge rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-2 flex items-center gap-2">
            <Captions size={16} className="text-accent" />
            Captions
          </h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={config.captions_enabled} onChange={(e) => setConfig({ captions_enabled: e.target.checked })} className="sr-only peer" />
            <div className="w-9 h-5 bg-edge rounded-full peer peer-checked:bg-accent transition-colors after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>
        <p className="text-xs text-ink-4 leading-relaxed">
          When enabled, each voiceover audio clip will be transcribed using Whisper to generate
          word-level captions. These captions are burned into the final video with highlighted
          active words for better viewer engagement and accessibility.
        </p>
      </div>

      {config.captions_enabled && <CaptionSettings />}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {voiceoversComplete && (
          <button onClick={handleGenerateVoiceovers} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-mist hover:bg-edge disabled:opacity-40 rounded-lg text-xs text-ink-2 cursor-pointer transition-colors">
            Regenerate All
          </button>
        )}
        <div className="flex-1" />
        {voiceoversComplete ? (
          <button onClick={() => setUiStep(3 as UiStep)}
            className="flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover rounded-xl text-sm font-medium text-white cursor-pointer transition-all shadow-lg shadow-accent/20">
            Next: Media <ArrowRight size={16} />
          </button>
        ) : (
          <button onClick={handleGenerateVoiceovers} disabled={busy}
            className="flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover disabled:opacity-40 rounded-xl text-sm font-medium text-white cursor-pointer transition-all shadow-lg shadow-accent/20">
            <Mic size={16} /> Generate Voiceovers
          </button>
        )}
      </div>
    </div>
  );
}

function VoiceBar({ label, done, duration, pct }: { label: string; done: boolean; duration?: number | null; pct?: number }) {
  const progress = done ? 100 : (pct ?? 0);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-ink-3">
        <span>{label}</span>
        {done && duration != null && <span className="text-ink-4">{duration.toFixed(1)}s</span>}
      </div>
      <div className="h-1.5 rounded-full bg-mist overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-emerald-400' : progress > 0 ? 'bg-accent' : 'bg-edge'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function DurationRow({ label, duration }: { label: string; duration: number | null }) {
  const maxDur = 60;
  const pct = duration ? Math.min(100, (duration / maxDur) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 truncate text-xs text-ink-3">{label}</div>
      <div className="flex-1 h-2 rounded-full bg-mist overflow-hidden">
        <div className="h-full rounded-full bg-accent/60 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-12 text-right text-[11px] text-ink-4 font-mono">
        {duration ? `${duration.toFixed(1)}s` : '—'}
      </div>
    </div>
  );
}
