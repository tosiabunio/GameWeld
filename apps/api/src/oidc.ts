import * as client from 'openid-client';
import type { OidcProviderConfig } from './config.ts';

/** What a provider tells us about the person who signed in, once the ID token has been checked. */
export interface OidcClaims {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/** Values that tie the provider's answer to the browser that asked, kept in a short-lived cookie. */
export interface OidcChecks {
  state: string;
  nonce: string;
  verifier: string;
}

/**
 * One OpenID Connect provider: authorization code flow with PKCE, state, and nonce. The
 * provider's metadata is fetched on the first sign-in rather than at startup, so the instance
 * starts even when the provider cannot be reached, and a failed fetch is tried again next time.
 */
export class OidcProvider {
  private configuration: Promise<client.Configuration> | null = null;

  constructor(
    readonly config: OidcProviderConfig,
    /** Replaces the network in tests. */
    private readonly fetchImpl?: client.CustomFetch,
  ) {}

  private discover(): Promise<client.Configuration> {
    this.configuration ??= client
      .discovery(
        new URL(this.config.issuer),
        this.config.clientId,
        this.config.clientSecret,
        undefined,
        this.fetchImpl ? { [client.customFetch]: this.fetchImpl } : undefined,
      )
      .catch((err: unknown) => {
        this.configuration = null;
        throw err;
      });
    return this.configuration;
  }

  async start(): Promise<{ url: string; checks: OidcChecks }> {
    const configuration = await this.discover();
    const checks = {
      state: client.randomState(),
      nonce: client.randomNonce(),
      verifier: client.randomPKCECodeVerifier(),
    };
    const url = client.buildAuthorizationUrl(configuration, {
      redirect_uri: this.config.redirectUri,
      scope: 'openid email profile',
      state: checks.state,
      nonce: checks.nonce,
      code_challenge: await client.calculatePKCECodeChallenge(checks.verifier),
      code_challenge_method: 'S256',
      // Someone signed in to several Google accounts picks the one that was invited.
      prompt: 'select_account',
    });
    return { url: url.href, checks };
  }

  /** Exchanges the code in the callback URL and returns the verified ID token's claims. */
  async finish(callbackUrl: URL, checks: OidcChecks): Promise<OidcClaims> {
    const configuration = await this.discover();
    const tokens = await client.authorizationCodeGrant(configuration, callbackUrl, {
      pkceCodeVerifier: checks.verifier,
      expectedState: checks.state,
      expectedNonce: checks.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims()!;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return {
      subject: claims.sub,
      email: str(claims.email)?.toLowerCase() ?? null,
      emailVerified: claims.email_verified === true,
      name: str(claims.name),
    };
  }
}
