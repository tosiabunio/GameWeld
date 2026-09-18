import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Avatar, Logo } from '../components/Brand.tsx';
import { useCurrentUser, useSession } from '../session.tsx';

/** Common page chrome: brand link, section navigation, current user, and sign-out. */
export function Shell({
  children,
  title,
  nav,
}: {
  children: ReactNode;
  title?: ReactNode;
  nav?: ReactNode;
}) {
  const user = useCurrentUser();
  const { signOut } = useSession();
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Link to="/">
            <Logo />
            GameWeld
          </Link>
          {title && <span className="crumb">{title}</span>}
        </div>
        {nav}
        <div className="user">
          <Link to="/profile" className="me" title="Your profile and picture">
            <Avatar name={user.displayName} url={user.avatarUrl} />
            <span data-testid="current-user">{user.displayName}</span>
          </Link>
          <button type="button" className="quiet" onClick={() => void signOut()}>
            {user.provider === 'mock' ? 'Switch persona' : 'Sign out'}
          </button>
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}
