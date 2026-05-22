/**
 * Single source of truth for accent theme colors.
 * Each entry provides:
 *   - value:   storage key
 *   - hex:     main shade (≈600)
 *   - rgb:     "r g b" string for CSS rgba() usage
 *   - light:   lighter shade (≈500), used for hover
 *   - dark:    darker shade (≈700), used for active
 *   - lighter: pale shade (≈300), used for text on dark backgrounds
 *   - bgBase:  very dark background (main app bg)
 *   - bgRaised: slightly lighter bg (panels, sidebar)
 *   - bgCard:  even lighter bg (cards, dropdowns, select options)
 */
export interface AccentColor {
    name: string;
    value: string;
    hex: string;
    rgb: string;
    light: string;
    dark: string;
    lighter: string;
    bgBase: string;
    bgRaised: string;
    bgCard: string;
}

export const ACCENT_COLORS: AccentColor[] = [
    {
        name: 'Violeta', value: 'violet',
        hex: '#7c3aed', rgb: '124 58 237', light: '#8b5cf6', dark: '#6d28d9', lighter: '#c4b5fd',
        bgBase: '#0d0d1f', bgRaised: '#13132b', bgCard: '#1a1a38',
    },
    {
        name: 'Azul', value: 'blue',
        hex: '#2563eb', rgb: '37 99 235', light: '#3b82f6', dark: '#1d4ed8', lighter: '#93c5fd',
        bgBase: '#090e1c', bgRaised: '#0f1629', bgCard: '#141e36',
    },
    {
        name: 'Esmeralda', value: 'emerald',
        hex: '#059669', rgb: '5 150 105', light: '#10b981', dark: '#047857', lighter: '#6ee7b7',
        bgBase: '#07120f', bgRaised: '#0c1c18', bgCard: '#112520',
    },
    {
        name: 'Rosa', value: 'pink',
        hex: '#db2777', rgb: '219 39 119', light: '#ec4899', dark: '#be185d', lighter: '#f9a8d4',
        bgBase: '#130810', bgRaised: '#1d0d1a', bgCard: '#261023',
    },
    {
        name: 'Naranja', value: 'orange',
        hex: '#ea580c', rgb: '234 88 12', light: '#f97316', dark: '#c2410c', lighter: '#fdba74',
        bgBase: '#130904', bgRaised: '#1e1007', bgCard: '#27160b',
    },
    {
        name: 'Rojo', value: 'red',
        hex: '#dc2626', rgb: '220 38 38', light: '#ef4444', dark: '#b91c1c', lighter: '#fca5a5',
        bgBase: '#130505', bgRaised: '#1d0b0b', bgCard: '#260e0e',
    },
];

export const DEFAULT_ACCENT = 'violet';

/** Apply an accent color's CSS variables to :root. */
export function applyAccent(value: string) {
    const color = ACCENT_COLORS.find((c) => c.value === value) ?? ACCENT_COLORS[0];
    const root = document.documentElement;
    root.style.setProperty('--accent', color.hex);
    root.style.setProperty('--accent-rgb', color.rgb);
    root.style.setProperty('--accent-light', color.light);
    root.style.setProperty('--accent-dark', color.dark);
    root.style.setProperty('--accent-lighter', color.lighter);
    root.style.setProperty('--bg-base', color.bgBase);
    root.style.setProperty('--bg-raised', color.bgRaised);
    root.style.setProperty('--bg-card', color.bgCard);
}
