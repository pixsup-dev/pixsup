import { createClient, type User } from "npm:@supabase/supabase-js@2.49.4";

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform;
// the service role key never leaves the server.
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

export const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// The signed-in caller, from the user JWT supabase-js sends as the bearer token.
// Returns null for guests (anon key) and invalid or expired tokens.
export async function callerOf(req: Request): Promise<User | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}
