import type { ProjectInvitation, ProjectMember, ProjectRole, UserSummary } from '@gameweld/domain';
import { PROJECT_ROLES, ROLE_LABELS } from '@gameweld/domain';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../api.ts';
import { TransferPanel } from '../components/TransferPanel.tsx';
import { t } from '../i18n/index.ts';
import { useCurrentUser } from '../session.tsx';
import { useProject } from './ProjectPage.tsx';

export function SettingsPage() {
  const { project } = useProject();
  const canEdit = project.permissions['project.settings'];
  return (
    <>
      <section className="panel" aria-labelledby="settings-heading">
        <h2 id="settings-heading">{t('Settings')}</h2>
        {!canEdit && <p className="muted">{t('Only a Game Director can change settings.')}</p>}
        <SettingsForm readOnly={!canEdit} />
      </section>
      <section className="panel" aria-labelledby="members-heading">
        <h2 id="members-heading">{t('Members')}</h2>
        <MembersTable readOnly={!project.permissions['members.manage']} />
        {project.invitations.length > 0 && (
          <InvitationsTable readOnly={!project.permissions['members.manage']} />
        )}
        {project.permissions['members.manage'] && <AddMemberForm />}
      </section>
      {canEdit && <TransferPanel />}
      {canEdit && <DangerZone />}
    </>
  );
}

function SettingsForm({ readOnly }: { readOnly: boolean }) {
  const { project, reload } = useProject();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [scopeLimit, setScopeLimit] = useState(project.scopeLimit);
  const [doneRestricted, setDoneRestricted] = useState(project.doneRestricted);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setName(project.name);
    setDescription(project.description);
    setScopeLimit(project.scopeLimit);
    setDoneRestricted(project.doneRestricted);
  }, [project]);

  const dirty =
    name !== project.name ||
    description !== project.description ||
    scopeLimit !== project.scopeLimit ||
    doneRestricted !== project.doneRestricted;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    try {
      await api.updateProject(project.id, {
        version: project.version,
        name,
        description,
        scopeLimit,
        doneRestricted,
      });
      await reload();
      setStatus({ kind: 'ok', text: t('Settings saved.') });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await reload();
        setStatus({
          kind: 'error',
          text: `${err.message} ${t('Your unsaved changes were replaced with the current values.')}`,
        });
      } else {
        setStatus({
          kind: 'error',
          text: err instanceof ApiError ? err.message : t('Could not save'),
        });
      }
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        {t('Name')}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={200}
          readOnly={readOnly}
        />
      </label>
      <label>
        {t('Description')}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          readOnly={readOnly}
        />
      </label>
      <label>
        {t('Workboard scope limit')}
        <input
          type="number"
          min={1}
          max={1000}
          value={scopeLimit}
          onChange={(e) => setScopeLimit(Number(e.target.value))}
          readOnly={readOnly}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={doneRestricted}
          onChange={(e) => setDoneRestricted(e.target.checked)}
          disabled={readOnly}
          data-testid="done-restricted"
        />
        {t('Restrict moving tasks into Done to Testers')}
      </label>
      {status && <p className={status.kind === 'ok' ? 'ok' : 'error'}>{status.text}</p>}
      {!readOnly && (
        <div className="row">
          <button type="submit" className="primary" disabled={!dirty}>
            {t('Save settings')}
          </button>
        </div>
      )}
    </form>
  );
}

