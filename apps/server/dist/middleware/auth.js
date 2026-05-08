"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCookies = parseCookies;
exports.sessionAuth = sessionAuth;
exports.adminAuth = adminAuth;
const users_1 = require("../services/users");
const tokens_1 = require("../services/tokens");
function parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader)
        return cookies;
    for (const pair of cookieHeader.split(';')) {
        const idx = pair.indexOf('=');
        if (idx < 0)
            continue;
        cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    }
    return cookies;
}
function sessionAuth(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    const username = (0, users_1.validateSession)(cookies['wj_session']);
    if (!username) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }
    req.sessionUsername = username;
    next();
}
function adminAuth(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    if ((0, users_1.isAdminSession)(cookies['wj_session'])) {
        next();
        return;
    }
    const adminCookie = cookies['wj_admin'];
    if (adminCookie && (0, tokens_1.verifyAdminCookie)(adminCookie, process.env['ADMIN_PASSWORD'] ?? '')) {
        next();
        return;
    }
    res.status(401).json({ error: 'Unauthorized' });
}
