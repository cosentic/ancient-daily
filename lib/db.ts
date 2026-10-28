import { createClient } from "@supabase/supabase-js";

/** Server-only Supabase client (service-role key; never expose to the browser). */
export function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set. */
export function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * For admin-only jobs that are safe to run any time (no AI spend, no data
 * loss): accepts the cron secret OR ?key=ADMIN_KEY in the URL.
 */
export function isAdmin(req: Request) {
  if (isAuthorized(req)) return true;
  const key = process.env.ADMIN_KEY;
  return !!key && new URL(req.url).searchParams.get("key") === key;
}

/** Today's date (YYYY-MM-DD) in New York time. */
export function todayET() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
    new Date(),
  );
}
