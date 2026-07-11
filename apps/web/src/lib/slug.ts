export function generateSlug(
  label: string,
  existingSlugsByUser: string[],
): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!existingSlugsByUser.includes(base)) {
    return base;
  }

  let n = 2;
  while (existingSlugsByUser.includes(`${base}-${n}`)) {
    n++;
  }
  return `${base}-${n}`;
}
