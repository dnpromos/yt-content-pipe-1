import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ContextMenuItem =
  | { type: 'item'; label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }
  | { type: 'separator' };

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const menuW = 180;
  const estH = items.reduce((h, it) => h + (it.type === 'separator' ? 9 : 30), 8);
  const left = Math.min(x, window.innerWidth - menuW - 8);
  const top = Math.min(y, window.innerHeight - estH - 8);

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', left, top, zIndex: 9999 }}
      className="w-44 bg-card border border-edge rounded-lg shadow-2xl shadow-black/40 py-1 overflow-hidden"
    >
      {items.map((item, i) =>
        item.type === 'separator' ? (
          <div key={i} className="h-px bg-edge mx-2 my-1" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onClick={(e) => { e.stopPropagation(); item.onClick(); onClose(); }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              item.danger ? 'text-red-400 hover:bg-red-900/20' : 'text-ink-2 hover:bg-mist'
            }`}
          >
            {item.icon && <span className="flex-shrink-0 opacity-60">{item.icon}</span>}
            {item.label}
          </button>
        )
      )}
    </div>,
    document.body
  );
}

export function useContextMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const open = (e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };
  const close = () => setMenu(null);
  return { menu, open, close };
}
