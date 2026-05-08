"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUser = registerUser;
exports.loginUser = loginUser;
exports.validateSession = validateSession;
exports.logoutSession = logoutSession;
exports.createAdminSession = createAdminSession;
exports.isAdminSession = isAdminSession;
exports.updateAvatar = updateAvatar;
exports.getUser = getUser;
exports.listUsers = listUsers;
exports.changePassword = changePassword;
const crypto_1 = __importDefault(require("crypto"));
const users = new Map();
const sessions = new Map();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_AVATAR_SIZE = 700_000;
function hashPassword(password, salt) {
    return crypto_1.default.pbkdf2Sync(password, salt, 100_000, 64, 'sha256').toString('hex');
}
function generateRecoveryCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto_1.default.randomBytes(10);
    let code = '';
    for (let i = 0; i < 10; i++)
        code += chars[bytes[i] % chars.length];
    return code.slice(0, 5) + '-' + code.slice(5);
}
function registerUser(username, password) {
    const key = username.toLowerCase();
    if (users.has(key))
        return { ok: false, code: 'USERNAME_TAKEN' };
    const salt = crypto_1.default.randomBytes(16).toString('hex');
    const recoveryCode = generateRecoveryCode();
    users.set(key, {
        username,
        passwordHash: hashPassword(password, salt),
        passwordSalt: salt,
        recoveryCode,
        avatar: null,
        createdAt: Date.now(),
    });
    return { ok: true, recoveryCode };
}
function loginUser(username, password) {
    const user = users.get(username.toLowerCase());
    if (!user)
        return { ok: false, code: 'INVALID_CREDENTIALS' };
    const hash = hashPassword(password, user.passwordSalt);
    try {
        if (!crypto_1.default.timingSafeEqual(Buffer.from(hash), Buffer.from(user.passwordHash))) {
            return { ok: false, code: 'INVALID_CREDENTIALS' };
        }
    }
    catch {
        return { ok: false, code: 'INVALID_CREDENTIALS' };
    }
    const token = crypto_1.default.randomBytes(32).toString('hex');
    sessions.set(token, { username: user.username, createdAt: Date.now() });
    return { ok: true, sessionToken: token, username: user.username, avatar: user.avatar };
}
function validateSession(token) {
    if (!token)
        return null;
    const s = sessions.get(token);
    if (!s)
        return null;
    if (Date.now() - s.createdAt > SESSION_TTL_MS) {
        sessions.delete(token);
        return null;
    }
    return s.username;
}
function logoutSession(token) {
    if (token)
        sessions.delete(token);
}
function createAdminSession(username) {
    const token = crypto_1.default.randomBytes(32).toString('hex');
    sessions.set(token, { username, isAdmin: true, createdAt: Date.now() });
    return token;
}
function isAdminSession(token) {
    if (!token)
        return false;
    return sessions.get(token)?.isAdmin === true;
}
function updateAvatar(username, avatarDataUrl) {
    const user = users.get(username.toLowerCase());
    if (!user)
        return { ok: false, code: 'USER_NOT_FOUND' };
    if (avatarDataUrl && !avatarDataUrl.startsWith('data:image/')) {
        return { ok: false, code: 'INVALID_AVATAR' };
    }
    if (avatarDataUrl && avatarDataUrl.length > MAX_AVATAR_SIZE) {
        return { ok: false, code: 'AVATAR_TOO_LARGE' };
    }
    user.avatar = avatarDataUrl ?? null;
    return { ok: true };
}
function getUser(username) {
    const u = users.get(username.toLowerCase());
    if (!u)
        return null;
    return { username: u.username, avatar: u.avatar, recoveryCode: u.recoveryCode, createdAt: u.createdAt };
}
function listUsers() {
    return Array.from(users.values()).map(u => ({
        username: u.username,
        avatar: u.avatar,
        recoveryCode: u.recoveryCode,
        createdAt: u.createdAt,
    }));
}
function changePassword(username, recoveryCode, newPassword) {
    const user = users.get(username.toLowerCase());
    if (!user)
        return { ok: false, code: 'USER_NOT_FOUND' };
    if (user.recoveryCode !== recoveryCode)
        return { ok: false, code: 'INVALID_CODE' };
    const salt = crypto_1.default.randomBytes(16).toString('hex');
    user.passwordHash = hashPassword(newPassword, salt);
    user.passwordSalt = salt;
    const newRecoveryCode = generateRecoveryCode();
    user.recoveryCode = newRecoveryCode;
    return { ok: true, newRecoveryCode };
}
