import type { ProjectMember, ProjectRole, UserSummary } from '@gameweld/domain';
import { PROJECT_ROLES, ROLE_LABELS } from '@gameweld/domain';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../api.ts';
import { useCurrentUser } from '../session.tsx';
import { useProject } from './ProjectPage.tsx';

export function SettingsPage() {
  const { project } = useProject();
  const canEdit = project.permissions['project.settings'];
  return (
    <>
      <section className="panel" aria-labelledby="settings-heading">
        <h2 id="settings-heading">Settings</h2>
        {!canEdit && <p className="muted">Only a Game Director can change settings.</p>}
        <SettingsForm readOnly={!canEdit} />
      </section>
      <section className="panel" aria-labelledby="members-heading">
        <h2 id="members-heading">Members</h2>
        <MembersTable readOnly={!project.permissions['members.manage']} />
        {project.permissions['members.manage'] && <AddMemberForm />}
      </section>
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
      setStatus({ kind: 'ok', text: 'Settings saved.' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await reload();
        setStatus({
          kind: 'error',
          text: `${err.message} Your unsaved changes were replaced with the current values.`,
        });
      } else {
        setStatus({
          kind: 'error',
          text: err instanceof ApiError ? err.message : 'Could not save',
        });
      }
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={200}
          readOnly={readOnly}
        />
      </label>
      <label>
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          readOnly={readOnly}
        />
      </label>
      <label>
        Workboard scope limit
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
        Restrict moving tasks into Done to Testers
      </label>
      {status && <p className={status.kind === 'ok' ? 'ok' : 'error'}>{status.text}</p>}
      {!readOnly && (
        <div className="row">
          <button type="submit" className="primary" disabled={!dirty}>
            Save settings
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
      setError('A member needs at least one role. Remove the member instead.');
      return;
    }
    try {
      await api.updateMember(project.id, member.userId, patch);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the member');
    }
  }

  async function remove(member: ProjectMember) {
    setError(null);
    try {
      await api.removeMember(project.id, member.userId);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove the member');
    }
  }

  return (
    <>
      {error && <p className="error">{error}</p>}
      <table className="table" data-testid="members-table">
        <thead>
          <tr>
            <th>Member</th>
            {PROJECT_ROLES.map((r) => (
              <th key={r}>{ROLE_LABELS[r]}</th>
            ))}
            <th>May accept items</th>
            {!readOnly && <th />}
          </tr>
        </thead>
        <tbody>
          {project.members.map((m) => (
            <tr key={m.userId} data-testid={`member-${m.email ?? m.userId}`}>
              <td>
                <strong>{m.displayName}</strong>
                {m.userId === me.id && <span className="muted"> (you)</span>}
                <br />
                <span className="muted">{m.email}</span>
              </td>
              {PROJECT_ROLES.map((r) => (
                <td key={r}>
                  <input
                    type="checkbox"
                    aria-label={`${m.displayName} is ${ROLE_LABELS[r]}`}
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
                  aria-label={`${m.displayName} may accept items`}
                  checked={m.canAccept}
                  disabled={readOnly || m.roles.includes('director')}
                  title={
                    m.roles.includes('director') ? 'Game Directors always may accept' : undefined
                  }
                  onChange={(e) => void update(m, { canAccept: e.target.checked })}
                />
              </td>
              {!readOnly && (
                <td>
                  <button
                    type="button"
                    onClick={() => void remove(m)}
                    aria-label={`Remove ${m.displayName}`}
                  >
                    Remove
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

  useEffect(() => {
    api.users().then(setUsers);
  }, [project.members]);

  const candidates = users.filter(
    (u) => u.email && !project.members.some((m) => m.userId === u.id),
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.addMember(project.id, { email, roles });
      setEmail('');
      setRoles(['developer']);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the member');
    }
  }

  return (
    <form className="form inline" onSubmit={submit} aria-label="Add member">
      <h3>Add member</h3>
      <label>
        Email
        <input
          type="email"
          list="known-users"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          required
        />
        <datalist id="known-users">
          {candidates.map((u) => (
            <option key={u.id} value={u.email!}>
              {u.displayName}
            </option>
          ))}
        </datalist>
        <span className="hint">The person must have signed in at least once.</span>
      </label>
      <fieldset className="roles">
        <legend>Roles</legend>
        {PROJECT_ROLES.map((r) => (
          <label key={r} className="check">
            <input
              type="checkbox"
              checked={roles.includes(r)}
              onChange={(e) =>
                setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))
              }
            />
            {ROLE_LABELS[r]}
          </label>
        ))}
      </fieldset>
      {error && <p className="error">{error}</p>}
      <button
        type="submit"
        className="primary"
        disabled={roles.length === 0 || email.trim() === ''}
      >
        Add member
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
      setError(err instanceof ApiError ? err.message : 'Could not change the archive state');
    }
  }

  return (
    <section className="panel" aria-labelledby="archive-heading">
      <h2 id="archive-heading">{project.archived ? 'Archived project' : 'Archive'}</h2>
      <p className="muted">
        {project.archived
          ? 'This project is archived and hidden from the active list. Nothing was deleted.'
          : 'Archiving hides the project from the active list. Nothing is deleted, and it can be restored later.'}
      </p>
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={() => void toggleArchive()}>
        {project.archived ? 'Restore project' : 'Archive project'}
      </button>
    </section>
  );
}
