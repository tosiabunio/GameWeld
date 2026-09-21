import type { AvatarCrop, MyAvatar } from '@gameweld/domain';
import { PREVIEW_IMAGE_TYPES } from '@gameweld/domain';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api.ts';
import { lang, LANGUAGES, setLang, t, type Lang } from '../i18n/index.ts';
import { useCurrentUser, useSession } from '../session.tsx';
import { AvatarCropper } from './AvatarCropper.tsx';
import { Avatar } from './Brand.tsx';

type Editing = { src: string; file: File } | { src: string; initial: AvatarCrop };

/**
 * The signed-in user's own settings: the picture shown for them everywhere, and the language
 * of the interface, which is this browser's rather than the account's. A modal dialog over
 * whatever page it was opened from, so closing it leaves the viewer where they were.
 */
export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const user = useCurrentUser();
  const { refresh } = useSession();
  const [avatar, setAvatar] = useState<MyAvatar | null | undefined>(undefined);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api.myAvatar().then(setAvatar);
  }, []);

  // Like a task's window: focus stays inside, the page under it is inert and does not scroll.
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    document.documentElement.classList.add('modal-open');
    return () => {
      document.documentElement.classList.remove('modal-open');
      element.close();
    };
  }, []);

  // A picture chosen from disk is shown from memory until it is saved or dropped.
  useEffect(() => {
    if (!editing || !('file' in editing)) return;
    return () => URL.revokeObjectURL(editing.src);
  }, [editing]);

  function choose(file: File | undefined) {
    setError(null);
    setStatus(null);
    if (!file) return;
    if (!PREVIEW_IMAGE_TYPES.has(file.type)) {
      setError(t('Choose a PNG, JPEG, GIF, or WebP picture.'));
      return;
    }
    setEditing({ src: URL.createObjectURL(file), file });
  }

  async function run(action: () => Promise<MyAvatar | null>, done: string) {
    setBusy(true);
    setError(null);
    try {
      setAvatar(await action());
      setEditing(null);
      await refresh();
      setStatus(done);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('Something went wrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="modal profile-modal"
      aria-labelledby="profile-heading"
      // Escape while choosing a circle drops that choice; otherwise it closes the window.
      onCancel={(e) => {
        e.preventDefault();
        if (editing) setEditing(null);
        else onClose();
      }}
      // Only the backdrop is the dialog itself. While a circle is being chosen, a drag that ends
      // outside the window would land here too, so it does not close then.
      onClick={(e) => e.target === e.currentTarget && !editing && onClose()}
    >
      <header className="modal-head">
        <h2 id="profile-heading">{t('Your profile')}</h2>
        <button
          type="button"
          className="quiet modal-close"
          aria-label={t('Close profile')}
          title={t('Close')}
          onClick={onClose}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            <path
              d="m3.5 3.5 9 9m0-9-9 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>
      <section className="panel" aria-labelledby="picture-heading">
        <h2 id="picture-heading">{t('Picture')}</h2>
        <div className="profile-card">
          <Avatar name={user.displayName} url={user.avatarUrl} size={96} />
          <div>
            <strong>{user.displayName}</strong>
            {user.email && <p className="muted small">{user.email}</p>}
            <p className="muted small">
              {t(
                'Shown in the top bar, on the cards assigned to you, and when someone picks an assignee. Without a picture, your initials are used.',
              )}
            </p>
          </div>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {status && !editing && (
          <p className="ok" role="status">
            {status}
          </p>
        )}
        {editing ? (
          <AvatarCropper
            key={editing.src}
            src={editing.src}
            initial={'initial' in editing ? editing.initial : undefined}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSave={(crop) =>
              void run(
                () =>
                  'file' in editing ? api.uploadAvatar(editing.file, crop) : api.cropAvatar(crop),
                t('Picture saved.'),
              )
            }
          />
        ) : (
          <div className="row">
            <label className="button primary">
              {avatar ? t('Upload a new picture') : t('Upload a picture')}
              <input
                type="file"
                className="sr-only"
                accept={[...PREVIEW_IMAGE_TYPES].join(',')}
                onChange={(e) => {
                  choose(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {avatar && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    // The source keeps its URL, so ask past the cache for the current one.
                    setEditing({
                      src: `${avatar.sourceUrl}?v=${encodeURIComponent(avatar.avatarUrl)}`,
                      initial: avatar.crop,
                    })
                  }
                >
                  {t('Change the circle')}
                </button>
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api.deleteAvatar();
                      return null;
                    }, t('Picture removed; your initials are shown instead.'))
                  }
                >
                  {t('Remove picture')}
                </button>
              </>
            )}
          </div>
        )}
      </section>
      <section className="panel" aria-labelledby="language-heading">
        <h2 id="language-heading">{t('Language')}</h2>
        <select
          aria-label={t('Language')}
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
        >
          {Object.entries(LANGUAGES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <p className="muted small">
          {t('Kept in this browser. The page reloads in the new language.')}
        </p>
      </section>
    </dialog>
  );
}
