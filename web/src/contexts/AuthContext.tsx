import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  branches?: { id: string; name: string; code: string }[];
  permissions?: string[];
}

interface AuthContextType {
  user: User | null;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  isOwner: boolean;
  login: (userData: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  permissions: [],
  hasPermission: () => false,
  isOwner: false,
  login: () => {},
  logout: () => {}
});

// Global fetch interceptor to handle 401 responses
// (portal endpoints are excluded — the members portal manages its own session)
const originalFetch = window.fetch;
window.fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
  const res = await originalFetch(input, init);
  if (res.status === 401) {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : input instanceof URL ? input.href : '');
    if (!url.includes('/api/portal')) {
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
  }
  return res;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  // Refresh permissions from the server so owner edits take effect without re-login
  useEffect(() => {
    if (!user) return;
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.user?.permissions) {
          setUser((prev: User | null) => {
            if (!prev) return prev;
            const updated = { ...prev, permissions: data.user.permissions };
            localStorage.setItem('user', JSON.stringify(updated));
            return updated;
          });
        }
      })
      .catch(() => {});
  }, []);

  const permissions = user?.permissions || [];
  const isOwner = user?.role === 'OWNER';

  const hasPermission = (permission: string) => {
    if (!user) return false;
    if (isOwner) return true;
    return permissions.includes(permission);
  };

  const login = (userData: User) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, permissions, hasPermission, isOwner, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
