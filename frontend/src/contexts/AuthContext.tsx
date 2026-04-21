import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import api from '@/lib/api';
import { queryClient } from '@/lib/queryClient';

interface User {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  avatarUrl: string | null;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Decode JWT payload without verifying signature — safe for client-side hydration only. */
function decodeJwtPayload(token: string): { sub: string; email: string; displayName: string; exp: number } | null {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded;
  } catch {
    return null;
  }
}

function getUserFromToken(token: string): User | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  // Reject if already expired
  if (payload.exp * 1000 < Date.now()) return null;
  return { id: payload.sub, email: payload.email, displayName: payload.displayName, phone: null, avatarUrl: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Hydrate synchronously from the stored JWT so there is no flash-to-login on reload.
  const [user, setUser] = useState<User | null>(() => {
    const token = localStorage.getItem('access_token');
    return token ? getUserFromToken(token) : null;
  });
  // If we already have a user from the token we don't need to show the loading spinner.
  const [isLoading, setIsLoading] = useState(() => {
    const token = localStorage.getItem('access_token');
    return !token || getUserFromToken(token) === null;
  });

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setIsLoading(false);
      return;
    }
    // Background validation — updates user with fresh server data.
    // Only clears the token on an explicit 401 (bad/revoked token),
    // not on network errors (backend temporarily down in dev).
    api
      .get('/users/me')
      .then(({ data }) => {
        setUser({
          id: data.id,
          email: data.email,
          displayName: data.displayName,
          phone: data.phone ?? null,
          avatarUrl: data.avatarUrl ?? null,
        });
        setIsLoading(false);
      })
      .catch((err) => {
        if (err?.response?.status === 401) {
          localStorage.removeItem('access_token');
          setUser(null);
        }
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post(
      '/auth/login',
      { email, password },
      { withCredentials: true },
    );
    localStorage.setItem('access_token', data.accessToken);
    setUser(data.user ?? getUserFromToken(data.accessToken));
    // Fetch full profile in background (phone, avatarUrl)
    api.get('/users/me').then(({ data: p }) => {
      setUser({ id: p.id, email: p.email, displayName: p.displayName, phone: p.phone ?? null, avatarUrl: p.avatarUrl ?? null });
    }).catch(() => {});
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const { data } = await api.post(
        '/auth/register',
        { email, password, displayName },
        { withCredentials: true },
      );
      localStorage.setItem('access_token', data.accessToken);
      setUser(data.user ?? getUserFromToken(data.accessToken));
      // Fetch full profile in background
      api.get('/users/me').then(({ data: p }) => {
        setUser({ id: p.id, email: p.email, displayName: p.displayName, phone: p.phone ?? null, avatarUrl: p.avatarUrl ?? null });
      }).catch(() => {});
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', null, { withCredentials: true });
    } catch {
      // silent fail
    }
    localStorage.removeItem('access_token');
    queryClient.clear();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await api.get('/users/me');
    setUser({
      id: data.id,
      email: data.email,
      displayName: data.displayName,
      phone: data.phone ?? null,
      avatarUrl: data.avatarUrl ?? null,
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
