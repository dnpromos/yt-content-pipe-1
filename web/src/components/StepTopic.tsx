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
        <label className="block text-xs uppercase tracking-wider text-neutral-400 font-medium">
          What's your video about?
        </label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Top 5 AI Tools in 2026"
          className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-5 py-4 text-lg text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all"
          onKeyDown={(e) => e.key === 'Enter' && !busy && handleGenerate()}
        />
      </div>

      {/* Video length selector */}
      <div className="space-y-3">
        <label className="block text-xs uppercase tracking-wider text-neutral-400 font-medium">
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
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                    : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700 hover:bg-neutral-800/50'
                  }
                `}
              >
                <div className="flex items-center gap-2">
                  <Icon size={16} className={active ? 'text-indigo-400' : 'text-neutral-500'} />
                  <span className={`text-sm font-semibold ${active ? 'text-indigo-300' : 'text-neutral-300'}`}>
                    {preset.label}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className={`text-lg font-bold ${active ? 'text-white' : 'text-neutral-200'}`}>
                    {preset.duration}
                  </div>
                  <div className={`text-xs ${active ? 'text-indigo-300/80' : 'text-neutral-500'}`}>
                    {preset.sections}
                  </div>
                </div>
                <p className={`text-xs leading-relaxed ${active ? 'text-neutral-300' : 'text-neutral-600'}`}>
                  {preset.detail}
                </p>
                {active && (
                  <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-indigo-400" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sections count */}
      <div className="flex items-center gap-4">
        <label className="text-xs uppercase tracking-wider text-neutral-400 font-medium whitespace-nowrap">
          Sections
        </label>
        <input
          type="range"
          min={2} max={15}
          value={numSections}
          onChange={(e) => setNumSections(Number(e.target.value))}
          className="flex-1 accent-indigo-500"
        />
        <span className="w-8 text-center text-sm font-bold text-neutral-200">{numSections}</span>
      </div>

      {/* Advanced options toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 cursor-pointer transition-colors"
      >
        {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        Advanced options
      </button>

      {showAdvanced && (
        <div className="space-y-4 bg-neutral-900/50 border border-neutral-800 rounded-xl p-4">
          <div className="space-y-1.5">
            <label className="block text-xs uppercase tracking-wider text-neutral-500">
              Section headings (one per line)
            </label>
            <textarea
              value={subtitles}
              onChange={(e) => setSubtitles(e.target.value)}
              placeholder={"FlowState.ai\nMoodBoard Studio\nCodeWhisper Pro"}
              rows={3}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-neutral-300 placeholder:text-neutral-700 focus:outline-none focus:border-neutral-600 resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs uppercase tracking-wider text-neutral-500">
              Custom instructions
            </label>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="e.g. Write the script based on this article: ...&#10;Or: Focus on beginner-friendly explanations"
              rows={4}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-sm text-neutral-300 placeholder:text-neutral-700 focus:outline-none focus:border-neutral-600 resize-y"
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleGenerate}
          disabled={busy || !topic.trim()}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-neutral-200 cursor-pointer transition-all"
        >
          Start Generating Script
        </button>
      </div>
    </div>
  );
}
