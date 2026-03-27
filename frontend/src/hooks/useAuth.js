import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authAPI } from '../utils/api';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await authAPI.login(email, password);
          localStorage.setItem('midp_token', data.token);
          set({ user: data.user, token: data.token, isLoading: false });
          return data;
        } catch (err) {
          const msg = err.response?.data?.error || 'Error de autenticación.';
          set({ error: msg, isLoading: false });
          throw new Error(msg);
        }
      },

      logout: () => {
        localStorage.removeItem('midp_token');
        localStorage.removeItem('midp_user');
        set({ user: null, token: null });
        window.location.href = '/login';
      },

      refreshUser: async () => {
        try {
          const { data } = await authAPI.me();
          set({ user: data });
        } catch {
          get().logout();
        }
      },

      isAdmin: () => get().user?.role === 'admin',
      isManagerUp: () => ['admin', 'bim_manager'].includes(get().user?.role),
    }),
    {
      name: 'midp_auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);

// Project store
export const useProjectStore = create((set) => ({
  currentProject: null,
  setCurrentProject: (project) => set({ currentProject: project }),
}));
