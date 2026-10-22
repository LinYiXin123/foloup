import { createClient } from "@supabase/supabase-js";

// Service-role client. It bypasses row-level security, so it may only run on the server:
// the browser never talks to Supabase directly, it goes through API routes and server actions.
export function createServiceClient() {
  if (typeof window !== "undefined") {
    throw new Error("The Supabase service client is server-only");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
