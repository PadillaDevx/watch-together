import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from './socket-types';

/**
 * Strongly-typed Socket.IO client.
 *
 * Generics ensure that `socket.emit(event, payload)` and `socket.on(event,
 * handler)` are checked against the contract in `./socket-types.ts`.
 *
 * Singleton — created once, survives React navigation.
 */
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  withCredentials: true,
  autoConnect: false,
});
