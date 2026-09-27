// Dock Radar front end: pick a station and a departure time, then show the live count,
// how the station usually looks in that 15-minute slot, and nearby alternatives.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { NEARBY_RADIUS_M, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, TIMEZONE } from "./config.js";
import { getLang, num, setLang, t } from "./i18n.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const STALE_AFTER_MIN = 20;
const dayName = (weekday) => t("days")[weekday - 1];

const $ = (id) => document.getElementById(id);

let stations = [];        // rows of the station_latest view
let byLabel = new Map();  // station picker label -> station
let renderId = 0;         // ignores results of outdated requests
let shown = null;         // the result on screen, kept to redraw it in another language

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function loadStations() {
  const { data, error } = await supabase.from("station_latest").select("*").order("name");
  if (error) throw error;
  stations = data;

  // Station names aren't guaranteed unique: add the id when two share a name.
  const counts = new Map();
  for (const s of stations) counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
  byLabel = new Map(stations.map((s) => [counts.get(s.name) > 1 ? `${s.name} (${s.id})` : s.name, s]));
}

async function profile(stationId, weekday, time) {
  const { data, error } = await supabase.rpc("station_profile", {
    p_station_id: stationId,
    p_weekday: weekday,
    p_time: time,
    p_timezone: TIMEZONE,
  });
  if (error) throw error;
  return data[0];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Current weekday (ISO 1-7) and HH:MM in the network's time zone, not the browser's. */
function nowInNetwork() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIMEZONE, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1;
  return { weekday, time: `${parts.hour}:${parts.minute}` };
}

