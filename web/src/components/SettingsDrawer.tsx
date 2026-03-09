import { useState, useEffect } from 'react';
import { useStore } from '../lib/store';
import { api, type ConfigPayload } from '../lib/api';
import { X, Settings, Mic, ImageIcon, Film, Save, Download, DollarSign } from 'lucide-react';

const VOICES: Record<string, string> = {
  Rachel: '21m00Tcm4TlvDq8ikWAM', Drew: '29vD33N1CtxCmqQRPOHJ',
  Clyde: '2EiwWnXFnvU5JabPnv8n', Paul: '5Q0t7uMcjvnagumLfvZi',
  Aria: '9BWtsMINqrJLrRacOk9x', Sarah: 'EXAVITQu4vr4xnSDxMaL',
  Laura: 'FGY2WhTYpPnrIDTdsKH5', Charlie: 'IKne3meq5aSn9XLyUdCD',
  George: 'JBFqnCBsd6RMkjVDRZzb', Emily: 'LcfcDJNUP1GQjkzn1xUU',
  Callum: 'N2lVS1w4EtoT3dr4eOWO', Liam: 'TX3LPaxmHKxFdv7VOQHJ',
  Charlotte: 'XB0fDUnXU5powFXDhCwa', Daniel: 'onwK4e9ZLuTAKqWW03F9',
  River: 'SAz9YHcvj6GT2YYXdXww',
};

const IMAGE_STYLES = [
  'cinematic realistic, dramatic lighting, film grain',
  'photorealistic, ultra detailed, natural lighting',
  'hyper realistic, 8K, sharp focus, studio lighting',
  '3D render, octane render, volumetric lighting',
  'digital art, vibrant colors, concept art style',
  'anime, studio ghibli style, soft colors',
  'dark moody cinematic, noir, high contrast shadows',
  'neon cyberpunk, glowing lights, futuristic',
  'watercolor painting, soft edges, artistic',
  'oil painting, renaissance style, rich textures',
  'comic book, bold outlines, halftone dots',
  'pixel art, retro 16-bit, nostalgic',
  'minimalist flat design, clean vectors, modern',
  'isometric 3D, low poly, colorful',
  'vintage retro, 70s aesthetic, warm tones',
  'sci-fi concept art, matte painting, epic scale',
];

const TTS_MODELS = ['eleven_flash_v2_5', 'eleven_v3', 'eleven_flash_v2', 'eleven_turbo_v2_5', 'eleven_turbo_v2'];
const VIDEO_RES: Record<string, [number, number]> = {
  '720p': [1280, 720], '1080p': [1920, 1080], '1440p': [2560, 1440], '4K': [3840, 2160],
  '720p portrait': [720, 1280], '1080p portrait': [1080, 1920],
};

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">{children}</label>;
}

function Input({ value, onChange, type = 'text', placeholder = '' }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600" />
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: string[] | Record<string, string>;
}) {
  const entries = Array.isArray(options) ? options.map((o) => [o, o]) : Object.entries(options);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-neutral-600 cursor-pointer">
      {entries.map(([label, val]) => <option key={val} value={val}>{label}</option>)}
    </select>
  );
}

function SectionBlock({ icon: Icon, label, children, defaultOpen = true }: {
  icon: React.ComponentType<{ size?: number }>; label: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-neutral-800/50">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full px-5 py-3 text-xs uppercase tracking-wider text-neutral-400 hover:text-neutral-200 cursor-pointer">
        <Icon size={14} />
        <span className="flex-1 text-left">{label}</span>
        <span className="text-[10px]">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="px-5 pb-4 space-y-2">{children}</div>}
    </div>
  );
}

