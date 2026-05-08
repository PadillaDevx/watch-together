import { io } from 'socket.io-client';

// Singleton — created once, survives React navigation
export const socket = io({ withCredentials: true, autoConnect: false });