function minusMinutes(time, minutes) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m - minutes;
  if (total < 0) return null; // don't cross into the previous day
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function distanceM(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function localTime(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" });
}

const hhmm = (time) => time.slice(0, 5);

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function verdict(p) {
  if (!p || p.samples === 0) return null;
  const empty = Number(p.pct_empty);
  const level = empty < 10 ? "good" : empty < 30 ? "ok" : "bad";
  return { level, text: t(level) };
}

function remember(stationId) {
  try { localStorage.setItem("dock-radar:station", stationId); } catch { /* storage unavailable */ }
}

function remembered() {
  try { return localStorage.getItem("dock-radar:station"); } catch { return null; }
}

// Shareable links: ?station=<id>&day=<ISO 1-7>&time=<HH:MM>. Every parameter is optional.

function shareUrl(stationId, weekday, time) {
  // Built by hand so the time reads 08:10 rather than 08%3A10.
  return `${location.origin}${location.pathname}?station=${encodeURIComponent(stationId)}&day=${weekday}&time=${time}`;
}

function linkParams() {
  const params = new URLSearchParams(location.search);
  const day = params.get("day");
  const time = params.get("time");
  return {
    stationId: params.get("station"),
    weekday: /^[1-7]$/.test(day ?? "") ? day : null,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time ?? "") ? time : null,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderLive(s) {
  if (!s.observed_at) return t("noLive");
  if (!s.is_renting) return t("closed", localTime(s.observed_at));

  const ageMin = Math.round((Date.now() - new Date(s.observed_at)) / 60_000);
  const ebikes = s.ebikes_available ? t("ebikes", s.ebikes_available) : "";
  const stale = ageMin > STALE_AFTER_MIN ? `<br><span class="warn">${t("stale", ageMin)}</span>` : "";
  return `<span class="big">${s.bikes_available}</span> ${t("bikes", s.bikes_available)}${ebikes}
    · ${t("freeDocks", s.docks_available)} · ${t("asOf", localTime(s.observed_at))}${stale}`;
}

function renderUsual(p, earlier, weekday) {
  const day = dayName(weekday);
  if (p.samples === 0) return `<p class="muted">${t("noHistory", day, hhmm(p.slot_start))}</p>`;

  const v = verdict(p);
  const thin = p.days_observed < 3 ? `<p class="muted small">${t("thin", day, p.days_observed)}</p>` : "";

  let tip = "";
  if (earlier && earlier.samples > 0 && Number(earlier.pct_empty) + 15 <= Number(p.pct_empty)) {
    tip = `<p class="tip">${t("earlier", num(earlier.pct_empty), hhmm(earlier.slot_start))}</p>`;
  }

  return `
    <p class="verdict ${v.level}">${v.text}</p>
    <div class="meter" aria-hidden="true"><span style="width:${p.pct_empty}%"></span></div>
    <p>${t("stats", num(p.pct_empty), num(p.avg_bikes), num(p.pct_full), Number(p.avg_bikes))}</p>
    <p class="muted small">${t("basis", day, hhmm(p.slot_start), hhmm(p.slot_end), p.days_observed, p.samples)}</p>
    ${thin}${tip}`;
}

function renderNearby(items, current) {
  const best = items
    .filter((i) => i.profile.samples > 0)
    .sort((a, b) => a.profile.pct_empty - b.profile.pct_empty)[0];
  const suggestBest = best && current.samples > 0 && Number(best.profile.pct_empty) < Number(current.pct_empty);

  return items.map(({ station: s, dist, profile: p }) => {
    const usual = p.samples > 0 ? t("usuallyEmpty", num(p.pct_empty)) : t("noHistoryYet");
    const live = s.observed_at ? t("bikesNow", s.bikes_available) : t("noLiveData");
    const tag = suggestBest && s.id === best.station.id ? `<span class="badge">${t("betterBet")}</span>` : "";
    return `<li>
      <button type="button" data-station="${escapeHtml(s.id)}">${escapeHtml(s.name)}</button> ${tag}
      <span class="muted small">${Math.round(dist)} m · ${live} · ${usual}</span>
    </li>`;
  }).join("");
}

async function render() {
  const station = byLabel.get($("station").value);
  if (!station) return;
  remember(station.id);

  const id = ++renderId;
  const weekday = Number($("weekday").value);
  const time = getTime();

  history.replaceState(null, "", shareUrl(station.id, weekday, time));
  $("share-status").textContent = "";
  $("status").textContent = t("loading");
  const earlierTime = minusMinutes(time, 15);
  const nearby = stations
    .filter((s) => s.id !== station.id)
    .map((s) => ({ station: s, dist: distanceM(station, s) }))
    .filter((n) => n.dist <= NEARBY_RADIUS_M)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3);

  try {
    const [current, earlier, nearbyProfiles] = await Promise.all([
      profile(station.id, weekday, time),
      earlierTime ? profile(station.id, weekday, earlierTime) : null,
      Promise.all(nearby.map((n) => profile(n.station.id, weekday, time))),
    ]);
    if (id !== renderId) return; // the user changed something meanwhile

    nearby.forEach((n, i) => (n.profile = nearbyProfiles[i]));
    shown = { station, weekday, time, current, earlier, nearby };
    paint();
    $("status").textContent = "";
  } catch (err) {
    if (id !== renderId) return;
    console.error(err);
    $("status").textContent = t("loadError");
  }
}

/** Draws the last loaded result. Also called on a language switch, without refetching. */
function paint() {
  if (!shown) return;
  const { station, weekday, time, current, earlier, nearby } = shown;
  $("station-name").textContent = station.name;
  $("live").innerHTML = renderLive(station);
  $("usual-title").textContent = t("usualTitle", dayName(weekday), time);
  $("usual").innerHTML = renderUsual(current, earlier, weekday);
  $("alert-title").textContent = t("alertTitle", dayName(weekday));
  $("nearby").innerHTML = renderNearby(nearby, current);
  $("nearby-card").hidden = nearby.length === 0;
  $("result").hidden = false;
}

// ---------------------------------------------------------------------------
// Email alerts (the alert-subscribe Edge Function; subscriptions aren't readable or writable via the API)
// ---------------------------------------------------------------------------

async function callAlerts(body) {
  const { data, error } = await supabase.functions.invoke("alert-subscribe", { body });
  if (!error) return data;
  const reply = await error.context?.json?.().catch(() => null);
  return reply ?? { ok: false, message: t("genericError") };
}

async function subscribe(e) {
  e.preventDefault();
  const station = byLabel.get($("station").value);
  if (!station) return;
  const button = $("alert-form").querySelector("button");
  button.disabled = true;
  $("alert-status").textContent = t("sending");
  const reply = await callAlerts({
    action: "subscribe",
    email: $("alert-email").value,
    station_id: station.id,
    weekday: Number($("weekday").value),
    time: getTime(),
    timezone: TIMEZONE,
  });
  $("alert-status").textContent = reply.message;
  button.disabled = false;
}

/** Confirm and unsubscribe links in emails land here: ?confirm=<token> or ?unsubscribe=<token>. */
async function handleEmailLink() {
  const params = new URLSearchParams(location.search);
  const action = ["confirm", "unsubscribe"].find((a) => params.has(a));
  if (!action) return;
  history.replaceState(null, "", location.pathname); // don't re-run it on refresh
  $("status").textContent = t(action === "confirm" ? "confirming" : "unsubscribing");
  const reply = await callAlerts({ action, token: params.get(action) });
  $("status").textContent = reply.message;
}

// ---------------------------------------------------------------------------
// Station picker: a combobox rather than a <datalist>, which mobile browsers
// support poorly (Firefox for Android ignores it, iOS hides it in the keyboard bar).
// ---------------------------------------------------------------------------

/** Lowercase, accents and punctuation stripped: "Gare St-Jean" -> "gare st jean". */
function fold(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

let matches = [];  // labels currently shown in the list
let active = -1;   // index of the highlighted option

function openList(query) {
  const words = fold(query).split(" ").filter(Boolean);
  const labels = [...byLabel.keys()];
  matches = words.length === 0 ? labels : labels
    .map((label) => ({ label, folded: fold(label) }))
    .filter(({ folded }) => words.every((w) => folded.includes(w)))
    .sort((a, b) => b.folded.startsWith(words[0]) - a.folded.startsWith(words[0]))
    .map(({ label }) => label);
  active = words.length > 0 && matches.length > 0 ? 0 : -1;

  const list = $("station-list");
  list.replaceChildren(...(matches.length > 0
    ? matches.map((label, i) => {
        const li = Object.assign(document.createElement("li"), { id: `station-opt-${i}`, textContent: label });
        li.setAttribute("role", "option");
        return li;
      })
    : [Object.assign(document.createElement("li"), { className: "empty", textContent: t("noMatch") })]));
  list.scrollTop = 0;
  list.hidden = false;
  $("station").setAttribute("aria-expanded", "true");
  highlight(active);
}

function closeList() {
  $("station-list").hidden = true;
  $("station").setAttribute("aria-expanded", "false");
  $("station").removeAttribute("aria-activedescendant");
  active = -1;
}

function highlight(index) {
  const options = $("station-list").querySelectorAll('[role="option"]');
  options.forEach((li, i) => li.setAttribute("aria-selected", String(i === index)));
  active = index;
  if (index < 0) return $("station").removeAttribute("aria-activedescendant");
  $("station").setAttribute("aria-activedescendant", options[index].id);
  options[index].scrollIntoView({ block: "nearest" });
}

function pick(label) {
  $("station").value = label;
  closeList();
  render();
}

function onStationKey(e) {
  const open = !$("station-list").hidden;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!open) return openList($("station").value);
    if (matches.length === 0) return;
    const step = e.key === "ArrowDown" ? 1 : -1;
    highlight((active + step + matches.length) % matches.length);
  } else if (e.key === "Enter") {
    e.preventDefault(); // don't submit the form
    if (open && active >= 0) pick(matches[active]);
    else if (open && matches.length === 1) pick(matches[0]);
  } else if (e.key === "Escape" && open) {
    closeList();
  }
}

