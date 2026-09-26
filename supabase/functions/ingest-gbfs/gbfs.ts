// Fetching and parsing a GBFS v3 feed into rows for our two tables.
// Plain TypeScript with no Supabase or Deno APIs, so it can be tested on its own.
// Spec: https://github.com/MobilityData/gbfs/blob/v3.0/gbfs.md

export type StationRow = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  capacity: number | null;
  updated_at: string;
};

export type SnapshotRow = {
  station_id: string;
  observed_at: string;
  bikes_available: number;
  ebikes_available: number | null;
  docks_available: number;
  is_renting: boolean;
  is_returning: boolean;
};

type LocalizedString = { text: string; language: string }[];

type Feed<T> = { version: string; last_updated: string; data: T };

type Discovery = { feeds: { name: string; url: string }[] };

type StationInformation = {
  stations: {
    station_id: string;
    name: LocalizedString;
    lat: number;
    lon: number;
    capacity?: number;
  }[];
};

type StationStatus = {
  stations: {
    station_id: string;
    num_vehicles_available: number;
    num_docks_available?: number;
    is_renting: boolean;
    is_returning: boolean;
    vehicle_types_available?: { vehicle_type_id: string; count: number }[];
  }[];
};

type VehicleTypes = {
  vehicle_types: { vehicle_type_id: string; propulsion_type: string }[];
};

async function fetchFeed<T>(url: string): Promise<Feed<T>> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  const feed = (await res.json()) as Feed<T>;
  if (!feed.version?.startsWith("3.")) {
    throw new Error(`Expected a GBFS 3.x feed, got version "${feed.version}" from ${url}`);
  }
  return feed;
}

/** Reads the discovery feed (gbfs.json) and turns the station feeds into table rows. */
export async function loadGbfs(discoveryUrl: string) {
  const discovery = await fetchFeed<Discovery>(discoveryUrl);
  const feedUrl = (name: string) => discovery.data.feeds.find((f) => f.name === name)?.url;

  const infoUrl = feedUrl("station_information");
  const statusUrl = feedUrl("station_status");
  if (!infoUrl || !statusUrl) {
    throw new Error("Discovery feed must list station_information and station_status");
  }
  const vehicleTypesUrl = feedUrl("vehicle_types"); // optional in GBFS

  const [info, status, vehicleTypes] = await Promise.all([
    fetchFeed<StationInformation>(infoUrl),
    fetchFeed<StationStatus>(statusUrl),
    vehicleTypesUrl ? fetchFeed<VehicleTypes>(vehicleTypesUrl) : null,
  ]);

  const now = new Date().toISOString();
  const stations: StationRow[] = info.data.stations.map((s) => ({
    id: s.station_id,
    name: s.name[0]?.text ?? s.station_id,
    lat: s.lat,
    lon: s.lon,
    capacity: s.capacity ?? null,
    updated_at: now,
  }));

  // Vehicle types with any kind of motor count as e-bikes.
  const electricTypeIds = vehicleTypes
    ? new Set(
      vehicleTypes.data.vehicle_types
        .filter((t) => t.propulsion_type !== "human")
        .map((t) => t.vehicle_type_id),
    )
    : null;

  // Skip statuses for stations missing from station_information (the foreign key would reject them).
  const knownIds = new Set(stations.map((s) => s.id));
  const observedAt = new Date(status.last_updated).toISOString();

  const snapshots: SnapshotRow[] = status.data.stations
    .filter((s) => knownIds.has(s.station_id))
    .map((s) => ({
      station_id: s.station_id,
      observed_at: observedAt,
      bikes_available: s.num_vehicles_available,
      ebikes_available: electricTypeIds && s.vehicle_types_available
        ? s.vehicle_types_available
          .filter((v) => electricTypeIds.has(v.vehicle_type_id))
          .reduce((sum, v) => sum + v.count, 0)
        : null,
      docks_available: s.num_docks_available ?? 0,
      is_renting: s.is_renting,
      is_returning: s.is_returning,
    }));

  return { stations, snapshots, observedAt };
}
