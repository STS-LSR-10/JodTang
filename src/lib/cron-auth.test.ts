import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "./cron-auth";

describe("isCronAuthorized", () => {
  it("accepts the exact secret", () => {
    expect(isCronAuthorized("Bearer s3cret-value", "s3cret-value")).toBe(true);
  });

  it("rejects a wrong secret, wrong scheme, or missing header", () => {
    expect(isCronAuthorized("Bearer nope", "s3cret-value")).toBe(false);
    expect(isCronAuthorized("Basic s3cret-value", "s3cret-value")).toBe(false);
    expect(isCronAuthorized("s3cret-value", "s3cret-value")).toBe(false);
    expect(isCronAuthorized(null, "s3cret-value")).toBe(false);
    expect(isCronAuthorized("Bearer ", "s3cret-value")).toBe(false);
  });

  it("never authorizes when no secret is configured", () => {
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized("Bearer anything", "")).toBe(false);
  });

  it("is not fooled by a prefix of the secret", () => {
    expect(isCronAuthorized("Bearer s3cret", "s3cret-value")).toBe(false);
  });
});
