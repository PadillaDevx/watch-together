import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { SyncMode } from '../hooks/useProviderDetection';

interface ResyncButtonProps {
  syncMode: SyncMode;
  estimatedTime: number;
  onSmartResync: () => void;
  onPassiveResync: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ResyncButton({ syncMode, estimatedTime, onSmartResync, onPassiveResync }: ResyncButtonProps) {
  const [showModal, setShowModal] = useState(false);

  const handleClick = () => {
    if (syncMode === 'smart') {
      onSmartResync();
    } else {
      onPassiveResync();
      setShowModal(true);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        className="absolute top-2 right-2 z-20 p-2 rounded-full text-white/50 hover:text-white/100 transition-colors duration-150 touch-manipulation"
        aria-label="Re-sincronizar"
        style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <RefreshCw style={{ width: 14, height: 14 }} />
      </button>

      {showModal && syncMode === 'passive' && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-neutral-900 border border-white/10 rounded-xl px-8 py-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-3xl font-mono text-white">⏱ {formatTime(estimatedTime)}</p>
          </div>
        </div>
      )}
    </>
  );
}
