import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { ChevronDown, ChevronUp, Clock, Timer, Hourglass } from 'lucide-react';
import { useState } from 'react';

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
  const busy = stage === 'scripting' || stage === 'generating_assets' || stage === 'assembling';

  const parseSubs = () => {
    const lines = subtitles.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.length > 0 ? lines : undefined;
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    clearLogs();
    addLog('starting script generation...');
    setStage('scripting');
    setUiStep(2);
    try {
      const res = await api.generateScript(config, topic.trim(), numSections, parseSubs(), customInstructions.trim() || undefined);
      setTaskId(res.task_id);
    } catch (e) {
      addLog(`error: ${e}`);
      setStage('idle');
      setUiStep(1);
    }
  };


  const selectLength = (preset: typeof LENGTH_PRESETS[0]) => {
    setConfig({ video_length: preset.value });
    setNumSections(preset.defaultSections);
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-8 space-y-8">
      {/* Topic input */}
      <div className="space-y-2">
        <label className="block text-xs uppercase tracking-wider text-ink-3 font-medium">
          What's your video about?
        </label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Top 5 AI Tools in 2026"
          className="w-full bg-card border border-edge rounded-xl px-5 py-4 text-lg text-ink placeholder:text-ink-4 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
          onKeyDown={(e) => e.key === 'Enter' && !busy && handleGenerate()}
        />
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

      {/* Sections count */}
      <div className="flex items-center gap-4">
        <label className="text-xs uppercase tracking-wider text-ink-3 font-medium whitespace-nowrap">
          Sections
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
