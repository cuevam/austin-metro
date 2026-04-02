SELECT *
FROM bronze_raw_json 
ORDER BY ingested_at DESC;

SELECT COUNT(*) FROM bronze_raw_json;
SELECT max(ingested_at), count(*) FROM bronze_raw_json;
SELECT now();

SELECT COUNT(*) FROM silver_telemetry;
SELECT * FROM silver_telemetry;
DELETE FROM silver_telemetry WHERE vehicle_id = '101';

TRUNCATE TABLE silver_telemetry;

SELECT raw_payload 
FROM bronze_raw_json 
ORDER BY ingested_at DESC 
LIMIT 1;

SELECT arrayJoin(JSONExtractArrayRaw(raw_payload, 'entity')) AS vehicle_blob
FROM (
    SELECT raw_payload 
    FROM bronze_raw_json 
    ORDER BY ingested_at DESC 
    LIMIT 1
);

SELECT 
    JSONExtractString(vehicle_blob, 'id') AS vehicle_id,
    JSONExtractString(vehicle_blob, 'vehicle', 'vehicle', 'label') AS vehicle_label,
    JSONExtractString(vehicle_blob, 'vehicle', 'trip', 'tripId') AS trip_id,
    JSONExtractString(vehicle_blob, 'vehicle', 'trip', 'routeId') AS route_id,
    JSONExtractInt(vehicle_blob, 'vehicle', 'trip', 'directionId') AS direction_id,
    JSONExtractString(vehicle_blob, 'vehicle', 'trip', 'startTime') AS start_time,
    JSONExtractString(vehicle_blob, 'vehicle', 'trip', 'startDate') AS start_date,
    JSONExtractString(vehicle_blob, 'vehicle', 'trip', 'scheduleRelationship') AS schedule_relationship,
    JSONExtractFloat(vehicle_blob, 'vehicle', 'position', 'latitude') AS latitude,
    JSONExtractFloat(vehicle_blob, 'vehicle', 'position', 'longitude') AS longitude,
    JSONExtractFloat(vehicle_blob, 'vehicle', 'position', 'bearing') AS bearing,
    JSONExtractFloat(vehicle_blob, 'vehicle', 'position', 'speed') AS speed_mps,
    JSONExtractFloat(vehicle_blob, 'vehicle', 'position', 'speed') * 3.6 AS speed_kph,
    JSONExtractInt(vehicle_blob, 'vehicle', 'currentStopSequence') AS current_stop_sequence,
    JSONExtractString(vehicle_blob, 'vehicle', 'currentStatus') AS current_status,
    JSONExtractString(vehicle_blob, 'vehicle', 'stopId') AS stop_id,
    toDateTime(toUInt64(JSONExtractString(vehicle_blob, 'vehicle', 'timestamp'))) AS vehicle_timestamp,
    now() as processed_at
FROM (
    -- Step 2: Unnest the Array
    SELECT arrayJoin(JSONExtractArrayRaw(raw_payload, 'entity')) AS vehicle_blob
    FROM (
        -- Step 1: Isolate the Target Payload
        SELECT raw_payload 
        FROM bronze_raw_json 
        ORDER BY ingested_at DESC 
        LIMIT 1
    )
);


SELECT COUNT(*) FROM dim_routes;
SELECT COUNT(*) FROM dim_shapes;
SELECT COUNT(*) FROM dim_trips;
SELECT COUNT(*) FROM dim_stops;

select * from gold_active_fleet;