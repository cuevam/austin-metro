import json
import requests
import os
from dagster import asset, AssetIn, get_dagster_logger
from clickhouse_connect import get_client

# --- CONFIGURATION ---
CAPMETRO_URL = os.getenv("CAPMETRO_URL", "https://data.texas.gov/download/cuc7-ywmd/text%2Fplain")
CH_HOST = os.getenv("CH_HOST", "localhost")
CH_PORT = int(os.getenv("CH_PORT", "8123"))
CH_USER = os.getenv("CH_USER", "default")
CH_PASS = os.getenv("CLICKHOUSE_PASSWORD", "vanguard_pass")

REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TransitPipeline/1.0)",
    "Accept": "application/json, text/plain, */*",
}

def get_ch_client():
    return get_client(
        host=CH_HOST, port=CH_PORT, username=CH_USER, password=CH_PASS,
        connect_timeout=10, send_receive_timeout=60,
    )

# --- BRONZE LAYER ---
@asset
def bronze_transit_snapshot():
    log = get_dagster_logger()
    response = requests.get(CAPMETRO_URL, headers=REQUEST_HEADERS, timeout=30)
    response.raise_for_status()

    data = response.json()
    if not data.get("entity"):
        log.warning("API returned empty entity list — skipping insert.")
        return "Bronze skipped — empty feed"

    client = get_ch_client()
    client.insert(
        table="bronze_raw_json",
        data=[[json.dumps(data)]],
        column_names=["raw_payload"],
    )

    return f"Bronze complete: {len(data['entity'])} entities"

# --- SILVER LAYER ---
@asset(
    ins={"bronze_transit_snapshot": AssetIn()},
    description="Shreds GTFS JSON into silver_telemetry using a stable Bronze watermark."
)
def silver_telemetry(bronze_transit_snapshot):
    log = get_dagster_logger()

    if "skipped" in str(bronze_transit_snapshot).lower():
        return "Silver skipped"

    client = get_ch_client()
    sql = """
    INSERT INTO silver_telemetry
    SELECT
        JSONExtractString(vehicle_blob, 'id')                                          AS vehicle_id,
        JSONExtractString(vehicle_blob, 'vehicle', 'vehicle', 'label')                 AS vehicle_label,
        nullIf(JSONExtractString(vehicle_blob, 'vehicle', 'trip', 'tripId'), '')       AS trip_id,
        nullIf(JSONExtractString(vehicle_blob, 'vehicle', 'trip', 'routeId'), '')      AS route_id,
        JSONExtractInt(vehicle_blob, 'vehicle', 'trip', 'directionId')                 AS direction_id,
        nullIf(JSONExtractString(vehicle_blob, 'vehicle', 'trip', 'startTime'), '')    AS start_time,
        nullIf(JSONExtractString(vehicle_blob, 'vehicle', 'trip', 'startDate'), '')    AS start_date,
        nullIf(JSONExtractString(vehicle_blob, 'vehicle', 'trip', 'scheduleRelationship'), '') AS schedule_relationship,
        JSONExtractFloat(vehicle_blob, 'vehicle', 'position', 'latitude')              AS latitude,
        JSONExtractFloat(vehicle_blob, 'vehicle', 'position', 'longitude')             AS longitude,
        JSONExtractFloat(vehicle_blob, 'vehicle', 'position', 'bearing')               AS bearing,
        JSONExtractFloat(vehicle_blob, 'vehicle', 'position', 'speed')                 AS speed_mps,
        JSONExtractFloat(vehicle_blob, 'vehicle', 'position', 'speed') * 3.6           AS speed_kph,
        JSONExtractInt(vehicle_blob, 'vehicle', 'currentStopSequence')                 AS current_stop_sequence,
        JSONExtractString(vehicle_blob, 'vehicle', 'currentStatus')                    AS current_status,
        JSONExtractString(vehicle_blob, 'vehicle', 'stopId')                           AS stop_id,
        toDateTime(toUInt64(JSONExtractString(vehicle_blob, 'vehicle', 'timestamp')))  AS vehicle_timestamp,
        ingested_at                                                                    AS source_ingested_at,
        now()                                                                          AS processed_at
    FROM (
        SELECT arrayJoin(JSONExtractArrayRaw(raw_payload, 'entity')) AS vehicle_blob, ingested_at
        FROM bronze_raw_json
        WHERE ingested_at > (
            SELECT coalesce(max(source_ingested_at), toDateTime('1970-01-01 00:00:00'))
            FROM silver_telemetry
        )
    )
    """
    client.command(sql)
    log.info("Silver transformation complete.")
    return "Silver complete"