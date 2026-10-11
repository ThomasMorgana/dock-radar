// ingest-gbfs: polls a GBFS v3 feed and stores stations and one snapshot per station.
// Called every 5 minutes by pg_cron (see the schedule_ingestion migration).
//
// Config (Edge Function secret): GBFS_URL, the network's discovery feed (gbfs.json).
// Optional: POSTHOG_TOKEN, to report each run to PostHog (see _shared/posthog.ts).

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { capture } from "../_shared/posthog.ts";
import { loadGbfs } from "./gbfs.ts";

const DISTINCT_ID = "system:ingest-gbfs";

export default {
  // Only the project's secret key may trigger ingestion.
  fetch: withSupabase({ auth: ["secret"] }, async (_req, ctx) => {
    const gbfsUrl = Deno.env.get("GBFS_URL");
    if (!gbfsUrl) {
      await capture("ingest_failed", DISTINCT_ID, { error: "GBFS_URL secret is not set" });
      return Response.json({ error: "GBFS_URL secret is not set" }, { status: 500 });
    }

    try {
      const { stations, snapshots, observedAt } = await loadGbfs(gbfsUrl);

      const { error: stationsError } = await ctx.supabaseAdmin
        .from("stations")
        .upsert(stations);
      if (stationsError) throw stationsError;

      // Same poll ingested twice (feed not refreshed yet): keep the existing rows.
      const { error: snapshotsError } = await ctx.supabaseAdmin
        .from("station_snapshots")
        .upsert(snapshots, { ignoreDuplicates: true });
      if (snapshotsError) throw snapshotsError;

      await capture("ingest_completed", DISTINCT_ID, {
        stations: stations.length,
        snapshots: snapshots.length,
        observed_at: observedAt,
        // How stale the feed is: a growing value means the network stopped updating it.
        feed_age_s: Math.round((Date.now() - Date.parse(observedAt)) / 1000),
      });
      return Response.json({
        observed_at: observedAt,
        stations: stations.length,
        snapshots: snapshots.length,
      });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      await capture("ingest_failed", DISTINCT_ID, { error: message });
      return Response.json({ error: message }, { status: 502 });
    }
  }),
};

/* To invoke locally (after `supabase start` and `supabase functions serve`):

  curl -i -X POST 'http://127.0.0.1:54321/functions/v1/ingest-gbfs' \
    --header "apikey: $SUPABASE_SECRET_KEY"
*/
