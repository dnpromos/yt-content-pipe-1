import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { ChevronDown, ChevronUp, Clock, Timer, Hourglass, List, Skull, Landmark, GraduationCap, BookOpen, PenLine, Sparkles, Loader2, Youtube, Smartphone } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const FORMAT_PRESETS = [
  { value: 'listicle', label: 'Listicle', detail: 'Numbered countdown — "Number 5, ...!"', icon: List },
  { value: 'true_crime', label: 'True Crime', detail: 'Suspenseful, dark, mystery storytelling', icon: Skull },
  { value: 'history', label: 'History', detail: 'Documentary-style, chronological narrative', icon: Landmark },
  { value: 'tutorial', label: 'Tutorial', detail: 'Step-by-step instructional how-to', icon: GraduationCap },
  { value: 'story', label: 'Story', detail: 'Immersive freeform narrative', icon: BookOpen },
  { value: 'essay', label: 'Video Essay', detail: 'Analytical, opinion-driven argument', icon: PenLine },
];

const LENGTH_PRESETS = [
  {
    value: 'short',
    label: 'Short',
    duration: '1.5 – 3 min',
    sections: '2 – 4 sections',
    detail: 'Quick, punchy narration. Great for TikTok repurpose or snackable content.',
    icon: Clock,
    defaultSections: 3,
  },
  {
    value: 'medium',
    label: 'Medium',
    duration: '3 – 6 min',
    sections: '6 – 8 sections',
    detail: 'Balanced depth and pacing. Ideal for most YouTube videos.',
    icon: Timer,
    defaultSections: 6,
  },
  {
    value: 'long',
    label: 'Long',
    duration: '6 – 10 min',
    sections: '8 – 12 sections',
    detail: 'In-depth analysis with storytelling. Best for educational content.',
    icon: Hourglass,
    defaultSections: 10,
  },
];

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube', desc: 'Landscape 16:9', icon: Youtube, aspect: '16:9' as const, resolution: [1920, 1080] as [number, number] },
  { id: 'shorts', label: 'Shorts / Reels / TikTok', desc: 'Portrait 9:16', icon: Smartphone, aspect: '9:16' as const, resolution: [1080, 1920] as [number, number] },
];

const RES_MAP: Record<string, [number, number]> = { '720p': [1280, 720], '1080p': [1920, 1080] };
function deriveOutputRes(genRes: string, portrait: boolean): [number, number] {
  const [w, h] = RES_MAP[genRes] || RES_MAP['720p'];
  return portrait ? [h, w] : [w, h];
}

