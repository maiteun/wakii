import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Reads public env vars. When they're absent the app runs in localStorage
// (mock) mode, so the prototype keeps working before the backend is set up.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabase = Boolean(url && anon);

export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(url as string, anon as string)
  : null;

export const PHOTO_BUCKET = "photos";
