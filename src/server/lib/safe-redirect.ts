/** True for an absolute http(s) URL or a root-relative path that cannot leave the site. */
export function isSafeRedirectTarget(value: string): boolean {
  const target = value.trim();
  if (!target) return false;
  for (const char of target) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f || char.trim() === "") return false;
  }
  if (target.startsWith("/")) return !target.startsWith("//");
  try {
    const url = new URL(target);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
