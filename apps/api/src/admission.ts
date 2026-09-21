import type { ProjectRole } from '@gameweld/domain';
import { recordActivity } from './activity.ts';
import { withTransaction, type Db, type Queryable } from './db.ts';
import type { OidcClaims } from './oidc.ts';

export type Refusal = 'not_invited' | 'email_unverified';

export type Admission = { userId: string } | { refused: Refusal; email: string | null };

/**
 * Decides whether a provider's sign-in gets in (T1). Access is by invitation only:
 *
 * - An identity seen before is the same person again, matched by provider and subject, so a
 *   changed address at the provider changes nothing here.
 * - A new identity needs an address its provider has verified. It joins the account that already
 *   has that address (the same person through another provider), or becomes a new account if the
 *   address has a pending invitation or is `INITIAL_ADMIN_EMAIL`. Anyone else is refused, and no
 *   account is made for them.
 *
 * Every sign-in then turns pending invitations for its verified address into memberships, and
 * the initial admin address becomes admin while the instance has none.
 */
export async function admit(
  db: Db,
  provider: string,
  claims: OidcClaims,
  initialAdminEmail: string | null,
): Promise<Admission> {
  const email = claims.emailVerified ? claims.email : null;
  return withTransaction(db, async (tx) => {
    const known = await tx.query<{ user_id: string }>(
      'SELECT user_id FROM identities WHERE provider = $1 AND subject = $2',
      [provider, claims.subject],
    );
    let userId = known.rows[0]?.user_id;
    if (userId) {
      await tx.query('UPDATE identities SET email = $3 WHERE provider = $1 AND subject = $2', [
        provider,
        claims.subject,
        claims.email,
      ]);
    } else {
      if (!email) return { refused: 'email_unverified', email: claims.email };
      const existing = await tx.query<{ id: string }>(
        'SELECT id FROM users WHERE lower(email) = $1 ORDER BY created_at LIMIT 1',
        [email],
      );
      userId = existing.rows[0]?.id;
      if (!userId) {
        const invited = await tx.query('SELECT 1 FROM project_invitations WHERE email = $1', [
          email,
        ]);
        if (!invited.rowCount && email !== initialAdminEmail)
          return { refused: 'not_invited', email };
        const created = await tx.query<{ id: string }>(
          'INSERT INTO users (display_name, email) VALUES ($1, $2) RETURNING id',
          [claims.name ?? email.split('@')[0]!, email],
        );
        userId = created.rows[0]!.id;
      }
      await tx.query(
        'INSERT INTO identities (provider, subject, user_id, email) VALUES ($1, $2, $3, $4)',
        [provider, claims.subject, userId, claims.email],
      );
    }

    if (email) {
      await claimInvitations(tx, userId, email);
      if (email === initialAdminEmail)
        await tx.query(
          `UPDATE users SET is_admin = true
            WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM users WHERE is_admin)`,
          [userId],
        );
    }
    return { userId };
  });
}

/** Turns every pending invitation for the address into a membership of that user. */
export async function claimInvitations(
  tx: Queryable,
  userId: string,
  email: string,
): Promise<void> {
  const invitations = await tx.query<{
    project_id: string;
    roles: ProjectRole[];
    can_accept: boolean;
    invited_by: string | null;
  }>(
    `DELETE FROM project_invitations WHERE email = $1
     RETURNING project_id, roles::text[] AS roles, can_accept, invited_by`,
    [email],
  );
  for (const inv of invitations.rows) {
    const inserted = await tx.query(
      `INSERT INTO project_memberships (project_id, user_id, roles, can_accept)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [inv.project_id, userId, inv.roles, inv.can_accept],
    );
    if (!inserted.rowCount) continue;
    await recordActivity(tx, {
      projectId: inv.project_id,
      actorId: inv.invited_by,
      action: 'member.added',
      entityType: 'user',
      entityId: userId,
      next: { roles: inv.roles, canAccept: inv.can_accept, invited: true },
    });
  }
}
