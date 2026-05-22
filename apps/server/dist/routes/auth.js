"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const users_1 = require("../services/users");
exports.authRouter = (0, express_1.Router)();
exports.authRouter.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: 'Faltan campos' });
        return;
    }
    if (username.length < 2 || username.length > 20) {
        res.status(400).json({ error: 'Nombre de 2-20 caracteres' });
        return;
    }
    if (password.length < 6) {
        res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });
        return;
    }
    if (/[<>"'&]/.test(username)) {
        res.status(400).json({ error: 'Nombre contiene caracteres no permitidos' });
        return;
    }
    try {
        const result = await (0, users_1.registerUser)(username, password);
        if (!result.ok) {
            res.status(result.code === 'USERNAME_TAKEN' ? 409 : 400).json({ error: result.code === 'USERNAME_TAKEN' ? 'El nombre de usuario ya existe' : 'Error al registrar' });
            return;
        }
        const loginResult = await (0, users_1.loginUser)(username, password);
        if (!loginResult.ok) {
            res.status(500).json({ error: 'Error al crear sesión' });
            return;
        }
        res.cookie('wj_session', loginResult.sessionToken, { httpOnly: true, sameSite: 'strict' });
        res.json({ ok: true, username, recoveryCode: result.recoveryCode });
    }
    catch {
        res.status(500).json({ error: 'Error interno' });
    }
});
exports.authRouter.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: 'Faltan campos' });
        return;
    }
    if (username === process.env['ADMIN_USERNAME'] && password === process.env['ADMIN_PASSWORD']) {
        const token = (0, users_1.createAdminSession)(username);
        res.cookie('wj_session', token, { httpOnly: true, sameSite: 'strict' });
        res.json({ ok: true, username, avatar: null, isAdmin: true });
        return;
    }
    try {
        const result = await (0, users_1.loginUser)(username, password);
        if (!result.ok) {
            res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
            return;
        }
        res.cookie('wj_session', result.sessionToken, { httpOnly: true, sameSite: 'strict' });
        res.json({ ok: true, username: result.username, avatar: result.avatar, isAdmin: false });
    }
    catch {
        res.status(500).json({ error: 'Error interno' });
    }
});
exports.authRouter.post('/logout', (req, res) => {
    (0, users_1.logoutSession)((0, auth_1.parseCookies)(req.headers.cookie)['wj_session']);
    res.clearCookie('wj_session');
    res.json({ ok: true });
});
exports.authRouter.get('/me', async (req, res) => {
    const cookies = (0, auth_1.parseCookies)(req.headers.cookie);
    const token = cookies['wj_session'];
    const username = (0, users_1.validateSession)(token);
    if (!username) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }
    try {
        const user = await (0, users_1.getUser)(username);
        res.json({ username, avatar: user?.avatar ?? null, isAdmin: (0, users_1.isAdminSession)(token), recoveryCode: user?.recoveryCode ?? null });
    }
    catch {
        res.status(500).json({ error: 'Error interno' });
    }
});
exports.authRouter.put('/password', auth_1.sessionAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        res.status(400).json({ error: 'Faltan campos' });
        return;
    }
    if (newPassword.length < 6) {
        res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });
        return;
    }
    try {
        const user = await (0, users_1.getUser)(req.sessionUsername);
        if (!user) {
            res.status(404).json({ error: 'Usuario no encontrado' });
            return;
        }
        const loginResult = await (0, users_1.loginUser)(req.sessionUsername, currentPassword);
        if (!loginResult.ok) {
            res.status(401).json({ error: 'Contraseña actual incorrecta' });
            return;
        }
        const result = await (0, users_1.changePassword)(req.sessionUsername, user.recoveryCode, newPassword);
        if (!result.ok) {
            res.status(400).json({ error: result.code });
            return;
        }
        res.json({ ok: true, newRecoveryCode: result.newRecoveryCode });
    }
    catch {
        res.status(500).json({ error: 'Error interno' });
    }
});
exports.authRouter.put('/avatar', auth_1.sessionAuth, async (req, res) => {
    const { avatar } = req.body;
    try {
        const result = await (0, users_1.updateAvatar)(req.sessionUsername, avatar ?? null);
        if (!result.ok) {
            res.status(result.code === 'AVATAR_TOO_LARGE' ? 413 : 400).json({ error: result.code });
            return;
        }
        res.json({ ok: true });
    }
    catch {
        res.status(500).json({ error: 'Error interno' });
    }
});
exports.authRouter.post('/recover', async (req, res) => {
    const { username, recoveryCode, newPassword } = req.body;
    if (!username || !recoveryCode || !newPassword) {
        res.status(400).json({ error: 'Faltan campos' });
        return;
    }
    if (newPassword.length < 6) {
        res.status(400).json({ error: 'Contraseña mínimo 6 caracteres' });
        return;
    }
    try {
        const result = await (0, users_1.changePassword)(username, recoveryCode, newPassword);
        if (!result.ok) {
            const status = result.code === 'INVALID_CODE' ? 401 : result.code === 'USER_NOT_FOUND' ? 404 : 400;
            const msgs = { INVALID_CODE: 'Código de recuperación incorrecto', USER_NOT_FOUND: 'Usuario no encontrado' };
            res.status(status).json({ error: msgs[result.code] ?? 'Error al recuperar cuenta' });
            return;
        }
        res.json({ ok: true, newRecoveryCode: result.newRecoveryCode });
    }
    catch {
        res.status(500).json({ error: 'Error interno' });
    }
});
