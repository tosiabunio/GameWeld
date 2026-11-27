import type { CurrentUser } from '@gameweld/domain';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import { api, onSignedOut } from './api.ts';

export type Session =
  | { state: 'loading' }
  | { state: 'anonymous' }
  | { state: 'signed-in'; user: CurrentUser }
  /** The server could not be asked who is signed in. */
  | { state: 'unreachable' };

interface SessionContextValue {
  session: Session;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ state: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const user = await api.me();
      setSession(user ? { state: 'signed-in', user } : { state: 'anonymous' });
    } catch (e) {
      // Before anyone is known, the failure is shown, with a way to try again, instead of
      // "Loading…" for good. Later, a failed refresh leaves the session as it was.
      setSession((s) =>
        s.state === 'loading' || s.state === 'unreachable' ? { state: 'unreachable' } : s,
      );
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.signOut();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  // A request refused with 401 means the session is over, whatever this tab still shows.
  // Whoever signs in next starts from the projects list, as after signing out: the page this tab
  // was on may be of a project that is not theirs, or that went with a demo reset. The method
  // is for anyone, so a reader of it stays there.
  const navigate = useNavigate();
  const signedIn = useRef(false);
  signedIn.current = session.state === 'signed-in';
  useEffect(() => {
    onSignedOut(() => {
      // Several requests may be refused at once; the first of them ends the session.
      if (!signedIn.current) return;
      signedIn.current = false;
      setSession({ state: 'anonymous' });
      if (window.location.pathname !== '/method') void navigate('/', { replace: true });
    });
    return () => onSignedOut(null);
  }, [navigate]);

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
