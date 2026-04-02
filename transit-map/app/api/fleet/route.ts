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

// Hardcoded seed data — Phase 1 scaffold only.
// Phase 2 will replace this with a live ClickHouse query against gold_active_fleet.
const HARDCODED_FLEET: FleetVehicle[] = [
  {
    vehicle_id: "1001",
    latitude: 30.2672,
    longitude: -97.7431,
    bearing: 45,
    speed_kph: 32.5,
    current_status: "IN_TRANSIT_TO",
    last_seen_at: new Date().toISOString(),
    route_id: "1",
    route_short_name: "1",
    route_long_name: "North Lamar/South Congress",
    route_color: "E3151A",
    trip_headsign: "North Lamar",
  },
  {
    vehicle_id: "1002",
    latitude: 30.2849,
    longitude: -97.7341,
    bearing: 180,
    speed_kph: 0,
    current_status: "STOPPED_AT",
    last_seen_at: new Date().toISOString(),
    route_id: "7",
    route_short_name: "7",
    route_long_name: "Duval/Dove Springs",
    route_color: "0066CC",
    trip_headsign: "Dove Springs",
  },
  {
    vehicle_id: "1003",
    latitude: 30.2541,
    longitude: -97.7642,
    bearing: 270,
    speed_kph: 48.0,
    current_status: "IN_TRANSIT_TO",
    last_seen_at: new Date().toISOString(),
    route_id: "10",
    route_short_name: "10",
    route_long_name: "West 7th Street",
    route_color: "008000",
    trip_headsign: "Westgate Transit Center",
  },
];

export async function GET() {
  return NextResponse.json(HARDCODED_FLEET);
}
