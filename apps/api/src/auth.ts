import type { Context, Next } from "hono";
import type { Env, Variables } from "./env";

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

async function ensureDevelopmentUser(c: AppContext, userId: string, email?: string) {
  const safeEmail = email ?? `${userId}@local.methodome.invalid`;
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`
  )
    .bind(userId, safeEmail, userId, now, now)
    .run();
}

export async function requireAuth(c: AppContext, next: Next) {
  if (c.env.AUTH_MODE !== "development_header") {
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

  await ensureDevelopmentUser(c, userId, userEmail);
  c.set("userId", userId);
  if (userEmail) c.set("userEmail", userEmail);

  await next();
}
