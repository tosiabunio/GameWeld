import type { AvatarCrop, MyAvatar } from '@gameweld/domain';
import { PREVIEW_IMAGE_TYPES } from '@gameweld/domain';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.ts';
import { AvatarCropper } from '../components/AvatarCropper.tsx';
import { Avatar } from '../components/Brand.tsx';
import { useCurrentUser, useSession } from '../session.tsx';
import { Shell } from './Shell.tsx';

type Editing = { src: string; file: File } | { src: string; initial: AvatarCrop };

/** The signed-in user's own settings: for now, the picture shown for them everywhere. */
export function ProfilePage() {
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
      setError('Choose a PNG, JPEG, GIF, or WebP picture.');
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
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Profile">
      <div className="row between page-head">
        <h2>Your profile</h2>
      </div>
      <section className="panel" aria-labelledby="picture-heading">
        <h2 id="picture-heading">Picture</h2>
        <div className="profile-card">
          <Avatar name={user.displayName} url={user.avatarUrl} size={96} />
          <div>
            <strong>{user.displayName}</strong>
            {user.email && <p className="muted small">{user.email}</p>}
            <p className="muted small">
              Shown in the top bar, on the cards assigned to you, and when someone picks an
              assignee. Without a picture, your initials are used.
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
                'Picture saved.',
              )
            }
          />
        ) : (
          <div className="row">
            <label className="button primary">
              {avatar ? 'Upload a new picture' : 'Upload a picture'}
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
                  Change the circle
                </button>
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api.deleteAvatar();
                      return null;
                    }, 'Picture removed; your initials are shown instead.')
                  }
                >
                  Remove picture
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </Shell>
  );
}
