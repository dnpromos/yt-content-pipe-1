import React, { useCallback, useState } from 'react';
import { useSocket } from './lib/useSocket';
import { useStore } from './lib/store';
import type { ScriptData, UiStep } from './lib/store';
import { StepWizard } from './components/StepWizard';
import { StepSettings } from './components/StepSettings';
import { StepTopic } from './components/StepTopic';
import { StepScript } from './components/StepScript';
import { StepAssets } from './components/StepAssets';
import { StepAssemble } from './components/StepAssemble';
import { LogPanel } from './components/LogPanel';
import { RunList } from './components/RunList';
import { CredentialsPopover } from './components/CredentialsPopover';
import { Lightbox } from './components/Lightbox';
import { api } from './lib/api';
import { FolderOpen, OctagonX, RotateCcw } from 'lucide-react';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-cream gap-4">
          <div className="text-red-400 text-sm font-medium">Something went wrong</div>
          <div className="text-ink-4 text-xs font-mono max-w-lg text-center">{this.state.error.message}</div>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-mist hover:bg-edge rounded-lg text-xs text-ink-2 cursor-pointer"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const { addLog, setScript, setRunId, setStage, setVideoPath, setTaskId, uiStep, setUiStep, resetRun } = useStore();
  const [runsOpen, setRunsOpen] = useState(false);

  const handleWsMessage = useCallback((data: Record<string, unknown>) => {
    if (data.type === 'log') {
      addLog(data.message as string);
      return;
    }

    if (data.type === 'task') {
      const status = data.status as string;
      const step = data.step as string;

      if (status === 'error') {
        addLog(`error: ${data.error}`);
        setTaskId(null);
        // Reset stage to last stable state so buttons become clickable again
        if (step === 'video') setStage('assets_done');
        else if (step === 'assets' || step === 'retry' || step === 'retry_section' || step === 'extra_images') setStage('assets_done');
        else if (step === 'script') setStage('idle');
        else setStage('assets_done');
        return;
      }

      if (data.run_id) setRunId(data.run_id as string);
      if (data.script) setScript(data.script as unknown as ScriptData);

      if (status === 'progress') {
        // Incremental update — script already set above, nothing else to change
        return;
      }

      if (status === 'running') {
        if (step === 'script') { setStage('scripting'); setUiStep(2 as UiStep); }
        else if (step === 'assets') { setStage('generating_assets'); setUiStep(3 as UiStep); }
        else if (step === 'video') { setStage('assembling'); setUiStep(4 as UiStep); }
      }

      if (status === 'done') {
        if (step === 'script') { setStage('scripted'); setUiStep(2 as UiStep); }
        else if (step === 'assets' || step === 'retry' || step === 'retry_section' || step === 'extra_images') { setStage('assets_done'); setUiStep(3 as UiStep); }
        else if (step === 'video') {
          setStage('video_done');
          setUiStep(4 as UiStep);
          if (data.video_path) setVideoPath(data.video_path as string);
        }
        setTaskId(null);
      }
    }
  }, [addLog, setScript, setRunId, setStage, setVideoPath, setTaskId, setUiStep]);

  useSocket(handleWsMessage);

  const stepContent = [
    <StepSettings key="settings" />,
    <StepTopic key="topic" />,
    <StepScript key="script" />,
    <StepAssets key="assets" />,
    <StepAssemble key="assemble" />,
  ];

  return (
    <div className="flex flex-col h-screen bg-cream overflow-hidden">
      {/* Top bar */}
      <header className="border-b border-edge">
        <div className="flex items-center justify-between px-8 py-3 max-w-5xl mx-auto w-full">
          <h1 className="text-sm font-bold text-ink-2 tracking-wide">clipmatic<span className="text-accent">.video</span></h1>
          <div className="flex items-center gap-1">
            <button onClick={() => { api.killAll(); resetRun(); }}
              title="Start a new run (keeps settings & topic)"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-accent/70 hover:text-accent hover:bg-accent/10 rounded-lg cursor-pointer transition-colors">
              <RotateCcw size={14} /> New Run
            </button>
            <button onClick={() => { api.killAll(); }}
              title="Kill all running tasks"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500/70 hover:text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors">
              <OctagonX size={14} /> Kill All
            </button>
            <div className="relative">
              <button onClick={() => setRunsOpen(!runsOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-ink-3 hover:text-ink-2 hover:bg-mist rounded-lg cursor-pointer transition-colors">
                <FolderOpen size={14} /> Runs
              </button>
              <RunList open={runsOpen} onClose={() => setRunsOpen(false)} />
            </div>
            <CredentialsPopover />
          </div>
        </div>
      </header>

      {/* Step wizard */}
      <StepWizard />

      {/* Step content */}
      <div className="flex-1 overflow-y-auto py-4">
        {stepContent[uiStep]}
      </div>

      {/* Log panel */}
      <LogPanel />
      <Lightbox />
    </div>
  );
}

export default function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
