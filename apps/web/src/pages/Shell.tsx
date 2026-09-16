import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useCurrentUser, useSession } from '../session.tsx';

/** Common page chrome: brand link, current user, and sign-out. */
export function Shell({ children, title }: { children: ReactNode; title?: ReactNode }) {
  const user = useCurrentUser();
  const { signOut } = useSession();
  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <Link to="/">GameWeld</Link>
          {title && <span className="crumb">{title}</span>}
        </div>
        <div className="user">
          <span data-testid="current-user">{user.displayName}</span>
          <button type="button" onClick={() => void signOut()}>
            {user.provider === 'mock' ? 'Switch persona' : 'Sign out'}
          </button>
        </div>
      </header>
      {children}
    </main>
  );
}
