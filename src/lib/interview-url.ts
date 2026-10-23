export function getInterviewUrl(identifier: string, baseUrl: string): string {
  const base = baseUrl.trim();
  const protocol = /^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(base) ? "http" : "https";
  const origin = /^https?:\/\//i.test(base) ? base : `${protocol}://${base}`;
  return new URL(`/call/${encodeURIComponent(identifier)}`, origin).toString();
}