/** On blur, accept an exact match typed by hand (ignoring case and accents). */
function onStationBlur() {
  closeList();
  const typed = fold($("station").value);
  const label = [...byLabel.keys()].find((l) => fold(l) === typed);
  if (label && label !== $("station").value) pick(label);
}

function setUpStationPicker() {
  const input = $("station");
  const list = $("station-list");
  input.addEventListener("focus", () => { input.select(); openList(""); });
  input.addEventListener("input", () => openList(input.value));
  input.addEventListener("keydown", onStationKey);
  input.addEventListener("blur", onStationBlur);
  // Keep focus on the input while tapping an option, so blur doesn't close the list first.
  list.addEventListener("pointerdown", (e) => e.preventDefault());
  list.addEventListener("mousedown", (e) => e.preventDefault());
  list.addEventListener("click", (e) => {
    const li = e.target.closest('[role="option"]');
    if (!li) return;
    pick(li.textContent);
    input.blur(); // hide the mobile keyboard
  });
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function selectStation(station) {
  const label = [...byLabel].find(([, s]) => s.id === station.id)?.[0];
  if (label) $("station").value = label;
  render();
}

// The departure time is two selects: hours, and minutes in 5-minute steps.
const pad = (n) => String(n).padStart(2, "0");

function fillTimeOptions() {
  const options = (values) => values.map((v) => `<option value="${pad(v)}">${pad(v)}</option>`).join("");
  $("hour").innerHTML = options([...Array(24).keys()]);
  $("minute").innerHTML = options([...Array(12).keys()].map((i) => i * 5));
}

const getTime = () => `${$("hour").value}:${$("minute").value}`;

/** Set HH:MM, rounding the minutes down to the 5-minute step. */
function setTime(time) {
  const [h, m] = time.split(":").map(Number);
  $("hour").value = pad(h);
  $("minute").value = pad(m - (m % 5));
}

function setNow() {
  const now = nowInNetwork();
  $("weekday").value = String(now.weekday);
  setTime(now.time);
}

async function share() {
  const station = byLabel.get($("station").value);
  if (!station) return;
  const url = shareUrl(station.id, $("weekday").value, getTime());
  const text = t("shareText", station.name, dayName($("weekday").value), getTime());
  if (navigator.share) {
    try { await navigator.share({ title: "Dock Radar", text, url }); } catch { /* cancelled */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    $("share-status").textContent = t("linkCopied");
  } catch {
    $("share-status").textContent = url;
  }
}

function useNearest() {
  if (!navigator.geolocation) {
    $("status").textContent = t("noGeolocation");
    return;
  }
  $("status").textContent = t("locating");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const here = { lat: coords.latitude, lon: coords.longitude };
      const nearest = stations.reduce((a, b) => (distanceM(here, a) <= distanceM(here, b) ? a : b));
      selectStation(nearest);
    },
    () => ($("status").textContent = t("locationError")),
    { timeout: 10_000 },
  );
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

/** Fill every element tagged with data-i18n* from the current language. */
function translatePage() {
  document.documentElement.lang = getLang();
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
  const attributes = { i18nContent: "content", i18nPlaceholder: "placeholder", i18nTitle: "title", i18nAriaLabel: "aria-label" };
  for (const [key, attribute] of Object.entries(attributes)) {
    const selector = `[data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`;
    for (const el of document.querySelectorAll(selector)) el.setAttribute(attribute, t(el.dataset[key]));
  }
  $("weekday").querySelectorAll("option").forEach((option, i) => (option.textContent = t("days")[i]));
}

function switchLanguage() {
  setLang(getLang() === "fr" ? "en" : "fr");
  translatePage();
  if (!$("station-list").hidden) openList($("station").value);
  paint();
}

async function init() {
  const link = linkParams(); // read before handleEmailLink clears the query string
  translatePage();
  $("lang").addEventListener("click", switchLanguage);
  fillTimeOptions();
  setNow();
  if (link.weekday) $("weekday").value = link.weekday;
  if (link.time) setTime(link.time);
  setUpStationPicker();
  $("weekday").addEventListener("change", render);
  $("hour").addEventListener("change", render);
  $("minute").addEventListener("change", render);
  $("now").addEventListener("click", () => { setNow(); render(); });
  $("nearest").addEventListener("click", useNearest);
  $("nearby").addEventListener("click", (e) => {
    const id = e.target.closest("button[data-station]")?.dataset.station;
    const station = stations.find((s) => s.id === id);
    if (station) selectStation(station);
  });
  $("share").addEventListener("click", share);
  $("alert-form").addEventListener("submit", subscribe);
  handleEmailLink();

  try {
    await loadStations();
  } catch (err) {
    console.error(err);
    $("status").textContent = t("stationsError");
    return;
  }
  $("station").disabled = false;
  $("station").dataset.i18nPlaceholder = "typeStation";
  $("station").placeholder = t("typeStation");

  // A shared link wins over the station remembered on this device.
  const linked = stations.find((s) => s.id === link.stationId);
  const saved = linked ?? stations.find((s) => s.id === remembered());
  if (saved) selectStation(saved);
  else if (link.stationId) $("status").textContent = t("unknownStation");
}

init();
