/// <reference types="vitest/globals" />
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the axios-based authApi BEFORE importing the store so that calling
// `logout()` inside the test does not perform a real network request.
vi.mock('../lib/api', () => ({
    authApi: {
        logout: vi.fn().mockResolvedValue({ data: { ok: true } }),
        login: vi.fn(),
        register: vi.fn(),
        me: vi.fn(),
    },
}));

import { useStore } from '../store';

describe('store / roomHostUsername', () => {
    beforeEach(() => {
        // Reset the store to a known baseline between tests.
        useStore.setState({
            user: null,
            isLoading: false,
            rooms: [],
            roomHostUsername: null,
        });
    });

    it('setRoomHostUsername updates the host username', () => {
        useStore.getState().setRoomHostUsername('alice');
        expect(useStore.getState().roomHostUsername).toBe('alice');

        useStore.getState().setRoomHostUsername('bob');
        expect(useStore.getState().roomHostUsername).toBe('bob');
    });

    it('setRoomHostUsername accepts null to clear the host', () => {
        useStore.getState().setRoomHostUsername('alice');
        useStore.getState().setRoomHostUsername(null);
        expect(useStore.getState().roomHostUsername).toBeNull();
    });

    it('logout resets roomHostUsername to null', async () => {
        useStore.setState({
            user: { username: 'alice', avatar: null, isAdmin: false },
            roomHostUsername: 'alice',
        });

        await useStore.getState().logout();

        const state = useStore.getState();
        expect(state.user).toBeNull();
        expect(state.roomHostUsername).toBeNull();
    });
});
