"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appSettings = exports.jellyfinConfig = exports.iptvLists = exports.roomQueue = exports.rooms = exports.inviteTokens = exports.users = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.uuid)('id').primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    username: (0, pg_core_1.varchar)('username', { length: 50 }).unique().notNull(),
    passwordHash: (0, pg_core_1.varchar)('password_hash', { length: 128 }).notNull(),
    passwordSalt: (0, pg_core_1.varchar)('password_salt', { length: 32 }).notNull(),
    recoveryCode: (0, pg_core_1.varchar)('recovery_code', { length: 11 }).notNull(),
    avatar: (0, pg_core_1.text)('avatar'),
    isAdmin: (0, pg_core_1.boolean)('is_admin').default(false).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.inviteTokens = (0, pg_core_1.pgTable)('invite_tokens', {
    id: (0, pg_core_1.uuid)('id').primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    token: (0, pg_core_1.varchar)('token', { length: 64 }).unique().notNull(),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => exports.users.id),
    usedBy: (0, pg_core_1.uuid)('used_by').references(() => exports.users.id),
    expiresAt: (0, pg_core_1.timestamp)('expires_at').notNull(),
    usedAt: (0, pg_core_1.timestamp)('used_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.rooms = (0, pg_core_1.pgTable)('rooms', {
    id: (0, pg_core_1.uuid)('id').primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    maxUsers: (0, pg_core_1.integer)('max_users').default(10).notNull(),
    isOpen: (0, pg_core_1.boolean)('is_open').default(true).notNull(),
    pin: (0, pg_core_1.varchar)('pin', { length: 6 }),
    sourceType: (0, pg_core_1.varchar)('source_type', { length: 20 }).default('youtube').notNull(),
    iptvListId: (0, pg_core_1.varchar)('iptv_list_id', { length: 36 }),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => exports.users.id),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.roomQueue = (0, pg_core_1.pgTable)('room_queue', {
    id: (0, pg_core_1.uuid)('id').primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    roomId: (0, pg_core_1.uuid)('room_id').references(() => exports.rooms.id, { onDelete: 'cascade' }).notNull(),
    type: (0, pg_core_1.varchar)('type', { length: 20 }).notNull(),
    title: (0, pg_core_1.varchar)('title', { length: 255 }),
    videoId: (0, pg_core_1.varchar)('video_id', { length: 50 }),
    streamUrl: (0, pg_core_1.text)('stream_url'),
    thumbnail: (0, pg_core_1.text)('thumbnail'),
    addedBy: (0, pg_core_1.varchar)('added_by', { length: 50 }),
    position: (0, pg_core_1.integer)('position').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.iptvLists = (0, pg_core_1.pgTable)('iptv_lists', {
    id: (0, pg_core_1.uuid)('id').primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    url: (0, pg_core_1.text)('url').notNull(),
    isActive: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    lastFetched: (0, pg_core_1.timestamp)('last_fetched'),
    entryCount: (0, pg_core_1.integer)('entry_count').default(0).notNull(),
    addedBy: (0, pg_core_1.uuid)('added_by').references(() => exports.users.id),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.jellyfinConfig = (0, pg_core_1.pgTable)('jellyfin_config', {
    id: (0, pg_core_1.uuid)('id').primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    serverUrl: (0, pg_core_1.text)('server_url').notNull(),
    apiKey: (0, pg_core_1.varchar)('api_key', { length: 255 }).notNull(),
    isActive: (0, pg_core_1.boolean)('is_active').default(false).notNull(),
    verifiedAt: (0, pg_core_1.timestamp)('verified_at'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.appSettings = (0, pg_core_1.pgTable)('app_settings', {
    key: (0, pg_core_1.varchar)('key', { length: 100 }).primaryKey(),
    value: (0, pg_core_1.text)('value').notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
