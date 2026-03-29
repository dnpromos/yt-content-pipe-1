import { useStore } from '../lib/store';
import { api, type ConfigPayload } from '../lib/api';
import { Settings, Mic, Image, Film, Save, Download, DollarSign } from 'lucide-react';
import { useState, useEffect } from 'react';

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

function SectionBlock({ icon: Icon, label, children, defaultOpen = true }: {
  icon: React.ComponentType<{ size?: number }>; label: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-edge">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs uppercase tracking-wider text-ink-3 hover:text-ink cursor-pointer">
        <Icon size={14} />
        <span className="flex-1 text-left">{label}</span>
        <span className="text-[10px]">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="px-4 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] uppercase tracking-wider text-ink-3 mb-0.5">{children}</label>;
}

function Input({ value, onChange, type = 'text', placeholder = '' }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <input
      type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-card border border-edge rounded px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:border-edge-strong"
    />
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: string[] | Record<string, string>;
}) {
  const entries = Array.isArray(options) ? options.map((o) => [o, o]) : Object.entries(options);
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-card border border-edge rounded px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:border-edge-strong cursor-pointer"
    >
      {entries.map(([label, val]) => <option key={val} value={val}>{label}</option>)}
    </select>
  );
}

function CostCalculator({ config }: { config: ConfigPayload }) {
  const { script } = useStore();
  const numSections = script?.sections?.length || 5;
  const isVideo = config.section_media_type === 'video';

  // Pricing
  const COST_VIDEO_PER_10S = 0.40;
  const COST_IMAGE = 0.067;
  const COST_AUDIO_SECTION = 0.06;
  const COST_SCRIPT = 0.01;

  // Script
  const scriptCost = COST_SCRIPT;

  // Audio: intro + sections + outro
  const audioCost = (numSections + 2) * COST_AUDIO_SECTION;

  // Images: intro (1) + outro (1) + section images (only in image mode)
  const sectionImageCount = isVideo ? 0 : numSections * config.images_per_section;
  const imageCost = (2 + sectionImageCount) * COST_IMAGE;

  // Videos: section videos + intro overview videos (only in video mode)
  const sectionVideoCount = isVideo ? numSections * config.videos_per_section : 0;
  const introVideoCount = isVideo ? config.intro_video_count : 0;
  const totalVideoClips = sectionVideoCount + introVideoCount;
  const totalVideoSeconds = totalVideoClips * config.video_gen_duration;
  const videoCost = (totalVideoSeconds / 10) * COST_VIDEO_PER_10S;

  const total = scriptCost + audioCost + imageCost + videoCost;

  return (
    <SectionBlock icon={DollarSign} label="cost estimate" defaultOpen={true}>
      <div className="space-y-1 text-[11px] text-ink-3">
        <div className="flex justify-between"><span>Script</span><span>${scriptCost.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>Audio ({numSections + 2} clips)</span><span>${audioCost.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>Images ({2 + sectionImageCount})</span><span>${imageCost.toFixed(2)}</span></div>
        {isVideo && (
          <div className="flex justify-between">
            <span>Videos ({totalVideoClips} × {config.video_gen_duration}s)</span>
            <span>${videoCost.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between pt-1 border-t border-edge text-xs font-semibold text-ink">
          <span>Total</span><span>${total.toFixed(2)}</span>
        </div>
      </div>
    </SectionBlock>
  );
}

export function Sidebar() {
  const { config, setConfig } = useStore();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.loadConfig().then((data) => {
      if (data && Object.keys(data).length > 0) setConfig(data);
    }).catch((e) => console.error('Failed to load config on startup:', e));
  }, []);

  const handleSave = async () => {
    try {
      await api.saveConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  };

  const handleLoad = async () => {
    try {
      const data = await api.loadConfig();
      if (data && Object.keys(data).length > 0) setConfig(data);
    } catch (e) {
      console.error('Failed to load config:', e);
    }
  };

  const currentVoice = Object.entries(VOICES).find(([, v]) => v === config.voice_id)?.[0] || 'Sarah';
  const currentRes = Object.entries(VIDEO_RES).find(([, v]) => v[0] === config.video_resolution[0] && v[1] === config.video_resolution[1])?.[0] || '720p';

  return (
    <aside className="w-64 min-w-64 h-screen bg-cream border-r border-edge flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-edge">
        <h1 className="text-sm font-semibold text-ink-2 tracking-wide">yt-content-pipe</h1>
      </div>

      <SectionBlock icon={Settings} label="credentials" defaultOpen={false}>
        <Label>api key</Label>
        <Input value={config.wiro_api_key} onChange={(v) => setConfig({ wiro_api_key: v })} type="password" placeholder="WIRO_API_KEY" />
        <Label>api secret</Label>
        <Input value={config.wiro_api_secret} onChange={(v) => setConfig({ wiro_api_secret: v })} type="password" placeholder="WIRO_API_SECRET" />
      </SectionBlock>

      <SectionBlock icon={Mic} label="voice">
        <Label>voice</Label>
        <Select value={currentVoice} onChange={(v) => setConfig({ voice_id: VOICES[v] })} options={Object.keys(VOICES)} />
        <Label>tts model</Label>
        <Select value={config.tts_model} onChange={(v) => setConfig({ tts_model: v })} options={TTS_MODELS} />
      </SectionBlock>

      <SectionBlock icon={Image} label="image">
        <Label>style</Label>
        <Select value={config.image_style} onChange={(v) => setConfig({ image_style: v })} options={IMAGE_STYLES} />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>resolution</Label>
            <Select value={config.image_resolution} onChange={(v) => setConfig({ image_resolution: v })} options={['1K', '2K', '4K']} />
          </div>
          <div>
            <Label>aspect</Label>
            <Select value={config.image_aspect} onChange={(v) => setConfig({ image_aspect: v })} options={['16:9', '1:1', '3:2', '4:3', '9:16', '21:9']} />
          </div>
        </div>
        <Label>images per section</Label>
        <Select value={String(config.images_per_section)} onChange={(v) => setConfig({ images_per_section: Number(v) })} options={['1', '2', '3', '4', '5']} />
      </SectionBlock>

      <SectionBlock icon={Film} label="video">
        <Label>section media</Label>
        <Select value={config.section_media_type} onChange={(v) => setConfig({ section_media_type: v })} options={{ 'Images': 'image', 'AI Video': 'video' }} />
        {config.section_media_type === 'video' && (
          <div className="grid grid-cols-2 gap-2 p-2 bg-card/50 border border-edge rounded">
            <div>
              <Label>clips per section</Label>
              <Select value={String(config.videos_per_section)} onChange={(v) => setConfig({ videos_per_section: Number(v) })} options={['1', '2', '3', '4', '5']} />
            </div>
            <div>
              <Label>clip duration (s)</Label>
              <Select value={String(config.video_gen_duration)} onChange={(v) => setConfig({ video_gen_duration: Number(v) })} options={['1','2','3','4','5','6','7','8','9','10']} />
            </div>
            <div>
              <Label>gen resolution</Label>
              <Select value={config.video_gen_resolution} onChange={(v) => setConfig({ video_gen_resolution: v })} options={['720p', '1080p']} />
            </div>
            <div>
              <Label>gen fps</Label>
              <Select value={config.video_gen_fps} onChange={(v) => setConfig({ video_gen_fps: v })} options={['24', '48']} />
            </div>
            <div>
              <Label>intro clips</Label>
              <Select value={String(config.intro_video_count)} onChange={(v) => setConfig({ intro_video_count: Number(v) })} options={['0', '1', '2', '3', '4', '5']} />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-1.5 text-xs text-ink-3 cursor-pointer">
                <input type="checkbox" checked={config.video_gen_draft === 'true'} onChange={(e) => setConfig({ video_gen_draft: e.target.checked ? 'true' : 'false' })} className="accent-accent" />
                draft mode (fast preview)
              </label>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>output resolution</Label>
            <Select value={currentRes} onChange={(v) => setConfig({ video_resolution: VIDEO_RES[v] })} options={Object.keys(VIDEO_RES)} />
          </div>
          <div>
            <Label>fps</Label>
            <Select value={String(config.video_fps)} onChange={(v) => setConfig({ video_fps: Number(v) })} options={['24', '30', '60']} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>transition</Label>
            <Select value={config.video_transition} onChange={(v) => setConfig({ video_transition: v })} options={['crossfade', 'slide', 'cut']} />
          </div>
          <div>
            <Label>preset</Label>
            <Select value={config.video_preset} onChange={(v) => setConfig({ video_preset: v })} options={['ultrafast', 'fast', 'medium', 'slow']} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-ink-3 cursor-pointer">
            <input type="checkbox" checked={config.video_ken_burns} onChange={(e) => setConfig({ video_ken_burns: e.target.checked })} className="accent-accent" />
            ken burns
          </label>
        </div>
      </SectionBlock>

      <CostCalculator config={config} />

      <div className="px-4 py-3 mt-auto border-t border-edge flex gap-2">
        <button onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-mist hover:bg-edge rounded text-xs text-ink-2 cursor-pointer transition-colors">
          <Save size={12} /> {saved ? 'saved!' : 'save config'}
        </button>
        <button onClick={handleLoad}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-mist hover:bg-edge rounded text-xs text-ink-2 cursor-pointer transition-colors">
          <Download size={12} />
        </button>
      </div>
    </aside>
  );
}
