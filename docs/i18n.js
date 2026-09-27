// Dock Radar translations. Every string shown on the page lives here, in English and French.
// Entries are plain strings or functions of their placeholders.
// Messages returned by the alert-subscribe Edge Function (and the emails) stay in English.

const NB = " "; // French puts a non-breaking space before : ? ! and %

const s = (n, word) => `${word}${n === 1 ? "" : "s"}`;        // English plural
const sFr = (n, word) => `${word}${n > 1 ? "s" : ""}`;         // French plural (0 and 1 are singular)

const STRINGS = {
  en: {
    description: "Will there be a bike at my station when I leave? How TBM Le Vélo stations in Bordeaux usually look at this time of the week.",
    tagline: "Will there be a bike at my station when I leave?",
    switchLabel: "FR",
    switchTitle: "Passer en français",
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],

    station: "Station",
    stations: "Stations",
    loadingStations: "Loading stations…",
    typeStation: "Type a station name",
    noMatch: "No matching station",
    nearest: "Nearest",
    nearestTitle: "Use my location",
    leavingOn: "Leaving on",
    at: "at",
    now: "Now",
    share: "Share",
    usualTitleDefault: "Usually at this time",
    nearbyTitle: "Nearby stations, same time",
    alertTitleDefault: "Email me the evening before",
    alertLabel: "If this station is usually empty at this time, email",
    alertButton: "Alert me",
    alertHint: "You'll get one email to confirm. Every alert has a one-click unsubscribe link.",
    footerData: "Station data: <strong>Bordeaux Métropole / TBM</strong>, open data under the Licence Ouverte. " +
      "Dock Radar records availability every 5 minutes, and the history grows every week.",
    footerSource: "Source on GitHub",
    builtWith: "Built with Supabase",

    // Live count
    noLive: "No live data yet.",
    closed: (time) => `<strong>Closed for rentals</strong> · as of ${time}`,
    bikes: (n) => s(n, "bike"),
    ebikes: (n) => ` (${n} electric)`,
    freeDocks: (n) => `${n} ${s(n, "free dock")}`,
    asOf: (time) => `as of ${time}`,
    stale: (min) => `This is ${min} minutes old. Collection may be paused.`,

    // Usual profile
    usualTitle: (day, time) => `Usually on ${day}s around ${time}`,
    noHistory: (day, time) => `No history for ${day}s at ${time} yet.
      Dock Radar has been collecting since September 2026, and this slot will fill in over the coming weeks.`,
    good: "You'll almost always find a bike.",
    ok: "Usually fine, sometimes empty.",
    bad: "Often empty. Leave earlier or try a nearby station.",
    stats: (empty, avg, full, avgValue) =>
      `<strong>Empty ${empty}% of the time</strong> · ${avg} ${s(avgValue, "bike")} on average · full ${full}% of the time`,
    basis: (day, start, end, days, samples) =>
      `${day}s ${start}–${end}, based on ${days} ${s(days, day)} (${samples} ${s(samples, "reading")}).`,
    thin: (day, days) => `Only ${days} ${s(days, day)} of history so far, so treat this as a first hint.`,
    earlier: (empty, time) => `Leaving 15 minutes earlier looks better: empty ${empty}% of the time at ${time}.`,

    // Nearby
    usuallyEmpty: (pct) => `usually empty ${pct}%`,
    noHistoryYet: "no history yet",
    bikesNow: (n) => `${n} ${s(n, "bike")} now`,
    noLiveData: "no live data",
    betterBet: "Better bet",

    // Status messages
    loading: "Loading…",
    loadError: "Couldn't load data. Please try again in a moment.",
    stationsError: "Couldn't load stations. Please refresh the page.",
    unknownStation: "The station in this link doesn't exist anymore. Pick one from the list.",
    alertTitle: (day) => `Email me the evening before each ${day}`,
    sending: "Sending…",
    genericError: "Something went wrong. Please try again later.",
    confirming: "Confirming your alert…",
    unsubscribing: "Unsubscribing…",
    shareText: (name, day, time) => `${name}: ${day}s around ${time}`,
    linkCopied: "Link copied.",
    noGeolocation: "Your browser doesn't share its location.",
    locating: "Finding the nearest station…",
    locationError: "Location unavailable. Pick a station from the list.",
  },

  fr: {
    description: `Y aura-t-il un vélo à ma station quand je partirai${NB}? L'état habituel des stations TBM Le Vélo à Bordeaux à ce moment de la semaine.`,
    tagline: `Y aura-t-il un vélo à ma station quand je partirai${NB}?`,
    switchLabel: "EN",
    switchTitle: "Switch to English",
    days: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],

    station: "Station",
    stations: "Stations",
    loadingStations: "Chargement des stations…",
    typeStation: "Tapez le nom d'une station",
    noMatch: "Aucune station trouvée",
    nearest: "La plus proche",
    nearestTitle: "Utiliser ma position",
    leavingOn: "Départ le",
    at: "à",
    now: "Maintenant",
    share: "Partager",
    usualTitleDefault: "Habituellement à cette heure",
    nearbyTitle: "Stations proches, même heure",
    alertTitleDefault: "M'avertir par e-mail la veille",
    alertLabel: "Si cette station est souvent vide à cette heure, écrire à",
    alertButton: "M'alerter",
    alertHint: "Vous recevrez un e-mail de confirmation. Chaque alerte contient un lien de désinscription en un clic.",
    footerData: `Données des stations${NB}: <strong>Bordeaux Métropole / TBM</strong>, données ouvertes sous Licence Ouverte. ` +
      "Dock Radar relève la disponibilité toutes les 5 minutes, et l'historique s'enrichit chaque semaine.",
    footerSource: "Code source sur GitHub",
    builtWith: "Construit avec Supabase",

    noLive: "Pas encore de données en direct.",
    closed: (time) => `<strong>Location fermée</strong> · à ${time}`,
    bikes: (n) => sFr(n, "vélo"),
    ebikes: (n) => ` (dont ${n} ${sFr(n, "électrique")})`,
    freeDocks: (n) => `${n} ${sFr(n, "place")} ${sFr(n, "libre")}`,
    asOf: (time) => `à ${time}`,
    stale: (min) => `Ces données datent de ${min} minutes. La collecte est peut-être en pause.`,

    usualTitle: (day, time) => `Habituellement le ${day} vers ${time}`,
    noHistory: (day, time) => `Pas encore d'historique le ${day} à ${time}.
      Dock Radar collecte depuis septembre 2026${NB}: ce créneau se remplira au fil des semaines.`,
    good: "Vous trouverez presque toujours un vélo.",
    ok: "En général ça va, parfois vide.",
    bad: "Souvent vide. Partez plus tôt ou essayez une station proche.",
    stats: (empty, avg, full, avgValue) =>
      `<strong>Vide ${empty}${NB}% du temps</strong> · ${avg} ${avgValue >= 2 ? "vélos" : "vélo"} en moyenne · pleine ${full}${NB}% du temps`,
    basis: (day, start, end, days, samples) =>
      `Le ${day} de ${start} à ${end}, d'après ${days} ${sFr(days, day)} (${samples} ${sFr(samples, "relevé")}).`,
    thin: (day, days) => `Seulement ${days} ${sFr(days, day)} d'historique pour l'instant${NB}: c'est une première indication.`,
    earlier: (empty, time) => `Partir 15 minutes plus tôt semble plus sûr${NB}: vide ${empty}${NB}% du temps à ${time}.`,

    usuallyEmpty: (pct) => `vide ${pct}${NB}% du temps`,
    noHistoryYet: "pas encore d'historique",
    bikesNow: (n) => `${n} ${sFr(n, "vélo")} maintenant`,
    noLiveData: "pas de données en direct",
    betterBet: "Meilleure option",

    loading: "Chargement…",
    loadError: "Impossible de charger les données. Réessayez dans un instant.",
    stationsError: "Impossible de charger les stations. Rechargez la page.",
    unknownStation: "La station de ce lien n'existe plus. Choisissez-en une dans la liste.",
    alertTitle: (day) => `M'avertir par e-mail la veille de chaque ${day}`,
    sending: "Envoi…",
    genericError: "Une erreur s'est produite. Réessayez plus tard.",
    confirming: "Confirmation de votre alerte…",
    unsubscribing: "Désinscription…",
    shareText: (name, day, time) => `${name}${NB}: le ${day} vers ${time}`,
    linkCopied: "Lien copié.",
    noGeolocation: "Votre navigateur ne partage pas sa position.",
    locating: "Recherche de la station la plus proche…",
    locationError: "Position indisponible. Choisissez une station dans la liste.",
  },
};

const STORAGE_KEY = "dock-radar:lang";

/** Saved choice first, then the browser's preferred languages, then English. */
function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved in STRINGS) return saved;
  } catch { /* storage unavailable */ }
  const preferred = (navigator.languages ?? [navigator.language]).find((l) => /^(en|fr)\b/i.test(l ?? ""));
  return preferred?.slice(0, 2).toLowerCase() ?? "en";
}

let lang = initialLang();

export const getLang = () => lang;

export function setLang(next) {
  lang = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage unavailable */ }
}

/** Translated string for `key`, calling it with `args` when the entry is a function. */
export function t(key, ...args) {
  const entry = STRINGS[lang][key] ?? STRINGS.en[key];
  return typeof entry === "function" ? entry(...args) : entry;
}

/** Numbers formatted for the current language: 12.5 in English, 12,5 in French. */
export function num(value) {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(Number(value));
}
