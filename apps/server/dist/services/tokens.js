"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.validateToken = validateToken;
exports.revokeAllTokens = revokeAllTokens;
exports.listTokens = listTokens;
exports.signAdminCookie = signAdminCookie;
exports.verifyAdminCookie = verifyAdminCookie;
const crypto_1 = __importDefault(require("crypto"));
const tokens = new Map();
const TOKEN_TTL_MS = 86_400_000;
function generateToken(baseUrl) {
    const token = crypto_1.default.randomBytes(24).toString('hex');
    tokens.set(token, { createdAt: Date.now(), usedBy: null });
    return { token, url: `${baseUrl}/join/${token}` };
}
function validateToken(token) {
    const entry = tokens.get(token);
    if (!entry)
        return false;
    return Date.now() - entry.createdAt <= TOKEN_TTL_MS;
}
function revokeAllTokens() {
    tokens.clear();
}
function listTokens() {
    return Array.from(tokens.entries()).map(([token, data]) => ({
        token,
        createdAt: data.createdAt,
        usedBy: data.usedBy,
    }));
}
function signAdminCookie(password) {
    return crypto_1.default.createHmac('sha256', password).update('wj_admin').digest('hex');
}
function verifyAdminCookie(cookie, password) {
    const expected = signAdminCookie(password);
    try {
        return crypto_1.default.timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
    }
    catch {
        return false;
    }
}
