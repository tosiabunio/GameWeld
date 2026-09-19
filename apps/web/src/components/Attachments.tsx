import type { Attachment } from '@gameweld/domain';
import { useRef, useState } from 'react';
import { api, ApiError } from '../api.ts';
import { t } from '../i18n/index.ts';
import { useProject } from '../pages/ProjectPage.tsx';
import { useCurrentUser } from '../session.tsx';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Attachments on an item or a task (T2). Download is authorized on the server. */
export function Attachments({
  owner,
  attachments,
  canWork,
  coverId,
  onSetCover,
  canPickCover = false,
  onChanged,
}: {
  owner: { itemId: string } | { taskId: string };
  attachments: Attachment[];
  canWork: boolean;
  /** The current cover attachment, and a setter for those allowed to pick another. */
  coverId?: string | null;
  onSetCover?: (attachmentId: string | null) => Promise<unknown>;
  canPickCover?: boolean;
  onChanged: () => Promise<void>;
}) {
  const { project } = useProject();
  const me = useCurrentUser();
  const canDirect = project.permissions['backlog.manage'];
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) await api.uploadAttachment(project.id, owner, file);
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('Upload failed'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(a: Attachment) {
    setError(null);
    try {
      await api.deleteAttachment(project.id, a.id);
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('Could not delete the attachment'));
    }
  }

  return (
    <div data-testid="attachments">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {attachments.length === 0 ? (
        <p className="muted small">{t('No attachments yet.')}</p>
      ) : (
        <ul className="attachment-list">
          {attachments.map((a) => (
            <li key={a.id} data-testid="attachment">
              {a.isImage && (
                <a href={api.attachmentUrl(project.id, a.id)} download={a.fileName}>
                  <img
                    src={api.attachmentUrl(project.id, a.id, true)}
                    alt={a.fileName}
                    className="thumb"
                  />
                </a>
              )}
              <div className="attachment-meta">
                <a href={api.attachmentUrl(project.id, a.id)} download={a.fileName}>
                  {a.fileName}
                </a>
                <span className="muted small">
                  {formatSize(a.sizeBytes)} · {a.uploadedBy.displayName} ·{' '}
                  {new Date(a.createdAt).toLocaleDateString()}
                  {coverId === a.id && ` · ${t('cover')}`}
                </span>
              </div>
              <div className="row">
                {onSetCover && canPickCover && a.isImage && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => void onSetCover(coverId === a.id ? null : a.id)}
                  >
                    {coverId === a.id ? t('Remove cover') : t('Use as cover')}
                  </button>
                )}
                {(a.uploadedBy.id === me.id || canDirect) && canWork && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => void remove(a)}
                    aria-label={t('Delete attachment {name}', { name: a.fileName })}
                  >
                    {t('Delete')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canWork && (
        <label className="upload">
          <input
            ref={input}
            type="file"
            multiple
            onChange={(e) => void upload(e.target.files)}
            disabled={busy}
            aria-label={t('Add attachment')}
          />
          <span className="muted small">
            {busy ? t('Uploading…') : t('Images, documents, builds… anything useful.')}
          </span>
        </label>
      )}
    </div>
  );
}
