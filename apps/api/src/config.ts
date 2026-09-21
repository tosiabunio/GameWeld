import { z } from 'zod';

const schema = z.object({
  APP_ENV: z.enum(['local', 'test', 'production']).default('local'),
  AUTH_MOCK: z.enum(['true', 'false']).default('false'),
  SEED_DEMO: z.enum(['true', 'false']).default('false'),
  RESET_DATABASE: z.enum(['true', 'false']).default('false'),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  WEB_DIST: z.string().optional(),
  ATTACHMENTS_DIR: z.string().default('./data/attachments'),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .positive()
    .default(24 * 14),
  ATTACHMENT_MAX_MB: z.coerce.number().positive().default(25),
  PUBLIC_URL: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  // An empty value (as Compose passes an unset variable) means unset.
  INITIAL_ADMIN_EMAIL: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().email().optional(),
  ),
});

/** An OpenID Connect provider. Google is the only one configured today; others are entries here. */
export interface OidcProviderConfig {
  /** Stored as `identities.provider` and used in the sign-in and callback paths. */
  id: string;
  label: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Where the provider sends the browser back: `PUBLIC_URL` + `/api/auth/<id>/callback`. */
  redirectUri: string;
}

export interface Config {
  appEnv: 'local' | 'test' | 'production';
  authMock: boolean;
  seedDemo: boolean;
  resetDatabase: boolean;
  databaseUrl: string;
  port: number;
  host: string;
  webDist: string | undefined;
  attachmentsDir: string;
  sessionTtlMs: number;
  attachmentMaxBytes: number;
  /** The address people open, without a trailing slash; null when no provider needs it. */
  publicUrl: string | null;
  oidcProviders: OidcProviderConfig[];
  /** The first sign-in with this address becomes admin and needs no invitation. Lower-cased. */
  initialAdminEmail: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const e = parsed.data;
  const blank = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);
  const publicUrl = parsePublicUrl(blank(e.PUBLIC_URL), e.APP_ENV);
  const oidcProviders: OidcProviderConfig[] = [];
  const google = { id: blank(e.GOOGLE_CLIENT_ID), secret: blank(e.GOOGLE_CLIENT_SECRET) };
  if (google.id || google.secret) {
    if (!google.id || !google.secret)
      throw new Error(
        'Invalid configuration: set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither',
      );
    if (!publicUrl)
      throw new Error(
        'Invalid configuration: Google sign-in needs PUBLIC_URL, the address people open (for example https://gameweld.example.com)',
      );
    oidcProviders.push({
      id: 'google',
      label: 'Google',
      issuer: 'https://accounts.google.com',
      clientId: google.id,
      clientSecret: google.secret,
      redirectUri: `${publicUrl}/api/auth/google/callback`,
    });
  }
  const config: Config = {
    appEnv: e.APP_ENV,
    authMock: e.AUTH_MOCK === 'true',
    seedDemo: e.SEED_DEMO === 'true',
    resetDatabase: e.RESET_DATABASE === 'true',
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    host: e.HOST,
    webDist: e.WEB_DIST,
    attachmentsDir: e.ATTACHMENTS_DIR,
    sessionTtlMs: e.SESSION_TTL_HOURS * 60 * 60 * 1000,
    attachmentMaxBytes: Math.round(e.ATTACHMENT_MAX_MB * 1024 * 1024),
    publicUrl,
    oidcProviders,
    initialAdminEmail: e.INITIAL_ADMIN_EMAIL?.toLowerCase() ?? null,
  };
  assertSafe(config);
  return config;
}

/**
 * The public address, checked early because a wrong one surfaces only as Google's
 * redirect_uri_mismatch page. Production needs HTTPS; plain HTTP is for localhost.
 */
function parsePublicUrl(value: string | undefined, appEnv: string): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid configuration: PUBLIC_URL is not an address: ${value}`);
  }
  if (url.pathname !== '/' || url.search || url.hash)
    throw new Error(
      `Invalid configuration: PUBLIC_URL must be only the scheme and host, like https://gameweld.example.com (got ${value})`,
    );
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && appEnv !== 'production'))
    throw new Error(`Invalid configuration: PUBLIC_URL must start with https:// (got ${value})`);
  return url.origin;
}

/**
 * T1 guard: the mock provider, demo seed, and database reset are development conveniences.
 * A production configuration that enables any of them is refused at startup rather than served.
 */
export function assertSafe(config: Config): void {
  if (config.appEnv !== 'production') return;
  const offenders = [
    config.authMock && 'AUTH_MOCK',
    config.seedDemo && 'SEED_DEMO',
    config.resetDatabase && 'RESET_DATABASE',
  ].filter(Boolean);
  if (offenders.length > 0) {
    throw new Error(
      `Refusing to start: ${offenders.join(', ')} must not be enabled when APP_ENV=production`,
    );
  }
  if (config.oidcProviders.length === 0) {
    throw new Error(
      'Refusing to start: no sign-in provider is configured, so nobody could sign in. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and PUBLIC_URL (see docs/google-sign-in.md)',
    );
  }
}
