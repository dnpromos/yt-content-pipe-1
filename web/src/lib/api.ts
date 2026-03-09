const BASE = import.meta.env.DEV ? '' : 'http://localhost:8000';

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type ConfigPayload = {
  wiro_api_key: string;
  wiro_api_secret: string;
  voice_id: string;
  tts_model: string;
  image_style: string;
  image_resolution: string;
  image_aspect: string;
  images_per_section: number;
  video_resolution: [number, number];
  video_fps: number;
  video_transition: string;
  video_transition_duration: number;
  video_section_gap: number;
  video_ken_burns: boolean;
  video_preset: string;
  section_media_type: string;
  video_gen_resolution: string;
  video_gen_fps: string;
  video_gen_draft: string;
  videos_per_section: number;
  video_gen_duration: number;
  intro_video_count: number;
  captions_enabled: boolean;
  caption_font: string;
  caption_font_size: number;
  caption_text_color: string;
  caption_active_color: string;
  caption_bg_color: string;
  caption_bg_opacity: number;
  caption_uppercase: boolean;
  caption_position: number;
  video_length: string;
};

export const api = {
  listRuns: () => get<{ runs: { id: string; title: string }[] }>('/api/runs'),

  getRun: (runId: string) => get<{ script: Record<string, unknown>; run_id: string; config?: Partial<ConfigPayload> }>(`/api/runs/${runId}`),

  generateScript: (config: ConfigPayload, topic: string, numSections: number, subtitles?: string[], customInstructions?: string) =>
    post<{ task_id: string }>('/api/generate-script', { config, topic, num_sections: numSections, subtitles, custom_instructions: customInstructions }),

  generateAssets: (config: ConfigPayload, runId: string, forceImages = false) =>
    post<{ task_id: string }>('/api/generate-assets', { config, run_id: runId, force_images: forceImages }),

  assembleVideo: (config: ConfigPayload, runId: string) =>
    post<{ task_id: string }>('/api/assemble-video', { config, run_id: runId }),

  fullPipeline: (config: ConfigPayload, topic: string, numSections: number, subtitles?: string[], customInstructions?: string) =>
    post<{ task_id: string }>('/api/full-pipeline', { config, topic, num_sections: numSections, subtitles, custom_instructions: customInstructions }),

  retryMissing: (config: ConfigPayload, runId: string) =>
    post<{ task_id: string }>('/api/retry-missing', { config, run_id: runId }),

  retrySection: (config: ConfigPayload, runId: string, sectionNumber: number) =>
    post<{ task_id: string }>('/api/retry-section', { config, run_id: runId, section_number: sectionNumber }),

  generateExtraImages: (config: ConfigPayload, runId: string, sectionNumber: number, count: number, prompt?: string) =>
    post<{ task_id: string }>('/api/generate-extra-images', { config, run_id: runId, section_number: sectionNumber, count, prompt: prompt || '' }),

  updateSectionImages: (runId: string, sectionNumber: number, imagePaths: string[]) =>
    post<{ ok: boolean; script: Record<string, unknown> }>('/api/update-section-images', { run_id: runId, section_number: sectionNumber, image_paths: imagePaths }),

  deleteImage: (runId: string, imagePath: string) =>
    post<{ ok: boolean; script: Record<string, unknown> }>('/api/delete-image', { run_id: runId, image_path: imagePath }),

  uploadImage: async (runId: string, sectionNumber: number, file: File) => {
    const form = new FormData();
    form.append('run_id', runId);
    form.append('section_number', String(sectionNumber));
    form.append('file', file);
    const res = await fetch(`${BASE}/api/upload-image`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ ok: boolean; image_path: string; script: Record<string, unknown> }>;
  },

  saveScript: (runId: string, script: Record<string, unknown>) =>
    post<{ ok: boolean }>('/api/save-script', { run_id: runId, script }),

  loadConfig: () => get<Record<string, unknown>>('/api/config'),

  saveConfig: (config: ConfigPayload) =>
    post<{ ok: boolean }>('/api/config', config),

  regenerateSpecialImage: (config: ConfigPayload, runId: string, kind: 'intro' | 'outro', prompt?: string) =>
    post<{ task_id: string }>('/api/regenerate-special-image', { config, run_id: runId, kind, prompt: prompt || '' }),

  generateTocImage: (config: ConfigPayload, runId: string) =>
    post<{ task_id: string }>('/api/generate-toc-image', { config, run_id: runId }),

  uploadSpecialImage: async (runId: string, kind: 'intro' | 'outro', file: File) => {
    const form = new FormData();
    form.append('run_id', runId);
    form.append('kind', kind);
    form.append('file', file);
    const res = await fetch(`${BASE}/api/upload-special-image`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ ok: boolean; script: Record<string, unknown> }>;
  },

  killAll: () => post<{ ok: boolean; cancelled: number }>('/api/kill-all', {}),

  fileUrl: (path: string) => `${BASE}/api/files/${path}?t=${Date.now()}`,
};
