import { NextResponse } from "next/server";

export interface FleetVehicle {
  vehicle_id: string;
  latitude: number;
  longitude: number;
  bearing: number;
  speed_kph: number;
  current_status: string;
  last_seen_at: string;
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_color: string;
  trip_headsign: string;
}

const QUERY = `
  SELECT
    vehicle_id,
    latitude,
    longitude,
    bearing,
    speed_kph,
    current_status,
    toString(last_seen_at) AS last_seen_at,
    ifNull(\`t.route_id\`, '') AS route_id,
    ifNull(route_short_name, '')  AS route_short_name,
    ifNull(route_long_name, '')   AS route_long_name,
    ifNull(route_color, 'CCCCCC') AS route_color,
    ifNull(trip_headsign, '')     AS trip_headsign
  FROM gold_active_fleet
  FORMAT JSONEachRow
`;

export async function GET() {
  const url = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
  const user = process.env.CLICKHOUSE_USER ?? "default";
  const password = process.env.CLICKHOUSE_PASSWORD ?? "";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-ClickHouse-User": user,
        "X-ClickHouse-Key": password,
        "Content-Type": "text/plain",
      },
      body: QUERY,
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }

    const text = await res.text();
    const vehicles: FleetVehicle[] = text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    return NextResponse.json(vehicles);
  } catch (err) {
    console.error("[/api/fleet]", err);
    return NextResponse.json(
      { error: "Failed to query fleet data", detail: String(err) },
      { status: 500 }
    );
  }
}