export function StepTopic() {
  const {
    config, setConfig,
    topic, setTopic,
    numSections, setNumSections,
    subtitles, setSubtitles,
    customInstructions, setCustomInstructions,
    stage, setStage, setTaskId, clearLogs, addLog, setUiStep,
  } = useStore();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);
  const ideasRef = useRef<HTMLDivElement>(null);
  const busy = stage === 'scripting' || stage === 'generating_voiceovers' || stage === 'generating_media' || stage === 'generating_assets' || stage === 'assembling';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ideasRef.current && !ideasRef.current.contains(e.target as Node)) setShowIdeas(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSuggestIdeas = async () => {
    setLoadingIdeas(true);
    setShowIdeas(true);
    try {
      const res = await api.topicIdeas(config, config.script_format);
      setIdeas(res.ideas);
    } catch (e) {
      addLog(`error generating ideas: ${e}`);
      setShowIdeas(false);
    } finally {
      setLoadingIdeas(false);
    }
  };

  const pickIdea = (idea: string) => {
    setTopic(idea);
    setShowIdeas(false);
  };

  const parseSubs = () => {
    const lines = subtitles.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.length > 0 ? lines : undefined;
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    clearLogs();
    addLog('starting script generation...');
    setStage('scripting');
    setUiStep(1);
    try {
      const res = await api.generateScript(config, topic.trim(), numSections, parseSubs(), customInstructions.trim() || undefined);
      setTaskId(res.task_id);
    } catch (e) {
      addLog(`error: ${e}`);
      setStage('idle');
      setUiStep(0);
    }
  };


  const selectLength = (preset: typeof LENGTH_PRESETS[0]) => {
    setConfig({ video_length: preset.value });
    setNumSections(preset.defaultSections);
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-8 space-y-8">
      {/* Script format selector */}
      <div className="space-y-3">
        <label className="block text-xs uppercase tracking-wider text-ink-3 font-medium">
          Script format
        </label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {FORMAT_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const active = config.script_format === preset.value;
            return (
              <button
                key={preset.value}
                onClick={() => setConfig({ script_format: preset.value })}
                className={`
                  relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all cursor-pointer
                  ${active
                    ? 'border-accent bg-accent/10 shadow-lg shadow-accent/10'
                    : 'border-edge bg-card hover:border-edge-strong hover:bg-mist/50'
                  }
                `}
              >
                <Icon size={18} className={active ? 'text-accent' : 'text-ink-3'} />
                <span className={`text-xs font-semibold leading-tight ${active ? 'text-accent' : 'text-ink-2'}`}>
                  {preset.label}
                </span>
                <p className={`text-[10px] leading-tight ${active ? 'text-ink-2' : 'text-ink-4'}`}>
                  {preset.detail}
                </p>
                {active && (
                  <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-accent" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Topic input */}
      <div className="space-y-2">
        <label className="block text-xs uppercase tracking-wider text-ink-3 font-medium">
          What's your video about?
        </label>
        <div className="relative" ref={ideasRef}>
          <div className="flex gap-2">
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Top 5 AI Tools in 2026"
              className="flex-1 bg-card border border-edge rounded-xl px-5 py-4 text-lg text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
              onKeyDown={(e) => e.key === 'Enter' && !busy && handleGenerate()}
            />
            <button
              onClick={handleSuggestIdeas}
              disabled={loadingIdeas}
              title="Suggest topic ideas with AI"
              className="flex items-center gap-1.5 px-4 bg-card border border-edge hover:border-accent hover:bg-accent/5 disabled:opacity-50 rounded-xl text-xs font-medium text-ink-2 cursor-pointer transition-all whitespace-nowrap"
            >
              {loadingIdeas ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Ideas
            </button>
          </div>
          {showIdeas && (
            <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-edge rounded-xl shadow-xl overflow-hidden">
              {loadingIdeas ? (
                <div className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-ink-3">
                  <Loader2 size={14} className="animate-spin" /> Generating ideas...
                </div>
              ) : ideas.length > 0 ? (
                <div className="py-1">
                  {ideas.map((idea, i) => (
                    <button
                      key={i}
                      onClick={() => pickIdea(idea)}
                      className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-accent/10 hover:text-accent transition-colors cursor-pointer"
                    >
                      {idea}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Video length selector */}
      <div className="space-y-3">
        <label className="block text-xs uppercase tracking-wider text-ink-3 font-medium">
          Video length
        </label>
        <div className="grid grid-cols-3 gap-3">
          {LENGTH_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const active = config.video_length === preset.value;
            return (
              <button
                key={preset.value}
                onClick={() => selectLength(preset)}
                className={`
                  relative flex flex-col items-start gap-3 p-4 rounded-xl border-2 text-left transition-all cursor-pointer
                  ${active
                    ? 'border-accent bg-accent/10 shadow-lg shadow-accent/10'
                    : 'border-edge bg-card hover:border-edge-strong hover:bg-mist/50'
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  <Icon size={16} className={active ? 'text-accent' : 'text-ink-3'} />
                  <span className={`text-sm font-semibold ${active ? 'text-accent' : 'text-ink-2'}`}>
                    {preset.label}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className={`text-lg font-bold ${active ? 'text-ink' : 'text-ink'}`}>
                    {preset.duration}
                  </div>
                  <div className={`text-xs ${active ? 'text-accent/80' : 'text-ink-3'}`}>
                    {preset.sections}
                  </div>
                </div>
                <p className={`text-xs leading-relaxed ${active ? 'text-ink-2' : 'text-ink-4'}`}>
                  {preset.detail}
                </p>
                {active && (
                  <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-accent" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Platform picker */}
      <div className="space-y-3">
        <label className="block text-xs uppercase tracking-wider text-ink-3 font-medium">
          Platform
        </label>
        <div className="grid grid-cols-2 gap-3">
          {PLATFORMS.map((p) => {
            const isPortrait = config.image_aspect === '9:16';
            const active = (p.id === 'shorts') === isPortrait;
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                onClick={() => {
                  const portrait = p.aspect === '9:16';
                  setConfig({
                    image_aspect: p.aspect,
                    video_resolution: deriveOutputRes(config.video_gen_resolution, portrait),
                  });
                }}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all cursor-pointer
                  ${active
                    ? 'border-accent bg-accent/10 shadow-lg shadow-accent/10'
                    : 'border-edge bg-card hover:border-edge-strong hover:bg-mist/50'
                  }
                `}
              >
                <Icon size={18} className={active ? 'text-accent' : 'text-ink-4'} />
                <div className="text-left">
                  <div className={`text-xs font-semibold ${active ? 'text-accent' : 'text-ink-2'}`}>{p.label}</div>
                  <div className={`text-[10px] ${active ? 'text-ink-2' : 'text-ink-4'}`}>{p.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sections count */}
      <div className="flex items-center gap-4">
        <label className="text-xs uppercase tracking-wider text-ink-3 font-medium whitespace-nowrap">
          {config.script_format === 'listicle' ? 'Sections' : 'Chapters'}
        </label>
        <input
          type="range"
          min={2} max={15}
          value={numSections}
          onChange={(e) => setNumSections(Number(e.target.value))}
          className="flex-1 accent-accent"
        />
        <span className="w-8 text-center text-sm font-bold text-ink">{numSections}</span>
      </div>

      {/* Advanced options toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink-2 cursor-pointer transition-colors"
      >
        {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        Advanced options
      </button>

      {showAdvanced && (
        <div className="space-y-4 bg-card border border-edge rounded-xl p-4">
          <div className="space-y-1.5">
            <label className="block text-xs uppercase tracking-wider text-ink-3">
              Section headings (one per line)
            </label>
            <textarea
              value={subtitles}
              onChange={(e) => setSubtitles(e.target.value)}
              placeholder={"FlowState.ai\nMoodBoard Studio\nCodeWhisper Pro"}
              rows={3}
              className="w-full bg-cream border border-edge rounded-lg px-4 py-3 text-sm text-ink-2 placeholder:text-ink-5 focus:outline-none focus:border-edge-strong resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs uppercase tracking-wider text-ink-3">
              Custom instructions
            </label>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="e.g. Write the script based on this article: ...&#10;Or: Focus on beginner-friendly explanations"
              rows={4}
              className="w-full bg-cream border border-edge rounded-lg px-4 py-3 text-sm text-ink-2 placeholder:text-ink-5 focus:outline-none focus:border-edge-strong resize-y"
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleGenerate}
          disabled={busy || !topic.trim()}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-white cursor-pointer transition-all shadow-lg shadow-accent/20"
        >
          Start Generating Script
        </button>
      </div>
    </div>
  );
}
