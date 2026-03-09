import { useStore, type UiStep } from '../lib/store';
import { Clapperboard, FileText, Sparkles, ImageIcon, Film } from 'lucide-react';

const STEPS: { label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { label: 'Settings', icon: Clapperboard },
  { label: 'Topic', icon: FileText },
  { label: 'Script', icon: Sparkles },
  { label: 'Assets', icon: ImageIcon },
  { label: 'Assemble', icon: Film },
];

export function StepWizard() {
  const { uiStep, setUiStep, stage } = useStore();

  const canNavigate = (step: UiStep): boolean => {
    if (step === 0) return true;
    if (step === 1) return true;
    if (step === 2) return stage !== 'idle';
    if (step === 3) return ['scripted', 'generating_assets', 'assets_done', 'assembling', 'video_done'].includes(stage);
    if (step === 4) return ['assets_done', 'assembling', 'video_done'].includes(stage);
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
              <div className={`w-16 h-px mx-1 ${state === 'disabled' ? 'bg-neutral-800' : idx <= uiStep ? 'bg-indigo-500' : 'bg-neutral-700'}`} />
            )}
            <button
              onClick={() => canNavigate(idx as UiStep) && setUiStep(idx as UiStep)}
              disabled={!canNavigate(idx as UiStep)}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer
                ${state === 'active' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : ''}
                ${state === 'completed' ? 'bg-neutral-800 text-indigo-400 hover:bg-neutral-700' : ''}
                ${state === 'upcoming' ? 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800' : ''}
                ${state === 'disabled' ? 'bg-neutral-900/50 text-neutral-700 cursor-not-allowed' : ''}
              `}
            >
              <span className={`
                w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold
                ${state === 'active' ? 'bg-white/20 text-white' : ''}
                ${state === 'completed' ? 'bg-indigo-500/20 text-indigo-400' : ''}
                ${state === 'upcoming' ? 'bg-neutral-800 text-neutral-500' : ''}
                ${state === 'disabled' ? 'bg-neutral-800/50 text-neutral-700' : ''}
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
