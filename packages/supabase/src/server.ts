import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { keys } from "./keys";

/**
 * Returns a Supabase client whose JWT is minted from the current Clerk session.
 * Supabase recognises Clerk via the Third-Party Auth integration: every request
 * carries the Clerk session token in the Authorization header, and the
 * `requesting_org_id()` SQL function reads `org_id` from the JWT to scope RLS.
 *
 * Use in server components, route handlers, server actions.
 */
export const createServerSupabaseClient = (): SupabaseClient => {
  const env = keys();
  return createClient(env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    accessToken: async () => {
      const { getToken } = await auth();
      return (await getToken()) ?? null;
    },
  });
};

/**
 * Service-role client. Bypasses RLS. Use only in trusted server code where
 * org_id scoping is enforced manually (e.g. webhook ingestion, cron jobs that
 * must see across orgs).
 */
export const createServiceRoleSupabaseClient = (): SupabaseClient => {
  const env = keys();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};
