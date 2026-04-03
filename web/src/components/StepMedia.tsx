import { useRef, useState } from 'react';
import { useStore, type UiStep } from '../lib/store';
import { api } from '../lib/api';
import { ImageIcon, Film, Loader, ArrowRight, Sparkles, CheckCircle, RefreshCw } from 'lucide-react';
import { CostEstimate } from './CostEstimate';

const IMAGE_STYLES = [
  'cinematic realistic, dramatic lighting, film grain',
  'photorealistic, ultra detailed, natural lighting',
  'hyper realistic, 8K, sharp focus, studio lighting',
  '3D render, octane render, volumetric lighting',
  'digital art, vibrant colors, concept art style',
  'anime, studio ghibli style, soft colors',
  'dark moody cinematic, noir, high contrast shadows',
  'neon cyberpunk, glowing lights, futuristic',
  'watercolor painting, soft edges, artistic',
  'oil painting, renaissance style, rich textures',
];

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] uppercase tracking-wider text-ink-3 mb-1">{children}</label>;
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-card border border-edge rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-edge-strong cursor-pointer">
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export function StepMedia() {
  const { script, config, setConfig, runId, stage, setStage, setTaskId, addLog, clearLogs, setUiStep } = useStore();
  const busy = stage === 'generating_media' || stage === 'assembling';
  const [autoApplied, setAutoApplied] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  if (!script) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-ink-4 text-sm">
        {stage === 'generating_media' ? (
          <>
            <div className="flex items-center gap-3">
              <Loader size={14} className="animate-spin text-accent" />
              Generating media...
            </div>
            <button
              onClick={() => { setStage('voiceovers_done'); setUiStep(2 as UiStep); setTaskId(null); }}
              className="px-4 py-2 bg-mist hover:bg-edge rounded-lg text-xs text-ink-3 cursor-pointer transition-colors"
            >
              Cancel &amp; go back
            </button>
          </>
        ) : (
          <>
            <span>No script available.</span>
            <button onClick={() => setUiStep(0 as UiStep)}
              className="px-4 py-2 bg-mist hover:bg-edge rounded-lg text-xs text-ink-2 cursor-pointer transition-colors">
              Go to Topic
            </button>
          </>
        )}
      </div>
    );
  }

  const sectionIsVideo = config.section_media_type === 'video';
  const hasDurations = script.sections.some((s) => s.duration && s.duration > 0);

  const suggestImageCount = (duration: number | null) => {
    if (!duration || duration <= 0) return 1;
    return Math.ceil(duration / 3.0);
  };

  const suggestVideoCount = (duration: number | null) => {
    if (!duration || duration <= 0) return 1;
    return Math.ceil(duration / config.video_gen_duration);
  };

  const avgDuration = script.sections.length > 0
    ? script.sections.reduce((a, s) => a + (s.duration || 0), 0) / script.sections.length
    : 0;

  const suggestedImages = suggestImageCount(avgDuration);
  const suggestedVideos = suggestVideoCount(avgDuration);

  const handleAutoSuggest = () => {
    if (sectionIsVideo) {
      setConfig({ videos_per_section: suggestedVideos });
    } else {
      setConfig({ images_per_section: suggestedImages });
    }
    setAutoApplied(true);
  };

  const handleGenerateMedia = async (force = false) => {
    if (!runId) return;
    clearLogs();
    addLog(force ? 'regenerating all media...' : 'starting media generation...');
    setStage('generating_media');
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    try {
      const res = await api.generateMedia(config, runId, force);
      setTaskId(res.task_id);
    } catch (e) {
      addLog(`error: ${e}`);
      setStage('voiceovers_done');
    }
  };

  const MEDIA_DONE_STAGES = ['media_done', 'generating_assets', 'assets_done', 'assembling', 'video_done'];

  const totalSections = script.sections.length;
  const sectionsWithImage = script.sections.filter((s) => s.image_path).length;
  const sectionsWithVideo = script.sections.filter((s) => s.video_path).length;
  const hasIntroImage = !!script.intro_image_path;
  const hasOutroImage = !!script.outro_image_path;
  const mediaReady = sectionIsVideo ? sectionsWithVideo : sectionsWithImage;
  const allPathsReady = mediaReady === totalSections && hasIntroImage;
  const mediaComplete = allPathsReady && MEDIA_DONE_STAGES.includes(stage);
  const isGenerating = stage === 'generating_media';

  const totalItems = totalSections + 2;
  const doneItems = mediaReady + (hasIntroImage ? 1 : 0) + (hasOutroImage ? 1 : 0);
  const overallPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto w-full px-8 space-y-4">
      <div ref={topRef} />
      {/* Media Progress */}
      {(isGenerating || mediaComplete) && (
        <div className="bg-card border border-edge rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-2 flex items-center gap-2">
              {sectionIsVideo ? <Film size={16} className="text-accent" /> : <ImageIcon size={16} className="text-accent" />}
              Media Progress
            </h3>
            <div className="flex items-center gap-3">
              {isGenerating && (
                <div className="flex items-center gap-2 text-xs text-amber-500">
                  <Loader size={12} className="animate-spin" /> Generating...
                </div>
              )}
              {mediaComplete && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle size={12} /> All media ready
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
              <div className={`h-full rounded-full transition-all duration-500 ${mediaComplete ? 'bg-emerald-400' : 'bg-accent'}`} style={{ width: `${overallPct}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <MediaBar label="Intro" done={hasIntroImage} />
            <MediaBar label={`Sections (${mediaReady}/${totalSections})`} done={mediaReady === totalSections} pct={totalSections > 0 ? Math.round((mediaReady / totalSections) * 100) : 0} />
            <MediaBar label="Outro" done={hasOutroImage} />
          </div>

          {totalSections > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-ink-3 font-medium mb-1">Per-section status</div>
              <div className="grid grid-cols-1 gap-0.5 max-h-40 overflow-y-auto">
                {script.sections.map((sec) => {
                  const done = sectionIsVideo ? !!sec.video_path : !!sec.image_path;
                  return (
                    <div key={sec.number} className="flex items-center gap-2 text-xs text-ink-3 py-0.5">
                      <span className="w-5 text-right text-ink-4 font-mono">{sec.number}</span>
                      <span className="flex-1 truncate">{sec.heading}</span>
                      <span className={`text-[10px] font-medium ${done ? 'text-emerald-400' : 'text-ink-5'}`}>
                        {done ? 'Done' : isGenerating ? 'Pending...' : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Intro Card */}
      <div className="bg-card border border-edge rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-ink-2 flex items-center gap-2">
          <Sparkles size={16} className="text-accent" />
          Intro Media
        </h3>

        <div className={`grid ${sectionIsVideo ? 'grid-cols-4' : 'grid-cols-3'} gap-2 p-3 bg-mist/50 border border-edge/50 rounded-lg`}>
          <div>
            <Label>Intro images</Label>
            <Select value={String(config.intro_image_count)} onChange={(v) => setConfig({ intro_image_count: Number(v) })} options={['1', '2', '3', '4', '5']} />
          </div>
          <div>
            <Label>Image style</Label>
            <Select value={config.image_style} onChange={(v) => setConfig({ image_style: v })} options={IMAGE_STYLES} />
          </div>
          <div>
            <Label>Image resolution</Label>
            <Select value={config.image_resolution} onChange={(v) => setConfig({ image_resolution: v })} options={['1K', '2K', '4K']} />
          </div>
          {sectionIsVideo && (
            <div>
              <Label>Intro video clips</Label>
              <Select value={String(config.intro_video_count)} onChange={(v) => setConfig({ intro_video_count: Number(v) })} options={['0', '1', '2', '3', '4', '5']} />
            </div>
          )}
        </div>
      </div>

      {/* Sections Card */}
      <div className="bg-card border border-edge rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-ink-2 flex items-center gap-2">
          <ImageIcon size={16} className="text-accent" />
          Section Media
        </h3>

        {/* Media type toggle */}
        <div className="space-y-1.5">
          <Label>Media type</Label>
          <div className="flex rounded-lg overflow-hidden border border-edge">
            <button onClick={() => setConfig({ section_media_type: 'image' })}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                !sectionIsVideo ? 'bg-accent text-white' : 'bg-card text-ink-3 hover:text-ink-2'
              }`}>
              <ImageIcon size={12} /> AI Images
            </button>
            <button onClick={() => setConfig({ section_media_type: 'video' })}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                sectionIsVideo ? 'bg-accent text-white' : 'bg-card text-ink-3 hover:text-ink-2'
              }`}>
              <Film size={12} /> AI Video
            </button>
          </div>
        </div>

        {/* Smart suggestion */}
        {hasDurations && (
          <div className="flex items-center gap-3 p-3 bg-accent/5 border border-accent/20 rounded-lg">
            <Sparkles size={14} className="text-accent flex-shrink-0" />
            <div className="flex-1 text-xs text-ink-3">
              Based on avg duration ({avgDuration.toFixed(1)}s):
              <span className="font-semibold text-ink ml-1">
                {sectionIsVideo
                  ? `${suggestedVideos} clip${suggestedVideos > 1 ? 's' : ''}/section`
                  : `${suggestedImages} image${suggestedImages > 1 ? 's' : ''}/section`
                }
              </span>
            </div>
            <button onClick={handleAutoSuggest}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover rounded-lg text-xs text-white cursor-pointer transition-colors flex-shrink-0">
              {autoApplied ? 'Applied!' : 'Apply'}
            </button>
          </div>
        )}

        {/* Config fields */}
        {sectionIsVideo ? (
          <div className="grid grid-cols-4 gap-2 p-3 bg-mist/50 border border-edge/50 rounded-lg">
            <div>
              <Label>Clips per section</Label>
              <Select value={String(config.videos_per_section)} onChange={(v) => setConfig({ videos_per_section: Number(v) })} options={['1', '2', '3', '4', '5', '6', '7', '8']} />
            </div>
            <div>
              <Label>Clip duration (s)</Label>
              <Select value={String(config.video_gen_duration)} onChange={(v) => setConfig({ video_gen_duration: Number(v) })} options={['1','2','3','4','5','6','7','8','9','10']} />
            </div>
            <div>
              <Label>Gen resolution</Label>
              <Select value={config.video_gen_resolution} onChange={(v) => setConfig({ video_gen_resolution: v })} options={['720p', '1080p']} />
            </div>
            <div>
              <Label>Gen FPS</Label>
              <Select value={config.video_gen_fps} onChange={(v) => setConfig({ video_gen_fps: v })} options={['24', '48']} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 p-3 bg-mist/50 border border-edge/50 rounded-lg">
            <div>
              <Label>Images per section</Label>
              <Select value={String(config.images_per_section)} onChange={(v) => setConfig({ images_per_section: Number(v) })} options={['1', '2', '3', '4', '5', '6', '7', '8']} />
            </div>
            <div>
              <Label>Resolution</Label>
              <Select value={config.image_resolution} onChange={(v) => setConfig({ image_resolution: v })} options={['1K', '2K', '4K']} />
            </div>
          </div>
        )}

        {/* Per-section breakdown */}
        {hasDurations && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-ink-3 font-medium mb-1">Per-section breakdown</div>
            <div className="grid grid-cols-1 gap-0.5 max-h-40 overflow-y-auto">
              {script.sections.map((sec) => {
                const suggested = sectionIsVideo ? suggestVideoCount(sec.duration) : suggestImageCount(sec.duration);
                return (
                  <div key={sec.number} className="flex items-center gap-2 text-xs text-ink-3 py-0.5">
                    <span className="w-5 text-right text-ink-4 font-mono">{sec.number}</span>
                    <span className="flex-1 truncate">{sec.heading}</span>
                    <span className="text-ink-4 font-mono w-12 text-right">{sec.duration?.toFixed(1) || '—'}s</span>
                    <span className="text-accent font-mono w-16 text-right">
                      {suggested} {sectionIsVideo ? 'clip' : 'img'}{suggested > 1 ? 's' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Outro Card */}
      <div className="bg-card border border-edge rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-ink-2 flex items-center gap-2">
          <ImageIcon size={16} className="text-accent" />
          Outro Media
        </h3>
        <p className="text-xs text-ink-4">1 AI image is generated for the outro (image only, no video).</p>
        <div className="grid grid-cols-2 gap-2 p-3 bg-mist/50 border border-edge/50 rounded-lg">
          <div>
            <Label>Image style</Label>
            <Select value={config.image_style} onChange={(v) => setConfig({ image_style: v })} options={IMAGE_STYLES} />
          </div>
          <div>
            <Label>Image resolution</Label>
            <Select value={config.image_resolution} onChange={(v) => setConfig({ image_resolution: v })} options={['1K', '2K', '4K']} />
          </div>
        </div>
      </div>

      {/* Cost */}
      <CostEstimate />

      {/* Actions */}
      <div className="flex items-center gap-2">
        {mediaComplete && (
          <button onClick={() => handleGenerateMedia(true)} disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-mist hover:bg-edge disabled:opacity-40 rounded-lg text-xs text-ink-2 cursor-pointer transition-colors">
            <RefreshCw size={12} /> Regenerate All
          </button>
        )}
        <div className="flex-1" />
        {mediaComplete ? (
          <button onClick={() => setUiStep(4 as UiStep)}
            className="flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover rounded-xl text-sm font-medium text-white cursor-pointer transition-all shadow-lg shadow-accent/20">
            Next: Review <ArrowRight size={16} />
          </button>
        ) : (
          <button onClick={() => handleGenerateMedia(false)} disabled={busy}
            className="flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover disabled:opacity-40 rounded-xl text-sm font-medium text-white cursor-pointer transition-all shadow-lg shadow-accent/20">
            Generate Media
          </button>
        )}
      </div>
    </div>
  );
}

function MediaBar({ label, done, pct }: { label: string; done: boolean; pct?: number }) {
  const progress = done ? 100 : (pct ?? 0);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-ink-3">
        <span>{label}</span>
        {done && <span className="text-emerald-400">✓</span>}
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
