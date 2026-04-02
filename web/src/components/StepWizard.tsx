import { useStore, type UiStep } from '../lib/store';
import { FileText, Sparkles, Mic, ImageIcon, Eye, Film } from 'lucide-react';

const STEPS: { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { label: 'Topic', icon: FileText },
  { label: 'Script', icon: Sparkles },
  { label: 'Voiceover', icon: Mic },
  { label: 'Media', icon: ImageIcon },
  { label: 'Review', icon: Eye },
  { label: 'Assemble', icon: Film },
];

export function StepWizard() {
  const { uiStep, setUiStep, stage } = useStore();

  const canNavigate = (step: UiStep): boolean => {
    if (step === 0) return true; // Topic
    if (step === 1) return stage !== 'idle'; // Script
    if (step === 2) return ['scripted', 'generating_voiceovers', 'voiceovers_done', 'generating_media', 'media_done', 'generating_assets', 'assets_done', 'assembling', 'video_done'].includes(stage); // Voiceover
    if (step === 3) return ['voiceovers_done', 'generating_media', 'media_done', 'generating_assets', 'assets_done', 'assembling', 'video_done'].includes(stage); // Media
    if (step === 4) return ['media_done', 'assets_done', 'assembling', 'video_done'].includes(stage); // Review
    if (step === 5) return ['media_done', 'assets_done', 'assembling', 'video_done'].includes(stage); // Assemble
    return false;
  };

  const stepState = (idx: number): 'active' | 'completed' | 'upcoming' | 'disabled' => {
    if (idx === uiStep) return 'active';
    if (idx < uiStep) return 'completed';
    if (canNavigate(idx as UiStep)) return 'upcoming';
    return 'disabled';
  };

  return (
    <div className="flex items-center justify-center gap-0 py-6 px-8 max-w-5xl mx-auto w-full">
      {STEPS.map((step, idx) => {
        const state = stepState(idx);
        const Icon = step.icon;
        return (
          <div key={idx} className="flex items-center">
            {idx > 0 && (
              <div className={`w-8 h-px mx-0.5 ${state === 'disabled' ? 'bg-edge' : idx <= uiStep ? 'bg-accent' : 'bg-edge-strong'}`} />
            )}
            <button
              onClick={() => canNavigate(idx as UiStep) && setUiStep(idx as UiStep)}
              disabled={!canNavigate(idx as UiStep)}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer
                ${state === 'active' ? 'bg-accent text-white shadow-lg shadow-accent/20' : ''}
                ${state === 'completed' ? 'bg-mist text-accent hover:bg-edge' : ''}
                ${state === 'upcoming' ? 'bg-card text-ink-3 hover:bg-mist' : ''}
                ${state === 'disabled' ? 'bg-card/50 text-ink-5 cursor-not-allowed' : ''}
              `}
            >
              <span className={`
                w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold
                ${state === 'active' ? 'bg-white/20 text-white' : ''}
                ${state === 'completed' ? 'bg-accent/20 text-accent' : ''}
                ${state === 'upcoming' ? 'bg-mist text-ink-3' : ''}
                ${state === 'disabled' ? 'bg-mist/50 text-ink-5' : ''}
              `}>
                {idx + 1}
              </span>
              <Icon size={14} />
              <span className="hidden sm:inline">{step.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
