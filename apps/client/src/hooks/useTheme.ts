import { useEffect } from 'react';
import { applyAccent, DEFAULT_ACCENT } from '../lib/theme';

/**
 * Reads the saved accent from localStorage and applies the CSS variables once
 * on mount. Call this once at the application root (App.tsx).
 */
export function useTheme() {
    useEffect(() => {
        const saved = localStorage.getItem('wj_accent') ?? DEFAULT_ACCENT;
        applyAccent(saved);
    }, []);
}
