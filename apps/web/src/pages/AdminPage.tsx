import {
  ROLE_LABELS,
  type InstancePeople,
  type InstancePerson,
  type InstanceRole,
  type InviteResult,
} from '@gameweld/domain';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { api, ApiError } from '../api.ts';
import { t } from '../i18n/index.ts';
import { useSession } from '../session.tsx';
import { Shell } from './Shell.tsx';

/**
 * The instance's people, for its admins: who is admin, who may create projects (the instance's
 * Game Directors), who observes which projects (teachers following students' work, say), and
 * invitations for people who have not signed in yet. An admin also sees and manages every
 * project, from the projects list.
 */
export function AdminPage() {
  const { session } = useSession();
  const me = session.state === 'signed-in' ? session.user : null;
  const [data, setData] = useState<InstancePeople | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [as, setAs] = useState<InstanceRole>('director');
  const [projectIds, setProjectIds] = useState<string[]>([]);
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
      const res = await api.inviteToInstance({
        email: address,
        as,
        ...(as === 'observer' ? { projectIds } : {}),
      });
      setEmail('');
      setProjectIds([]);
      setNotice(describe(res, address));
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
            <option value="observer">{t('Observer: reads the projects you choose')}</option>
            <option value="admin">{t('Admin: may do everything')}</option>
          </select>
        </label>
        {as === 'observer' && (
          <fieldset className="roles" data-testid="observer-projects">
            <legend>{t('Projects to observe')}</legend>
            {data?.projects.length === 0 && (
              <p className="muted">{t('There are no team projects yet.')}</p>
            )}
            {data?.projects.map((p) => (
              <label key={p.id} className="check">
                <input
                  type="checkbox"
                  checked={projectIds.includes(p.id)}
                  onChange={(e) =>
                    setProjectIds(
                      e.target.checked
                        ? [...projectIds, p.id]
                        : projectIds.filter((id) => id !== p.id),
                    )
                  }
                />
                {p.name}
              </label>
            ))}
          </fieldset>
        )}
        <div className="row">
          <button
            type="submit"
            className="primary"
            disabled={email.trim() === '' || (as === 'observer' && projectIds.length === 0)}
          >
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
                  <td>
                    {p.memberships.length === 0 && <span className="muted">—</span>}
                    <ul className="plain-list">
                      {p.memberships.map((m) => (
                        <li key={m.projectId}>
                          {m.projectName}
                          <span className="muted">
                            {' · '}
                            {m.roles.map((r) => t(ROLE_LABELS[r])).join(', ')}
                          </span>
                          {m.roles.includes('observer') && (
                            <button
                              type="button"
                              className="link"
                              aria-label={t('Stop {name} observing {project}', {
                                name: p.displayName,
                                project: m.projectName,
                              })}
                              onClick={() => void run(() => api.removeMember(m.projectId, p.id))}
                            >
                              {t('Remove')}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.projectInvitations.length > 0 && (
            <>
              <h3>{t('Invited to projects, not signed in yet')}</h3>
              <table className="table" data-testid="project-invitations">
                <tbody>
                  {data.projectInvitations.map((i) => (
                    <tr key={i.id}>
                      <td>{i.email}</td>
                      <td>
                        {i.projectName}
                        <span className="muted">
                          {' · '}
                          {i.roles.map((r) => t(ROLE_LABELS[r])).join(', ')}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="link"
                          onClick={() => void run(() => api.cancelInvitation(i.projectId, i.id))}
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

/** What an invitation did, in a sentence for the admin. */
function describe(res: InviteResult, email: string): string {
  const skipped = res.skipped.length
    ? ' ' +
      t('Left alone, as they were already there: {projects}.', {
        projects: res.skipped.join(', '),
      })
    : '';
  if (res.person) return t('{email} has it now.', { email }) + skipped;
  if (res.invitation || res.projectInvitations.length)
    return (
      t(
        '{email} is invited. GameWeld sends no e-mail: tell them to sign in at {address} with that Google account.',
        { email, address: window.location.origin },
      ) + skipped
    );
  return t('Nothing to do: {email} was already there.', { email });
}
