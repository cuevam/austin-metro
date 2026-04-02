-- 1. Ensure the raw landing table exists
CREATE TABLE IF NOT EXISTS bronze_raw_json (
    raw_payload String,
    ingested_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY ingested_at;

-- 2. Drop the Silver table if you accidentally created the simplified one earlier
DROP TABLE IF EXISTS silver_telemetry;

CREATE TABLE silver_telemetry (
    vehicle_id String,
    vehicle_label String,
    trip_id Nullable(String),
    route_id LowCardinality(Nullable(String)),
    direction_id Int8,
    start_time Nullable(String),
    start_date Nullable(String),
    schedule_relationship LowCardinality(Nullable(String)),
    latitude Float64,
    longitude Float64,
    bearing Float64,
    speed_mps Float64,
    speed_kph Float64,
    current_stop_sequence Int32,
    current_status LowCardinality(String),
    stop_id String,
    vehicle_timestamp DateTime,
    source_ingested_at DateTime, 
    processed_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(vehicle_timestamp)
ORDER BY (vehicle_id, vehicle_timestamp);

CREATE OR REPLACE VIEW gold_active_fleet AS
WITH latest_telemetry AS (
    -- Step 1: Isolate the absolute newest ping for each active bus
    SELECT 
        vehicle_id,
        argMax(latitude, vehicle_timestamp) AS latitude,
        argMax(longitude, vehicle_timestamp) AS longitude,
        argMax(bearing, vehicle_timestamp) AS bearing,
        argMax(speed_kph, vehicle_timestamp) AS speed_kph,
        argMax(route_id, vehicle_timestamp) AS route_id,
        argMax(trip_id, vehicle_timestamp) AS trip_id,
        argMax(current_status, vehicle_timestamp) AS current_status,
        max(vehicle_timestamp) AS last_seen_at
    FROM silver_telemetry
    WHERE vehicle_timestamp >= now() - INTERVAL 15 MINUTE
    GROUP BY vehicle_id
)
-- Step 2: Enrich with Dimension Data
SELECT 
    t.vehicle_id,
    t.latitude,
    t.longitude,
    t.bearing,
    t.speed_kph,
    t.current_status,
    t.last_seen_at,
    t.route_id,
    r.route_short_name,
    r.route_long_name,
    r.route_color,
    tr.trip_headsign
FROM latest_telemetry t
LEFT JOIN dim_routes r ON t.route_id = r.route_id
LEFT JOIN dim_trips tr ON t.trip_id = tr.trip_id;