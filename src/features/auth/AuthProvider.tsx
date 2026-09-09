import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthContext } from './context';
import { session as defaultSession, type SessionStore } from './session';

export function AuthProvider({
  children,
  session = defaultSession,
}: {
  children: ReactNode;
  session?: SessionStore;
}) {
  const client = useQueryClient();
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => {
    let generation = session.getSnapshot().generation;
    const unsubscribe = session.subscribe(() => {
      const next = session.getSnapshot().generation;
      if (next !== generation) {
        generation = next;
        client.clear();
      }
    });
    void session.restore();
    return unsubscribe;
  }, [client, session]);
  return <AuthContext value={{ ...snapshot, session }}>{children}</AuthContext>;
}
