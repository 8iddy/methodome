import type { Context, Next } from "hono";
import { createAuth } from "./better-auth";
import type { Env, Variables } from "./env";

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

async function ensureApplicationUser(
  c: AppContext,
  userId: string,
  email: string,
  displayName: string
) {
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       display_name = excluded.display_name,
       updated_at = excluded.updated_at`
  )
    .bind(userId, email, displayName, now, now)
    .run();
}

async function authenticateDevelopmentHeader(c: AppContext, next: Next) {
  const userId = c.req.header("x-methodome-user-id")?.trim();
  const userEmail = c.req.header("x-methodome-user-email")?.trim();

  if (!userId) {
    return c.json(
      {
        error: {
          code: "UNAUTHENTICATED",
          message: "Development requests require x-methodome-user-id."
        }
      },
      401
    );
  }

  const email = userEmail ?? `${userId}@local.methodome.invalid`;
  await ensureApplicationUser(c, userId, email, userId);
  c.set("userId", userId);
  c.set("userEmail", email);
  await next();
}

async function authenticateBetterAuth(c: AppContext, next: Next) {
  if (!c.env.BETTER_AUTH_SECRET) {
    return c.json(
      {
        error: {
          code: "AUTH_NOT_CONFIGURED",
          message: "Authentication secret has not been configured."
        }
      },
      503
    );
  }

  const auth = createAuth(c.env);
  const session = await auth.api.getSession({
    headers: c.req.raw.headers
  });

  if (!session) {
    return c.json(
      {
        error: {
          code: "UNAUTHENTICATED",
          message: "Sign in to continue."
        }
      },
      401
    );
  }

  await ensureApplicationUser(
    c,
    session.user.id,
    session.user.email,
    session.user.name
  );

  c.set("userId", session.user.id);
  c.set("userEmail", session.user.email);
  await next();
}

export async function requireAuth(c: AppContext, next: Next) {
  if (c.env.AUTH_MODE === "development_header") {
    return authenticateDevelopmentHeader(c, next);
  }

  if (c.env.AUTH_MODE === "better_auth") {
    return authenticateBetterAuth(c, next);
  }

  return c.json(
    {
      error: {
        code: "AUTH_NOT_CONFIGURED",
        message: "Production authentication has not been configured."
      }
    },
    503
  );
}
