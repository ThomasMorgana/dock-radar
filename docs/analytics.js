// The only module that talks to PostHog. Every export is safe to call when analytics is off
// (no token, or localhost without POSTHOG_ON_LOCALHOST): it does nothing, and posthog-js isn't even downloaded.
// Nothing here may throw: analytics must never break the page.

import { LOCAL, POSTHOG_HOST, POSTHOG_ON_LOCALHOST, POSTHOG_TOKEN } from "./config.js";
import { getLang } from "./i18n.js";

const ENABLED = Boolean(POSTHOG_TOKEN) && (!LOCAL || POSTHOG_ON_LOCALHOST);

let posthog = null;              // set once posthog-js is loaded and initialised
let ready = Promise.resolve(null); // resolves to posthog, or null when off or the load failed

/** Loads posthog-js and starts it. Resolves to true when analytics is on. */
export function initAnalytics() {
  if (!ENABLED) return Promise.resolve(false);
  // A dynamic import rather than a static one, so a page without a token never fetches posthog-js.
  ready = import("https://cdn.jsdelivr.net/npm/posthog-js@1/+esm")
    .then(({ default: ph }) => {
      ph.init(POSTHOG_TOKEN, {
        api_host: POSTHOG_HOST,
        defaults: "2026-08-30",             // the latest in PostHog's JS config reference (2026-10)
        cookieless_mode: "on_reject",       // nothing stored, nothing captured until the visitor chooses
        person_profiles: "identified_only", // we never identify, so every event stays anonymous
        capture_exceptions: true,
        session_recording: { maskAllInputs: true },
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

export function track(event, props) {
  withPosthog((ph) => ph.capture(event, props));
}

export function trackError(err, props) {
  withPosthog((ph) => ph.captureException(err, props));
}

/** Super properties sent with every later event, e.g. the language after a switch. */
export function register(props) {
  withPosthog((ph) => ph.register(props));
}

/** The flag's variant, or "control" when analytics is off or flags haven't arrived yet. */
export function flag(key) {
  try {
    const value = posthog?.getFeatureFlag(key);
    return typeof value === "string" ? value : "control";
  } catch {
    return "control";
  }
}

/** Runs callback whenever flags load. Flags can arrive after the first paint. */
export function onFlags(callback) {
  withPosthog((ph) => ph.onFeatureFlags(() => callback()));
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
  withPosthog((ph) => (accepted ? ph.opt_in_capturing() : ph.opt_out_capturing()));
}
