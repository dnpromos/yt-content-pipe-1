import { useStore } from '../lib/store';
import { type ConfigPayload } from '../lib/api';
import { Mic, ImageIcon, Film, DollarSign, ArrowRight, Clapperboard, MonitorPlay, Youtube, Smartphone, Monitor } from 'lucide-react';
import { VoicePicker } from './VoicePicker';
import { CaptionSettings } from './CaptionSettings';


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

const _TTS_MODELS: Record<string, string> = {
  'Flash v2.5': 'eleven_flash_v2_5',
  'v3 (HD)': 'eleven_v3',
};
void _TTS_MODELS;
const RES_MAP: Record<string, [number, number]> = { '720p': [1280, 720], '1080p': [1920, 1080] };

function deriveOutputRes(genRes: string, portrait: boolean): [number, number] {
  const [w, h] = RES_MAP[genRes] || RES_MAP['720p'];
  return portrait ? [h, w] : [w, h];
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] uppercase tracking-wider text-ink-3 mb-1">{children}</label>;
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: string[] | Record<string, string>;
}) {
  const entries = Array.isArray(options) ? options.map((o) => [o, o]) : Object.entries(options);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-card border border-edge rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-edge-strong cursor-pointer">
      {entries.map(([label, val]) => <option key={val} value={val}>{label}</option>)}
    </select>
  );
}

function Card({ icon: Icon, title, children }: {
  icon: React.ComponentType<{ size?: number; className?: string }>; title: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-edge rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-3 font-medium">
        <Icon size={14} className="text-accent" />
        {title}
      </div>
      {children}
    </div>
  );
}

function MediaToggle({ value, onChange, label }: { value: 'image' | 'video'; onChange: (v: 'image' | 'video') => void; label: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex rounded-lg overflow-hidden border border-edge">
        <button onClick={() => onChange('image')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
            value === 'image' ? 'bg-accent text-white' : 'bg-card text-ink-3 hover:text-ink-2'
          }`}>
          <ImageIcon size={12} /> AI Images
        </button>
        <button onClick={() => onChange('video')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
            value === 'video' ? 'bg-accent text-white' : 'bg-card text-ink-3 hover:text-ink-2'
          }`}>
          <Film size={12} /> AI Video
        </button>
      </div>
    </div>
  );
}

function CostEstimate({ config }: { config: ConfigPayload }) {
  const { script, numSections: storeNumSections } = useStore();
  const numSections = script?.sections?.length || storeNumSections || 5;
  const sectionIsVideo = config.section_media_type === 'video';
  const introIsVideo = config.intro_video_count > 0;
  const COST_VIDEO_PER_10S = 0.40;
  const COST_IMAGE = 0.067;
  const COST_AUDIO = 0.06;
  const COST_SCRIPT = 0.01;

  const audioCost = (numSections + 2) * COST_AUDIO;
  const sectionImageCount = sectionIsVideo ? 0 : numSections * config.images_per_section;
  const introImageCount = introIsVideo ? 0 : 1;
  const outroImageCount = 1;
  const imageCost = (introImageCount + outroImageCount + sectionImageCount) * COST_IMAGE;
  const sectionVideoClips = sectionIsVideo ? numSections * config.videos_per_section : 0;
  const introVideoClips = introIsVideo ? config.intro_video_count : 0;
  const totalVideoClips = sectionVideoClips + introVideoClips;
  const videoCost = (totalVideoClips * config.video_gen_duration / 10) * COST_VIDEO_PER_10S;
  const total = COST_SCRIPT + audioCost + imageCost + videoCost;

  return (
    <Card icon={DollarSign} title="Estimated Cost">
      <div className="space-y-1.5 text-[11px] text-ink-3">
        <div className="flex justify-between"><span>Script generation</span><span>${COST_SCRIPT.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>Audio ({numSections + 2} clips)</span><span>${audioCost.toFixed(2)}</span></div>
        <div className="flex justify-between"><span>Images ({introImageCount + outroImageCount + sectionImageCount})</span><span>${imageCost.toFixed(2)}</span></div>
        {totalVideoClips > 0 && (
          <div className="flex justify-between"><span>Videos ({totalVideoClips} clips)</span><span>${videoCost.toFixed(2)}</span></div>
        )}
        <div className="flex justify-between pt-2 border-t border-edge text-sm font-semibold text-ink">
          <span>Total</span><span>${total.toFixed(2)}</span>
        </div>
      </div>
    </Card>
  );
}

function AspectIcon({ ratio, className = '' }: { ratio: '16:9' | '9:16'; className?: string }) {
  return ratio === '16:9' ? (
    <div className={`border-2 border-current rounded-sm w-5 h-3.5 ${className}`} />
  ) : (
    <div className={`border-2 border-current rounded-sm w-3 h-5 ${className}`} />
  );
}

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube', desc: 'Landscape 16:9 widescreen format', icon: Youtube, aspect: '16:9' as const, resolution: [1920, 1080] as [number, number] },
  { id: 'shorts', label: 'Shorts / Reels / TikTok', desc: 'Portrait 9:16 vertical format', icon: Smartphone, aspect: '9:16' as const, resolution: [1080, 1920] as [number, number] },
];

