# Methodome Authentication

## Direction

Methodome uses Better Auth inside the existing Cloudflare API Worker.

The authentication service uses the same D1 database as the application but keeps authentication records in dedicated tables.

## Production state

Production authentication is enabled with:

- `AUTH_MODE=better_auth`
- `BETTER_AUTH_URL=https://api.methodome.com`
- `BETTER_AUTH_SECRET` stored as a Worker secret
- D1-backed sessions
- D1-backed authentication rate limiting
- a 10-character minimum password

The production API rejects unauthenticated access to protected project routes.

Better Auth is mounted at:

`/api/auth/*`

Methodome also exposes:

`/api/auth-config`

This reports which optional account protections are active so the web application can render the matching sign-up flow.

## User separation

Better Auth owns:

- `auth_user`
- `auth_session`
- `auth_account`
- `auth_verification`
- `auth_rate_limit`

Methodome keeps its application `users` table separately.

After a valid authentication session is established, the API Worker synchronises the authenticated user id, email and display name into the Methodome application user record before executing a protected application request.

## Turnstile bot protection

The repository includes server-side Cloudflare Turnstile verification for email/password sign-up.

Turnstile becomes active only when both of these bindings are configured:

- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

The site key is public configuration.

The secret key must be stored as a Worker secret and must never be committed.

When Turnstile is enabled:

1. the sign-up page renders the Cloudflare widget;
2. the browser submits the resulting token with the account request;
3. the API Worker validates the token through Cloudflare Siteverify;
4. only a successful, unexpired token is passed to Better Auth.

A partial Turnstile configuration fails closed instead of silently disabling the check.

Production activation still requires a Turnstile widget for `methodome.com`.

## Email OTP verification

The repository includes a Better Auth email-OTP path for email verification.

It is enabled only when:

- the API Worker has an `EMAIL` Cloudflare Email Service binding; and
- `EMAIL_VERIFICATION_REQUIRED=true`.

When enabled:

1. account creation does not create an authenticated session;
2. Better Auth sends a six-digit email-verification OTP;
3. the OTP expires after five minutes;
4. verification attempts are limited;
5. the web application asks for the code;
6. after successful verification, the user signs in and continues to the requested destination.

Default sender:

`no-reply@methodome.com`

This can be changed with `EMAIL_FROM`.

Before enabling the flag in production, `methodome.com` must be onboarded to Cloudflare Email Sending and the `EMAIL` send binding must be added to the API Worker.

Do not enable `EMAIL_VERIFICATION_REQUIRED` without a working email binding.

## Rate limiting

Authentication rate limiting is stored in D1.

Current rules include:

- global: 60 requests per 60 seconds;
- sign up: 3 requests per 60 seconds;
- sign in: 5 requests per 10 seconds;
- email OTP send: 3 requests per 60 seconds;
- email OTP verification: 8 requests per 60 seconds.

Better Auth also limits OTP attempts before an OTP becomes invalid.

## Secrets

The following values are secrets and must not be committed:

- `BETTER_AUTH_SECRET`
- `TURNSTILE_SECRET_KEY`

The following values are configuration rather than secrets:

- `BETTER_AUTH_URL`
- `TURNSTILE_SITE_KEY`
- `EMAIL_VERIFICATION_REQUIRED`
- `EMAIL_FROM`

## Production origins

Web:

`https://methodome.com`

API:

`https://api.methodome.com`

Both services use the same registrable domain, which supports normal first-party browser session behaviour.

## External production setup still required

The code paths for Turnstile and email OTP are present, but they must not be represented as active until the Cloudflare account configuration exists.

To activate them:

1. Create a managed Turnstile widget for `methodome.com`.
2. Store its secret as `TURNSTILE_SECRET_KEY` on `methodome-api`.
3. Set its public key as `TURNSTILE_SITE_KEY`.
4. Onboard `methodome.com` under Cloudflare Email Service > Email Sending.
5. Add an `EMAIL` send binding to `methodome-api`.
6. Set `EMAIL_FROM=no-reply@methodome.com`.
7. Set `EMAIL_VERIFICATION_REQUIRED=true`.
8. Redeploy.
9. Smoke-test sign-up, Turnstile validation, OTP delivery, invalid/expired code handling, resend limits, verified sign-in and protected API access.
