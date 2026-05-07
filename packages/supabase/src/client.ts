"use client";
import { useAuth } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import { keys } from "./keys";

/**
 * Browser-side Supabase client bound to the current Clerk session.
 * Memoised per Clerk session token so we don't reconnect on every render.
 */
export const useSupabaseClient = (): SupabaseClient => {
  const { getToken } = useAuth();
  const env = keys();
  return useMemo(
    () =>
      createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
          accessToken: async () => (await getToken()) ?? null,
        }
      ),
    [getToken, env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY]
  );
};
