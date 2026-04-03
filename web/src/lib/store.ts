import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ConfigPayload } from './api';

export type Section = {
  number: number;
  heading: string;
  narration: string;
  image_prompt: string;
  image_prompts: string[];
  audio_path: string | null;
  image_path: string | null;
  image_paths: string[];
  video_path: string | null;
  video_paths: string[];
  duration: number | null;
};

export type ScriptData = {
  title: string;
  intro_narration: string;
  intro_image_prompt: string;
  sections: Section[];
  outro_narration: string;
  outro_image_prompt: string;
  intro_audio_path: string | null;
  outro_audio_path: string | null;
  intro_image_path: string | null;
  intro_image_paths: string[];
  intro_video_paths: string[];
  outro_image_path: string | null;
  intro_duration: number | null;
  outro_duration: number | null;
};

export type Stage = 'idle' | 'scripting' | 'scripted' | 'generating_voiceovers' | 'voiceovers_done' | 'generating_media' | 'media_done' | 'generating_assets' | 'assets_done' | 'assembling' | 'video_done';
export type UiStep = 0 | 1 | 2 | 3 | 4 | 5;

type AppState = {
  config: ConfigPayload;
  setConfig: (partial: Partial<ConfigPayload>) => void;
  stage: Stage;
  setStage: (s: Stage) => void;
  uiStep: UiStep;
  setUiStep: (s: UiStep) => void;
  topic: string;
  setTopic: (t: string) => void;
  numSections: number;
  setNumSections: (n: number) => void;
  subtitles: string;
  setSubtitles: (s: string) => void;
  customInstructions: string;
  setCustomInstructions: (s: string) => void;
  runId: string | null;
  setRunId: (id: string | null) => void;
  script: ScriptData | null;
  setScript: (s: ScriptData | null) => void;
  videoPath: string | null;
  setVideoPath: (p: string | null) => void;
  logs: string[];
  addLog: (line: string) => void;
  clearLogs: () => void;
  taskId: string | null;
  setTaskId: (id: string | null) => void;
  resetRun: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
};

const defaultConfig: ConfigPayload = {
  wiro_api_key: '',
  wiro_api_secret: '',
  voice_provider: 'elevenlabs',
  voice_id: 'EXAVITQu4vr4xnSDxMaL',
  tts_model: 'eleven_flash_v2_5',
  image_style: 'cinematic realistic',
  image_resolution: '2K',
  image_aspect: '16:9',
  images_per_section: 1,
  video_resolution: [1280, 720],
  video_fps: 30,
  video_transition: 'crossfade',
  video_transition_duration: 0.8,
  video_section_gap: 0.5,
  video_ken_burns: true,
  video_preset: 'ultrafast',
  section_media_type: 'image',
  video_gen_resolution: '720p',
  video_gen_fps: '24',
  video_gen_draft: 'false',
  videos_per_section: 1,
  video_gen_duration: 5,
  intro_image_count: 1,
  intro_video_count: 2,
  captions_enabled: true,
  caption_font: 'assets/fonts/Montserrat-Bold.ttf',
  caption_font_size: 0,
  caption_text_color: '#FFFFFF',
  caption_active_color: '#FFFF32',
  caption_bg_color: '#000000',
  caption_bg_opacity: 160,
  caption_uppercase: true,
  caption_position: 75,
  video_length: 'medium',
  script_format: 'listicle',
};

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      config: defaultConfig,
      setConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),
      stage: 'idle',
      setStage: (stage) => set({ stage }),
      uiStep: 0 as UiStep,
      settingsOpen: false,
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setUiStep: (uiStep) => set({ uiStep }),
      topic: '',
      setTopic: (topic) => set({ topic }),
      numSections: 6,
      setNumSections: (numSections) => set({ numSections }),
      subtitles: '',
      setSubtitles: (subtitles) => set({ subtitles }),
      customInstructions: '',
      setCustomInstructions: (customInstructions) => set({ customInstructions }),
      runId: null,
      setRunId: (runId) => set({ runId }),
      script: null,
      setScript: (script) => set({ script }),
      videoPath: null,
      setVideoPath: (videoPath) => set({ videoPath }),
      logs: [],
      addLog: (line) => set((s) => ({ logs: [...s.logs.slice(-200), line] })),
      clearLogs: () => set({ logs: [] }),
      taskId: null,
      setTaskId: (taskId) => set({ taskId }),
      resetRun: () => set({ script: null, runId: null, videoPath: null, logs: [], taskId: null, stage: 'idle', uiStep: 0 as UiStep }),
    }),
    {
      name: 'clipmatic-store',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        config: s.config,
        topic: s.topic,
        numSections: s.numSections,
        subtitles: s.subtitles,
        customInstructions: s.customInstructions,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<AppState> | undefined;
        return {
          ...current,
          topic: p?.topic ?? '',
          numSections: p?.numSections ?? 6,
          subtitles: p?.subtitles ?? '',
          customInstructions: p?.customInstructions ?? '',
          config: { ...defaultConfig, ...(p?.config ?? {}) },
        };
      },
    }
  )
);
