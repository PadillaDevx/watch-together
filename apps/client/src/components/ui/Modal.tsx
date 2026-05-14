import { type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
  unclosable?: boolean;
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-md', unclosable }: ModalProps) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={unclosable ? undefined : onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={clsx('relative w-full bg-raised border border-white/[0.08] rounded-2xl shadow-2xl animate-slide-up', maxWidth)}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {!unclosable && onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
