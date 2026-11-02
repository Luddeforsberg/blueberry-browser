// Public values, safe to deploy. Use the publishable key, never the secret key.
export const SUPABASE_URL = "";
export const SUPABASE_PUBLISHABLE_KEY = "";
// Where "Get Blueberry" goes. The front page of this site, until there's a download.
export const GET_BLUEBERRY_URL = "/";
// The public half of the VAPID key pair from `pnpm run push:keys`, for notifications on the phone page. Empty turns them off.
export const VAPID_PUBLIC_KEY = "";
