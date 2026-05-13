import 'dotenv/config';
import crypto from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from './index';
import { users, appSettings } from './schema';

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100_000, 64, 'sha256').toString('hex');
}

function generateRecoveryCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  let code = '';
  for (let i = 0; i < 10; i++) code += chars[bytes[i]! % chars.length];
  return code.slice(0, 5) + '-' + code.slice(5);
}

async function seed() {
  console.log('[Seed] Starting...');

  const adminUsername = process.env['ADMIN_USERNAME'];
  const adminPassword = process.env['ADMIN_PASSWORD'];

  if (!adminUsername || !adminPassword) {
    console.warn('[Seed] ADMIN_USERNAME or ADMIN_PASSWORD not set, skipping admin user creation');
  } else {
    const existing = await db.select()
      .from(users)
      .where(sql`lower(${users.username}) = lower(${adminUsername})`)
      .limit(1);

    if (existing.length === 0) {
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(adminPassword, salt);
      const recoveryCode = generateRecoveryCode();

      await db.insert(users).values({
        username: adminUsername,
        passwordHash,
        passwordSalt: salt,
        recoveryCode,
        isAdmin: true,
        avatar: null,
      });
      console.log(`[Seed] Admin user '${adminUsername}' created`);
    } else {
      console.log(`[Seed] Admin user '${adminUsername}' already exists`);
    }
  }

  await db.insert(appSettings)
    .values({ key: 'app_name', value: 'WatchJunto' })
    .onConflictDoNothing();

  console.log('[Seed] Done');
  process.exit(0);
}

seed().catch(err => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
