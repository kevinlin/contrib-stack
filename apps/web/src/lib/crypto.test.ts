import { describe, it, expect, beforeEach } from "vitest";
import { decryptSecret, encryptSecret, hashApiKey } from "./crypto";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

describe("crypto", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  it("round-trips encrypt/decrypt", () => {
    const sealed = encryptSecret("ghp_secret_token");
    expect(sealed.split(":")).toHaveLength(3);
    expect(decryptSecret(sealed)).toBe("ghp_secret_token");
  });

  it("detects tampering", () => {
    const sealed = encryptSecret("secret");
    const parts = sealed.split(":");
    const cipher = Buffer.from(parts[2]!, "base64");
    cipher[0]! ^= 0xff;
    parts[2] = cipher.toString("base64");
    const tampered = parts.join(":");

    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("hashApiKey is deterministic", () => {
    const first = hashApiKey("abc");
    const second = hashApiKey("abc");

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(hashApiKey("def")).not.toBe(first);
  });
});
