import { useEffect, type ReactNode } from 'react';

interface MobileDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    /** 'left' slides from the left, 'bottom' slides up from the bottom. */
    side?: 'left' | 'bottom';
    /** Width for left drawers (Tailwind class). */
    width?: string;
    /** Height for bottom drawers (Tailwind class). */
    height?: string;
    /** Extra classes for the panel. */
    className?: string;
    /** Hide the close button (defaults to no visible button — consumers add their own). */
    hideOnDesktop?: boolean;
}

/**
 * Generic mobile drawer with an overlay.
 *
 * - Slides in from the chosen side (default left).
 * - Tapping the overlay closes the drawer.
 * - Closes on Escape.
 * - When `hideOnDesktop` is true (default) it auto-hides on md+ screens via
 *   Tailwind classes so callers don't need to gate rendering themselves.
 */
export function MobileDrawer({
    isOpen,
    onClose,
    children,
    side = 'left',
    width = 'w-72',
    height = 'h-[60vh]',
    className = '',
    hideOnDesktop = true,
}: MobileDrawerProps) {
    useEffect(() => {
        if (!isOpen) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    const desktopClass = hideOnDesktop ? 'md:hidden' : '';

    const panelBase =
        side === 'left'
            ? `top-0 left-0 h-full ${width} max-w-[85vw] transform transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : '-translate-x-full'
            }`
            : `bottom-0 left-0 right-0 ${height} max-h-[85vh] transform transition-transform duration-300 ease-out rounded-t-2xl ${isOpen ? 'translate-y-0' : 'translate-y-full'
            }`;

    return (
        <div
            className={`fixed inset-0 z-50 ${desktopClass} ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
            aria-hidden={!isOpen}
        >
            {/* Overlay */}
            <div
                onClick={onClose}
                className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'
                    }`}
            />

            {/* Panel */}
            <div
                className={`absolute ${panelBase} bg-raised border-white/[0.06] shadow-2xl ${side === 'left' ? 'border-r' : 'border-t'
                    } ${className}`}
            >
                {children}
            </div>
        </div>
    );
}

export default MobileDrawer;
