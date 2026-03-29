import { useState, useRef } from 'react';
import { useStore, type ScriptData } from '../lib/store';
import { api } from '../lib/api';
import { RefreshCw, ArrowRight, CheckCircle, Loader, AlertCircle, ImagePlus, Upload, Trash2, Volume2 } from 'lucide-react';
import { openLightbox } from './Lightbox';

export function StepAssets() {
  const { script, config, runId, stage, setStage, setTaskId, addLog, clearLogs, setUiStep, logs } = useStore();
  const busy = stage === 'generating_assets' || stage === 'assembling';

  if (!script) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-ink-4 text-sm">
        {stage === 'generating_assets' ? (
          <>
            <div className="flex items-center gap-3">
              <Loader size={14} className="animate-spin text-accent" />
              Generating assets...
            </div>
            <button onClick={() => { setStage('scripted'); setUiStep(2); setTaskId(null); }}
              className="px-4 py-2 bg-mist hover:bg-edge rounded-lg text-xs text-ink-3 cursor-pointer transition-colors">
              Cancel &amp; go back
            </button>
          </>
        ) : (
          <>
            <span>No script available.</span>
            <button onClick={() => setUiStep(1)}
              className="px-4 py-2 bg-mist hover:bg-edge rounded-lg text-xs text-ink-2 cursor-pointer transition-colors">
              Go to Topic
            </button>
          </>
        )}
      </div>
    );
  }

  const handleGenerateAssets = async (force = false) => {
    if (!runId) return;
    clearLogs();
    addLog(force ? 'regenerating all assets...' : 'starting asset generation...');
    setStage('generating_assets');
    try {
      const res = await api.generateAssets(config, runId, force);
      setTaskId(res.task_id);
    } catch (e) {
      addLog(`error: ${e}`);
      setStage('scripted');
    }
  };

  const handleRetryMissing = async () => {
    if (!runId) return;
    clearLogs();
    addLog('retrying missing assets...');
    setStage('generating_assets');
    try {
      const res = await api.retryMissing(config, runId);
      setTaskId(res.task_id);
    } catch (e) {
      addLog(`error: ${e}`);
      setStage('assets_done');
    }
  };

  const totalSections = script.sections.length;
  const sectionsWithAudio = script.sections.filter((s) => s.audio_path).length;
  const sectionsWithImage = script.sections.filter((s) => s.image_path).length;
  const sectionsWithVideo = script.sections.filter((s) => s.video_path).length;
  const hasIntroAudio = !!script.intro_audio_path;
  const hasOutroAudio = !!script.outro_audio_path;
  const hasIntroImage = !!script.intro_image_path;

  const isVideo = config.section_media_type === 'video';
  const mediaReady = isVideo ? sectionsWithVideo : sectionsWithImage;
  const allReady = sectionsWithAudio === totalSections && mediaReady === totalSections && hasIntroAudio;

  // Live counter from logs
  const liveCount = logs.filter((l) =>
    l.includes('saved') || l.includes('generated') || l.includes('downloaded') || l.includes('audio ready') || l.includes('image ready')
  ).length;

  return (
    <div className="max-w-5xl mx-auto w-full px-8 space-y-5">
      {/* Progress bar header */}
      <div className="bg-card border border-edge rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-2">Asset Progress</h3>
          <div className="flex items-center gap-3">
            {stage === 'generating_assets' && (
              <div className="flex items-center gap-2 text-xs text-amber-600">
                <Loader size={12} className="animate-spin" />
                Generating... ({liveCount} events)
              </div>
            )}
            {allReady && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle size={12} />
                All assets ready
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3">
          <AssetRow label="Intro audio" current={hasIntroAudio ? 1 : 0} total={1} />
          <AssetRow label="Outro audio" current={hasOutroAudio ? 1 : 0} total={1} />
          <AssetRow label="Section audio" current={sectionsWithAudio} total={totalSections} />
          <AssetRow label={isVideo ? 'Section videos' : 'Section images'} current={mediaReady} total={totalSections} />
          <AssetRow label="Intro image" current={hasIntroImage ? 1 : 0} total={1} />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {(stage === 'scripted') && (
            <button onClick={() => handleGenerateAssets(false)} disabled={busy}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-40 rounded-lg text-xs font-medium text-white cursor-pointer transition-all shadow-lg shadow-accent/20">
              Generate Assets
            </button>
          )}
          {(stage === 'assets_done' || stage === 'video_done') && (
            <>
              <button onClick={handleRetryMissing} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 bg-mist hover:bg-edge disabled:opacity-40 rounded-lg text-xs text-ink-2 cursor-pointer transition-colors">
                <RefreshCw size={12} /> Retry missing
              </button>
              <button onClick={() => handleGenerateAssets(true)} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-100 hover:bg-amber-200 border border-amber-300 disabled:opacity-40 rounded-lg text-xs text-amber-800 cursor-pointer transition-colors">
                <RefreshCw size={12} /> Regenerate all
              </button>
              <div className="flex-1" />
              <button onClick={() => setUiStep(4)}
                className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover rounded-lg text-xs font-medium text-white cursor-pointer transition-all shadow-lg shadow-accent/20">
                Assemble Video <ArrowRight size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Intro assets */}
      <SpecialAssetBlock
        label="Intro"
        kind="intro"
        audioPath={script.intro_audio_path}
        imagePath={script.intro_image_path}
        imagePaths={script.intro_image_paths}
        videoPaths={script.intro_video_paths}
        imagePrompt={script.intro_image_prompt}
        busy={busy}
      />

      {/* Section assets */}
      {script.sections.map((section) => (
        <SectionAssetBlock key={section.number} section={section} busy={busy} />
      ))}

      {/* Outro assets */}
      <SpecialAssetBlock
        label="Outro"
        kind="outro"
        audioPath={script.outro_audio_path}
        imagePath={script.outro_image_path}
        imagePaths={[]}
        videoPaths={[]}
        imagePrompt={script.outro_image_prompt}
        busy={busy}
      />
    </div>
  );
}

function AssetRow({ label, current, total }: { label: string; current: number; total: number }) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  const done = current === total;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className={done ? 'text-ink-2' : 'text-ink-3'}>{label}</span>
        <span className={done ? 'text-emerald-600 font-medium' : 'text-ink-4'}>{current}/{total}</span>
      </div>
      <div className="h-1 bg-edge rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-emerald-500' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SpecialAssetBlock({ label, kind, audioPath, imagePath, imagePaths, videoPaths, imagePrompt, busy }: {
  label: string; kind: 'intro' | 'outro';
  audioPath: string | null; imagePath: string | null; imagePaths: string[]; videoPaths: string[];
  imagePrompt: string; busy: boolean;
}) {
  const { config, runId, addLog, setScript, setTaskId } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allImages: string[] = [];
  if (imagePath) allImages.push(imagePath);
  if (imagePaths) {
    for (const p of imagePaths) {
      if (!allImages.includes(p)) allImages.push(p);
    }
  }

  const handleRegenerate = async () => {
    if (!runId) return;
    addLog(`regenerating ${kind} image...`);
    try {
      const res = await api.regenerateSpecialImage(config, runId, kind, imagePrompt);
      setTaskId(res.task_id);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!runId || !e.target.files?.length) return;
    addLog(`uploading ${kind} image...`);
    try {
      const res = await api.uploadSpecialImage(runId, kind, e.target.files[0]);
      setScript(res.script as unknown as ScriptData);
      addLog('upload done');
    } catch (err) { addLog(`error: ${err}`); }
    e.target.value = '';
  };

  const handleDelete = async (path: string) => {
    if (!runId) return;
    try {
      const res = await api.deleteImage(runId, path);
      setScript(res.script as unknown as ScriptData);
    } catch (e) { addLog(`error: ${e}`); }
  };

  return (
    <div className="bg-card border border-edge/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">{label}</span>
          <span className="flex items-center gap-1 text-[10px] text-ink-4">
            {audioPath ? <Volume2 size={10} className="text-emerald-500" /> : <Volume2 size={10} />}
            {audioPath ? 'audio ✓' : 'no audio'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleRegenerate} disabled={busy}
            className="flex items-center gap-1 px-2 py-1 bg-mist hover:bg-edge disabled:opacity-40 rounded text-[10px] text-ink-2 cursor-pointer transition-colors">
            <ImagePlus size={10} /> {imagePath ? 'regen' : 'generate'}
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2 py-1 bg-mist hover:bg-edge rounded text-[10px] text-ink-2 cursor-pointer transition-colors">
            <Upload size={10} /> upload
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        </div>
      </div>

      {(allImages.length > 0 || (videoPaths && videoPaths.length > 0)) && (
        <div className="flex flex-wrap gap-2">
          {allImages.map((p, i) => (
            <div key={p} className="relative group">
              <img src={api.fileUrl(p)} alt={`${kind} ${i}`} onClick={() => openLightbox(api.fileUrl(p), 'image')} className="h-24 w-auto rounded-lg border border-edge object-cover cursor-zoom-in" />
              <button onClick={() => handleDelete(p)}
                className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center bg-red-900/80 hover:bg-red-700 rounded text-red-300 text-[8px] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <Trash2 size={8} />
              </button>
              {i === 0 && <div className="absolute bottom-0.5 left-0.5 bg-emerald-600/80 text-[7px] text-white px-1 rounded">primary</div>}
            </div>
          ))}
          {videoPaths && videoPaths.map((p) => (
            <video key={p} src={api.fileUrl(p)} controls onClick={(e) => { e.preventDefault(); openLightbox(api.fileUrl(p), 'video'); }} className="h-24 rounded-lg border border-edge cursor-zoom-in" />
          ))}
        </div>
      )}

      {audioPath && (
        <audio src={api.fileUrl(audioPath)} controls className="w-full h-8 opacity-70" />
      )}
    </div>
  );
}

