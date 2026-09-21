# Google sign-in

How to set up signing in to a GameWeld instance with Google, invite people, and recover when
something goes wrong. It takes about ten minutes and needs no Google review.

In short: create an OAuth client in Google Cloud, give GameWeld four settings, and sign in as the
initial admin. After that, everyone is invited from inside GameWeld.

## How access works

- **Nobody has a password in GameWeld.** Google checks who someone is; GameWeld decides whether
  they may come in.
- **Access is by invitation only, and anyone with a Google account can be invited.** That includes
  Gmail and any Google Workspace domain; no domain is favoured or restricted. A Game Director
  invites an e-mail address in **Project settings → Members → Add member**.
- **Someone who has signed in before becomes a member at once.** Anyone else gets an invitation,
  listed under **Invited, not signed in yet** until they sign in. Their first sign-in with that
  address turns every invitation they have into a membership. **GameWeld sends no e-mail**, so
  tell the person to sign in at the instance's address.
- **Only an address Google has verified counts.** Addresses are compared ignoring letter case and
  nothing else. `j.smith@gmail.com` and `jsmith@gmail.com` are different invitations, even though
  Gmail delivers both to one inbox.
- **After the first sign-in, a person is recognised by their Google account, not by their
  address.** If their address changes at Google, they keep their account and projects.
- **A sign-in without an invitation is refused, and no account is made.** The sign-in page names
  the address that was used. This is often the wrong one of several Google accounts; the page
  offers Google's account chooser each time.
- **`INITIAL_ADMIN_EMAIL` gets in without an invitation.** That account becomes admin as long as the
  instance has no admin. Its first job is to create a project and invite the team. Any signed-in
  user may create projects.

Two limits to know:

- **Removing someone from every project does not remove their account.** They can still sign in
  and create a project, but they see no one else's work.
- **Signing out of Google does not sign anyone out of GameWeld.** A GameWeld session lasts
  `SESSION_TTL_HOURS` (14 days by default). Removing a member from a project takes effect
  immediately.

## 1. Create the OAuth client in Google Cloud

Use an account the organisation keeps, such as a shared admin account or one inside your
Workspace organisation, so the client does not depend on one person's account.

1. Open <https://console.cloud.google.com>, create a project (for example `GameWeld`), and select
   it.
2. Open **Google Auth Platform** (older consoles call it **APIs & Services → OAuth consent
   screen**) and choose **Get started**:
   - **App name:** `GameWeld`. **User support email:** an address people can write to.
   - **Audience: External.** Choose this even if your company uses Google Workspace. **Internal**
     would let in only your own organisation's accounts, and invited outsiders could not sign in.
   - **Contact information:** your address. Agree to the policy and **Create**.
3. **Branding:** under **Authorized domains**, add the domain of your instance's address (for
   `https://gameweld.example.com`, add `example.com`). **Do not upload a logo.** A logo sends the
   app to Google's brand verification, which takes days, and nothing else here needs it.
4. **Audience → Publish app**, then confirm. The status must say **In production**. While it says
   **Testing**, only test users listed there (at most 100) can sign in, and everyone else sees
   "Access blocked". GameWeld asks only for the basic `openid`, `email`, and `profile` scopes, so
   publishing needs no verification.
5. **Data Access:** leave it as it is. GameWeld asks for its scopes when people sign in.
6. **Clients → Create client:**
   - **Application type:** Web application. **Name:** for example `GameWeld gameweld.example.com`.
   - **Authorized JavaScript origins:** leave empty.
   - **Authorized redirect URIs:** add exactly

     ```
     https://<your address>/api/auth/google/callback
     ```

     The scheme, host, and port must match `PUBLIC_URL` below, with no trailing slash.
     GameWeld prints this exact value when it starts.
7. **Create**, then copy the **Client ID** and **Client secret** at once, or download the JSON.
   Newer consoles show the secret only when it is created.

## 2. Configure GameWeld

Set these in the application's environment. In Dokploy, that is **Application → Environment**;
elsewhere, it is the Compose file or `.env` next to it.

```sh
APP_ENV=production
PUBLIC_URL=https://gameweld.example.com        # what people type; no path, no trailing slash
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
INITIAL_ADMIN_EMAIL=you@example.com            # the first person to sign in
```

`AUTH_MOCK` and `SEED_DEMO` must be unset or `false` in production. The personas would let
anyone in as a Game Director, so production refuses to start with them.

Restart or redeploy. The log should show:

```
Google sign-in enabled; authorized redirect URI: https://gameweld.example.com/api/auth/google/callback
initial admin: you@example.com
```

If the settings are incomplete, GameWeld refuses to start and names what is missing:

