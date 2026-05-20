import { create } from 'zustand';
import type { User, Room } from './types';
import { authApi } from './lib/api';

interface AppStore {
  user: User | null;
  isLoading: boolean;
  rooms: Room[];
  /**
   * Username of the current host for the active room, or null when the user
   * is not in a room or no host is set. Updated reactively by `host-changed`
   * socket events so all participants render the same host badge.
   */
  roomHostUsername: string | null;
  setUser: (user: User | null) => void;
  setRooms: (rooms: Room[]) => void;
  /**
   * Update the current room host username. Pass `null` when leaving the room
   * or when the host identity is unknown.
   */
  setRoomHostUsername: (username: string | null) => void;
  fetchMe: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<{ recoveryCode: string }>;
  logout: () => Promise<void>;
}

export const useStore = create<AppStore>((set) => ({
  user: null,
  isLoading: true,
  rooms: [],
  roomHostUsername: null,

  setUser: (user) => set({ user }),
  setRooms: (rooms) => set({ rooms }),
  setRoomHostUsername: (username) => set({ roomHostUsername: username }),

  fetchMe: async () => {
    try {
      const { data } = await authApi.me();
      set({ user: { username: data.username, avatar: data.avatar, isAdmin: data.isAdmin, recoveryCode: data.recoveryCode }, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  },

  login: async (username, password) => {
    const { data } = await authApi.login(username, password);
    set({ user: { username: data.username, avatar: data.avatar, isAdmin: data.isAdmin } });
  },

  register: async (username, password) => {
    const { data } = await authApi.register(username, password);
    set({ user: { username: data.username, avatar: null, isAdmin: false } });
    return { recoveryCode: data.recoveryCode };
  },

  logout: async () => {
    await authApi.logout();
    set({ user: null, roomHostUsername: null });
  },
}));
