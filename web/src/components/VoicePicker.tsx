import { useState, useRef, useEffect } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { Square, Volume2, Loader2 } from 'lucide-react';

export const ELEVENLABS_VOICES: { name: string; id: string }[] = [
  { name: 'Rachel', id: '21m00Tcm4TlvDq8ikWAM' },
  { name: 'Drew', id: '29vD33N1CtxCmqQRPOHJ' },
  { name: 'Clyde', id: '2EiwWnXFnvU5JabPnv8n' },
  { name: 'Paul', id: '5Q0t7uMcjvnagumLfvZi' },
  { name: 'Aria', id: '9BWtsMINqrJLrRacOk9x' },
  { name: 'Sarah', id: 'EXAVITQu4vr4xnSDxMaL' },
  { name: 'Laura', id: 'FGY2WhTYpPnrIDTdsKH5' },
  { name: 'Charlie', id: 'IKne3meq5aSn9XLyUdCD' },
  { name: 'George', id: 'JBFqnCBsd6RMkjVDRZzb' },
  { name: 'Emily', id: 'LcfcDJNUP1GQjkzn1xUU' },
  { name: 'Callum', id: 'N2lVS1w4EtoT3dr4eOWO' },
  { name: 'Liam', id: 'TX3LPaxmHKxFdv7VOQHJ' },
  { name: 'Charlotte', id: 'XB0fDUnXU5powFXDhCwa' },
  { name: 'Daniel', id: 'onwK4e9ZLuTAKqWW03F9' },
  { name: 'River', id: 'SAz9YHcvj6GT2YYXdXww' },
];

export const GEMINI_VOICES: { name: string; id: string; gender: 'F' | 'M' }[] = [
  { name: 'Achernar', id: 'Achernar', gender: 'F' },

  { name: 'Algenib', id: 'Algenib', gender: 'M' },
  { name: 'Algieba', id: 'Algieba', gender: 'M' },
  { name: 'Alnilam', id: 'Alnilam', gender: 'M' },
  { name: 'Aoede', id: 'Aoede', gender: 'F' },
  { name: 'Autonoe', id: 'Autonoe', gender: 'F' },
  { name: 'Callirrhoe', id: 'Callirrhoe', gender: 'F' },
  { name: 'Charon', id: 'Charon', gender: 'M' },
  { name: 'Despina', id: 'Despina', gender: 'F' },
  { name: 'Enceladus', id: 'Enceladus', gender: 'M' },
  { name: 'Erinome', id: 'Erinome', gender: 'F' },
  { name: 'Fenrir', id: 'Fenrir', gender: 'M' },
  { name: 'Gacrux', id: 'Gacrux', gender: 'F' },
  { name: 'Iapetus', id: 'Iapetus', gender: 'M' },
  { name: 'Kore', id: 'Kore', gender: 'F' },
  { name: 'Laomedeia', id: 'Laomedeia', gender: 'F' },
  { name: 'Leda', id: 'Leda', gender: 'F' },
  { name: 'Orus', id: 'Orus', gender: 'M' },
  { name: 'Pulcherrima', id: 'Pulcherrima', gender: 'F' },
  { name: 'Puck', id: 'Puck', gender: 'M' },
  { name: 'Rasalgethi', id: 'Rasalgethi', gender: 'M' },
  { name: 'Sadachbia', id: 'Sadachbia', gender: 'M' },
  { name: 'Sadaltager', id: 'Sadaltager', gender: 'M' },
  { name: 'Schedar', id: 'Schedar', gender: 'M' },
  { name: 'Sulafat', id: 'Sulafat', gender: 'F' },
  { name: 'Umbriel', id: 'Umbriel', gender: 'M' },
  { name: 'Vindemiatrix', id: 'Vindemiatrix', gender: 'F' },
  { name: 'Zephyr', id: 'Zephyr', gender: 'F' },
  { name: 'Zubenelgenubi', id: 'Zubenelgenubi', gender: 'M' },
];

type VoiceProviderTab = 'elevenlabs' | 'gemini';

