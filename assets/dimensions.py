import zipfile
import io
import csv
import requests
import os
from dagster import asset, get_dagster_logger
from clickhouse_connect import get_client

# --- CONFIGURATION ---
CAPMETRO_STATIC_URL = os.getenv("CAPMETRO_STATIC_URL", "https://data.texas.gov/download/r4v4-vz24/application%2Fzip")
CH_HOST = os.getenv("CH_HOST", "localhost")
CH_PORT = int(os.getenv("CH_PORT", "8123"))
CH_USER = os.getenv("CH_USER", "default")
CH_PASS = os.getenv("CLICKHOUSE_PASSWORD", "vanguard_pass")

def get_ch_client():
    return get_client(host=CH_HOST, port=CH_PORT, username=CH_USER, password=CH_PASS)

# --- DIMENSION LAYER ---
@asset(description="Downloads GTFS Static ZIP, builds tables, and syncs Dimension data.")
def static_gtfs_dimensions():
    log = get_dagster_logger()
    client = get_ch_client()

    log.info("Preparing ClickHouse Dimension Tables...")
    client.command("ALTER TABLE dim_trips ADD COLUMN IF NOT EXISTS shape_id String DEFAULT ''")

    tables = {
        "dim_routes": "CREATE TABLE IF NOT EXISTS dim_routes (route_id String, route_short_name String, route_long_name String, route_color String) ENGINE = MergeTree() ORDER BY route_id",
        "dim_stops": "CREATE TABLE IF NOT EXISTS dim_stops (stop_id String, stop_name String, stop_lat Float64, stop_lon Float64) ENGINE = MergeTree() ORDER BY stop_id",
        "dim_trips": "CREATE TABLE IF NOT EXISTS dim_trips (trip_id String, route_id String, direction_id Int8, trip_headsign String, shape_id String DEFAULT '') ENGINE = MergeTree() ORDER BY trip_id",
        "dim_shapes": "CREATE TABLE IF NOT EXISTS dim_shapes (shape_id String, shape_pt_lat Float64, shape_pt_lon Float64, shape_pt_sequence Int32) ENGINE = MergeTree() ORDER BY (shape_id, shape_pt_sequence)"
    }

    for table_name, ddl in tables.items():
        client.command(ddl)
        client.command(f"TRUNCATE TABLE {table_name}")

    log.info("Downloading GTFS Static ZIP from CapMetro...")
    response = requests.get(CAPMETRO_STATIC_URL, timeout=120)
    response.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(response.content)) as z:
        def process_file(filename, extract_logic):
            with z.open(filename) as f:
                content = f.read().decode('utf-8-sig')
                reader = csv.DictReader(io.StringIO(content))
                return [extract_logic(row) for row in reader]

        routes_data = process_file("routes.txt", lambda r: [r.get("route_id", ""), r.get("route_short_name", ""), r.get("route_long_name", ""), r.get("route_color", "FFFFFF")])
        client.insert("dim_routes", routes_data, column_names=["route_id", "route_short_name", "route_long_name", "route_color"])
        
        stops_data = process_file("stops.txt", lambda r: [r.get("stop_id", ""), r.get("stop_name", ""), float(r.get("stop_lat", 0.0)), float(r.get("stop_lon", 0.0))])
        client.insert("dim_stops", stops_data, column_names=["stop_id", "stop_name", "stop_lat", "stop_lon"])
        
        trips_data = process_file("trips.txt", lambda r: [r.get("trip_id", ""), r.get("route_id", ""), int(r.get("direction_id", 0)), r.get("trip_headsign", ""), r.get("shape_id", "")])
        client.insert("dim_trips", trips_data, column_names=["trip_id", "route_id", "direction_id", "trip_headsign", "shape_id"])
        
        shapes_data = process_file("shapes.txt", lambda r: [r.get("shape_id", ""), float(r.get("shape_pt_lat", 0.0)), float(r.get("shape_pt_lon", 0.0)), int(r.get("shape_pt_sequence", 0))])
        client.insert("dim_shapes", shapes_data, column_names=["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"])

    return "Dimensions synced successfully."