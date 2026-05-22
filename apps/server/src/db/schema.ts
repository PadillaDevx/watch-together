import { pgTable, uuid, varchar, boolean, timestamp, integer, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  username: varchar('username', { length: 50 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 128 }).notNull(),
  passwordSalt: varchar('password_salt', { length: 32 }).notNull(),
  recoveryCode: varchar('recovery_code', { length: 11 }).notNull(),
  avatar: text('avatar'),
  isAdmin: boolean('is_admin').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const inviteTokens = pgTable('invite_tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  token: varchar('token', { length: 64 }).unique().notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  usedBy: uuid('used_by').references(() => users.id),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull(),
  maxUsers: integer('max_users').default(10).notNull(),
  isOpen: boolean('is_open').default(true).notNull(),
  pin: varchar('pin', { length: 6 }),
  sourceType: varchar('source_type', { length: 20 }).default('youtube').notNull(),
  iptvListId: varchar('iptv_list_id', { length: 36 }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const roomQueue = pgTable('room_queue', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'cascade' }).notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  title: varchar('title', { length: 255 }),
  videoId: varchar('video_id', { length: 50 }),
  streamUrl: text('stream_url'),
  thumbnail: text('thumbnail'),
  addedBy: varchar('added_by', { length: 50 }),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const iptvLists = pgTable('iptv_lists', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull(),
  url: text('url').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  lastFetched: timestamp('last_fetched'),
  entryCount: integer('entry_count').default(0).notNull(),
  addedBy: uuid('added_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const jellyfinConfig = pgTable('jellyfin_config', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  serverUrl: text('server_url').notNull(),
  apiKey: varchar('api_key', { length: 255 }).notNull(),
  isActive: boolean('is_active').default(false).notNull(),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const appSettings = pgTable('app_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  token: varchar('token', { length: 64 }).primaryKey(),
  username: varchar('username', { length: 50 }).notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});
