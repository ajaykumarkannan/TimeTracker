import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User } from '../types';
import { api, getStoredUser, clearTokens, setStoredUser, onAuthStateChange, restoreSession } from '../api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  clearSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Handle unexpected auth state changes (e.g., server restart invalidating refresh tokens)
  useEffect(() => {
    const unsubscribe = onAuthStateChange((_reason) => {
      // Only set session expired if user was actually logged in
      if (user) {
        setUser(null);
        setSessionExpired(true);
      }
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    const storedUser = getStoredUser();
    if (storedUser) {
      // Try to restore session via HttpOnly refresh cookie
      restoreSession()
        .then(data => {
          if (data) {
            setUser(data.user);
          } else {
            // Cookie-based refresh failed — session is truly expired
            clearTokens();
            setUser(null);
            setSessionExpired(true);
          }
        })
        .catch(() => {
          clearTokens();
          setUser(null);
          setSessionExpired(true);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string, rememberMe?: boolean) => {
    const response = await api.login(email, password, rememberMe);
    setUser(response.user);
    setSessionExpired(false);
  };

  const register = async (email: string, name: string, password: string) => {
    const response = await api.register(email, name, password);
    setUser(response.user);
    setSessionExpired(false);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    // Don't set sessionExpired on intentional logout
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    setStoredUser(updatedUser);
  };

  const clearSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      sessionExpired, 
      login, 
      register, 
      logout, 
      updateUser,
      clearSessionExpired 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
