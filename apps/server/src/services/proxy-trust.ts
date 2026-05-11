/**
 * Shared whitelist of CDN / external hostnames that the IPTV proxy is
 * allowed to relay.  Kept in a dedicated module so both the route layer
 * (routes/iptv) and the service layer (services/jellyfin, etc.) can
 * register hostnames without creating cross-layer circular imports.
 */

export const _discoveredCdnHostnames = new Set<string>();

/**
 * Pre-register a hostname so the IPTV proxy will accept requests to it
 * without requiring it to appear in an IPTV list entry first.
 */
export function trustHostname(hostname: string): void {
    _discoveredCdnHostnames.add(hostname);
}
