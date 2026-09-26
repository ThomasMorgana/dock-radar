// Public settings for the Dock Radar page. Change these to point at your own project.
// The publishable key is meant to be public: RLS only allows reading.
// Served from localhost, the page talks to the local stack (`supabase start`) instead.
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
export const SUPABASE_URL = LOCAL ? "http://127.0.0.1:54321" : "https://itcdvukrmdowwflwipza.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = LOCAL
  ? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH" // `supabase status`, same on every local stack
  : "sb_publishable_NHEt9X0YggcsAYWbS5ajxg_8AguOLVz";

// The network's local time zone. It must match station_profile's p_timezone.
export const TIMEZONE = "Europe/Paris";

// How far to look for alternative stations, in metres.
export const NEARBY_RADIUS_M = 600;
