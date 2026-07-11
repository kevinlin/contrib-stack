import { describe, expect, it } from "vitest";
import { getServerTimezone, getTimezone } from "./page";

describe("welcome timezone detection", () => {
  it("uses UTC for the server snapshot", () => {
    expect(getServerTimezone()).toBe("UTC");
  });

  it("uses the runtime timezone for the client snapshot", () => {
    expect(getTimezone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});
