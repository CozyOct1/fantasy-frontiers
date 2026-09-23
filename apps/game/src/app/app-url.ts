/** Resolves application pages under Vite's configured base path in development and production. */
export function appUrl(path = ""): string {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  return new URL(path.replace(/^\//, ""), base).toString();
}
