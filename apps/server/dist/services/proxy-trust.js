"use strict";
/**
 * Shared whitelist of CDN / external hostnames that the IPTV proxy is
 * allowed to relay.  Kept in a dedicated module so both the route layer
 * (routes/iptv) and the service layer (services/jellyfin, etc.) can
 * register hostnames without creating cross-layer circular imports.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports._discoveredCdnHostnames = void 0;
exports.trustHostname = trustHostname;
exports._discoveredCdnHostnames = new Set();
/**
 * Pre-register a hostname so the IPTV proxy will accept requests to it
 * without requiring it to appear in an IPTV list entry first.
 */
function trustHostname(hostname) {
    exports._discoveredCdnHostnames.add(hostname);
}
