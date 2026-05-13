"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const crypto_1 = __importDefault(require("crypto"));
const drizzle_orm_1 = require("drizzle-orm");
const index_1 = require("./index");
const schema_1 = require("./schema");
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
async function seed() {
    console.log('[Seed] Starting...');
    const adminUsername = process.env['ADMIN_USERNAME'];
    const adminPassword = process.env['ADMIN_PASSWORD'];
    if (!adminUsername || !adminPassword) {
        console.warn('[Seed] ADMIN_USERNAME or ADMIN_PASSWORD not set, skipping admin user creation');
    }
    else {
        const existing = await index_1.db.select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.sql) `lower(${schema_1.users.username}) = lower(${adminUsername})`)
            .limit(1);
        if (existing.length === 0) {
            const salt = crypto_1.default.randomBytes(16).toString('hex');
            const passwordHash = hashPassword(adminPassword, salt);
            const recoveryCode = generateRecoveryCode();
            await index_1.db.insert(schema_1.users).values({
                username: adminUsername,
                passwordHash,
                passwordSalt: salt,
                recoveryCode,
                isAdmin: true,
                avatar: null,
            });
            console.log(`[Seed] Admin user '${adminUsername}' created`);
        }
        else {
            console.log(`[Seed] Admin user '${adminUsername}' already exists`);
        }
    }
    await index_1.db.insert(schema_1.appSettings)
        .values({ key: 'app_name', value: 'WatchJunto' })
        .onConflictDoNothing();
    console.log('[Seed] Done');
    process.exit(0);
}
seed().catch(err => {
    console.error('[Seed] Error:', err);
    process.exit(1);
});
