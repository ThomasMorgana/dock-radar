// alert-subscribe: the only way into alert_subscriptions, which the public API can't read or write.
// Called by the front end with the publishable key. POST a JSON body with one of:
//
//   { action: "subscribe", email, station_id, weekday, time, timezone }  -> pending row + confirmation email
//   { action: "confirm", token }                                         -> activates the alert
//   { action: "unsubscribe", token }                                     -> deletes it
//
// Double opt-in: nothing but the confirmation email goes to an address until its owner clicks the link.
// Replies to "subscribe" are the same whatever the state, so the endpoint can't reveal who is subscribed.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { escapeHtml, sendEmail, siteLink } from "../_shared/resend.ts";

const COOLDOWN_MINUTES = 10; // at most one confirmation email per address per 10 minutes
const MAX_PER_EMAIL = 5;
const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CHECK_INBOX = { ok: true, message: "Check your inbox and click the link to confirm your alert." };

const bad = (message: string) => Response.json({ ok: false, message }, { status: 400 });

export default {
  fetch: withSupabase({ auth: "publishable" }, async (req, ctx) => {
    if (req.method !== "POST") return bad("POST only");
    const body = await req.json().catch(() => ({}));
    const db = ctx.supabaseAdmin;

    // ------------------------------------------------------------------ confirm / unsubscribe
    if (body.action === "confirm" || body.action === "unsubscribe") {
      if (typeof body.token !== "string" || !/^[0-9a-f-]{36}$/i.test(body.token)) return bad("Invalid link");

      if (body.action === "unsubscribe") {
        const { error } = await db.from("alert_subscriptions").delete().eq("token", body.token);
        if (error) throw error;
        return Response.json({ ok: true, message: "You're unsubscribed. No more alerts for this trip." });
      }

      const { data, error } = await db.from("alert_subscriptions")
        .update({ confirmed_at: new Date().toISOString() })
        .eq("token", body.token)
        .select("weekday, depart_time, stations(name)")
        .maybeSingle();
      if (error) throw error;
      if (!data) return bad("This link has expired. Subscribe again from the page.");
      const station = (data.stations as unknown as { name: string }).name;
      return Response.json({
        ok: true,
        message: `Alert on. You'll get an email on the evening before each ${DAYS[data.weekday]} ` +
          `if ${station} is usually empty at ${data.depart_time.slice(0, 5)}.`,
      });
    }

    // ------------------------------------------------------------------ subscribe
    if (body.action !== "subscribe") return bad("Unknown action");

    const email = String(body.email ?? "").trim().toLowerCase();
    const weekday = Number(body.weekday);
    const time = String(body.time ?? "");
    const timezone = String(body.timezone ?? "Europe/Paris");
    if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Enter a valid email address");
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return bad("Invalid weekday");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return bad("Invalid time");
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
    } catch {
      return bad("Invalid time zone");
    }

    const { data: station } = await db.from("stations").select("id, name")
      .eq("id", String(body.station_id ?? "")).maybeSingle();
    if (!station) return bad("Unknown station");

    // Rate limits, checked before anything is written or sent.
    const { data: existing, error: listError } = await db.from("alert_subscriptions")
      .select("station_id, weekday, depart_time, confirmed_at, created_at").eq("email", email);
    if (listError) throw listError;
    const cutoff = Date.now() - COOLDOWN_MINUTES * 60_000;
    const same = existing.find((s) =>
      s.station_id === station.id && s.weekday === weekday && s.depart_time.slice(0, 5) === time
    );
    if (
      same?.confirmed_at || // already active: nothing to do
      existing.some((s) => Date.parse(s.created_at) > cutoff) ||
      (!same && existing.length >= MAX_PER_EMAIL)
    ) {
      return Response.json(CHECK_INBOX);
    }

    const token = crypto.randomUUID();
    const { error: upsertError } = await db.from("alert_subscriptions").upsert({
      email,
      station_id: station.id,
      weekday,
      depart_time: time,
      timezone,
      token,
      created_at: new Date().toISOString(),
    }, { onConflict: "email,station_id,weekday,depart_time" });
    if (upsertError) throw upsertError;

    const link = siteLink({ confirm: token });
    const trip = `${station.name}, ${DAYS[weekday]}s at ${time}`;
    try {
      await sendEmail({
        to: email,
        subject: `Confirm your Dock Radar alert: ${trip}`,
        text: `Someone (hopefully you) asked Dock Radar to email this address on the evening before each ` +
          `${DAYS[weekday]} when ${station.name} is usually empty at ${time}.\n\n` +
          `Confirm: ${link}\n\nIf this wasn't you, ignore this email and nothing will be sent.`,
        html: `<p>Someone (hopefully you) asked Dock Radar to email this address on the evening before each ` +
          `${DAYS[weekday]} when <strong>${escapeHtml(station.name)}</strong> is usually empty at ${time}.</p>` +
          `<p><a href="${link}">Confirm my alert</a></p>` +
          `<p>If this wasn't you, ignore this email and nothing will be sent.</p>`,
      });
    } catch (err) {
      console.error(err);
      // Let the user retry straight away rather than hitting the cooldown.
      await db.from("alert_subscriptions").delete().eq("token", token);
      return Response.json({ ok: false, message: "Couldn't send the confirmation email. Try again later." }, {
        status: 502,
      });
    }
    return Response.json(CHECK_INBOX);
  }),
};

/* To invoke locally (after `supabase start` and `supabase functions serve`):

  curl -i -X POST 'http://127.0.0.1:54321/functions/v1/alert-subscribe' \
    --header "apikey: $SUPABASE_PUBLISHABLE_KEY" --header 'Content-Type: application/json' \
    --data '{"action":"subscribe","email":"you@example.com","station_id":"1","weekday":1,"time":"08:10"}'
*/
