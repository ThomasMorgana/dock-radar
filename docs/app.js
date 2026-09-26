// Dock Radar front end: pick a station and a departure time, then show the live count,
// how the station usually looks in that 15-minute slot, and nearby alternatives.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { NEARBY_RADIUS_M, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, TIMEZONE } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const STALE_AFTER_MIN = 20;

const $ = (id) => document.getElementById(id);

let stations = [];        // rows of the station_latest view
let byLabel = new Map();  // datalist label -> station
let renderId = 0;         // ignores results of outdated requests

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

  $("station-list").replaceChildren(
    ...[...byLabel.keys()].map((label) => Object.assign(document.createElement("option"), { value: label })),
  );
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
      timeZone: TIMEZONE, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { weekday: DAYS.indexOf(parts.weekday) + 1, time: `${parts.hour}:${parts.minute}` };
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

const hhmm = (t) => t.slice(0, 5);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function verdict(p) {
  if (!p || p.samples === 0) return null;
  const empty = Number(p.pct_empty);
  if (empty < 10) return { level: "good", text: "You'll almost always find a bike." };
  if (empty < 30) return { level: "ok", text: "Usually fine, sometimes empty." };
  return { level: "bad", text: "Often empty. Leave earlier or try a nearby station." };
}

function remember(stationId) {
  try { localStorage.setItem("dock-radar:station", stationId); } catch { /* storage unavailable */ }
}

function remembered() {
  try { return localStorage.getItem("dock-radar:station"); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderLive(s) {
  if (!s.observed_at) return "No live data yet.";
  if (!s.is_renting) return `<strong>Closed for rentals</strong> · as of ${localTime(s.observed_at)}`;

  const ageMin = Math.round((Date.now() - new Date(s.observed_at)) / 60_000);
  const ebikes = s.ebikes_available ? ` (${s.ebikes_available} electric)` : "";
  const stale = ageMin > STALE_AFTER_MIN
    ? `<br><span class="warn">This is ${ageMin} minutes old. Collection may be paused.</span>`
    : "";
  return `<span class="big">${s.bikes_available}</span> ${s.bikes_available === 1 ? "bike" : "bikes"}${ebikes}
    · ${plural(s.docks_available, "free dock")} · as of ${localTime(s.observed_at)}${stale}`;
}

function renderUsual(p, earlier, weekday) {
  const day = DAYS[weekday - 1];
  if (p.samples === 0) {
    return `<p class="muted">No history for ${day}s at ${hhmm(p.slot_start)} yet.
      Dock Radar has been collecting since September 2026, and this slot will fill in over the coming weeks.</p>`;
  }

  const v = verdict(p);
  const thin = p.days_observed < 3
    ? `<p class="muted small">Only ${plural(p.days_observed, day)} of history so far, so treat this as a first hint.</p>`
    : "";

  let tip = "";
  if (earlier && earlier.samples > 0 && Number(earlier.pct_empty) + 15 <= Number(p.pct_empty)) {
    tip = `<p class="tip">Leaving 15 minutes earlier looks better: empty ${earlier.pct_empty}% of the time
      at ${hhmm(earlier.slot_start)}.</p>`;
  }

  return `
    <p class="verdict ${v.level}">${v.text}</p>
    <div class="meter" aria-hidden="true"><span style="width:${p.pct_empty}%"></span></div>
    <p><strong>Empty ${p.pct_empty}% of the time</strong> · ${p.avg_bikes} bikes on average
      · full ${p.pct_full}% of the time</p>
    <p class="muted small">${day}s ${hhmm(p.slot_start)}–${hhmm(p.slot_end)},
      based on ${plural(p.days_observed, day)} (${plural(p.samples, "reading")}).</p>
    ${thin}${tip}`;
}

function renderNearby(items, current) {
  const best = items
    .filter((i) => i.profile.samples > 0)
    .sort((a, b) => a.profile.pct_empty - b.profile.pct_empty)[0];
  const suggestBest = best && current.samples > 0 && Number(best.profile.pct_empty) < Number(current.pct_empty);

  return items.map(({ station: s, dist, profile: p }) => {
    const usual = p.samples > 0 ? `usually empty ${p.pct_empty}%` : "no history yet";
    const live = s.observed_at ? plural(s.bikes_available, "bike") + " now" : "no live data";
    const tag = suggestBest && s.id === best.station.id ? `<span class="badge">Better bet</span>` : "";
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
  const time = $("time").value;
  if (!time) return;

  $("status").textContent = "Loading…";
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

    $("station-name").textContent = station.name;
    $("live").innerHTML = renderLive(station);
    $("usual-title").textContent = `Usually on ${DAYS[weekday - 1]}s around ${time}`;
    $("usual").innerHTML = renderUsual(current, earlier, weekday);

    nearby.forEach((n, i) => (n.profile = nearbyProfiles[i]));
    $("nearby").innerHTML = renderNearby(nearby, current);
    $("nearby-card").hidden = nearby.length === 0;

    $("result").hidden = false;
    $("status").textContent = "";
  } catch (err) {
    if (id !== renderId) return;
    console.error(err);
    $("status").textContent = "Couldn't load data. Please try again in a moment.";
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function selectStation(station) {
  const label = [...byLabel].find(([, s]) => s.id === station.id)?.[0];
  if (label) $("station").value = label;
  render();
}

function setNow() {
  const now = nowInNetwork();
  $("weekday").value = String(now.weekday);
  $("time").value = now.time;
}

function useNearest() {
  if (!navigator.geolocation) {
    $("status").textContent = "Your browser doesn't share its location.";
    return;
  }
  $("status").textContent = "Finding the nearest station…";
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const here = { lat: coords.latitude, lon: coords.longitude };
      const nearest = stations.reduce((a, b) => (distanceM(here, a) <= distanceM(here, b) ? a : b));
      selectStation(nearest);
    },
    () => ($("status").textContent = "Location unavailable. Pick a station from the list."),
    { timeout: 10_000 },
  );
}

async function init() {
  setNow();
  $("station").addEventListener("change", render);
  $("weekday").addEventListener("change", render);
  $("time").addEventListener("change", render);
  $("now").addEventListener("click", () => { setNow(); render(); });
  $("nearest").addEventListener("click", useNearest);
  $("nearby").addEventListener("click", (e) => {
    const id = e.target.closest("button[data-station]")?.dataset.station;
    const station = stations.find((s) => s.id === id);
    if (station) selectStation(station);
  });

  try {
    await loadStations();
  } catch (err) {
    console.error(err);
    $("status").textContent = "Couldn't load stations. Please refresh the page.";
    return;
  }
  $("station").disabled = false;
  $("station").placeholder = "Type a station name";

  const saved = stations.find((s) => s.id === remembered());
  if (saved) selectStation(saved);
}

init();
