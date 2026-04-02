import { useState, useRef, useEffect } from 'react';
import { useStore, type ScriptData } from '../lib/store';
import { api } from '../lib/api';
import {
  RefreshCw, ArrowRight, CheckCircle, Loader, AlertCircle,
  Upload, Trash2, Volume2, Plus, Maximize2, Star, X, Film, Sparkles,
} from 'lucide-react';
import { openLightbox } from './Lightbox';
import { ContextMenu, useContextMenu, type ContextMenuItem } from './ContextMenu';

// ---------------------------------------------------------------------------
// AddAssetButton — dashed "+" at the end of a gallery row
// Shows a mini popover: Generate | Upload
// ---------------------------------------------------------------------------
function AddAssetButton({
  onGenerate,
  onUpload,
  label = 'Add',
  disabled = false,
}: {
  onGenerate?: () => void;
  onUpload?: () => void;
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        disabled={disabled}
        onClick={() => (onGenerate || onUpload) ? setOpen(!open) : undefined}
        className="h-24 w-14 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-edge hover:border-accent/60 hover:bg-accent/5 rounded-lg text-ink-4 hover:text-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        title={label}
      >
        <Plus size={14} />
        <span className="text-[9px] uppercase tracking-wider">{label}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-36 bg-card border border-edge rounded-lg shadow-xl py-1 z-50">
          {onGenerate && (
            <button
              onClick={() => { onGenerate(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-ink-2 hover:bg-mist cursor-pointer transition-colors"
            >
              <Sparkles size={11} className="text-accent" /> Generate
            </button>
          )}
          {onUpload && (
            <button
              onClick={() => { onUpload(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-ink-2 hover:bg-mist cursor-pointer transition-colors"
            >
              <Upload size={11} /> Upload
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main StepAssets page
// ---------------------------------------------------------------------------
export function StepAssets() {
  const { script, config, runId, stage, setStage, setTaskId, addLog, clearLogs, setUiStep } = useStore();
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
            <button
              onClick={() => { setStage('scripted'); setUiStep(2); setTaskId(null); }}
              className="px-4 py-2 bg-mist hover:bg-edge rounded-lg text-xs text-ink-3 cursor-pointer transition-colors"
            >
              Cancel &amp; go back
            </button>
          </>
        ) : (
          <>
            <span>No script available.</span>
            <button onClick={() => setUiStep(1)} className="px-4 py-2 bg-mist hover:bg-edge rounded-lg text-xs text-ink-2 cursor-pointer transition-colors">
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

  const doneCount = sectionsWithAudio + mediaReady + (hasIntroAudio ? 1 : 0) + (hasOutroAudio ? 1 : 0) + (hasIntroImage ? 1 : 0);
  const totalExpected = totalSections * 2 + 3; // sections*(audio+media) + intro audio + outro audio + intro image

  return (
    <div className="max-w-5xl mx-auto w-full px-8 space-y-4">
      {/* Progress header */}
      <div className="bg-card border border-edge rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-2">Asset Progress</h3>
          <div className="flex items-center gap-3">
            {stage === 'generating_assets' && (
              <div className="flex items-center gap-2 text-xs text-amber-500">
                <Loader size={12} className="animate-spin" />
                Generating... ({doneCount}/{totalExpected})
              </div>
            )}
            {allReady && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle size={12} /> All assets ready
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-5 gap-3">
          <AssetBar label="Intro audio" current={hasIntroAudio ? 1 : 0} total={1} />
          <AssetBar label="Outro audio" current={hasOutroAudio ? 1 : 0} total={1} />
          <AssetBar label="Section audio" current={sectionsWithAudio} total={totalSections} />
          <AssetBar label={isVideo ? 'Section videos' : 'Section images'} current={mediaReady} total={totalSections} />
          <AssetBar label="Intro image" current={hasIntroImage ? 1 : 0} total={1} />
        </div>
        <div className="flex gap-2 pt-1">
          {stage === 'scripted' && (
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

      {/* Intro */}
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

      {/* Sections */}
      {script.sections.map((section) => (
        <SectionAssetBlock key={section.number} section={section} busy={busy} />
      ))}

      {/* Outro */}
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

// ---------------------------------------------------------------------------
// AssetBar — progress bar pill
// ---------------------------------------------------------------------------
function AssetBar({ label, current, total }: { label: string; current: number; total: number }) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  const done = current === total;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className={done ? 'text-ink-2' : 'text-ink-3'}>{label}</span>
        <span className={done ? 'text-emerald-500 font-medium' : 'text-ink-4'}>{current}/{total}</span>
      </div>
      <div className="h-1 bg-edge rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-emerald-500' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SpecialAssetBlock — intro / outro
// ---------------------------------------------------------------------------
function SpecialAssetBlock({
  label, kind, audioPath, imagePath, imagePaths, videoPaths, imagePrompt, busy,
}: {
  label: string; kind: 'intro' | 'outro';
  audioPath: string | null; imagePath: string | null;
  imagePaths: string[]; videoPaths: string[];
  imagePrompt: string; busy: boolean;
}) {
  const { config, runId, addLog, setScript, setTaskId } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const allImages: string[] = [];
  if (imagePath) allImages.push(imagePath);
  for (const p of (imagePaths || [])) {
    if (!allImages.includes(p)) allImages.push(p);
  }

  const handleRegenImage = async () => {
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

  const handleDeleteImage = async (path: string) => {
    if (!runId || deletingPath) return;
    setDeletingPath(path);
    try {
      const res = await api.deleteImage(runId, path);
      setScript(res.script as unknown as ScriptData);
    } catch (e) { addLog(`error deleting: ${e}`); }
    finally { setDeletingPath(null); }
  };

  const handleDeleteVideo = async (path: string) => {
    if (!runId) return;
    try {
      const res = await api.deleteVideo(runId, path);
      setScript(res.script as unknown as ScriptData);
    } catch (e) { addLog(`error deleting video: ${e}`); }
  };

  const handleSetPrimaryImage = async (path: string) => {
    if (!runId) return;
    const reordered = [path, ...allImages.filter((p) => p !== path)];
    try {
      const res = await api.updateIntroImages(runId, reordered);
      setScript(res.script as unknown as ScriptData);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const imageMenuItems = (p: string, idx: number): ContextMenuItem[] => [
    { type: 'item', label: 'View full screen', icon: <Maximize2 size={11} />, onClick: () => openLightbox(api.fileUrl(p), 'image') },
    ...(idx > 0 ? [{ type: 'item' as const, label: 'Set as primary', icon: <Star size={11} />, onClick: () => handleSetPrimaryImage(p) }] : []),
    { type: 'separator' },
    { type: 'item', label: 'Delete', icon: <Trash2 size={11} />, danger: true, disabled: deletingPath === p, onClick: () => handleDeleteImage(p) },
  ];

  const videoMenuItems = (p: string): ContextMenuItem[] => [
    { type: 'item', label: 'View full screen', icon: <Maximize2 size={11} />, onClick: () => openLightbox(api.fileUrl(p), 'video') },
    { type: 'separator' },
    { type: 'item', label: 'Delete clip', icon: <Trash2 size={11} />, danger: true, onClick: () => handleDeleteVideo(p) },
  ];

  return (
    <div className="bg-card border border-edge/50 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">{label}</span>
          <span className={`flex items-center gap-1 text-[10px] ${audioPath ? 'text-emerald-500' : 'text-ink-4'}`}>
            <Volume2 size={10} />
            {audioPath ? 'audio ready' : 'no audio'}
          </span>
        </div>
      </div>

      {/* Image gallery */}
      {(allImages.length > 0 || true) && (
        <div>
          <div className="text-[9px] uppercase tracking-wider text-ink-4 mb-1.5">Images</div>
          <div className="flex flex-wrap gap-2">
            {allImages.map((p, i) => (
              <div
                key={p}
                className="relative group flex-shrink-0 cursor-pointer"
                onContextMenu={(e) => openMenu(e, imageMenuItems(p, i))}
                onClick={() => openLightbox(api.fileUrl(p), 'image')}
              >
                <img
                  src={api.fileUrl(p)}
                  alt={`${kind} ${i + 1}`}
                  className="h-24 w-auto rounded-lg border border-edge object-cover"
                />
                {i === 0 && (
                  <div className="absolute bottom-0.5 left-0.5 bg-emerald-600/80 text-[7px] text-white px-1 rounded">primary</div>
                )}
                <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/10 transition-colors" />
              </div>
            ))}
            <AddAssetButton
              disabled={busy}
              label="image"
              onGenerate={handleRegenImage}
              onUpload={() => fileInputRef.current?.click()}
            />
          </div>
        </div>
      )}

      {/* Video gallery — intro only */}
      {kind === 'intro' && (
        <div>
          <div className="text-[9px] uppercase tracking-wider text-ink-4 mb-1.5">Video clips ({(videoPaths || []).length})</div>
          <div className="flex flex-wrap gap-2">
            {(videoPaths || []).map((p, i) => (
              <div
                key={p}
                className="relative group flex-shrink-0"
                onContextMenu={(e) => openMenu(e, videoMenuItems(p))}
              >
                <video
                  src={`${api.fileUrl(p)}#t=0.5`}
                  preload="metadata"
                  muted
                  onClick={(e) => { e.preventDefault(); openLightbox(api.fileUrl(p), 'video'); }}
                  className="h-24 rounded-lg border border-edge cursor-pointer"
                />
                {i === 0 && (
                  <div className="absolute top-0.5 left-0.5 bg-accent/80 text-[7px] text-white px-1 rounded">primary</div>
                )}
                <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audio */}
      {audioPath && (
        <audio src={api.fileUrl(audioPath)} controls className="w-full h-8 opacity-70" />
      )}

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
      {menu && <ContextMenu {...menu} onClose={closeMenu} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionAssetBlock — per section
// ---------------------------------------------------------------------------
function SectionAssetBlock({
  section,
  busy,
}: {
  section: ReturnType<typeof useStore.getState>['script'] extends infer S
    ? S extends { sections: (infer T)[] } ? T : never
    : never;
  busy: boolean;
}) {
  const { config, runId, addLog, setScript, setTaskId } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const { menu, open: openMenu, close: closeMenu } = useContextMenu();

  const isVideo = config.section_media_type === 'video';
  const hasAudio = !!section.audio_path;
  const hasImage = !!section.image_path;
  const hasVideo = !!section.video_path;
  const mediaOk = isVideo ? hasVideo : hasImage;

  // ── Image handlers ──────────────────────────────────────────────────────
  const handleDeleteImage = async (imgPath: string) => {
    if (!runId || deletingPath) return;
    setDeletingPath(imgPath);
    try {
      const res = await api.deleteImage(runId, imgPath);
      setScript(res.script as unknown as ScriptData);
    } catch (e) { addLog(`error: ${e}`); }
    finally { setDeletingPath(null); }
  };

  const handleRemoveImage = async (imgPath: string) => {
    if (!runId) return;
    const updated = section.image_paths.filter((p: string) => p !== imgPath);
    try {
      const res = await api.updateSectionImages(runId, section.number, updated);
      setScript(res.script as unknown as ScriptData);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const handleSetPrimaryImage = async (imgPath: string) => {
    if (!runId) return;
    const reordered = [imgPath, ...section.image_paths.filter((p: string) => p !== imgPath)];
    try {
      const res = await api.updateSectionImages(runId, section.number, reordered);
      setScript(res.script as unknown as ScriptData);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const handleGenerateExtraImage = async () => {
    if (!runId) return;
    const prompt = section.image_prompts?.[0] || section.image_prompt || section.heading;
    addLog(`generating extra image for section ${section.number}...`);
    try {
      const res = await api.generateExtraImages(config, runId, section.number, 1, prompt);
      setTaskId(res.task_id);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!runId || !e.target.files?.length) return;
    addLog(`uploading image for section ${section.number}...`);
    try {
      const res = await api.uploadImage(runId, section.number, e.target.files[0]);
      setScript(res.script as unknown as ScriptData);
      addLog('upload done');
    } catch (err) { addLog(`error: ${err}`); }
    e.target.value = '';
  };

  // ── Video handlers ───────────────────────────────────────────────────────
  const handleDeleteVideo = async (vidPath: string) => {
    if (!runId) return;
    try {
      const res = await api.deleteVideo(runId, vidPath);
      setScript(res.script as unknown as ScriptData);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const handleSetPrimaryVideo = async (vidPath: string) => {
    if (!runId) return;
    const reordered = [vidPath, ...(section.video_paths || []).filter((p: string) => p !== vidPath)];
    try {
      const res = await api.updateSectionVideos(runId, section.number, reordered);
      setScript(res.script as unknown as ScriptData);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const handleAddExtraVideo = async () => {
    if (!runId) return;
    addLog(`generating extra video for section ${section.number}...`);
    try {
      const res = await api.addSectionVideo(config, runId, section.number);
      setTaskId(res.task_id);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const handleRegenVideo = async () => {
    if (!runId) return;
    addLog(`regenerating section ${section.number} videos...`);
    try {
      const res = await api.regenerateSectionVideo(config, runId, section.number);
      setTaskId(res.task_id);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const handleRegenImages = async () => {
    if (!runId) return;
    addLog(`regenerating section ${section.number} images...`);
    try {
      const res = await api.retrySection(config, runId, section.number);
      setTaskId(res.task_id);
    } catch (e) { addLog(`error: ${e}`); }
  };

  // ── Context menu builders ────────────────────────────────────────────────
  const imageMenuItems = (p: string, idx: number): ContextMenuItem[] => [
    { type: 'item', label: 'View full screen', icon: <Maximize2 size={11} />, onClick: () => openLightbox(api.fileUrl(p), 'image') },
    ...(idx > 0 ? [{
      type: 'item' as const,
      label: 'Set as primary',
      icon: <Star size={11} />,
      onClick: () => handleSetPrimaryImage(p),
    }] : []),
    { type: 'separator' },
    { type: 'item', label: 'Remove from section', icon: <X size={11} />, onClick: () => handleRemoveImage(p) },
    { type: 'item', label: 'Delete file', icon: <Trash2 size={11} />, danger: true, disabled: deletingPath === p, onClick: () => handleDeleteImage(p) },
  ];

  const videoMenuItems = (p: string, idx: number): ContextMenuItem[] => [
    { type: 'item', label: 'View full screen', icon: <Maximize2 size={11} />, onClick: () => openLightbox(api.fileUrl(p), 'video') },
    ...(idx > 0 ? [{
      type: 'item' as const,
      label: 'Set as primary',
      icon: <Star size={11} />,
      onClick: () => handleSetPrimaryVideo(p),
    }] : []),
    { type: 'separator' },
    { type: 'item', label: 'Delete clip', icon: <Trash2 size={11} />, danger: true, onClick: () => handleDeleteVideo(p) },
  ];

  return (
    <div className="bg-card border border-edge/50 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 flex items-center justify-center bg-accent/20 rounded-lg text-xs font-bold text-accent flex-shrink-0">
            {section.number}
          </span>
          <span className="text-sm font-medium text-ink-2 truncate max-w-xs">{section.heading}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 text-[10px] text-ink-4">
            <span className={`flex items-center gap-0.5 ${hasAudio ? 'text-emerald-500' : ''}`}>
              {hasAudio ? <CheckCircle size={10} /> : <AlertCircle size={10} />} audio
            </span>
            <span className={`flex items-center gap-0.5 ${mediaOk ? 'text-emerald-500' : ''}`}>
              {mediaOk ? <CheckCircle size={10} /> : <AlertCircle size={10} />} {isVideo ? 'video' : 'image'}
            </span>
            {section.duration && <span className="text-ink-4">{section.duration.toFixed(1)}s</span>}
          </div>
        </div>
      </div>

      {/* Image gallery (image mode) */}
      {!isVideo && (
        <div>
          <div className="text-[9px] uppercase tracking-wider text-ink-4 mb-1.5">
            Images ({section.image_paths.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {section.image_paths.map((p: string, i: number) => (
              <div
                key={p}
                className="relative group flex-shrink-0 cursor-pointer"
                onContextMenu={(e) => openMenu(e, imageMenuItems(p, i))}
                onClick={() => openLightbox(api.fileUrl(p), 'image')}
              >
                <img
                  src={api.fileUrl(p)}
                  alt={`s${section.number} img ${i + 1}`}
                  className="h-24 w-auto rounded-lg border border-edge object-cover"
                />
                {i === 0 && (
                  <div className="absolute bottom-0.5 left-0.5 bg-emerald-600/80 text-[7px] text-white px-1 rounded">primary</div>
                )}
                <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/10 transition-colors" />
              </div>
            ))}
            <AddAssetButton
              disabled={busy}
              label="image"
              onGenerate={handleGenerateExtraImage}
              onUpload={() => fileInputRef.current?.click()}
            />
          </div>
        </div>
      )}

      {/* Video gallery (video mode) */}
      {isVideo && (
        <div>
          <div className="text-[9px] uppercase tracking-wider text-ink-4 mb-1.5">
            Video clips ({(section.video_paths || []).length})
          </div>
          {(() => {
            const clipCount = (section.video_paths || []).length;
            const totalClipTime = clipCount * (config.video_gen_duration || 5);
            const voiceoverDuration = section.duration || 0;
            if (clipCount > 0 && totalClipTime > voiceoverDuration + 1) {
              return (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-md px-2 py-1 mb-2">
                  <AlertCircle size={10} className="flex-shrink-0" />
                  Estimated clip time (~{totalClipTime.toFixed(0)}s) exceeds voiceover ({voiceoverDuration.toFixed(1)}s). Later clips may be trimmed.
                </div>
              );
            }
            return null;
          })()}
          <div className="flex flex-wrap gap-2">
            {(section.video_paths || []).map((p: string, i: number) => (
              <div
                key={p}
                className="relative group flex-shrink-0"
                onContextMenu={(e) => openMenu(e, videoMenuItems(p, i))}
              >
                <video
                  src={`${api.fileUrl(p)}#t=0.5`}
                  preload="metadata"
                  muted
                  playsInline
                  onClick={(e) => { e.preventDefault(); openLightbox(api.fileUrl(p), 'video'); }}
                  className="h-24 rounded-lg border border-edge cursor-pointer"
                />
                {i === 0 && (
                  <div className="absolute top-0.5 left-0.5 bg-accent/80 text-[7px] text-white px-1 rounded">primary</div>
                )}
                <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
              </div>
            ))}
            <AddAssetButton
              disabled={busy}
              label="video"
              onGenerate={handleAddExtraVideo}
            />
          </div>
        </div>
      )}

      {/* Audio */}
      {hasAudio && (
        <audio src={api.fileUrl(section.audio_path!)} controls className="w-full h-8 opacity-70" />
      )}

      {/* Regen action row — minimal, at bottom */}
      <div className="flex items-center gap-2 pt-1 border-t border-edge/40">
        {!isVideo && (
          <button
            onClick={handleRegenImages}
            disabled={busy}
            className="flex items-center gap-1 px-2 py-1 bg-mist hover:bg-edge disabled:opacity-40 rounded text-[10px] text-ink-3 cursor-pointer transition-colors"
          >
            <RefreshCw size={9} /> Regen images
          </button>
        )}
        {isVideo && (
          <button
            onClick={handleRegenVideo}
            disabled={busy}
            className="flex items-center gap-1 px-2 py-1 bg-mist hover:bg-edge disabled:opacity-40 rounded text-[10px] text-ink-3 cursor-pointer transition-colors"
          >
            <Film size={9} /> Regen videos
          </button>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUploadImage} className="hidden" />
      {menu && <ContextMenu {...menu} onClose={closeMenu} />}
    </div>
  );
}