| Message | Fix |
| --- | --- |
| `no sign-in provider is configured` | Production needs `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `PUBLIC_URL`. |
| `set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither` | One of the two is missing or empty. |
| `Google sign-in needs PUBLIC_URL` | Add the address people open. |
| `PUBLIC_URL must start with https://` | Production needs HTTPS. Plain `http://` works only for `localhost` outside production. |
| `PUBLIC_URL must be only the scheme and host` | Remove the path or trailing parts, e.g. `https://gameweld.example.com`. |

## 3. First sign-in

1. Open `PUBLIC_URL` and choose **Sign in with Google**. Pick the `INITIAL_ADMIN_EMAIL` account.
2. Create the first project. You become its Game Director.
3. In **Project settings → Members**, add each person's address and roles. Tell them to sign in
   at the instance's address with that address.

## When sign-in does not work

| What people see | Cause and fix |
| --- | --- |
| Google: **Error 400: redirect_uri_mismatch** | The redirect URI in the Google client differs from the one in GameWeld's log. Check `http` against `https`, `www.` against the bare domain, and trailing slashes. Google may take a few minutes to apply a change. |
| Google: **Access blocked … has not completed the Google verification process**, or **403 access_denied** | The app is still in **Testing**. Use **Audience → Publish app**. |
| GameWeld: **… has not been invited** | Invite that exact address, or sign in with the Google account that was invited. |
| GameWeld: **The sign-in took too long or was started in another browser** | Try again. If it keeps happening, the browser opened a different host from `PUBLIC_URL`, e.g. `www.` against the bare domain. Redirect one to the other at the proxy so everyone uses `PUBLIC_URL`. Browsers that block cookies cause this too. |
| GameWeld: **The sign-in provider cannot be reached** | The server cannot make outbound HTTPS requests to `accounts.google.com`, `oauth2.googleapis.com`, and `www.googleapis.com`. Check its firewall and DNS. |
| GameWeld: **Sign-in failed** | The server log has a `google sign-in failed` line with the reason. Usually `invalid_client` (a wrong or deleted client secret) or a server clock that is far off. |
| GameWeld: **… has not verified this account's e-mail address** | Rare with Google. The person must verify the address in their Google account. |

## Admin commands

For when nobody who could fix something in GameWeld is able to sign in. Run them in the
application container:

```sh
docker compose exec app npm run admin -w apps/api -- <command>
```

On a Dokploy host, use the application's **Terminal** in the panel, or run this on the server:

```sh
sudo docker exec -it $(sudo docker ps -qf name=gameweld-app) npm run admin -w apps/api -- <command>
```

| Command | What it does |
| --- | --- |
| `list-admins` | Shows who is admin. |
| `grant-admin <email>` | Makes an existing account admin. The person must have signed in once. |
| `revoke-admin <email>` | Takes admin away. |
| `projects` | Lists projects with their ids and Game Directors. |
| `add-director <email> <project-id>` | Makes someone a Game Director of a project, keeping any roles they have. Someone who has not signed in gets an invitation as Game Director. |

Changes appear in project history as made by **System**.

Being admin today means only that the initial admin got in without an invitation. There are no
admin screens yet. Recovering a project is what `add-director` is for.

**Common cases:**

- **Every Game Director of a project has left:** run `projects` to find its id, then
  `add-director new.lead@example.com <id>`.
- **`INITIAL_ADMIN_EMAIL` was mistyped, or that person left:** set the right address, restart, and
  have that person sign in. Their sign-in makes them admin only while there is no admin, so run
  `revoke-admin` on the old account first.

## Rotating the client secret

1. **Google Auth Platform → Clients →** your client **→ Add secret**.
2. Put the new secret in `GOOGLE_CLIENT_SECRET` and redeploy.
3. Once sign-in works, disable the old secret in the same page, then delete it.

Rotating the secret does not sign anyone out.

## If the OAuth client or the Google Cloud project is lost

Follow step 1 again to create a new client, then update the two Google settings. Nobody loses
their account or projects. Google identifies a person by their Google account, which stays the
same across OAuth clients. While there is no working client, nobody can sign in; sessions that
are already open keep working until they expire.

## Trying it locally

`make up` passes Google settings through to the local instance when they are set in the shell or
in a `.env` file in the repository root (which git ignores):

```sh
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
INITIAL_ADMIN_EMAIL=you@example.com
```

Add `http://localhost:8090/api/auth/google/callback` to the client's redirect URIs, either on the
production client or on a separate development one. Google allows plain HTTP for `localhost`.
The sign-in page then shows **Sign in with Google** above the demo personas.

## Adding another provider later

Identities are stored as provider and subject, and invitations match on an address the provider
has verified. An invited person can therefore sign in through any configured provider. Their
first sign-in through a second provider joins the account that already has their address.
Adding a provider is a new entry in `oidcProviders` in `apps/api/src/config.ts`, with its issuer
and its own two settings. The routes, the sign-in button, and invitations follow from that entry.