export function VoicePicker() {
  const { config, setConfig } = useStore();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState<string | null>(null);
  const activeTab = (config.voice_provider || 'elevenlabs') as VoiceProviderTab;

  const setTab = (tab: VoiceProviderTab) => {
    setConfig({ voice_provider: tab });
    // Set default voice for the selected provider
    if (tab === 'gemini') {
      const current = GEMINI_VOICES.find((v) => v.id === config.voice_id);
      if (!current) setConfig({ voice_id: 'Kore' });
    } else {
      const current = ELEVENLABS_VOICES.find((v) => v.id === config.voice_id);
      if (!current) setConfig({ voice_id: 'EXAVITQu4vr4xnSDxMaL' });
    }
  };

  const handleSelect = (id: string) => {
    setConfig({ voice_id: id });
  };

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingVoice(null);
  };

  const playAudioUrl = (url: string, key: string) => {
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingVoice(key);
    audio.onended = () => { setPlayingVoice(null); audioRef.current = null; };
    audio.onerror = () => { setPlayingVoice(null); audioRef.current = null; };
    audio.play();
  };

  const handlePreviewElevenlabs = (name: string) => {
    const key = `el_${name}`;
    if (playingVoice === key) { stopAudio(); return; }
    stopAudio();
    playAudioUrl(`/voices/${name.toLowerCase()}.mp3`, key);
  };

  const handlePreviewGemini = async (voice: typeof GEMINI_VOICES[0]) => {
    const key = `gem_${voice.name}`;
    if (playingVoice === key) { stopAudio(); return; }
    stopAudio();

    const nameLower = voice.name.toLowerCase();
    const previewUrl = `/voices/gemini/${nameLower}.mp3`;

    // Try playing directly first
    try {
      const resp = await fetch(previewUrl, { method: 'HEAD' });
      if (resp.ok) {
        playAudioUrl(previewUrl, key);
        return;
      }
    } catch { /* file doesn't exist */ }

    // Generate preview on demand
    setGeneratingPreview(voice.name);
    try {
      await api.generateVoicePreview(config, 'gemini', voice.id, voice.name);
      playAudioUrl(`${previewUrl}?t=${Date.now()}`, key);
    } catch {
      // silently fail
    } finally {
      setGeneratingPreview(null);
    }
  };

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  const selectedEL = ELEVENLABS_VOICES.find((v) => v.id === config.voice_id)?.name;
  const selectedGem = GEMINI_VOICES.find((v) => v.id === config.voice_id)?.name;

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex border-b border-edge">
        <button onClick={() => setTab('elevenlabs')}
          className={`px-4 py-2 text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'elevenlabs'
              ? 'text-accent border-b-2 border-accent -mb-px'
              : 'text-ink-4 hover:text-ink-2'
          }`}>
          ElevenLabs
        </button>
        <button onClick={() => setTab('gemini')}
          className={`px-4 py-2 text-xs font-medium transition-colors cursor-pointer ${
            activeTab === 'gemini'
              ? 'text-accent border-b-2 border-accent -mb-px'
              : 'text-ink-4 hover:text-ink-2'
          }`}>
          Gemini TTS
        </button>
      </div>

      {/* ElevenLabs grid */}
      {activeTab === 'elevenlabs' && (
        <div className="grid grid-cols-3 gap-1.5">
          {ELEVENLABS_VOICES.map((voice) => {
            const isSelected = voice.name === selectedEL;
            const key = `el_${voice.name}`;
            const isPlaying = playingVoice === key;
            return (
              <VoiceCard key={voice.id} name={voice.name} isSelected={isSelected} isPlaying={isPlaying}
                isGenerating={false}
                onSelect={() => handleSelect(voice.id)}
                onPreview={() => handlePreviewElevenlabs(voice.name)} />
            );
          })}
        </div>
      )}

      {/* Gemini grid */}
      {activeTab === 'gemini' && (
        <div className="grid grid-cols-3 gap-1.5">
          {GEMINI_VOICES.map((voice) => {
            const isSelected = voice.name === selectedGem;
            const key = `gem_${voice.name}`;
            const isPlaying = playingVoice === key;
            const isGenerating = generatingPreview === voice.name;
            return (
              <VoiceCard key={voice.id} name={voice.name} gender={voice.gender}
                isSelected={isSelected} isPlaying={isPlaying} isGenerating={isGenerating}
                onSelect={() => handleSelect(voice.id)}
                onPreview={() => handlePreviewGemini(voice)} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function VoiceCard({ name, gender, isSelected, isPlaying, isGenerating, onSelect, onPreview }: {
  name: string; gender?: 'F' | 'M'; isSelected: boolean; isPlaying: boolean; isGenerating: boolean;
  onSelect: () => void; onPreview: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border transition-all cursor-pointer ${
        isSelected
          ? 'bg-accent/10 border-accent/50 text-accent'
          : 'bg-card border-edge text-ink-3 hover:border-edge-strong hover:text-ink-2'
      }`}
      onClick={onSelect}
    >
      <span className="flex-1 text-xs font-medium truncate">{name}</span>
      {gender && (
        <span className={`text-[9px] font-bold ${gender === 'F' ? 'text-pink-400' : 'text-blue-400'}`}>
          {gender}
        </span>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onPreview(); }}
        disabled={isGenerating}
        title={isPlaying ? 'Stop' : isGenerating ? 'Generating preview...' : 'Play preview'}
        className={`w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer disabled:cursor-wait ${
          isPlaying
            ? 'bg-accent text-white'
            : 'bg-mist text-ink-3 hover:bg-edge hover:text-ink-2'
        }`}
      >
        {isGenerating ? <Loader2 size={9} className="animate-spin" /> : isPlaying ? <Square size={8} /> : <Volume2 size={10} />}
      </button>
    </div>
  );
}
