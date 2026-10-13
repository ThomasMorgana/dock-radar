// The only module that talks to PostHog. Every export is safe to call when analytics is off
// (no token, or localhost without POSTHOG_ON_LOCALHOST): it does nothing, and posthog-js isn't even downloaded.
// Nothing here may throw: analytics must never break the page.

import { LOCAL, POSTHOG_HOST, POSTHOG_ON_LOCALHOST, POSTHOG_TOKEN } from "./config.js";
import { getLang } from "./i18n.js";

const ENABLED = Boolean(POSTHOG_TOKEN) && (!LOCAL || POSTHOG_ON_LOCALHOST);

let posthog = null;                // for the synchronous reads (flag, consentStatus) once loaded
let ready = Promise.resolve(null); // resolves to posthog, or null when off or the load failed

/** Loads posthog-js and starts it. Resolves to true when analytics is on. */
export function initAnalytics() {
  if (!ENABLED) return Promise.resolve(false);
  // A dynamic import rather than a static one, so a page without a token never fetches posthog-js.
  ready = import("https://cdn.jsdelivr.net/npm/posthog-js@1/+esm")
    .then(({ default: ph }) => {
      ph.init(POSTHOG_TOKEN, {
        api_host: POSTHOG_HOST,
        defaults: "2026-08-30",             // pinned so PostHog's defaults don't change under us; bump deliberately
        cookieless_mode: "on_reject",       // no cookies, nothing captured until the visitor chooses
        person_profiles: "identified_only", // we never identify, so every event stays anonymous
        capture_exceptions: true,
        session_recording: { maskAllInputs: true },
        // Surveys otherwise follow the browser's language, which may not be the one picked on the page.
        override_display_language: getLang(),
        debug: LOCAL,
        loaded: (loaded) => loaded.register({ app: "dock-radar", env: LOCAL ? "local" : "production", lang: getLang() }),
      });
      posthog = ph;
      return ph;
    })
    .catch((err) => {
      console.warn("Analytics unavailable:", err); // blocked by an ad blocker, offline, …
      return null;
    });
  return ready.then(Boolean);
}

/** Runs fn(posthog) once loaded; swallows any error. Calls made before the load are kept, in order. */
function withPosthog(fn) {
  ready.then((ph) => ph && fn(ph)).catch((err) => console.warn("Analytics error:", err));
}

// Until the visitor chooses, posthog-js drops events (cookieless_mode "on_reject"). Without this,
// a first visit from a shared link would lose its station_selected and profile_viewed.
// Kept in memory only, and sent once the visitor accepts or declines.
const held = [];

/** Runs send(posthog) now, or once the visitor has chosen. */
function sendOrHold(send) {
  withPosthog((ph) => {
    if (ph.get_explicit_consent_status() === "pending") held.push(send);
    else send(ph);
  });
}

export function track(event, props) {
  const timestamp = new Date(); // the original time, even when held
  sendOrHold((ph) => ph.capture(event, props, { timestamp }));
}

/** Reports a handled error. `where` in props says which part of the page failed. */
export function trackError(err, props) {
  // supabase-js errors are plain objects ({ message, code, details, hint }). Wrapped in an Error,
  // they get a readable issue title instead of "[object Object]".
  const error = err instanceof Error ? err : Object.assign(new Error(err?.message ?? String(err)), { name: "SupabaseError" });
  sendOrHold((ph) => ph.captureException(error, { ...props, code: err?.code }));
}

/** Tags this session's later events, e.g. the survey response with the profile it was about. */
export function registerForSession(props) {
  withPosthog((ph) => ph.register_for_session(props));
}

/** After a language switch: tags later events, and shows surveys in that language. */
export function setAnalyticsLang(lang) {
  withPosthog((ph) => {
    ph.register({ lang });
    ph.set_config({ override_display_language: lang });
  });
}

// Flags read while consent is pending. posthog-js drops their $feature_flag_called (the experiment
// exposure) but still marks it as reported, so it would never be counted. Reported after the choice instead.
const unreported = new Set();

/** The flag's variant, or "control" when analytics is off or flags haven't arrived yet. */
export function flag(key) {
  try {
    const pending = posthog?.get_explicit_consent_status() === "pending";
    if (pending) unreported.add(key);
    const value = posthog?.getFeatureFlag(key, { send_event: !pending });
    return typeof value === "string" ? value : "control";
  } catch {
    return "control";
  }
}

/** Runs callback whenever flags load. They can arrive after the first paint, and reload on the consent choice. */
export function onFlags(callback) {
  withPosthog((ph) => ph.onFeatureFlags(callback));
}

/** "pending", "granted" or "denied". null when analytics is off. */
export function consentStatus() {
  try {
    return posthog?.get_explicit_consent_status() ?? null;
  } catch {
    return null;
  }
}

/** Accept: cookies, replay and surveys. Decline: anonymous cookieless events only. */
export function setConsent(accepted) {
  withPosthog((ph) => {
    if (accepted) ph.opt_in_capturing();
    else ph.opt_out_capturing();
    for (const key of unreported) ph.getFeatureFlag(key); // sends the exposure now
    unreported.clear();
    for (const send of held.splice(0)) send(ph);
  });
}
