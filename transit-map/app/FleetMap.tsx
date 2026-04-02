"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Map from "react-map-gl/maplibre";
import { DeckGL, ScatterplotLayer } from "deck.gl";
import type { PickingInfo } from "deck.gl";
import type { FleetVehicle } from "./api/fleet/route";
import "maplibre-gl/dist/maplibre-gl.css";

const AUSTIN = { longitude: -97.743, latitude: 30.267, zoom: 11 };
const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const REFRESH_MS = 15_000;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function rgbToCss([r, g, b]: [number, number, number]) {
  return `rgb(${r},${g},${b})`;
}

function buildColorMap(vehicles: FleetVehicle[]): Record<string, [number, number, number]> {
  const routes = Array.from(new Set(vehicles.map((v) => v.route_short_name))).sort();
  const colors: Record<string, [number, number, number]> = {};
  routes.forEach((route, i) => {
    colors[route] = hslToRgb(i / routes.length, 0.85, 0.6);
  });
  return colors;
}

export default function FleetMap() {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [hovered, setHovered] = useState<FleetVehicle | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);

  const fetchFleet = useCallback(async () => {
    try {
      const res = await fetch("/api/fleet");
      if (!res.ok) return;
      const data: FleetVehicle[] = await res.json();
      setVehicles(data);
    } catch {
      // silently retry on next interval
    }
  }, []);

  useEffect(() => {
    fetchFleet();
    const id = setInterval(fetchFleet, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchFleet]);

  const colorMap = useMemo<Record<string, [number, number, number]>>(
    () => buildColorMap(vehicles),
    [vehicles]
  );

  // Sorted list of [route, busCount] for the sidebar
  const routeList = useMemo(() => {
    const counts: Record<string, number> = {};
    vehicles.forEach((v) => {
      counts[v.route_short_name] = (counts[v.route_short_name] ?? 0) + 1;
    });
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  }, [vehicles]);

  const visibleVehicles = useMemo(
    () => selectedRoute ? vehicles.filter((v) => v.route_short_name === selectedRoute) : vehicles,
    [vehicles, selectedRoute]
  );

  const layers = [
    new ScatterplotLayer<FleetVehicle>({
      id: "fleet",
      data: visibleVehicles,
      getPosition: (v) => [v.longitude, v.latitude],
      getRadius: 60,
      radiusUnits: "meters",
      getFillColor: (v) => colorMap[v.route_short_name] ?? [180, 180, 180],
      updateTriggers: { getFillColor: [colorMap] },
      pickable: true,
      onHover: (info: PickingInfo) => {
        setHovered((info.object as FleetVehicle) ?? null);
        if (info.x !== undefined) setCursor({ x: info.x, y: info.y });
      },
    }),
  ];

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", background: "#0a0a0a" }}>

      {/* Sidebar */}
      <div style={{
        width: 200,
        flexShrink: 0,
        background: "#111",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        zIndex: 20,
      }}>
        <div style={{
          padding: "14px 12px 10px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: "#666",
          textTransform: "uppercase",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          Routes · {routeList.length}
        </div>

        {/* "All routes" reset row */}
        <button
          onClick={() => setSelectedRoute(null)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 12px",
            background: selectedRoute === null ? "rgba(255,255,255,0.07)" : "transparent",
            border: "none",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            color: selectedRoute === null ? "#fff" : "#888",
            fontSize: 12,
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
          }}
        >
          <span style={{
            width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
            background: "rgba(255,255,255,0.3)",
          }} />
          All routes
        </button>

        {/* Scrollable route list */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {routeList.map(([route, count]) => {
            const color = colorMap[route] ?? [180, 180, 180];
            const active = selectedRoute === route;
            return (
              <button
                key={route}
                onClick={() => setSelectedRoute(active ? null : route)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "7px 12px",
                  background: active ? "rgba(255,255,255,0.07)" : "transparent",
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.03)",
                  color: active ? "#fff" : "#aaa",
                  fontSize: 12,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                  background: rgbToCss(color),
                  boxShadow: active ? `0 0 6px ${rgbToCss(color)}` : "none",
                }} />
                <span style={{ flex: 1 }}>
                  {route === "" ? "(no route)" : `Route ${route}`}
                </span>
                <span style={{ color: "#555", fontSize: 11 }}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: "relative" }}>
        <DeckGL
          initialViewState={AUSTIN}
          controller
          layers={layers}
          style={{ width: "100%", height: "100%" }}
        >
          <Map mapStyle={BASEMAP} />
        </DeckGL>

        {hovered && (
          <div style={{
            position: "fixed",
            left: cursor.x + 12,
            top: cursor.y + 12,
            background: "rgba(10,10,10,0.92)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            padding: "8px 12px",
            color: "#fff",
            fontSize: 13,
            lineHeight: 1.6,
            pointerEvents: "none",
            zIndex: 30,
            maxWidth: 220,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              Route {hovered.route_short_name}
            </div>
            <div style={{ color: "#aaa", marginBottom: 6 }}>
              {hovered.trip_headsign}
            </div>
            <div>{hovered.speed_kph.toFixed(1)} km/h</div>
            <div style={{ color: "#aaa", fontSize: 11, marginTop: 2 }}>
              {hovered.current_status.replace(/_/g, " ")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
