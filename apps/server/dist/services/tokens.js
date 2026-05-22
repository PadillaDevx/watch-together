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
exports.purgeExpiredTokens = purgeExpiredTokens;
const crypto_1 = __importDefault(require("crypto"));
const drizzle_orm_1 = require("drizzle-orm");
const index_1 = require("../db/index");
const schema_1 = require("../db/schema");
const TOKEN_TTL_MS = 86_400_000; // 24 hours
async function generateToken(baseUrl) {
    const token = crypto_1.default.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await index_1.db.insert(schema_1.inviteTokens).values({ token, expiresAt });
    return { token, url: `${baseUrl}/join/${token}` };
}
async function validateToken(token) {
    const [entry] = await index_1.db.select({ expiresAt: schema_1.inviteTokens.expiresAt })
        .from(schema_1.inviteTokens)
        .where((0, drizzle_orm_1.eq)(schema_1.inviteTokens.token, token))
        .limit(1);
    if (!entry)
        return false;
    return entry.expiresAt.getTime() > Date.now();
}
async function revokeAllTokens() {
    await index_1.db.delete(schema_1.inviteTokens);
}
async function listTokens() {
    const rows = await index_1.db.select({
        token: schema_1.inviteTokens.token,
        createdAt: schema_1.inviteTokens.createdAt,
        usedBy: schema_1.inviteTokens.usedBy,
        expiresAt: schema_1.inviteTokens.expiresAt,
    }).from(schema_1.inviteTokens);
    return rows.map(r => ({
        token: r.token,
        createdAt: r.createdAt.getTime(),
        usedBy: r.usedBy,
        expiresAt: r.expiresAt.getTime(),
    }));
}
// ─── Admin cookie helpers (no DB needed) ─────────────────────────────────────
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
// ─── Cleanup expired tokens ───────────────────────────────────────────────────
async function purgeExpiredTokens() {
    await index_1.db.delete(schema_1.inviteTokens).where((0, drizzle_orm_1.lt)(schema_1.inviteTokens.expiresAt, new Date()));
}
