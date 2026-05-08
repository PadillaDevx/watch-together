'use strict';

const crypto = require('crypto');

// Module-level token store: Map<token:string, { createdAt:number, usedBy:string|null }>
const tokens = new Map();

const TOKEN_TTL_MS = 86_400_000; // 24 hours

/**
 * Generate a new invite token and store it.
 * @param {string} baseUrl - Base URL of the server (e.g. http://192.168.1.10:3000)
 * @returns {{ token: string, url: string }}
 */
function generateToken(baseUrl) {
  const token = crypto.randomBytes(24).toString('hex'); // 48-char hex string
  tokens.set(token, { createdAt: Date.now(), usedBy: null });
  return { token, url: baseUrl + '/join/' + token };
}

/**
 * Validate whether a token is known and not expired.
 * @param {string} token
 * @returns {boolean}
 */
function validateToken(token) {
  const entry = tokens.get(token);
  if (!entry) return false;
  if (Date.now() - entry.createdAt > TOKEN_TTL_MS) return false;
  return true;
}

/**
 * Mark a token as used by a specific socket.
 * @param {string} token
 * @param {string} socketId
 */
function markTokenUsed(token, socketId) {
  const entry = tokens.get(token);
  if (entry) {
    entry.usedBy = socketId;
  }
}

/**
 * Revoke (delete) a single token.
 * @param {string} token
 */
function revokeToken(token) {
  tokens.delete(token);
}

/**
 * Revoke all tokens.
 */
function revokeAllTokens() {
  tokens.clear();
}

/**
 * List all tokens with their metadata.
 * @returns {Array<{ token: string, createdAt: number, usedBy: string|null }>}
 */
function listTokens() {
  const result = [];
  for (const [token, data] of tokens.entries()) {
    result.push({ token, createdAt: data.createdAt, usedBy: data.usedBy });
  }
  return result;
}

/**
 * Produce an HMAC-SHA256 signature used as the admin cookie value.
 * @param {string} password
 * @returns {string}
 */
function signAdminCookie(password) {
  return crypto.createHmac('sha256', password).update('wj_admin').digest('hex');
}

/**
 * Verify an admin cookie value using a timing-safe comparison.
 * @param {string} cookieValue
 * @param {string} password
 * @returns {boolean}
 */
function verifyAdminCookie(cookieValue, password) {
  try {
    const expected = signAdminCookie(password);
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(cookieValue)
    );
  } catch (_err) {
    // Buffer length mismatch or invalid input
    return false;
  }
}

module.exports = {
  generateToken,
  validateToken,
  markTokenUsed,
  revokeToken,
  revokeAllTokens,
  listTokens,
  signAdminCookie,
  verifyAdminCookie,
};
