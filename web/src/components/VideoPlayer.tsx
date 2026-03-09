import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { Film } from 'lucide-react';

export function VideoPlayer() {
  const videoPath = useStore((s) => s.videoPath);

  if (!videoPath) return null;

  return (
    <div className="px-6 py-4 border-t border-neutral-800">
      <div className="flex items-center gap-2 mb-3">
        <Film size={14} className="text-neutral-500" />
        <span className="text-xs uppercase tracking-wider text-neutral-500">video</span>
      </div>
      <video
        src={api.fileUrl(videoPath)}
        controls
        className="w-full max-w-2xl rounded-lg border border-neutral-800"
      />
    </div>
  );
}
