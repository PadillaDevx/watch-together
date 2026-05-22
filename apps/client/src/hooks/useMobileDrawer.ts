import { useCallback, useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * Manages the open/closed state of a mobile drawer.
 * Automatically closes the drawer when the viewport grows past the desktop
 * breakpoint so the underlying layout doesn't end up with a hidden drawer
 * still mounted.
 */
export function useMobileDrawer(initial = false) {
    const [isOpen, setIsOpen] = useState(initial);

    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);
    const toggle = useCallback(() => setIsOpen((o) => !o), []);

    useEffect(() => {
        function handleResize() {
            if (window.innerWidth >= MOBILE_BREAKPOINT) setIsOpen(false);
        }
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Lock body scroll while drawer is open on mobile.
    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [isOpen]);

    return { isOpen, open, close, toggle };
}