function SectionAssetBlock({ section, busy }: { section: ReturnType<typeof useStore.getState>['script'] extends infer S ? S extends { sections: (infer T)[] } ? T : never : never; busy: boolean }) {
  const { config, runId, addLog, setScript, setTaskId } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);

  const isVideo = config.section_media_type === 'video';
  const hasAudio = !!section.audio_path;
  const hasImage = !!section.image_path;
  const hasVideo = !!section.video_path;
  const mediaOk = isVideo ? hasVideo : hasImage;

  const handleRetry = async () => {
    if (!runId) return;
    addLog(`regenerating section ${section.number} images...`);
    try {
      const res = await api.retrySection(config, runId, section.number);
      setTaskId(res.task_id);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!runId || !e.target.files?.length) return;
    addLog(`uploading image for section ${section.number}...`);
    try {
      const res = await api.uploadImage(runId, section.number, e.target.files[0]);
      setScript(res.script as unknown as ScriptData);
      addLog('upload done');
    } catch (err) { addLog(`error: ${err}`); }
    e.target.value = '';
  };

  const handleDeleteImage = async (imgPath: string) => {
    if (!runId) return;
    try {
      const res = await api.deleteImage(runId, imgPath);
      setScript(res.script as unknown as ScriptData);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const handleRemoveFromSection = async (imgPath: string) => {
    if (!runId) return;
    const updated = section.image_paths.filter((p: string) => p !== imgPath);
    try {
      const res = await api.updateSectionImages(runId, section.number, updated);
      setScript(res.script as unknown as ScriptData);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const handleGenerateExtra = async () => {
    if (!runId) return;
    const prompt = section.image_prompts[0] || section.image_prompt || section.heading;
    addLog(`generating extra image for section ${section.number}...`);
    try {
      const res = await api.generateExtraImages(config, runId, section.number, 1, prompt);
      setTaskId(res.task_id);
    } catch (e) { addLog(`error: ${e}`); }
  };

  return (
    <div className="bg-card border border-edge/50 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 flex items-center justify-center bg-accent/20 rounded-lg text-xs font-bold text-accent">
            {section.number}
          </span>
          <span className="text-sm font-medium text-ink-2">{section.heading}</span>
          <div className="flex items-center gap-2 text-[10px] text-ink-4">
            <span className="flex items-center gap-0.5">
              {hasAudio ? <CheckCircle size={10} className="text-emerald-500" /> : <AlertCircle size={10} />} audio
            </span>
            <span className="flex items-center gap-0.5">
              {mediaOk ? <CheckCircle size={10} className="text-emerald-500" /> : <AlertCircle size={10} />} {isVideo ? 'video' : 'image'}
            </span>
            {section.duration && <span>{section.duration.toFixed(1)}s</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleRetry} disabled={busy}
            className="flex items-center gap-1 px-2 py-1 bg-mist hover:bg-edge disabled:opacity-40 rounded text-[10px] text-ink-2 cursor-pointer transition-colors">
            <RefreshCw size={10} /> regen
          </button>
          <button onClick={handleGenerateExtra} disabled={busy}
            className="flex items-center gap-1 px-2 py-1 bg-mist hover:bg-edge disabled:opacity-40 rounded text-[10px] text-ink-2 cursor-pointer transition-colors">
            <ImagePlus size={10} /> +1
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2 py-1 bg-mist hover:bg-edge rounded text-[10px] text-ink-2 cursor-pointer transition-colors">
            <Upload size={10} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          <button onClick={() => setExpanded(!expanded)} className="text-ink-4 hover:text-ink-2 text-xs cursor-pointer px-1">
            {expanded ? '▼' : '▶'}
          </button>
        </div>
      </div>

      {/* Media gallery */}
      {(section.image_paths.length > 0 || (section.video_paths && section.video_paths.length > 0)) && (
        <div className="flex flex-wrap gap-2">
          {section.video_paths && section.video_paths.map((p: string, i: number) => (
            <div key={p} className="relative group">
              <video src={api.fileUrl(p)} controls onClick={(e) => { e.preventDefault(); openLightbox(api.fileUrl(p), 'video'); }} className="h-24 rounded-lg border border-edge cursor-zoom-in" />
              {i === 0 && <div className="absolute top-0.5 left-0.5 bg-accent/80 text-[7px] text-white px-1 rounded">primary</div>}
            </div>
          ))}
          {section.image_paths.map((p: string, i: number) => (
            <div key={p} className="relative group">
              <img src={api.fileUrl(p)} alt={`s${section.number} img ${i}`} onClick={() => openLightbox(api.fileUrl(p), 'image')} className="h-24 w-auto rounded-lg border border-edge object-cover cursor-zoom-in" />
              <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleRemoveFromSection(p)} title="remove from section"
                  className="w-4 h-4 flex items-center justify-center bg-card/80 hover:bg-edge rounded text-ink-3 text-[8px] cursor-pointer">✕</button>
                <button onClick={() => handleDeleteImage(p)} title="delete file"
                  className="w-4 h-4 flex items-center justify-center bg-red-900/80 hover:bg-red-700 rounded text-red-300 text-[8px] cursor-pointer">
                  <Trash2 size={8} />
                </button>
              </div>
              {i === 0 && <div className="absolute bottom-0.5 left-0.5 bg-emerald-600/80 text-[7px] text-white px-1 rounded">primary</div>}
            </div>
          ))}
        </div>
      )}

      {/* Audio player */}
      {hasAudio && (
        <audio src={api.fileUrl(section.audio_path!)} controls className="w-full h-8 opacity-70" />
      )}

      {/* Expanded: prompts */}
      {expanded && (
        <div className="space-y-1 border-t border-edge/50 pt-2">
          <div className="text-[10px] uppercase tracking-wider text-ink-4">Image prompts</div>
          {section.image_prompts.map((prompt: string, i: number) => (
            <p key={i} className="text-xs text-ink-3 bg-cream rounded px-3 py-1.5">{prompt}</p>
          ))}
        </div>
      )}
    </div>
  );
}
