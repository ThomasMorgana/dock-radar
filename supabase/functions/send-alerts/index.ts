// send-alerts: emails every confirmed subscriber whose station is usually empty at their
// departure time tomorrow. Called hourly by pg_cron (see the add_alert_subscriptions migration);
// due_alerts() picks the subscriptions for which it's 19:00 local time.
//
// Body (optional, for testing): { "any_hour": true } skips the 19:00 check.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { escapeHtml, sendEmail, siteLink } from "../_shared/resend.ts";

const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default {
  // Only the project's secret key may trigger sending.
  fetch: withSupabase({ auth: ["secret"] }, async (req, ctx) => {
    const body = await req.json().catch(() => ({}));
    const { data: due, error } = await ctx.supabaseAdmin.rpc("due_alerts", body.any_hour ? { p_hour: null } : {});
    if (error) {
      console.error(error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    const failures: string[] = [];
    for (const a of due) {
      const time = a.depart_time.slice(0, 5);
      const unsubscribe = siteLink({ unsubscribe: a.token });
      const usually = `empty ${a.pct_empty}% of the time (about ${a.avg_bikes} bikes on average, ` +
        `based on ${a.days_observed} past ${DAYS[a.weekday]}${a.days_observed === 1 ? "" : "s"})`;
      try {
        await sendEmail({
          to: a.email,
          subject: `Tomorrow ${time}: ${a.station_name} is often empty`,
          text: `Heads up for tomorrow, ${DAYS[a.weekday]}: around ${time}, ${a.station_name} is usually ` +
            `${usually}. Leave a few minutes early or plan for a nearby station.\n\n` +
            `Stop these alerts: ${unsubscribe}`,
          html: `<p>Heads up for tomorrow, ${DAYS[a.weekday]}: around ${time}, ` +
            `<strong>${escapeHtml(a.station_name)}</strong> is usually ${usually}.</p>` +
            `<p>Leave a few minutes early or plan for a nearby station.</p>` +
            `<p style="color:#666;font-size:12px"><a href="${unsubscribe}">Stop these alerts</a></p>`,
          headers: { "List-Unsubscribe": `<${unsubscribe}>` },
          idempotencyKey: `alert/${a.id}/${a.local_date}`, // a retried run can't send twice
        });
        await ctx.supabaseAdmin.from("alert_subscriptions")
          .update({ last_sent_on: a.local_date }).eq("id", a.id);
      } catch (err) {
        console.error(err);
        failures.push(a.id);
      }
    }

    return Response.json({ due: due.length, sent: due.length - failures.length, failures },
      { status: failures.length ? 502 : 200 });
  }),
};

/* To invoke locally (after `supabase start` and `supabase functions serve`):

  curl -i -X POST 'http://127.0.0.1:54321/functions/v1/send-alerts' \
    --header "apikey: $SUPABASE_SECRET_KEY" --data '{"any_hour": true}'
*/
