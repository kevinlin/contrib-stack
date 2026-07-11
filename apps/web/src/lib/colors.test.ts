import { describe, expect, it } from "vitest";
import {
  getDefaultColor,
  PLATFORM_SIGNATURE_COLORS,
  PRESET_PALETTE,
} from "./colors";

describe("colors", () => {
  it("returns platform signature color when no existing colors", () => {
    expect(getDefaultColor("github", [])).toBe(PLATFORM_SIGNATURE_COLORS.github);
    expect(getDefaultColor("gitlab", [])).toBe(PLATFORM_SIGNATURE_COLORS.gitlab);
    expect(getDefaultColor("ingest", [])).toBe(PLATFORM_SIGNATURE_COLORS.ingest);
  });

  it("picks a distinguishable shade for second connection of same platform", () => {
    const first = getDefaultColor("github", []);
    const second = getDefaultColor("github", [first]);

    expect(first).toBe("#2da44e");
    expect(second).not.toBe(first);
    expect(PRESET_PALETTE).toContain(second);
  });

  it("includes platform signature colors in preset palette", () => {
    expect(PRESET_PALETTE).toContain(PLATFORM_SIGNATURE_COLORS.github);
    expect(PRESET_PALETTE).toContain(PLATFORM_SIGNATURE_COLORS.gitlab);
    expect(PRESET_PALETTE).toContain(PLATFORM_SIGNATURE_COLORS.ingest);
  });

  it("has 8-10 preset colors including AI-tool signature colors", () => {
    expect(PRESET_PALETTE.length).toBeGreaterThanOrEqual(8);
    expect(PRESET_PALETTE.length).toBeLessThanOrEqual(10);
  });
});
