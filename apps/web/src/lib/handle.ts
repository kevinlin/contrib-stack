export const HANDLE_REGEX = /^[a-z0-9-]{3,30}$/;

export const RESERVED_HANDLES = [
  "api",
  "settings",
  "welcome",
  "embed",
  "widget",
  "admin",
] as const;

export const PENDING_HANDLE_PREFIX = "__pending__";

export function isPendingHandle(handle: string): boolean {
  return handle.startsWith(PENDING_HANDLE_PREFIX);
}

export function validateHandle(
  handle: string,
): { ok: true } | { ok: false; reason: string } {
  if (!HANDLE_REGEX.test(handle)) {
    return { ok: false, reason: "invalid_format" };
  }
  if (RESERVED_HANDLES.includes(handle as (typeof RESERVED_HANDLES)[number])) {
    return { ok: false, reason: "reserved" };
  }
  return { ok: true };
}
