interface LoadingOverlayProps {
  visible: boolean;
  text: string;
}

export function LoadingOverlay({ visible, text }: LoadingOverlayProps) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-30 pointer-events-none"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 400ms ease',
      }}
    >
      <svg
        className="animate-spin h-10 w-10 text-violet-600"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <p className="mt-4 text-sm text-white/70">{text}</p>
    </div>
  );
}
