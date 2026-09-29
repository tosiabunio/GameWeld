import type { InstancePeople, InstancePerson, InstanceRole } from '@gameweld/domain';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { api, ApiError } from '../api.ts';
import { t } from '../i18n/index.ts';
import { useSession } from '../session.tsx';
import { Shell } from './Shell.tsx';

/**
 * The instance's people, for its admins: who is admin, who may create projects (the instance's
 * Game Directors), and invitations for people who have not signed in yet. An admin also sees and
 * manages every project, from the projects list.
 */
export function AdminPage() {
  const { session } = useSession();
  const me = session.state === 'signed-in' ? session.user : null;
  const [data, setData] = useState<InstancePeople | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [as, setAs] = useState<InstanceRole>('director');
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.instancePeople());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('Something went wrong'));
    }
  }, []);
  useEffect(() => {
    if (me?.isAdmin) void load();
  }, [me?.isAdmin, load]);

  if (!me?.isAdmin) return <Navigate to="/" replace />;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setNotice(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('Something went wrong'));
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    const address = email.trim();
    await run(async () => {
      const res = await api.inviteToInstance({ email: address, as });
      setEmail('');
      setNotice(
        'projectCount' in res
          ? t('{email} has it now.', { email: address })
          : t(
              '{email} is invited. GameWeld sends no e-mail: tell them to sign in at {address} with that Google account.',
              { email: address, address: window.location.origin },
            ),
      );
    });
  }

  const toggle = (p: InstancePerson, change: { isAdmin?: boolean; canCreateProjects?: boolean }) =>
    run(() => api.updateInstancePerson(p.id, change));

  return (
    <Shell title={t('Administration')}>
      <h2>{t('Administration')}</h2>
      <p className="muted">
        {t(
          'Admins may do everything: they see and manage every project, member or not. Game Directors here may create projects, and lead them. The demo personas are not listed.',
        )}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <form className="form" onSubmit={invite} aria-label={t('Invite')}>
        <h3>{t('Invite')}</h3>
        <label>
          {t('Email')}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="instance-invite-email"
          />
        </label>
        <label>
          {t('As')}
          <select value={as} onChange={(e) => setAs(e.target.value as InstanceRole)}>
            <option value="director">{t('Game Director: may create projects')}</option>
            <option value="admin">{t('Admin: may do everything')}</option>
          </select>
        </label>
        <div className="row">
          <button type="submit" className="primary" disabled={email.trim() === ''}>
            {t('Invite')}
          </button>
        </div>
        {notice && (
          <p className="hint ok" role="status">
            {notice}
          </p>
        )}
      </form>

      {data === null ? (
        <p>{t('Loading…')}</p>
      ) : (
        <>
          <h3>{t('People')}</h3>
          <table className="table" data-testid="instance-people">
            <thead>
              <tr>
                <th>{t('Person')}</th>
                <th>{t('Admin')}</th>
                <th>{t('May create projects')}</th>
                <th>{t('Projects')}</th>
              </tr>
            </thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.id} data-testid={`person-${p.email ?? p.id}`}>
                  <td>
                    {p.displayName}
                    {p.id === me.id && <span className="muted"> {t('(you)')}</span>}
                    <br />
                    <span className="muted">{p.email}</span>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={t('{name} is admin', { name: p.displayName })}
                      checked={p.isAdmin}
                      onChange={(e) => void toggle(p, { isAdmin: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={t('{name} may create projects', { name: p.displayName })}
                      checked={p.canCreateProjects || p.isAdmin}
                      disabled={p.isAdmin}
                      onChange={(e) => void toggle(p, { canCreateProjects: e.target.checked })}
                    />
                  </td>
                  <td>{p.projectCount}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.invitations.length > 0 && (
            <>
              <h3>{t('Invited, not signed in yet')}</h3>
              <table className="table" data-testid="instance-invitations">
                <tbody>
                  {data.invitations.map((i) => (
                    <tr key={i.id}>
                      <td>{i.email}</td>
                      <td>{i.isAdmin ? t('Admin') : t('Game Director: may create projects')}</td>
                      <td>
                        <button
                          type="button"
                          className="link"
                          onClick={() => void run(() => api.cancelInstanceInvitation(i.id))}
                        >
                          {t('Cancel invitation')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
