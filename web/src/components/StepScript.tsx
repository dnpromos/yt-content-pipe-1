import { useState, useRef } from 'react';
import { useStore, type Section, type ScriptData } from '../lib/store';
import { api } from '../lib/api';
import { Save, RefreshCw, ImagePlus, Upload, AlertTriangle, FileText, ArrowRight } from 'lucide-react';

export function StepScript() {
  const { script, setScript, runId, stage, setStage, setTaskId, addLog, setUiStep } = useStore();
  const [dirty, setDirty] = useState(false);
  const busy = stage === 'scripting' || stage === 'generating_voiceovers' || stage === 'generating_media' || stage === 'generating_assets' || stage === 'assembling';

  if (!script) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-ink-4 text-sm">
        {stage === 'scripting' ? (
          <>
            <div className="flex items-center gap-3">
              <span className="inline-block w-2 h-2 bg-accent rounded-full animate-pulse" />
              Generating script...
            </div>
            <button
              onClick={() => { setStage('idle'); setUiStep(0); setTaskId(null); }}
              className="px-4 py-2 bg-mist hover:bg-edge rounded-lg text-xs text-ink-3 cursor-pointer transition-colors"
            >
              Cancel &amp; go back
            </button>
          </>
        ) : (
          <>
            <span>No script generated yet.</span>
            <button
              onClick={() => setUiStep(0)}
              className="px-4 py-2 bg-mist hover:bg-edge rounded-lg text-xs text-ink-2 cursor-pointer transition-colors"
            >
              Go to Topic
            </button>
          </>
        )}
      </div>
    );
  }

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

  const handleNextStep = async () => {
    if (!runId) return;
    if (dirty) await handleSave();
    setUiStep(2);
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-8 space-y-4">
      {/* Title bar */}
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
            <button onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover rounded-lg text-xs text-white cursor-pointer transition-colors">
              <Save size={12} /> Save
            </button>
          )}
        </div>
      </div>

      {/* Intro */}
      <SpecialBlock
        label="Intro" kind="intro"
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
          busy={busy}
        />
      ))}

      {/* Outro */}
      <SpecialBlock
        label="Outro" kind="outro"
        narration={script.outro_narration}
        imagePrompt={script.outro_image_prompt}
        imagePath={script.outro_image_path}
        onNarrationChange={(v: string) => update({ outro_narration: v })}
        onPromptChange={(v: string) => update({ outro_image_prompt: v })}
        busy={busy}
      />

      {/* Next step button */}
      {(stage === 'scripted' || stage === 'voiceovers_done' || stage === 'media_done' || stage === 'assets_done' || stage === 'video_done') && (
        <div className="pt-4 flex justify-end">
          <button
            onClick={handleNextStep}
            disabled={busy}
            className="flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover disabled:opacity-40 rounded-xl text-sm font-medium text-white cursor-pointer transition-all shadow-lg shadow-accent/20"
          >
            Next: Voiceover <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}


function SpecialBlock({ label, kind, narration, imagePrompt, imagePath, imagePaths, videoPaths, onNarrationChange, onPromptChange, busy }: {
  label: string; kind: 'intro' | 'outro';
  narration: string; imagePrompt: string;
  imagePath: string | null; imagePaths?: string[]; videoPaths?: string[];
  onNarrationChange: (v: string) => void; onPromptChange: (v: string) => void;
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
    if (!runId) return;
    try {
      const res = await api.deleteImage(runId, path);
      setScript(res.script as unknown as ScriptData);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const handleGenerateToc = async () => {
    if (!runId) return;
    addLog('generating chalkboard TOC image...');
    try {
      const res = await api.generateTocImage(config, runId);
      setTaskId(res.task_id);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const allImages: string[] = [];
  if (imagePath) allImages.push(imagePath);
  if (imagePaths) {
    for (const p of imagePaths) {
      if (!allImages.includes(p)) allImages.push(p);
    }
  }

  return (
    <div className="bg-card border border-edge rounded-xl p-5 space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-accent font-semibold">{label}</div>
      <textarea
        value={narration} onChange={(e) => onNarrationChange(e.target.value)}
        rows={3}
        className="w-full bg-cream border border-edge rounded-lg px-4 py-3 text-sm text-ink-2 focus:outline-none focus:border-edge-strong resize-y"
      />
      <div className="text-[10px] uppercase tracking-wider text-ink-4">Image prompt</div>
      <textarea
        value={imagePrompt} onChange={(e) => onPromptChange(e.target.value)}
        rows={2}
        className="w-full bg-cream border border-edge rounded-lg px-4 py-2 text-xs text-ink-3 focus:outline-none focus:border-edge-strong resize-y"
      />
      {allImages.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {allImages.map((p, i) => (
            <div key={p} className="relative group">
              <img src={api.fileUrl(p)} alt={`${kind} ${i + 1}`} className="w-32 h-auto rounded-lg border border-edge" />
              <button onClick={() => handleDeleteImage(p)} title="delete"
                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-red-900/80 hover:bg-red-700 rounded text-red-300 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                ✕
              </button>
              {i === 0 && <div className="absolute bottom-1 left-1 bg-emerald-600/80 text-[8px] text-white px-1.5 py-0.5 rounded">primary</div>}
            </div>
          ))}
        </div>
      )}
      {videoPaths && videoPaths.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-accent/60 mb-1">Video clips ({videoPaths.length})</div>
          <div className="flex flex-wrap gap-2">
            {videoPaths.map((p, i) => (
              <video key={i} src={api.fileUrl(p)} controls className="w-40 rounded-lg border border-edge" />
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 mt-1">
        <button onClick={handleRegenerate} disabled={busy}
          className="flex items-center gap-1 px-3 py-1.5 bg-mist hover:bg-edge disabled:opacity-40 rounded-lg text-[11px] text-ink-2 cursor-pointer transition-colors">
          <ImagePlus size={11} /> {imagePath ? 'regenerate' : 'generate'}
        </button>
        <button onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 px-3 py-1.5 bg-mist hover:bg-edge rounded-lg text-[11px] text-ink-2 cursor-pointer transition-colors">
          <Upload size={11} /> upload
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        {kind === 'intro' && (
          <button onClick={handleGenerateToc} disabled={busy}
            className="flex items-center gap-1 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 disabled:opacity-40 rounded-lg text-[11px] text-amber-800 cursor-pointer transition-colors">
            <FileText size={11} /> TOC
          </button>
        )}
      </div>
    </div>
  );
}


function SectionCard({ section, onChange, busy }: {
  section: Section; onChange: (patch: Partial<Section>) => void; busy: boolean;
}) {
  const { config, runId, addLog, setScript, setTaskId } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [extraCount, setExtraCount] = useState(1);
  const [extraPrompt, setExtraPrompt] = useState('');
  const [expanded, setExpanded] = useState(false);
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

  const handleRetry = async () => {
    if (!runId) return;
    addLog(`regenerating section ${section.number} images...`);
    try {
      const res = await api.retrySection(config, runId, section.number);
      setTaskId(res.task_id);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const handleGenerateMissing = async () => {
    if (!runId || missingCount <= 0) return;
    const prompt = section.image_prompts[0] || section.image_prompt || section.heading;
    addLog(`generating ${missingCount} missing image(s) for section ${section.number}...`);
    try {
      const res = await api.generateExtraImages(config, runId, section.number, missingCount, prompt);
      setTaskId(res.task_id);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const handleGenerateExtra = async () => {
    if (!runId) return;
    const prompt = extraPrompt.trim() || section.image_prompts[0] || section.image_prompt || '';
    addLog(`generating ${extraCount} image(s) for section ${section.number}...`);
    try {
      const res = await api.generateExtraImages(config, runId, section.number, extraCount, prompt);
      setTaskId(res.task_id);
    } catch (e) { addLog(`error: ${e}`); }
  };

  const handleDelete = async (imgPath: string) => {
    if (!runId) return;
    try {
      const res = await api.deleteImage(runId, imgPath);
      setScript(res.script as unknown as ScriptData);
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

  const handleRemoveFromSection = async (imgPath: string) => {
    if (!runId) return;
    const updated = section.image_paths.filter((p) => p !== imgPath);
    try {
      const res = await api.updateSectionImages(runId, section.number, updated);
      setScript(res.script as unknown as ScriptData);
    } catch (e) { addLog(`error: ${e}`); }
  };

  return (
    <div className="bg-card border border-edge rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 flex items-center justify-center bg-accent/20 rounded-lg text-xs font-bold text-accent">
            {section.number}
          </span>
          <input
            value={section.heading}
            onChange={(e) => onChange({ heading: e.target.value })}
            className="bg-transparent text-sm font-semibold text-ink border-b border-transparent hover:border-edge-strong focus:border-accent focus:outline-none px-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${hasAudio ? 'bg-emerald-500' : 'bg-edge-strong'}`} title={hasAudio ? 'audio ok' : 'no audio'} />
          <span className={`w-2 h-2 rounded-full ${hasImage ? 'bg-emerald-500' : 'bg-edge-strong'}`} title={hasImage ? 'image ok' : 'no image'} />
          {missingCount > 0 && (
            <button onClick={handleGenerateMissing} disabled={busy}
              className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 disabled:opacity-40 rounded text-[10px] text-amber-800 cursor-pointer">
              <AlertTriangle size={10} /> +{missingCount}
            </button>
          )}
          <button onClick={handleRetry} disabled={busy} title="regenerate all images"
            className="text-ink-4 hover:text-ink-2 disabled:opacity-40 cursor-pointer">
            <RefreshCw size={12} />
          </button>
          <button onClick={() => setExpanded(!expanded)}
            className="text-xs text-ink-4 hover:text-ink-2 cursor-pointer">
            {expanded ? '▼' : '▶'}
          </button>
        </div>
      </div>

      <textarea
        value={section.narration}
        onChange={(e) => onChange({ narration: e.target.value })}
        rows={3}
        className="w-full bg-cream border border-edge rounded-lg px-4 py-3 text-sm text-ink-3 focus:outline-none focus:border-edge-strong resize-y"
      />

      {/* Image/Video gallery (always visible) */}
      {section.video_paths && section.video_paths.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-accent/60 mb-1">Video clips ({section.video_paths.length})</div>
          <div className="flex flex-wrap gap-2">
            {section.video_paths.map((p, i) => (
              <div key={p} className="relative group">
                <video src={api.fileUrl(p)} controls className="w-40 rounded-lg border border-edge" />
                {i === 0 && <div className="absolute top-1 left-1 bg-accent/80 text-[8px] text-white px-1 rounded">primary</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {section.image_paths.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {section.image_paths.map((p, i) => (
            <div key={p} className="relative group">
              <img src={api.fileUrl(p)} alt={`section ${section.number} img ${i + 1}`} className="w-28 h-auto rounded-lg border border-edge" />
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleRemoveFromSection(p)} title="remove" className="w-5 h-5 flex items-center justify-center bg-card/80 hover:bg-edge rounded text-ink-3 text-[10px] cursor-pointer">✕</button>
                <button onClick={() => handleDelete(p)} title="delete" className="w-5 h-5 flex items-center justify-center bg-red-900/80 hover:bg-red-700 rounded text-red-300 text-[10px] cursor-pointer">🗑</button>
              </div>
              {i === 0 && <div className="absolute bottom-1 left-1 bg-emerald-600/80 text-[8px] text-white px-1 rounded">primary</div>}
            </div>
          ))}
        </div>
      )}

      {/* Expanded section: prompts + extra generation */}
      {expanded && (
        <>
          <div className="space-y-1 border-t border-edge pt-3">
            <div className="text-[10px] uppercase tracking-wider text-ink-4">Image prompts</div>
            {section.image_prompts.map((prompt, i) => (
              <textarea key={i} value={prompt} onChange={(e) => updatePrompt(i, e.target.value)} rows={2}
                className="w-full bg-cream border border-edge rounded-lg px-3 py-1.5 text-xs text-ink-3 focus:outline-none focus:border-edge-strong resize-y" />
            ))}
          </div>
          <div className="border-t border-edge pt-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-ink-4">Generate additional images</div>
            <textarea value={extraPrompt} onChange={(e) => setExtraPrompt(e.target.value)} rows={2}
              placeholder="custom prompt (leave empty to use section prompt)"
              className="w-full bg-cream border border-edge rounded-lg px-3 py-1.5 text-xs text-ink-3 placeholder:text-ink-5 focus:outline-none focus:border-edge-strong resize-y" />
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={10} value={extraCount}
                onChange={(e) => setExtraCount(Math.max(1, Number(e.target.value)))}
                className="w-12 bg-cream border border-edge rounded px-1.5 py-0.5 text-xs text-ink-3 focus:outline-none focus:border-edge-strong" />
              <button onClick={handleGenerateExtra} disabled={busy}
                className="flex items-center gap-1 px-2 py-1 bg-mist hover:bg-edge disabled:opacity-40 rounded-lg text-[10px] text-ink-2 cursor-pointer"><ImagePlus size={10} /> generate</button>
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 bg-mist hover:bg-edge rounded-lg text-[10px] text-ink-2 cursor-pointer"><Upload size={10} /> upload</button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            </div>
          </div>
        </>
      )}

      {section.duration && (
        <div className="text-[10px] text-ink-4">{section.duration.toFixed(1)}s</div>
      )}
    </div>
  );
}
