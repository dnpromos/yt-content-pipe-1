import { useState, useRef, useEffect } from 'react';
import { useStore } from '../lib/store';
import { Square, Volume2 } from 'lucide-react';

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

export function VoicePicker() {
  const { config, setConfig } = useStore();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);

  const selectedVoice = Object.entries(VOICES).find(([, v]) => v === config.voice_id)?.[0] || 'Sarah';

  const handleSelect = (name: string) => {
    setConfig({ voice_id: VOICES[name] });
  };

  const handlePreview = (name: string) => {
    if (playingVoice === name) {
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingVoice(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(`/voices/${name.toLowerCase()}.mp3`);
    audioRef.current = audio;
    setPlayingVoice(name);

    audio.onended = () => {
      setPlayingVoice(null);
      audioRef.current = null;
    };
    audio.play();
  };

  useEffect(() => {
    return () => { audioRef.current?.pause(); };
  }, []);

  return (
    <div className="space-y-2">
      <label className="block text-[10px] uppercase tracking-wider text-ink-3 mb-1">Voice</label>
      <div className="grid grid-cols-3 gap-1.5">
        {Object.keys(VOICES).map((name) => {
          const isSelected = name === selectedVoice;
          const isPlaying = playingVoice === name;

          return (
            <div key={name}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-accent/10 border-accent/50 text-accent'
                  : 'bg-card border-edge text-ink-3 hover:border-edge-strong hover:text-ink-2'
              }`}
              onClick={() => handleSelect(name)}
            >
              <span className="flex-1 text-xs font-medium truncate">{name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handlePreview(name); }}
                title={isPlaying ? 'Stop' : 'Play preview'}
                className={`w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer ${
                  isPlaying
                    ? 'bg-accent text-white'
                    : 'bg-mist text-ink-3 hover:bg-edge hover:text-ink-2'
                }`}
              >
                {isPlaying ? <Square size={8} /> : <Volume2 size={10} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
