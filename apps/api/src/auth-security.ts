import type { Env } from "./env";

export interface TurnstileResult {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
}

export function turnstileEnabled(env: Env): boolean {
  return Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);
}

export function turnstileConfigurationIncomplete(env: Env): boolean {
  return Boolean(env.TURNSTILE_SITE_KEY) !== Boolean(env.TURNSTILE_SECRET_KEY);
}

export async function validateTurnstile(
  env: Env,
  token: string,
  remoteIp?: string
): Promise<TurnstileResult> {
  if (!env.TURNSTILE_SECRET_KEY) {
    return { success: true };
  }

  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token
  });
  if (remoteIp) body.set("remoteip", remoteIp);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    }
  );

  if (!response.ok) {
    return {
      success: false,
      "error-codes": [`siteverify-http-${response.status}`]
    };
  }

  return (await response.json()) as TurnstileResult;
}
