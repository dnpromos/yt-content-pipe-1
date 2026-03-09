import { useEffect, useRef } from 'react';
import { useStore } from '../lib/store';
import { Terminal } from 'lucide-react';

export function LogPanel() {
  const logs = useStore((s) => s.logs);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div className="border-t border-neutral-800 bg-neutral-950">
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-neutral-800">
        <Terminal size={12} className="text-neutral-500" />
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">logs</span>
        <span className="text-[10px] text-neutral-600 ml-auto">{logs.length} lines</span>
      </div>
      <div className="h-40 overflow-y-auto px-4 py-2 font-mono text-xs text-neutral-500 leading-relaxed">
        {logs.length === 0 && <span className="text-neutral-700">waiting for activity...</span>}
        {logs.map((line, i) => (
          <div key={i} className={line.includes('error') ? 'text-red-400' : ''}>{line}</div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
