// Send one email through the Resend API, as in Supabase's "Sending Emails" guide
// (https://supabase.com/docs/guides/functions/examples/send-emails).
//
// Config (Edge Function secrets):
//   RESEND_API_KEY  a Resend API key with "Sending access"
//   ALERT_FROM      sender, e.g. "Dock Radar <alerts@yourdomain.com>". The default,
//                   onboarding@resend.dev, can only send to your own Resend account's address.

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
  idempotencyKey?: string; // Resend sends at most once per key within 24 h
}

export async function sendEmail(email: Email): Promise<{ id: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY secret is not set");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(email.idempotencyKey && { "Idempotency-Key": email.idempotencyKey }),
    },
    body: JSON.stringify({
      from: Deno.env.get("ALERT_FROM") ?? "Dock Radar <onboarding@resend.dev>",
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: email.headers,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${data.message ?? JSON.stringify(data)}`);
  return data;
}

// Links in emails point at the static front end, which POSTs the token back to alert-subscribe.
// (Edge Functions can't serve HTML pages on the default *.supabase.co domain.)
export function siteLink(params: Record<string, string>): string {
  const site = Deno.env.get("SITE_URL") ?? "http://localhost:8080";
  return `${site.replace(/\/$/, "")}/?${new URLSearchParams(params)}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
