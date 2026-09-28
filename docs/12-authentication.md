# Methodome Authentication

## Direction

Methodome uses Better Auth inside the existing Cloudflare Worker.

The authentication service uses the same D1 database as the application but keeps authentication records in dedicated tables.

## Routes

Better Auth is mounted at:

`/api/auth/*`

Examples include the Better Auth email and password sign-up, sign-in, sign-out, and session routes.

Protected Methodome application routes continue to live under `/api/*`.

## Authentication modes

`AUTH_MODE=disabled`

Protected application routes return `AUTH_NOT_CONFIGURED`.

`AUTH_MODE=development_header`

Local development can use the temporary Methodome development headers.

This mode must not be used in the deployed production Worker.

`AUTH_MODE=better_auth`

Protected application routes validate the Better Auth session.

## User separation

Better Auth owns:

- `auth_user`
- `auth_session`
- `auth_account`
- `auth_verification`
- `auth_rate_limit`

Methodome owns its existing `users` application table.

After a valid authentication session is established, the Worker synchronises the authenticated user id, email, and display name into the Methodome `users` record before executing a protected application request.

This keeps the identity provider schema separate from application profile and research permissions.

## Initial authentication method

The first method is email and password.

Password hashing is handled by Better Auth.

Minimum password length is 10 characters.

Email verification and password-reset email delivery are not enabled in this stage because Methodome does not yet have a transactional email provider.

Do not present password reset as available in the UI until an email delivery service is configured.

## Rate limiting

Authentication rate limiting is always enabled.

Rate limit state is stored in D1 rather than Worker memory.

Global rule:

- 60 requests per 60 seconds

Sign up:

- 3 requests per 60 seconds

Sign in:

- 5 requests per 10 seconds

The database table is `auth_rate_limit`.

## Secrets

`BETTER_AUTH_SECRET` must be stored as a Cloudflare Worker secret.

It must never be committed to the repository or added to `wrangler.jsonc`.

`BETTER_AUTH_URL` may be stored as a normal environment variable because it is public configuration.

## Intended production URL

The intended API origin is:

`https://api.methodome.com`

The public front end can remain at:

`https://methodome.com`

Keeping both services under the same registrable domain avoids relying on third-party cookies for normal browser sessions.

## Current state

The implementation is present in `backend-foundation`, but the live Worker should remain in disabled auth mode until:

1. D1 migration `0002_better_auth.sql` is applied remotely.
2. `BETTER_AUTH_SECRET` is configured through Wrangler secrets.
3. `api.methodome.com` is attached to the Worker.
4. `BETTER_AUTH_URL` is updated to `https://api.methodome.com`.
5. `AUTH_MODE` is changed to `better_auth`.
6. Sign-up, sign-in, session retrieval, sign-out, and protected API access are smoke-tested.
7. The temporary smoke-test user is deleted after verification.
