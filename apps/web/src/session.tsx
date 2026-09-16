import type { CurrentUser } from '@gameweld/domain';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api.ts';

export type Session =
  { state: 'loading' } | { state: 'anonymous' } | { state: 'signed-in'; user: CurrentUser };

interface SessionContextValue {
  session: Session;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ state: 'loading' });

  const refresh = useCallback(async () => {
    const user = await api.me();
    setSession(user ? { state: 'signed-in', user } : { state: 'anonymous' });
  }, []);

  const signOut = useCallback(async () => {
    await api.signOut();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ session, refresh, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

/** The signed-in user; only valid inside routes that require a session. */
export function useCurrentUser(): CurrentUser {
  const { session } = useSession();
  if (session.state !== 'signed-in') throw new Error('no signed-in user');
  return session.user;
}
