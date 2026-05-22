import { Play } from 'lucide-react';

interface PlayInstructionProps {
  visible: boolean;
}

export function PlayInstruction({ visible }: PlayInstructionProps) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none"
      style={{
        background: 'rgba(0,0,0,0.6)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 300ms ease',
      }}
      aria-hidden="true"
    >
      <Play
        className="text-white"
        style={{
          width: 80,
          height: 80,
          animation: visible ? 'pulse 600ms ease-in-out 2' : 'none',
        }}
      />
    </div>
  );
}