function MembersTable({ readOnly }: { readOnly: boolean }) {
  const { project, reload } = useProject();
  const me = useCurrentUser();
  const [error, setError] = useState<string | null>(null);

  async function update(
    member: ProjectMember,
    patch: { roles?: ProjectRole[]; canAccept?: boolean },
  ) {
    setError(null);
    if (patch.roles && patch.roles.length === 0) {
      setError(t('A member needs at least one role. Remove the member instead.'));
      return;
    }
    try {
      await api.updateMember(project.id, member.userId, patch);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not update the member'));
    }
  }

  async function remove(member: ProjectMember) {
    setError(null);
    try {
      await api.removeMember(project.id, member.userId);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not remove the member'));
    }
  }

  return (
    <>
      {error && <p className="error">{error}</p>}
      <table className="table" data-testid="members-table">
        <thead>
          <tr>
            <th>{t('Member')}</th>
            {PROJECT_ROLES.map((r) => (
              <th key={r}>{t(ROLE_LABELS[r])}</th>
            ))}
            <th>{t('May accept items')}</th>
            {!readOnly && <th />}
          </tr>
        </thead>
        <tbody>
          {project.members.map((m) => (
            <tr key={m.userId} data-testid={`member-${m.email ?? m.userId}`}>
              <td>
                <strong>{m.displayName}</strong>
                {m.userId === me.id && <span className="muted"> {t('(you)')}</span>}
                <br />
                <span className="muted">{m.email}</span>
              </td>
              {PROJECT_ROLES.map((r) => (
                <td key={r}>
                  <input
                    type="checkbox"
                    aria-label={t('{name} is {role}', {
                      name: m.displayName,
                      role: t(ROLE_LABELS[r]),
                    })}
                    checked={m.roles.includes(r)}
                    disabled={readOnly}
                    onChange={(e) =>
                      void update(m, {
                        roles: e.target.checked ? [...m.roles, r] : m.roles.filter((x) => x !== r),
                      })
                    }
                  />
                </td>
              ))}
              <td>
                <input
                  type="checkbox"
                  aria-label={t('{name} may accept items', { name: m.displayName })}
                  checked={m.canAccept}
                  disabled={readOnly || m.roles.includes('director')}
                  title={
                    m.roles.includes('director') ? t('Game Directors always may accept') : undefined
                  }
                  onChange={(e) => void update(m, { canAccept: e.target.checked })}
                />
              </td>
              {!readOnly && (
                <td>
                  <button
                    type="button"
                    onClick={() => void remove(m)}
                    aria-label={t('Remove {name}', { name: m.displayName })}
                  >
                    {t('Remove')}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function InvitationsTable({ readOnly }: { readOnly: boolean }) {
  const { project, reload } = useProject();
  const [error, setError] = useState<string | null>(null);

  async function cancel(invitation: ProjectInvitation) {
    setError(null);
    try {
      await api.cancelInvitation(project.id, invitation.id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not cancel the invitation'));
    }
  }

  return (
    <>
      <h3>{t('Invited, not signed in yet')}</h3>
      {error && <p className="error">{error}</p>}
      <table className="table" data-testid="invitations-table">
        <thead>
          <tr>
            <th>{t('Email')}</th>
            <th>{t('Roles')}</th>
            <th>{t('Invited by')}</th>
            {!readOnly && <th />}
          </tr>
        </thead>
        <tbody>
          {project.invitations.map((i) => (
            <tr key={i.id} data-testid={`invitation-${i.email}`}>
              <td>{i.email}</td>
              <td>{i.roles.map((r) => t(ROLE_LABELS[r])).join(', ')}</td>
              <td>{i.invitedBy ?? t('System')}</td>
              {!readOnly && (
                <td>
                  <button
                    type="button"
                    onClick={() => void cancel(i)}
                    aria-label={t('Cancel the invitation for {email}', { email: i.email })}
                  >
                    {t('Cancel invitation')}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function AddMemberForm() {
  const { project, reload } = useProject();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<ProjectRole[]>(['developer']);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);

  useEffect(() => {
    api.users().then(setUsers);
  }, [project.members]);

  const candidates = users.filter(
    (u) => u.email && !project.members.some((m) => m.userId === u.id),
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInvited(null);
    try {
      const added = await api.addMember(project.id, { email, roles });
      if (!('userId' in added)) setInvited(added.email);
      setEmail('');
      setRoles(['developer']);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not add the member'));
    }
  }

  return (
    <form className="form inline" onSubmit={submit} aria-label={t('Add member')}>
      <h3>{t('Add member')}</h3>
      <label>
        {t('Email')}
        <input
          type="email"
          list="known-users"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('name@example.com')}
          required
        />
        <datalist id="known-users">
          {candidates.map((u) => (
            <option key={u.id} value={u.email!}>
              {u.displayName}
            </option>
          ))}
        </datalist>
        <span className="hint">
          {t(
            'Anyone with a Google account. Someone who has not signed in yet is invited, and joins the first time they sign in with this address.',
          )}
        </span>
      </label>
      <fieldset className="roles">
        <legend>{t('Roles')}</legend>
        {PROJECT_ROLES.map((r) => (
          <label key={r} className="check">
            <input
              type="checkbox"
              checked={roles.includes(r)}
              onChange={(e) =>
                setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))
              }
            />
            {t(ROLE_LABELS[r])}
          </label>
        ))}
      </fieldset>
      {error && <p className="error">{error}</p>}
      {invited && (
        <p className="hint ok" role="status">
          {t(
            '{email} is invited. GameWeld sends no e-mail: tell them to sign in at {address} with that address.',
            { email: invited, address: window.location.origin },
          )}
        </p>
      )}
      <button
        type="submit"
        className="primary"
        disabled={roles.length === 0 || email.trim() === ''}
      >
        {t('Add member')}
      </button>
    </form>
  );
}

function DangerZone() {
  const { project, reload } = useProject();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function toggleArchive() {
    setError(null);
    try {
      await api.updateProject(project.id, {
        version: project.version,
        archived: !project.archived,
      });
      if (!project.archived) navigate('/');
      else await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not change the archive state'));
    }
  }

  return (
    <section className="panel" aria-labelledby="archive-heading">
      <h2 id="archive-heading">
        {project.archived ? t('Archived project') : t('Archive', undefined, 'heading')}
      </h2>
      <p className="muted">
        {project.archived
          ? t('This project is archived and hidden from the active list. Nothing was deleted.')
          : t(
              'Archiving hides the project from the active list. Nothing is deleted, and it can be restored later.',
            )}
      </p>
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={() => void toggleArchive()}>
        {project.archived ? t('Restore project') : t('Archive project')}
      </button>
    </section>
  );
}
