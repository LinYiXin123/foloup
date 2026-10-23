import { createClient } from "@supabase/supabase-js";

// Retry only idempotent reads after a short-lived connection or upstream failure.
// Writes remain single attempts so a lost response cannot cause duplicate inserts.
export const fetchWithReadRetries: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : undefined;
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return fetch(input, init);
  }
  const signal = init?.signal ?? request?.signal;
  for (let attempt = 0; ; attempt += 1) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(input, init);
      if (attempt === 2 || ![502, 503, 504].includes(response.status)) {
        return response;
      }
      await response.body?.cancel();
    } catch (error) {
      if (attempt === 2 || signal?.aborted) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
};

// Service-role client. It bypasses row-level security, so it may only run on the server:
// the browser never talks to Supabase directly, it goes through API routes and server actions.
export function createServiceClient() {
  if (typeof window !== "undefined") {
    throw new Error("The Supabase service client is server-only");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchWithReadRetries },
    },
  );
}
