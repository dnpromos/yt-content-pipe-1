import { useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

export function TopicBar() {
  const { config, stage, setStage, setTaskId, clearLogs, addLog } = useStore();
  const [topic, setTopic] = useState('');
  const [numSections, setNumSections] = useState(5);
  const [subtitles, setSubtitles] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const busy = stage === 'scripting' || stage === 'generating_assets' || stage === 'assembling';

  const parseSubs = () => {
    const lines = subtitles.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.length > 0 ? lines : undefined;
  };

  const handleGenerateScript = async () => {
    if (!topic.trim()) return;
    clearLogs();
    addLog('starting script generation...');
    setStage('scripting');
    try {
      const res = await api.generateScript(config, topic.trim(), numSections, parseSubs(), customInstructions.trim() || undefined);
      setTaskId(res.task_id);
    } catch (e) {
      addLog(`error: ${e}`);
      setStage('idle');
    }
  };

  return (
    <div className="px-6 py-4 border-b border-edge space-y-3">
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-wider text-ink-3 mb-1">topic</label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Top 5 AI Tools in 2026"
            className="w-full bg-card border border-edge rounded px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-edge-strong"
          />
        </div>
        <div className="w-20">
          <label className="block text-[10px] uppercase tracking-wider text-ink-3 mb-1">sections</label>
          <input
            type="number" min={2} max={20} value={numSections}
            onChange={(e) => setNumSections(Number(e.target.value))}
            className="w-full bg-card border border-edge rounded px-3 py-2 text-sm text-ink focus:outline-none focus:border-edge-strong"
          />
        </div>
        <button
          onClick={handleGenerateScript} disabled={busy || !topic.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed rounded text-sm text-white cursor-pointer transition-colors"
        >
          <Sparkles size={14} /> script
        </button>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-wider text-ink-3 mb-1">subtitles (one per line, optional)</label>
          <textarea
            value={subtitles} onChange={(e) => setSubtitles(e.target.value)}
            placeholder={"FlowState.ai\nMoodBoard Studio\nCodeWhisper Pro"}
            rows={2}
            className="w-full bg-card border border-edge rounded px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-edge-strong resize-none"
          />
        </div>
      </div>

      <button
        onClick={() => setShowCustom(!showCustom)}
        className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink-2 cursor-pointer"
      >
        {showCustom ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        custom instructions
      </button>
      {showCustom && (
        <textarea
          value={customInstructions} onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder="e.g. Write the script based on this article: ...&#10;Or: Focus on beginner-friendly explanations, keep each section under 30 seconds..."
          rows={4}
          className="w-full bg-card border border-edge rounded px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-edge-strong resize-y"
        />
      )}

      {busy && (
        <div className="flex items-center gap-2 text-xs text-amber-400">
          <span className="inline-block w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
          {stage === 'scripting' ? 'generating script...' : stage === 'generating_assets' ? 'generating assets...' : 'assembling video...'}
        </div>
      )}
    </div>
  );
}