export function StepSettings() {
  const { config, setConfig, setUiStep } = useStore();

  const sectionIsVideo = config.section_media_type === 'video';
  const introIsVideo = config.intro_video_count > 0;
  const isPortrait = config.image_aspect === '9:16';
  const currentPlatform = isPortrait ? 'shorts' : 'youtube';

  const handlePlatformChange = (platformId: string) => {
    const platform = PLATFORMS.find((p) => p.id === platformId)!;
    const portrait = platform.aspect === '9:16';
    setConfig({
      image_aspect: platform.aspect,
      video_resolution: deriveOutputRes(config.video_gen_resolution, portrait),
    });
  };

  const handleGenResChange = (v: string) => {
    setConfig({
      video_gen_resolution: v,
      video_resolution: deriveOutputRes(v, isPortrait),
    });
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-8 space-y-5">
      {/* Platform */}
      <Card icon={Monitor} title="Platform">
        <div className="flex gap-2">
          {PLATFORMS.map((p) => {
            const active = currentPlatform === p.id;
            return (
              <button key={p.id} onClick={() => handlePlatformChange(p.id)}
                className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg border transition-all cursor-pointer ${
                  active
                    ? 'bg-accent/10 border-accent/50'
                    : 'bg-card border-edge hover:border-edge-strong'
                }`}>
                <p.icon size={18} className={active ? 'text-accent' : 'text-ink-4'} />
                <div className="text-left">
                  <div className={`text-xs font-medium ${active ? 'text-accent' : 'text-ink-3'}`}>{p.label}</div>
                  <div className={`text-[10px] ${active ? 'text-accent/60' : 'text-ink-4'}`}>{p.desc}</div>
                </div>
                <AspectIcon ratio={p.aspect} className={`ml-auto ${active ? 'text-accent' : 'text-ink-5'}`} />
              </button>
            );
          })}
        </div>
      </Card>

      {/* Section Media */}
      <Card icon={Clapperboard} title="Section Media">
        <MediaToggle
          value={sectionIsVideo ? 'video' : 'image'}
          onChange={(v) => setConfig({ section_media_type: v })}
          label="What media to generate for each section"
        />

        {sectionIsVideo ? (
          <div className="space-y-2 p-3 bg-mist/50 border border-edge/50 rounded-lg">
            <div className="text-[10px] text-ink-3 mb-2">Each section will have AI-generated video clips</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Clips per section</Label>
                <Select value={String(config.videos_per_section)} onChange={(v) => setConfig({ videos_per_section: Number(v) })} options={['1', '2', '3', '4', '5']} />
              </div>
              <div>
                <Label>Clip duration (s)</Label>
                <Select value={String(config.video_gen_duration)} onChange={(v) => setConfig({ video_gen_duration: Number(v) })} options={['1','2','3','4','5','6','7','8','9','10']} />
              </div>
              <div>
                <Label>Gen resolution</Label>
                <Select value={config.video_gen_resolution} onChange={handleGenResChange} options={['720p', '1080p']} />
              </div>
              <div>
                <Label>Gen FPS</Label>
                <Select value={config.video_gen_fps} onChange={(v) => setConfig({ video_gen_fps: v })} options={['24', '48']} />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2 p-3 bg-mist/50 border border-edge/50 rounded-lg">
            <div className="text-[10px] text-ink-3 mb-2">Each section will display AI images for 3s with Ken Burns effect</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Images per section</Label>
                <Select value={String(config.images_per_section)} onChange={(v) => setConfig({ images_per_section: Number(v) })} options={['1', '2', '3', '4', '5']} />
              </div>
              <div>
                <Label>Style</Label>
                <Select value={config.image_style} onChange={(v) => setConfig({ image_style: v })} options={IMAGE_STYLES} />
              </div>
              <div>
                <Label>Resolution</Label>
                <Select value={config.image_resolution} onChange={(v) => setConfig({ image_resolution: v })} options={['1K', '2K', '4K']} />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-1.5 text-xs text-ink-3 cursor-pointer">
                  <input type="checkbox" checked={config.video_ken_burns} onChange={(e) => setConfig({ video_ken_burns: e.target.checked })} className="accent-accent" />
                  Ken Burns effect
                </label>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Intro Media */}
      <Card icon={MonitorPlay} title="Intro Media">
        <MediaToggle
          value={introIsVideo ? 'video' : 'image'}
          onChange={(v) => setConfig({ intro_video_count: v === 'video' ? 2 : 0 })}
          label="What media to generate for the intro"
        />

        {introIsVideo ? (
          <div className="space-y-2 p-3 bg-mist/50 border border-edge/50 rounded-lg">
            <div className="text-[10px] text-ink-3 mb-2">AI video clips will play in addition to the 3s intro image</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Number of intro clips</Label>
                <Select value={String(config.intro_video_count)} onChange={(v) => setConfig({ intro_video_count: Number(v) })} options={['1', '2', '3', '4', '5']} />
              </div>
              <div className="flex items-end pb-1 text-[10px] text-ink-4">
                Uses same duration & resolution as sections
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-mist/50 border border-edge/50 rounded-lg">
            <div className="text-[10px] text-ink-3">Intro will display an AI-generated thumbnail image for 3s</div>
          </div>
        )}
      </Card>

      {/* Voice & Narration */}
      <Card icon={Mic} title="Voice & Narration">
        <VoicePicker />
      </Card>

      {/* Output Settings */}
      <Card icon={Film} title="Output Video">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label>Transition</Label>
            <Select value={config.video_transition} onChange={(v) => setConfig({ video_transition: v })} options={['crossfade', 'slide', 'cut']} />
          </div>
          <div>
            <Label>Preset</Label>
            <Select value={config.video_preset} onChange={(v) => setConfig({ video_preset: v })} options={['ultrafast', 'fast', 'medium', 'slow']} />
          </div>
          <div>
            <Label>FPS</Label>
            <Select value={String(config.video_fps)} onChange={(v) => setConfig({ video_fps: Number(v) })} options={['24', '30', '60']} />
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-3 cursor-pointer">
            <input type="checkbox" checked={config.captions_enabled} onChange={(e) => setConfig({ captions_enabled: e.target.checked })} className="accent-accent" />
            TikTok-style captions
          </label>
          <div className="text-[10px] text-ink-4">
            {config.video_resolution[0]}×{config.video_resolution[1]} ({config.video_gen_resolution} {isPortrait ? 'portrait' : 'landscape'})
          </div>
        </div>
      </Card>

      {/* Caption Style (shown when captions enabled) */}
      {config.captions_enabled && <CaptionSettings />}

      {/* Cost */}
      <CostEstimate config={config} />

      {/* Next */}
      <div className="flex justify-end pt-2">
        <button onClick={() => setUiStep(1)}
          className="flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-hover rounded-xl text-sm font-medium text-white cursor-pointer transition-all shadow-lg shadow-accent/20">
          Next: Choose Topic <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
