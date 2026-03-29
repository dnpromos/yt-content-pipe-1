import { useStore } from '../lib/store';
import { type ConfigPayload } from '../lib/api';
import { Subtitles } from 'lucide-react';

const FONTS: Record<string, string> = {
  'Montserrat Bold': 'assets/fonts/Montserrat-Bold.ttf',
  'Bangers': 'assets/fonts/Bangers-Regular.ttf',
  'Anton': 'assets/fonts/Anton-Regular.ttf',
  'Bebas Neue': 'assets/fonts/BebasNeue-Regular.ttf',
  'Poppins Bold': 'assets/fonts/Poppins-Bold.ttf',
};

const FONT_DISPLAY: Record<string, string> = {
  'assets/fonts/Montserrat-Bold.ttf': 'Montserrat, sans-serif',
  'assets/fonts/Bangers-Regular.ttf': 'Bangers, cursive',
  'assets/fonts/Anton-Regular.ttf': 'Anton, sans-serif',
  'assets/fonts/BebasNeue-Regular.ttf': '"Bebas Neue", sans-serif',
  'assets/fonts/Poppins-Bold.ttf': 'Poppins, sans-serif',
};

const PRESET_STYLES: { name: string; text: string; active: string; bg: string; opacity: number }[] = [
  { name: 'Classic', text: '#FFFFFF', active: '#FFFF32', bg: '#000000', opacity: 160 },
  { name: 'Neon', text: '#FFFFFF', active: '#00FF88', bg: '#1A0033', opacity: 200 },
  { name: 'Fire', text: '#FFFFFF', active: '#FF4400', bg: '#1A0000', opacity: 180 },
  { name: 'Ocean', text: '#E0F0FF', active: '#00BBFF', bg: '#001133', opacity: 180 },
  { name: 'Minimal', text: '#FFFFFF', active: '#FFFFFF', bg: '#000000', opacity: 120 },
  { name: 'Sunset', text: '#FFF5E0', active: '#FF8800', bg: '#2D0A00', opacity: 180 },
];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha / 255})`;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] uppercase tracking-wider text-ink-3 mb-1">{children}</label>;
}

function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-edge bg-transparent" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-card border border-edge rounded-lg px-2 py-1.5 text-xs text-ink-2 font-mono focus:outline-none focus:border-edge-strong uppercase" />
      </div>
    </div>
  );
}

function CaptionPreview({ config }: { config: ConfigPayload }) {
  const isPortrait = config.image_aspect === '9:16';
  const fontFamily = FONT_DISPLAY[config.caption_font] || 'sans-serif';
  const [w, h] = config.video_resolution;
  const isPortraitRes = h > w;
  const autoSize = isPortraitRes
    ? Math.max(36, Math.floor(w * 0.08))
    : Math.max(36, Math.floor(h * 0.055));
  const actualSize = config.caption_font_size > 0 ? config.caption_font_size : autoSize;
  const scale = isPortrait ? 160 / w : 320 / w;
  const fontSize = Math.max(10, Math.round(actualSize * scale));
  const words = isPortrait ? ['AMAZING', 'THINGS'] : ['AMAZING', 'THINGS', 'HAPPEN'];
  const bgColor = hexToRgba(config.caption_bg_color, config.caption_bg_opacity);

  return (
    <div className={`relative overflow-hidden rounded-lg border border-edge ${isPortrait ? 'aspect-[9/16] max-h-64' : 'aspect-video'}`}
      style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}>
      {/* Fake video content lines */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20">
        <div className="text-ink-3 text-xs">Video Preview</div>
      </div>
      {/* Caption overlay — position matches renderer: top = caption_position% */}
      <div className="absolute left-0 right-0 flex justify-center"
        style={{ top: `${config.caption_position}%`, transform: 'translateY(-50%)' }}>
        <div className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl"
          style={{ backgroundColor: bgColor }}>
          {words.map((word, i) => (
            <span key={i}
              style={{
                fontFamily,
                fontSize: `${fontSize}px`,
                fontWeight: 700,
                color: i === 1 ? config.caption_active_color : config.caption_text_color,
                textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                letterSpacing: '0.5px',
                textTransform: config.caption_uppercase ? 'uppercase' : 'none',
              }}>
              {config.caption_uppercase ? word : word.charAt(0) + word.slice(1).toLowerCase()}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CaptionSettings() {
  const { config, setConfig } = useStore();

  if (!config.captions_enabled) return null;

  const applyPreset = (preset: typeof PRESET_STYLES[number]) => {
    setConfig({
      caption_text_color: preset.text,
      caption_active_color: preset.active,
      caption_bg_color: preset.bg,
      caption_bg_opacity: preset.opacity,
    });
  };

  return (
    <div className="bg-card border border-edge rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-3 font-medium">
        <Subtitles size={14} className="text-accent" />
        Caption Style
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Left: Live preview */}
        <div className="flex flex-col">
          <CaptionPreview config={config} />
          <div className="flex gap-1.5 flex-wrap mt-3">
            {PRESET_STYLES.map((preset) => (
              <button key={preset.name} onClick={() => applyPreset(preset)}
                className="px-2.5 py-1 text-[10px] rounded-lg border border-edge hover:border-edge-strong cursor-pointer transition-colors"
                style={{ backgroundColor: hexToRgba(preset.bg, preset.opacity), color: preset.active }}>
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Options */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Font</Label>
              <select value={config.caption_font} onChange={(e) => setConfig({ caption_font: e.target.value })}
                className="w-full bg-card border border-edge rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-edge-strong cursor-pointer">
                {Object.entries(FONTS).map(([label, val]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Size (0 = auto)</Label>
              <input type="number" min={0} max={120} value={config.caption_font_size}
                onChange={(e) => setConfig({ caption_font_size: Number(e.target.value) })}
                className="w-full bg-card border border-edge rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-edge-strong" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <ColorInput label="Text color" value={config.caption_text_color} onChange={(v) => setConfig({ caption_text_color: v })} />
            <ColorInput label="Active word" value={config.caption_active_color} onChange={(v) => setConfig({ caption_active_color: v })} />
            <ColorInput label="Background" value={config.caption_bg_color} onChange={(v) => setConfig({ caption_bg_color: v })} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Position ({config.caption_position}%)</Label>
              <input type="range" min={10} max={90} value={config.caption_position}
                onChange={(e) => setConfig({ caption_position: Number(e.target.value) })}
                className="w-full accent-accent" />
            </div>
            <div>
              <Label>BG opacity ({config.caption_bg_opacity})</Label>
              <input type="range" min={0} max={255} value={config.caption_bg_opacity}
                onChange={(e) => setConfig({ caption_bg_opacity: Number(e.target.value) })}
                className="w-full accent-accent" />
            </div>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-ink-3 cursor-pointer">
            <input type="checkbox" checked={config.caption_uppercase} onChange={(e) => setConfig({ caption_uppercase: e.target.checked })} className="accent-accent" />
            Uppercase text
          </label>
        </div>
      </div>
    </div>
  );
}
