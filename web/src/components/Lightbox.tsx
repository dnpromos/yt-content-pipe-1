import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

type LightboxState = { src: string; type: 'image' | 'video' } | null;
let _setter: ((s: LightboxState) => void) | null = null;

export function openLightbox(src: string, type: 'image' | 'video' = 'image') {
  _setter?.({ src, type });
}

export function Lightbox() {
  const [state, setState] = useState<LightboxState>(null);
  _setter = setState;

  const close = useCallback(() => setState(null), []);

  useEffect(() => {
    if (!state) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [state, close]);

  if (!state) return null;

  return (
    <div onClick={close}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm cursor-zoom-out">
      <button onClick={close}
        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-neutral-800/80 hover:bg-neutral-700 rounded-full text-neutral-300 cursor-pointer z-10">
        <X size={16} />
      </button>
      {state.type === 'image' ? (
        <img src={state.src} alt="Preview" onClick={(e) => e.stopPropagation()}
          className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg cursor-default" />
      ) : (
        <video src={state.src} controls autoPlay onClick={(e) => e.stopPropagation()}
          className="max-w-[90vw] max-h-[90vh] rounded-lg cursor-default" />
      )}
    </div>
  );
}
