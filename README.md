# Austin Metro — Real-Time Transit Data Warehouse

A portfolio project demonstrating end-to-end data engineering across ingestion, transformation, warehousing, and visualization — built with production-grade patterns on a live public transit feed.

**Live data source:** Capital Metro (Austin, TX) bus fleet — ~500 vehicles, updating every 60 seconds.

---

## Architecture Overview

```
GTFS-RT API (Texas Open Data Portal)
        │
        ▼
┌──────────────────┐
│   BRONZE LAYER   │  Raw JSON snapshots — append-only landing zone
│  bronze_raw_json │  ClickHouse MergeTree, ordered by ingested_at
└────────┬─────────┘
         │  Watermark-based incremental load
         ▼
┌──────────────────┐
│   SILVER LAYER   │  Typed, deduplicated telemetry rows
│ silver_telemetry │  ReplacingMergeTree on (vehicle_id, vehicle_timestamp)
└────────┬─────────┘
         │  argMax() aggregation + dimension JOIN
         ▼
┌──────────────────┐
│    GOLD LAYER    │  Latest position per vehicle, enriched with route/trip info
│ gold_active_fleet│  ClickHouse VIEW — query-time materialization
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Next.js App     │  Custom real-time map — deck.gl + MapLibre GL
│  transit-map/    │  Replaces Grafana; direct ClickHouse HTTP API queries
└──────────────────┘
```

**Orchestration:** Dagster (asset-based DAG, 1-minute schedule)
**Warehouse:** ClickHouse (columnar, Docker on WSL2)
**Visualization:** Next.js 14 + deck.gl v8 + react-map-gl

---

## Key Engineering Concepts Demonstrated

### Data Pipeline Patterns
- **Medallion / Lakehouse architecture** — Bronze → Silver → Gold layers with clear contracts at each boundary
- **Watermark-based incremental processing** — Silver only processes Bronze rows newer than `max(source_ingested_at)`, avoiding full reprocessing on every run
- **Idempotent schema migrations** — `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE VIEW` throughout
- **ELT pattern** — raw data lands in Bronze as-is; transformation happens inside the warehouse using ClickHouse SQL functions (`JSONExtractString`, `JSONExtractFloat`, `arrayJoin`)

### Data Modeling
- **Dimensional modeling** — fact table (`silver_telemetry`) joined to dimension tables (`dim_routes`, `dim_trips`, `dim_shapes`, `dim_stops`) at the Gold layer
- **ReplacingMergeTree deduplication** — Silver table deduplicates repeated pings for the same vehicle using ClickHouse's `ReplacingMergeTree` engine, ordered by `(vehicle_id, vehicle_timestamp)`
- **argMax() aggregation** — Gold view uses `argMax(field, vehicle_timestamp)` to extract the latest value of each field per vehicle without a subquery or window function
- **GTFS standard** — static schedule data (routes, trips, shapes, stops) loaded from the official GTFS ZIP format; real-time positions from GTFS-RT JSON feed

### Orchestration (Dagster)
- **Asset-based pipeline** — `bronze_transit_snapshot` and `silver_telemetry` defined as Dagster assets with explicit dependency (`AssetIn`), enabling lineage tracking and partial re-runs
- **Separate job for dimensions** — `dimension_sync_job` loads GTFS static data independently of the real-time telemetry pipeline
- **Schedule definition** — 1-minute cron schedule defined in code; status controlled via Dagster UI

### ClickHouse
- **Columnar storage** — MergeTree family engines for high-throughput append workloads
- **HTTP API** — queried directly via `fetch()` with `FORMAT JSONEachRow` for the visualization layer; no ORM or SDK on the query path
- **LowCardinality optimization** — `route_id`, `current_status`, `schedule_relationship` columns use `LowCardinality` to reduce storage and improve filter performance
- **Config-as-code** — system log tables disabled via XML config mounted into the container; listen host configured separately

### Visualization (Next.js + deck.gl)
- **Custom map application** — built to replace Grafana; demonstrates ability to build purpose-fit tooling rather than relying on generic BI tools
- **Real-time polling** — 15-second refresh cycle via `setInterval` + `fetch`
- **deck.gl IconLayer** — directional arrow icons rotated by GPS bearing, colored per route using evenly-spaced HSL palette for guaranteed uniqueness
- **Route shape overlays** — PathLayer renders the selected route's polyline geometry from `dim_shapes`, fetched on demand via `/api/shapes/[routeId]`
- **Next.js App Router API routes** — `/api/fleet` and `/api/shapes/[routeId]` query ClickHouse directly from server-side route handlers

