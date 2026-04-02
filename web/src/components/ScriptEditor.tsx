import { useState, useRef } from 'react';
import { useStore, type Section, type ScriptData } from '../lib/store';
import { api } from '../lib/api';
import { FileText, Download, RefreshCw, Film, Save, ImagePlus, Upload, AlertTriangle } from 'lucide-react';
import { openLightbox } from './Lightbox';

export function ScriptEditor() {
  const { script, setScript, config, runId, stage, setStage, setTaskId, addLog, clearLogs } = useStore();
  const [dirty, setDirty] = useState(false);
  const busy = stage === 'generating_assets' || stage === 'assembling';

  if (!script) return null;

  const update = (patch: Partial<typeof script>) => {
    setScript({ ...script, ...patch });
    setDirty(true);
  };

  const updateSection = (idx: number, patch: Partial<Section>) => {
    const sections = [...script.sections];
    sections[idx] = { ...sections[idx], ...patch };
    setScript({ ...script, sections });
    setDirty(true);
  };

  const handleSave = async () => {
    if (!runId) return;
    try {
      await api.saveScript(runId, script as unknown as Record<string, unknown>);
      addLog('script saved');
      setDirty(false);
    } catch (e) {
      addLog(`error saving: ${e}`);
    }
  };

  const handleGenerateAssets = async (forceImages = false) => {
    if (!runId) return;
    if (dirty) await handleSave();
    clearLogs();
    addLog(forceImages ? 'regenerating all images...' : 'starting asset generation...');
    setStage('generating_assets');
    try {
      const res = await api.generateAssets(config, runId, forceImages);
      setTaskId(res.task_id);
    } catch (e) {
      addLog(`error: ${e}`);
      setStage('scripted');
    }
  };

  const handleAssembleVideo = async () => {
    if (!runId) return;
    if (dirty) await handleSave();
    clearLogs();
    addLog('assembling video...');
    setStage('assembling');
    try {
      const res = await api.assembleVideo(config, runId);
      setTaskId(res.task_id);
    } catch (e) {
      addLog(`error: ${e}`);
      setStage('assets_done');
    }
  };

  const handleRetrySection = async (sectionNumber: number) => {
    if (!runId) return;
    if (dirty) await handleSave();
    addLog(`regenerating section ${sectionNumber} images...`);
    try {
      const res = await api.retrySection(config, runId, sectionNumber);
      setTaskId(res.task_id);
    } catch (e) {
      addLog(`error: ${e}`);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
      {/* Title + actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-ink-3" />
          <input
            value={script.title}
            onChange={(e) => update({ title: e.target.value })}
            className="bg-transparent text-lg font-semibold text-ink border-b border-transparent hover:border-edge-strong focus:border-accent focus:outline-none px-1"
          />
          <span className="text-xs text-ink-4">{script.sections.length} sections</span>
        </div>
        <div className="flex gap-2">
          {dirty && (
            <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover rounded text-xs text-white cursor-pointer transition-colors">
              <Save size={12} /> save
            </button>
          )}
          {(stage === 'scripted' || stage === 'assets_done' || stage === 'video_done') && (
            <button onClick={() => handleGenerateAssets(false)} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded text-xs text-white cursor-pointer transition-colors">
              <Download size={12} /> generate assets
            </button>
          )}
          {(stage === 'assets_done' || stage === 'video_done') && (
            <button onClick={() => handleGenerateAssets(true)} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 rounded text-xs text-white cursor-pointer transition-colors">
              <RefreshCw size={12} /> regenerate all images
            </button>
          )}
          {(stage === 'assets_done' || stage === 'video_done') && (
            <button onClick={handleAssembleVideo} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-40 rounded text-xs text-white cursor-pointer transition-colors">
              <Film size={12} /> {stage === 'video_done' ? 'reassemble' : 'assemble video'}
            </button>
          )}
        </div>
      </div>

      {/* Intro */}
      <SpecialBlock
        label="intro"
        kind="intro"
        narration={script.intro_narration}
        imagePrompt={script.intro_image_prompt}
        imagePath={script.intro_image_path}
        imagePaths={script.intro_image_paths}
        videoPaths={script.intro_video_paths}
        onNarrationChange={(v: string) => update({ intro_narration: v })}
        onPromptChange={(v: string) => update({ intro_image_prompt: v })}
        busy={busy}
      />

      {/* Sections */}
      {script.sections.map((section, idx) => (
        <SectionCard
          key={section.number}
          section={section}
          onChange={(patch) => updateSection(idx, patch)}
          onRetry={() => handleRetrySection(section.number)}
          busy={busy}
        />
      ))}

      {/* Outro */}
      <SpecialBlock
        label="outro"
        kind="outro"
        narration={script.outro_narration}
        imagePrompt={script.outro_image_prompt}
        imagePath={script.outro_image_path}
        onNarrationChange={(v: string) => update({ outro_narration: v })}
        onPromptChange={(v: string) => update({ outro_image_prompt: v })}
        busy={busy}
      />
    </div>
  );
}

function SpecialBlock({ label, kind, narration, imagePrompt, imagePath, imagePaths, videoPaths, onNarrationChange, onPromptChange, busy }: {
  label: string;
  kind: 'intro' | 'outro';
  narration: string;
  imagePrompt: string;
  imagePath: string | null;
  imagePaths?: string[];
  videoPaths?: string[];
  onNarrationChange: (v: string) => void;
  onPromptChange: (v: string) => void;
  busy: boolean;
}) {
  const { config, runId, addLog, setScript, setTaskId } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRegenerate = async () => {
    if (!runId) return;
    addLog(`regenerating ${kind} image...`);
    try {
      const res = await api.regenerateSpecialImage(config, runId, kind, imagePrompt);
      setTaskId(res.task_id);
    } catch (e) {
      addLog(`error: ${e}`);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!runId || !e.target.files?.length) return;
    addLog(`uploading ${kind} image...`);
    try {
      const res = await api.uploadSpecialImage(runId, kind, e.target.files[0]);
      setScript(res.script as unknown as ScriptData);
      addLog('upload done');
    } catch (err) {
      addLog(`error: ${err}`);
    }
    e.target.value = '';
  };

  const handleDeleteImage = async (path: string) => {
    if (!runId) return;
    addLog(`deleting image...`);
    try {
      const res = await api.deleteImage(runId, path);
      setScript(res.script as unknown as ScriptData);
    } catch (e) {
      addLog(`error: ${e}`);
    }
  };

  const handleGenerateToc = async () => {
    if (!runId) return;
    addLog('generating chalkboard TOC image...');
    try {
      const res = await api.generateTocImage(config, runId);
      setTaskId(res.task_id);
    } catch (e) {
      addLog(`error: ${e}`);
    }
  };

  const allImages: string[] = [];
  if (imagePath) allImages.push(imagePath);
  if (imagePaths) {
    for (const p of imagePaths) {
      if (!allImages.includes(p)) allImages.push(p);
    }
  }

  return (
    <div className="bg-card border border-edge rounded-lg p-4 space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <textarea
        value={narration}
        onChange={(e) => onNarrationChange(e.target.value)}
        rows={3}
        className="w-full bg-cream border border-edge rounded px-3 py-2 text-sm text-ink-2 focus:outline-none focus:border-edge-strong resize-y"
      />
      <div className="text-[10px] uppercase tracking-wider text-ink-4 mt-1">image prompt</div>
      <textarea
        value={imagePrompt}
        onChange={(e) => onPromptChange(e.target.value)}
        rows={2}
        className="w-full bg-cream border border-edge rounded px-3 py-2 text-xs text-ink-3 focus:outline-none focus:border-edge-strong resize-y"
      />
      {allImages.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {allImages.map((p, i) => (
            <div key={p} className="relative group">
              <img src={api.fileUrl(p)} alt={`${kind} ${i + 1}`} onClick={() => openLightbox(api.fileUrl(p), 'image')} className="w-32 h-auto rounded border border-edge cursor-zoom-in" />
              <button onClick={() => handleDeleteImage(p)} title="delete image"
                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-red-900/80 hover:bg-red-700 rounded text-red-300 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                🗑
              </button>
              {i === 0 && (
                <div className="absolute bottom-1 left-1 bg-emerald-600/80 text-[8px] text-white px-1 rounded">primary</div>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Intro video clips */}
      {videoPaths && videoPaths.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-accent mb-1">
            intro video clips ({videoPaths.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {videoPaths.map((p, i) => (
              <video key={i} src={`${api.fileUrl(p)}#t=0.5`} preload="metadata" muted playsInline onClick={(e) => { e.preventDefault(); openLightbox(api.fileUrl(p), 'video'); }} className="w-40 rounded border border-edge cursor-zoom-in" />
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 mt-1">
        <button onClick={handleRegenerate} disabled={busy}
          className="flex items-center gap-1 px-2 py-1 bg-mist hover:bg-edge disabled:opacity-40 rounded text-[10px] text-ink-2 cursor-pointer transition-colors">
          <ImagePlus size={10} /> {imagePath ? 'regenerate' : 'generate'}
        </button>
        <button onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 px-2 py-1 bg-mist hover:bg-edge rounded text-[10px] text-ink-2 cursor-pointer transition-colors">
          <Upload size={10} /> upload
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        {kind === 'intro' && (
          <button onClick={handleGenerateToc} disabled={busy}
            className="flex items-center gap-1 px-2 py-1 bg-amber-100 hover:bg-amber-200 disabled:opacity-40 rounded text-[10px] text-amber-800 cursor-pointer transition-colors">
            <FileText size={10} /> chalkboard TOC
          </button>
        )}
      </div>
    </div>
  );
}


function SectionCard({ section, onChange, onRetry, busy }: {
  section: Section;
  onChange: (patch: Partial<Section>) => void;
  onRetry: () => void;
  busy: boolean;
}) {
  const { config, runId, addLog, setScript, setTaskId } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [extraCount, setExtraCount] = useState(1);
  const [extraPrompt, setExtraPrompt] = useState('');
  const hasAudio = !!section.audio_path;
  const hasImage = !!section.image_path;

  const updatePrompt = (idx: number, val: string) => {
    const prompts = [...section.image_prompts];
    prompts[idx] = val;
    onChange({ image_prompts: prompts });
  };

  const requiredImages = config.images_per_section || 1;
  const currentImages = section.image_paths.length;
  const missingCount = Math.max(0, requiredImages - currentImages);

  const handleGenerateMissing = async () => {
    if (!runId || missingCount <= 0) return;
    const prompt = section.image_prompts[0] || section.image_prompt || section.heading;
    addLog(`generating ${missingCount} missing image(s) for section ${section.number}...`);
    try {
      const res = await api.generateExtraImages(config, runId, section.number, missingCount, prompt);
      setTaskId(res.task_id);
    } catch (e) {
      addLog(`error: ${e}`);
    }
  };

  const handleGenerateExtra = async () => {
    if (!runId) return;
    const prompt = extraPrompt.trim() || section.image_prompts[0] || section.image_prompt || '';
    addLog(`generating ${extraCount} image(s) for section ${section.number}...`);
    try {
      const res = await api.generateExtraImages(config, runId, section.number, extraCount, prompt);
      setTaskId(res.task_id);
    } catch (e) {
      addLog(`error: ${e}`);
    }
  };

  const handleDelete = async (imgPath: string) => {
    if (!runId) return;
    addLog(`deleting image...`);
    try {
      const res = await api.deleteImage(runId, imgPath);
      setScript(res.script as unknown as ScriptData);
    } catch (e) {
      addLog(`error: ${e}`);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!runId || !e.target.files?.length) return;
    const file = e.target.files[0];
    addLog(`uploading image for section ${section.number}...`);
    try {
      const res = await api.uploadImage(runId, section.number, file);
      setScript(res.script as unknown as ScriptData);
      addLog('upload done');
    } catch (err) {
      addLog(`error: ${err}`);
    }
    e.target.value = '';
  };

  const handleRemoveFromSection = async (imgPath: string) => {
    if (!runId) return;
    const updated = section.image_paths.filter((p) => p !== imgPath);
    try {
      const res = await api.updateSectionImages(runId, section.number, updated);
      setScript(res.script as unknown as ScriptData);
    } catch (e) {
      addLog(`error: ${e}`);
    }
  };

  return (
    <div className="bg-card border border-edge rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 flex items-center justify-center bg-accent/20 rounded text-xs font-bold text-accent">
            {section.number}
          </span>
          <input
            value={section.heading}
            onChange={(e) => onChange({ heading: e.target.value })}
            className="bg-transparent text-sm font-semibold text-ink border-b border-transparent hover:border-edge-strong focus:border-accent focus:outline-none px-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${hasAudio ? 'bg-emerald-500' : 'bg-edge-strong'}`} title={hasAudio ? 'audio ok' : 'audio missing'} />
          <span className={`w-2 h-2 rounded-full ${hasImage ? 'bg-emerald-500' : 'bg-edge-strong'}`} title={hasImage ? 'image ok' : 'image missing'} />
          {missingCount > 0 && (
            <button onClick={handleGenerateMissing} disabled={busy}
              title={`generate ${missingCount} missing image(s) (need ${requiredImages}, have ${currentImages})`}
              className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 disabled:opacity-40 rounded text-[10px] text-amber-800 cursor-pointer transition-colors">
              <AlertTriangle size={10} /> +{missingCount}
            </button>
          )}
          <button onClick={onRetry} disabled={busy} title="regenerate all images"
            className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink-2 disabled:opacity-40 cursor-pointer">
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      <textarea
        value={section.narration}
        onChange={(e) => onChange({ narration: e.target.value })}
        rows={3}
        className="w-full bg-cream border border-edge rounded px-3 py-2 text-sm text-ink-3 focus:outline-none focus:border-edge-strong resize-y"
      />

      {/* Image prompts */}
      <div className="space-y-1 border-t border-edge pt-2">
        <div className="text-[10px] uppercase tracking-wider text-ink-4">image prompts</div>
        {section.image_prompts.map((prompt, i) => (
          <textarea
            key={i}
            value={prompt}
            onChange={(e) => updatePrompt(i, e.target.value)}
            rows={2}
            className="w-full bg-cream border border-edge rounded px-3 py-1.5 text-xs text-ink-3 focus:outline-none focus:border-edge-strong resize-y"
          />
        ))}
      </div>

      {/* Video gallery */}
      {section.video_paths && section.video_paths.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-accent mb-1">
            AI video clips ({section.video_paths.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {section.video_paths.map((p, i) => (
              <div key={p} className="relative group">
                <video src={api.fileUrl(p)} controls onClick={(e) => { e.preventDefault(); openLightbox(api.fileUrl(p), 'video'); }} className="w-40 rounded border border-edge cursor-zoom-in" />
                {i === 0 && (
                  <div className="absolute top-1 left-1 bg-accent/80 text-[8px] text-white px-1 rounded">primary</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image gallery */}
      {section.image_paths.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {section.image_paths.map((p, i) => (
            <div key={p} className="relative group">
              <img src={api.fileUrl(p)} alt={`section ${section.number} img ${i + 1}`}
                onClick={() => openLightbox(api.fileUrl(p), 'image')} className="w-28 h-auto rounded border border-edge cursor-zoom-in" />
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleRemoveFromSection(p)} title="remove from section"
                  className="w-5 h-5 flex items-center justify-center bg-card/80 hover:bg-edge rounded text-ink-3 text-[10px] cursor-pointer">
                  ✕
                </button>
                <button onClick={() => handleDelete(p)} title="delete file"
                  className="w-5 h-5 flex items-center justify-center bg-red-900/80 hover:bg-red-700 rounded text-red-300 text-[10px] cursor-pointer">
                  🗑
                </button>
              </div>
              {i === 0 && (
                <div className="absolute bottom-1 left-1 bg-emerald-600/80 text-[8px] text-white px-1 rounded">primary</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Generate additional images */}
      <div className="border-t border-edge pt-2 space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-ink-4">generate additional images</div>
        <textarea
          value={extraPrompt}
          onChange={(e) => setExtraPrompt(e.target.value)}
          rows={2}
          placeholder="custom prompt (leave empty to use section prompt)"
          className="w-full bg-cream border border-edge rounded px-3 py-1.5 text-xs text-ink-3 placeholder:text-ink-5 focus:outline-none focus:border-edge-strong resize-y"
        />
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <input type="number" min={1} max={10} value={extraCount}
              onChange={(e) => setExtraCount(Math.max(1, Number(e.target.value)))}
              className="w-12 bg-cream border border-edge rounded px-1.5 py-0.5 text-xs text-ink-3 focus:outline-none focus:border-edge-strong"
            />
            <button onClick={handleGenerateExtra} disabled={busy}
              className="flex items-center gap-1 px-2 py-1 bg-mist hover:bg-edge disabled:opacity-40 rounded text-[10px] text-ink-2 cursor-pointer transition-colors">
              <ImagePlus size={10} /> generate
            </button>
          </div>
          <button onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2 py-1 bg-mist hover:bg-edge rounded text-[10px] text-ink-2 cursor-pointer transition-colors">
            <Upload size={10} /> upload
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        </div>
      </div>

      {section.duration && (
        <div className="text-[10px] text-ink-4">{section.duration.toFixed(1)}s</div>
      )}
    </div>
  );
}
