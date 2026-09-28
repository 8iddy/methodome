import { describe, expect, it } from "vitest";
import {
  turnstileConfigurationIncomplete,
  turnstileEnabled
} from "../apps/api/src/auth-security";
import { emailVerificationEnabled } from "../apps/api/src/better-auth";

describe("authentication security configuration", () => {
  it("enables Turnstile only when site and secret keys are both present", () => {
    expect(turnstileEnabled({} as never)).toBe(false);
    expect(
      turnstileEnabled({
        TURNSTILE_SITE_KEY: "site",
        TURNSTILE_SECRET_KEY: "secret"
      } as never)
    ).toBe(true);
  });

  it("detects partial Turnstile configuration", () => {
    expect(
      turnstileConfigurationIncomplete({
        TURNSTILE_SITE_KEY: "site"
      } as never)
    ).toBe(true);
    expect(
      turnstileConfigurationIncomplete({
        TURNSTILE_SITE_KEY: "site",
        TURNSTILE_SECRET_KEY: "secret"
      } as never)
    ).toBe(false);
  });

  it("requires a mail binding and explicit flag before enabling email verification", () => {
    expect(
      emailVerificationEnabled({
        EMAIL_VERIFICATION_REQUIRED: "true"
      } as never)
    ).toBe(false);

    expect(
      emailVerificationEnabled({
        EMAIL_VERIFICATION_REQUIRED: "true",
        EMAIL: { send: async () => ({}) }
      } as never)
    ).toBe(true);
  });
});
