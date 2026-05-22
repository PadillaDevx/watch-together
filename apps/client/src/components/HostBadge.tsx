import { Crown } from 'lucide-react';

/**
 * Maximum number of characters displayed inline before the host username is
 * truncated. The untruncated value is preserved in the native `title`
 * attribute so users can hover to see the full identity.
 */
const MAX_DISPLAY_LENGTH = 18;

interface HostBadgeProps {
  /**
   * Current host username for the active room. When `null` or empty the
   * badge does not render so passive sources (or pre-join state) stay clean.
   */
  hostUsername: string | null;
}

/**
 * Truncate a username for inline display preserving readability. Returns the
 * original string when it already fits within `MAX_DISPLAY_LENGTH`.
 */
function truncate(value: string): string {
  if (value.length <= MAX_DISPLAY_LENGTH) return value;
  return `${value.slice(0, MAX_DISPLAY_LENGTH - 1)}…`;
}

/**
 * Discrete pill rendered over the iframe player that surfaces the current
 * host identity to every participant. The component is purely presentational
 * and does not subscribe to any state — callers are expected to pipe the
 * latest `hostUsername` from the global store (updated via `host-changed`).
 *
 * Visual contract:
 * - Absolute positioned top-left of the relative parent (z-20).
 * - `pointer-events-none` to ensure it never blocks player controls.
 * - Backdrop blur + translucent violet background for legibility on bright
 *   or dark frames without hard-clipping underlying media.
 */
export function HostBadge({ hostUsername }: HostBadgeProps) {
  if (!hostUsername) return null;
  const display = truncate(hostUsername);
  return (
    <div
      className="absolute top-2 left-2 z-20 pointer-events-none bg-violet-700/70 text-white text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 backdrop-blur-sm"
      title={hostUsername}
      data-testid="host-badge"
    >
      <Crown size={10} aria-hidden="true" />
      <span>{display}</span>
    </div>
  );
}
