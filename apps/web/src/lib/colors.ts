export const PLATFORM_SIGNATURE_COLORS = {
  github: "#2da44e",
  gitlab: "#fc6d26",
  ingest: "#6366f1",
} as const;

export const PRESET_PALETTE = [
  "#2da44e",
  "#1f883d",
  "#fc6d26",
  "#e24329",
  "#6366f1",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
] as const;

const PLATFORM_SHADES: Record<string, readonly string[]> = {
  github: ["#2da44e", "#1f883d", "#116329", "#6fdd8c", "#4ac26b"],
  gitlab: ["#fc6d26", "#e24329", "#fca326", "#dd7a00", "#f0a070"],
  ingest: ["#6366f1", "#4f46e5", "#818cf8", "#4338ca", "#a5b4fc"],
};

function isUsed(color: string, existingColors: string[]): boolean {
  const lower = color.toLowerCase();
  return existingColors.some((c) => c.toLowerCase() === lower);
}

export function getDefaultColor(type: string, existingColors: string[]): string {
  const shades = PLATFORM_SHADES[type] ?? PRESET_PALETTE;

  for (const shade of shades) {
    if (!isUsed(shade, existingColors)) {
      return shade;
    }
  }

  for (const color of PRESET_PALETTE) {
    if (!isUsed(color, existingColors)) {
      return color;
    }
  }

  return shades[0]!;
}
