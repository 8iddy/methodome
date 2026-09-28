import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import type { Env } from "./env";

export function emailVerificationEnabled(env: Env): boolean {
  return Boolean(env.EMAIL) && env.EMAIL_VERIFICATION_REQUIRED === "true";
}

export function createAuth(env: Env) {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required when Better Auth is enabled.");
  }

  const email = env.EMAIL;
  const verificationEnabled = emailVerificationEnabled(env);
  const plugins = verificationEnabled && email
    ? [
        emailOTP({
          otpLength: 6,
          expiresIn: 300,
          allowedAttempts: 5,
          sendVerificationOnSignUp: true,
          overrideDefaultEmailVerification: true,
          async sendVerificationOTP({ email: recipient, otp, type }) {
            const subject =
              type === "email-verification"
                ? "Verify your Methodome email"
                : type === "forget-password"
                  ? "Reset your Methodome password"
                  : "Your Methodome sign-in code";
            const purpose =
              type === "email-verification"
                ? "verify your email address"
                : type === "forget-password"
                  ? "reset your password"
                  : "sign in to Methodome";
            await email.send({
              to: recipient,
              from: env.EMAIL_FROM ?? "no-reply@methodome.com",
              subject,
              text: `Use this code to ${purpose}: ${otp}. The code expires in 5 minutes.`,
              html: `<p>Use this code to ${purpose}:</p><p style="font-size:24px;font-weight:700;letter-spacing:0.15em">${otp}</p><p>The code expires in 5 minutes.</p>`
            });
          }
        })
      ]
    : [];

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
      autoSignIn: !verificationEnabled,
      requireEmailVerification: verificationEnabled
    },
    plugins,
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
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      storage: "database",
      modelName: "auth_rate_limit",
      customRules: {
        "/sign-up/email": {
          window: 60,
          max: 3
        },
        "/sign-in/email": {
          window: 10,
          max: 5
        },
        "/email-otp/send-verification-otp": {
          window: 60,
          max: 3
        },
        "/email-otp/verify-email": {
          window: 60,
          max: 8
        }
      }
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
