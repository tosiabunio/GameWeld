import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Avatar, Logo } from '../components/Brand.tsx';
import { CommandPalette } from '../components/CommandPalette.tsx';
import { NotificationsBell } from '../components/NotificationsBell.tsx';
import { ProfileDialog } from '../components/ProfileDialog.tsx';
import { t } from '../i18n/index.ts';
import { useCurrentUser, useSession } from '../session.tsx';

/**
 * Common page chrome: brand link, section navigation, current user, and sign-out. `titleAction`
 * sits beside the title it belongs to, such as a project's settings beside the project's name.
 */
export function Shell({
  children,
  title,
  nav,
  titleAction,
}: {
  children: ReactNode;
  title?: ReactNode;
  nav?: ReactNode;
  titleAction?: ReactNode;
}) {
  const user = useCurrentUser();
  const { signOut } = useSession();
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();

  // Whoever signs in next starts from the projects list, not from a page of the last one's
  // project, which they may not belong to.
  async function leave() {
    await navigate('/', { replace: true });
    await signOut();
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Link to="/">
            <Logo />
            GameWeld
          </Link>
          {title && <span className="crumb">{title}</span>}
          {titleAction}
        </div>
        {nav}
        <div className="user">
          <Link to="/method" className="method-link" title={t('How GameWeld works: the method')}>
            {t('Method')}
          </Link>
          <CommandPalette />
          <NotificationsBell />
          <button
            type="button"
            className="me"
            title={t('Your profile and picture')}
            aria-haspopup="dialog"
            onClick={() => setProfileOpen(true)}
          >
            <Avatar name={user.displayName} url={user.avatarUrl} />
            <span data-testid="current-user">{user.displayName}</span>
          </button>
          <button type="button" className="quiet" onClick={() => void leave()}>
            {user.provider === 'mock' ? t('Switch persona') : t('Sign out')}
          </button>
        </div>
      </header>
      <main className="page">{children}</main>
      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}
    </div>
  );
}
