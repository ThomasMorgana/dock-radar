// capture(event, distinctId, properties): one event to PostHog's capture API
// (https://posthog.com/docs/api/capture), with plain fetch and no new dependency.
//
// Config (Edge Function secrets, optional):
//   POSTHOG_TOKEN  the project token (phc_...), the same public one as docs/config.js
//   POSTHOG_HOST   default https://eu.i.posthog.com
//
// Without POSTHOG_TOKEN it does nothing. It never throws: analytics must never break ingestion or alerts.
// Await it before returning the response: the function can shut down right after.

export async function capture(event: string, distinctId: string, properties: Record<string, unknown> = {}) {
  const token = Deno.env.get("POSTHOG_TOKEN");
  if (!token) return;
  const host = (Deno.env.get("POSTHOG_HOST") ?? "https://eu.i.posthog.com").replace(/\/$/, "");

  try {
    const res = await fetch(`${host}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: token,
        event,
        distinct_id: distinctId,
        timestamp: new Date().toISOString(),
        properties: {
          ...properties,
          app: "dock-radar",
          source: "edge",
          // Like the front end's env: keeps `supabase functions serve` runs out of production charts.
          env: (Deno.env.get("SUPABASE_URL") ?? "").includes(".supabase.co") ? "production" : "local",
          $process_person_profile: false, // system events: no person profile
        },
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) console.warn(`PostHog capture ${event}: HTTP ${res.status}`);
  } catch (err) {
    console.warn(`PostHog capture ${event}:`, err instanceof Error ? err.message : err);
  }
}
