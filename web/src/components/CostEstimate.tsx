import { useStore } from '../lib/store';
import { type ConfigPayload } from '../lib/api';
import { DollarSign } from 'lucide-react';

const COST_VIDEO_PER_10S = 0.40;
const COST_IMAGE = 0.067;
const COST_AUDIO = 0.06;
const COST_CAPTION = 0.02;
const COST_SCRIPT = 0.01;

export function CostEstimate() {
  const { config, script, numSections: storeNumSections } = useStore();
  const numSections = script?.sections?.length || storeNumSections || 5;

  const rows = buildRows(config, numSections);
  const total = rows.reduce((sum, r) => sum + r.cost, 0);

  return (
    <div className="bg-card border border-edge rounded-xl p-5 space-y-3">
      <h3 className="text-sm font-semibold text-ink-2 flex items-center gap-2">
        <DollarSign size={16} className="text-accent" />
        Estimated Cost
      </h3>

      <div className="space-y-1.5 text-[11px] text-ink-3">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between">
            <span>{r.label}</span>
            <span>${r.cost.toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 border-t border-edge text-sm font-semibold text-ink">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function buildRows(config: ConfigPayload, numSections: number) {
  const sectionIsVideo = config.section_media_type === 'video';
  const introIsVideo = config.intro_video_count > 0;

  const audioClips = numSections + 2;
  const audioCost = audioClips * COST_AUDIO;

  const sectionImageCount = sectionIsVideo ? 0 : numSections * config.images_per_section;
  const introImageCount = introIsVideo ? 0 : 1;
  const outroImageCount = 1;
  const totalImages = introImageCount + outroImageCount + sectionImageCount;
  const imageCost = totalImages * COST_IMAGE;

  const sectionVideoClips = sectionIsVideo ? numSections * config.videos_per_section : 0;
  const introVideoClips = introIsVideo ? config.intro_video_count : 0;
  const totalVideoClips = sectionVideoClips + introVideoClips;
  const videoCost = (totalVideoClips * config.video_gen_duration / 10) * COST_VIDEO_PER_10S;

  const captionCost = config.captions_enabled ? audioClips * COST_CAPTION : 0;

  const rows: { label: string; cost: number }[] = [
    { label: 'Script generation', cost: COST_SCRIPT },
    { label: `Audio (${audioClips} clips)`, cost: audioCost },
  ];

  if (totalImages > 0) {
    rows.push({ label: `Images (${totalImages})`, cost: imageCost });
  }

  if (totalVideoClips > 0) {
    rows.push({ label: `Videos (${totalVideoClips} clips)`, cost: videoCost });
  }

  if (config.captions_enabled) {
    rows.push({ label: `Captions (${audioClips} transcriptions)`, cost: captionCost });
  }

  return rows;
}