---

## Stack

| Layer | Technology |
|---|---|
| Ingestion | Python 3, `requests` |
| Orchestration | Dagster (asset-based) |
| Warehouse | ClickHouse (columnar, Docker) |
| Transformation | ClickHouse SQL (`JSONExtract*`, `argMax`, `arrayJoin`) |
| Static dimensions | GTFS ZIP → ClickHouse via `clickhouse-connect` |
| Visualization | Next.js 14, TypeScript, deck.gl v8, MapLibre GL |
| Infrastructure | Docker Compose, WSL2 |

---

## Data Flow Detail

### Bronze — Raw Landing
Every minute, Dagster hits the CapMetro GTFS-RT endpoint and inserts the entire JSON response as a single string into `bronze_raw_json`. No transformation — the raw payload is preserved exactly as received.

### Silver — Typed Telemetry
ClickHouse's `JSONExtractString` / `JSONExtractFloat` / `arrayJoin` functions shred the raw JSON blobs into typed rows inline during the INSERT. The watermark pattern (`WHERE ingested_at > max(source_ingested_at)`) ensures each Bronze row is processed exactly once. `ReplacingMergeTree` deduplicates repeated vehicle pings at the storage engine level.

### Dimensions — GTFS Static
A separate Dagster job downloads the CapMetro GTFS static ZIP, parses `routes.txt`, `trips.txt`, `stops.txt`, and `shapes.txt` using Python's `csv.DictReader`, and performs a full truncate + reload into ClickHouse dimension tables. The `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` guard at the start of the job makes schema evolution safe to run repeatedly.

### Gold — Active Fleet View
A ClickHouse `VIEW` that joins the Silver fact table to dimension tables and uses `argMax()` to return the single latest GPS ping per vehicle across all history. Removing the time-window filter means the map always shows the most recent known position of every vehicle, even if the pipeline hasn't run recently.

### Visualization — Live Map
The Next.js app polls `/api/fleet` every 15 seconds. The API route queries `gold_active_fleet` directly via ClickHouse's HTTP interface with `FORMAT JSONEachRow`. The map renders ~500 vehicle icons using deck.gl's `IconLayer` with per-route HSL colors and GPS-bearing rotation. Selecting a route triggers a second query to `/api/shapes/[routeId]` which fetches polyline geometry from `dim_shapes` and renders it as a `PathLayer` underneath the icons.

---

## Running Locally

**Prerequisites:** Docker, Docker Compose, Node.js 18+, Python 3.12

```bash
# 1. Start ClickHouse
docker compose up -d clickhouse

# 2. Create schema
docker exec -i austin_metro_warehouse clickhouse-client \
  -u default --password vanguard_pass < sql/01_schema.sql

# 3. Install Python dependencies
python -m venv venv && source venv/bin/activate
pip install dagster dagster-webserver clickhouse-connect requests pandas

# 4. Load GTFS static dimensions (routes, trips, shapes, stops)
dagster job execute -f definitions.py -j dimension_sync_job

# 5. Start Dagster (pipeline UI at localhost:3000)
dagster dev -f definitions.py

# 6. Start the map (localhost:3001)
cd transit-map && npm install && npm run dev
```

Trigger `transit_sync_job` in the Dagster UI to run the Bronze → Silver pipeline, then open the map.

---

## Repository Structure

```
austin-metro/
├── assets/
│   ├── telemetry.py          # Bronze + Silver Dagster assets
│   └── dimensions.py         # GTFS static dimension loader
├── definitions.py            # Dagster jobs, schedules, definitions
├── sql/
│   └── 01_schema.sql         # ClickHouse DDL + gold_active_fleet view
├── ch_config/
│   ├── disable_logs.xml      # Disable ClickHouse system log tables
│   └── listen.xml            # ClickHouse network listen config
├── docker-compose.yml        # ClickHouse container
└── transit-map/              # Next.js visualization app
    └── app/
        ├── api/fleet/        # /api/fleet → gold_active_fleet
        ├── api/shapes/       # /api/shapes/[routeId] → dim_shapes
        └── FleetMap.tsx      # deck.gl map component
```
