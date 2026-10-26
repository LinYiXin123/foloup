function normalizeBaseUrl(baseUrl: string): URL {
  const base = baseUrl.trim();
  const protocol = /^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(base) ? "http" : "https";
  const origin = /^https?:\/\//i.test(base) ? base : `${protocol}://${base}`;
  return new URL(origin);
}

export function isLocalInterviewUrl(value: string): boolean {
  try {
    const { hostname } = normalizeBaseUrl(value);
    return hostname === "localhost" || hostname === "[::1]" || /^127\./.test(hostname);
  } catch {
    return false;
  }
}

export function getInterviewUrl(
  identifier: string,
  baseUrl: string,
  currentOrigin?: string,
): string {
  // A local development setting must not send people back to localhost when
  // the application is reached through its deployed domain or an HTTPS tunnel.
  const origin =
    currentOrigin && isLocalInterviewUrl(baseUrl)
      ? normalizeBaseUrl(currentOrigin)
      : normalizeBaseUrl(baseUrl);
  return new URL(`/call/${encodeURIComponent(identifier)}`, origin).toString();
}
