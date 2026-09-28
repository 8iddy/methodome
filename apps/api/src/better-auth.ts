import { betterAuth } from "better-auth";
import type { Env } from "./env";

export function createAuth(env: Env) {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required when Better Auth is enabled.");
  }

  return betterAuth({
    appName: "Methodome",
    baseURL:
      env.BETTER_AUTH_URL ??
      "https://methodome-api.abakogideon.workers.dev",
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true
    },
    trustedOrigins: [
      "https://methodome.com",
      "http://localhost:3000"
    ],
    user: {
      modelName: "auth_user"
    },
    session: {
      modelName: "auth_session",
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24
    },
    account: {
      modelName: "auth_account"
    },
    verification: {
      modelName: "auth_verification",
      storeIdentifier: "hashed"
    },
    advanced: {
      database: {
        generateId: "uuid",
        joins: false
      }
    }
  });
}

export type MethodomeAuth = ReturnType<typeof createAuth>;
