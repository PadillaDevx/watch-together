import React from 'react';
import { SkipForward } from 'lucide-react';

interface NextEpisodeButtonProps {
  visible: boolean;
  onClick: () => void;
  nextEpisodeTitulo?: string;
}

export default function NextEpisodeButton({
  visible,
  onClick,
  nextEpisodeTitulo: _nextEpisodeTitulo,
}: NextEpisodeButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`absolute bottom-4 right-4 z-20 flex items-center gap-2 px-4 py-2 rounded-full bg-black/70 backdrop-blur-sm border border-white/20 text-white text-sm font-medium hover:bg-violet-600/80 hover:border-violet-500 hover:shadow-[0_0_16px_rgba(139,92,246,0.5)] transition-all duration-200 cursor-pointer ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      } transition-opacity duration-300`}
    >
      <SkipForward className="w-4 h-4" />
      <span>Siguiente episodio</span>
    </button>
  );
}