function CostCalculator({ config }: { config: ConfigPayload }) {
  const { script } = useStore();
  const numSections = script?.sections?.length || 5;
  const isVideo = config.section_media_type === 'video';
  const COST_VIDEO_PER_10S = 0.40;
  const COST_IMAGE = 0.067;
  const COST_AUDIO_SECTION = 0.06;
  const COST_SCRIPT = 0.01;
  const scriptCost = COST_SCRIPT;
  const audioCost = (numSections + 2) * COST_AUDIO_SECTION;
  const sectionImageCount = isVideo ? 0 : numSections * config.images_per_section;
  const imageCost = (2 + sectionImageCount) * COST_IMAGE;
  const sectionVideoCount = isVideo ? numSections * config.videos_per_section : 0;
  const introVideoCount = isVideo ? config.intro_video_count : 0;
  const totalVideoClips = sectionVideoCount + introVideoCount;
  const totalVideoSeconds = totalVideoClips * config.video_gen_duration;
  const videoCost = (totalVideoSeconds / 10) * COST_VIDEO_PER_10S;
  const total = scriptCost + audioCost + imageCost + videoCost;

  return (
    <SectionBlock icon={DollarSign} label="Cost Estimate" defaultOpen={true}>
      <div className="space-y-1 text-[11px] text-neutral-400">
        <div className="flex justify-between"><span>Script</span><span>${scriptCost.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>Audio ({numSections + 2} clips)</span><span>${audioCost.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>Images ({2 + sectionImageCount})</span><span>${imageCost.toFixed(2)}</span></div>
        {isVideo && (
          <div className="flex justify-between">
            <span>Videos ({totalVideoClips} × {config.video_gen_duration}s)</span>
            <span>${videoCost.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between pt-1 border-t border-neutral-800 text-xs font-semibold text-neutral-200">
          <span>Total</span><span>${total.toFixed(2)}</span>
        </div>
      </div>
    </SectionBlock>
  );
}

export function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { config, setConfig } = useStore();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.loadConfig().then((data) => {
      if (data && Object.keys(data).length > 0) setConfig(data);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      await api.saveConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
  };

  const handleLoad = async () => {
    try {
      const data = await api.loadConfig();
      if (data && Object.keys(data).length > 0) setConfig(data);
    } catch { /* ignore */ }
  };

  const currentVoice = Object.entries(VOICES).find(([, v]) => v === config.voice_id)?.[0] || 'Sarah';
  const currentRes = Object.entries(VIDEO_RES).find(([, v]) => v[0] === config.video_resolution[0] && v[1] === config.video_resolution[1])?.[0] || '720p';

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />
      )}

      {/* Drawer */}
      <div className={`
        fixed top-0 right-0 h-full w-80 bg-neutral-950 border-l border-neutral-800 z-50
        transform transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : 'translate-x-full'}
        flex flex-col overflow-hidden
      `}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-neutral-400" />
            <h2 className="text-sm font-semibold text-neutral-300">Settings</h2>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <SectionBlock icon={Settings} label="Credentials" defaultOpen={false}>
            <Label>API key</Label>
            <Input value={config.wiro_api_key} onChange={(v) => setConfig({ wiro_api_key: v })} type="password" placeholder="WIRO_API_KEY" />
            <Label>API secret</Label>
            <Input value={config.wiro_api_secret} onChange={(v) => setConfig({ wiro_api_secret: v })} type="password" placeholder="WIRO_API_SECRET" />
          </SectionBlock>

          <SectionBlock icon={Mic} label="Voice">
            <Label>Voice</Label>
            <Select value={currentVoice} onChange={(v) => setConfig({ voice_id: VOICES[v] })} options={Object.keys(VOICES)} />
            <Label>TTS model</Label>
            <Select value={config.tts_model} onChange={(v) => setConfig({ tts_model: v })} options={TTS_MODELS} />
          </SectionBlock>

          <SectionBlock icon={ImageIcon} label="Image">
            <Label>Style</Label>
            <Select value={config.image_style} onChange={(v) => setConfig({ image_style: v })} options={IMAGE_STYLES} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Resolution</Label>
                <Select value={config.image_resolution} onChange={(v) => setConfig({ image_resolution: v })} options={['1K', '2K', '4K']} />
              </div>
              <div>
                <Label>Aspect</Label>
                <Select value={config.image_aspect} onChange={(v) => setConfig({ image_aspect: v })} options={['16:9', '1:1', '3:2', '4:3', '9:16', '21:9']} />
              </div>
            </div>
            <Label>Images per section</Label>
            <Select value={String(config.images_per_section)} onChange={(v) => setConfig({ images_per_section: Number(v) })} options={['1', '2', '3', '4', '5']} />
          </SectionBlock>

          <SectionBlock icon={Film} label="Video">
            <Label>Section media</Label>
            <Select value={config.section_media_type} onChange={(v) => setConfig({ section_media_type: v })} options={{ 'Images': 'image', 'AI Video': 'video' }} />
            {config.section_media_type === 'video' && (
              <div className="grid grid-cols-2 gap-2 p-2 bg-neutral-900/50 border border-neutral-800 rounded-lg">
                <div>
                  <Label>Clips/section</Label>
                  <Select value={String(config.videos_per_section)} onChange={(v) => setConfig({ videos_per_section: Number(v) })} options={['1', '2', '3', '4', '5']} />
                </div>
                <div>
                  <Label>Clip duration</Label>
                  <Select value={String(config.video_gen_duration)} onChange={(v) => setConfig({ video_gen_duration: Number(v) })} options={['1','2','3','4','5','6','7','8','9','10']} />
                </div>
                <div>
                  <Label>Gen resolution</Label>
                  <Select value={config.video_gen_resolution} onChange={(v) => setConfig({ video_gen_resolution: v })} options={['720p', '1080p']} />
                </div>
                <div>
                  <Label>Gen FPS</Label>
                  <Select value={config.video_gen_fps} onChange={(v) => setConfig({ video_gen_fps: v })} options={['24', '48']} />
                </div>
                <div>
                  <Label>Intro clips</Label>
                  <Select value={String(config.intro_video_count)} onChange={(v) => setConfig({ intro_video_count: Number(v) })} options={['0', '1', '2', '3', '4', '5']} />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-1.5 text-xs text-neutral-400 cursor-pointer">
                    <input type="checkbox" checked={config.video_gen_draft === 'true'} onChange={(e) => setConfig({ video_gen_draft: e.target.checked ? 'true' : 'false' })} className="accent-neutral-500" />
                    Draft mode (fast preview)
                  </label>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Output resolution</Label>
                <Select value={currentRes} onChange={(v) => setConfig({ video_resolution: VIDEO_RES[v] })} options={Object.keys(VIDEO_RES)} />
              </div>
              <div>
                <Label>FPS</Label>
                <Select value={String(config.video_fps)} onChange={(v) => setConfig({ video_fps: Number(v) })} options={['24', '30', '60']} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Transition</Label>
                <Select value={config.video_transition} onChange={(v) => setConfig({ video_transition: v })} options={['crossfade', 'slide', 'cut']} />
              </div>
              <div>
                <Label>Preset</Label>
                <Select value={config.video_preset} onChange={(v) => setConfig({ video_preset: v })} options={['ultrafast', 'fast', 'medium', 'slow']} />
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-neutral-400 cursor-pointer">
              <input type="checkbox" checked={config.video_ken_burns} onChange={(e) => setConfig({ video_ken_burns: e.target.checked })} className="accent-neutral-500" />
              Ken Burns effect
            </label>
          </SectionBlock>

          <CostCalculator config={config} />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-800 flex gap-2">
          <button onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs text-neutral-300 cursor-pointer transition-colors">
            <Save size={12} /> {saved ? 'Saved!' : 'Save'}
          </button>
          <button onClick={handleLoad}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs text-neutral-300 cursor-pointer transition-colors">
            <Download size={12} /> Load
          </button>
        </div>
      </div>
    </>
  );
}
