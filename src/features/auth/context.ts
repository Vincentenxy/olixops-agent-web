import { createContext, useContext } from 'react';
import type { SessionSnapshot, SessionStore } from './session';

export const AuthContext = createContext<(SessionSnapshot & { session: SessionStore }) | null>(
  null,
);
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('Authentication provider is required');
  return context;
}
