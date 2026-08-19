import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

import { api } from './client';

const TOKEN_KEY = 'inventory.token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [email, setEmail] = useState(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(TOKEN_KEY);
        if (saved) {
          const profile = await api.me(saved);
          setToken(saved);
          setEmail(profile.email);
        }
      } catch (e) {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  const value = useMemo(
    () => ({
      token,
      email,
      restoring,
      signIn: async (userEmail, password) => {
        const result = await api.login(userEmail, password);
        await SecureStore.setItemAsync(TOKEN_KEY, result.access_token);
        setToken(result.access_token);
        setEmail(userEmail);
      },
      signUp: async (userEmail, password) => {
        await api.register(userEmail, password);
      },
      signOut: async () => {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        setToken(null);
        setEmail(null);
      },
    }),
    [token, email, restoring],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
