import requests
import polars as pl
import time
from datetime import datetime

# The Austin CapMetro public JSON feed
URL = "https://data.texas.gov/download/cuc7-ywmd/text%2Fplain"

def fetch_and_process():
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Fetching fleet telemetry...")
    
    # 1. Fetch the tiny JSON payload
    try:
        response = requests.get(URL, timeout=5)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        print(f"Network error: {e}")
        return

    # Extract the 'entity' list which contains the vehicles
    vehicles = data.get('entity', [])
    
    # 2. Extract ONLY what we need (dropping all the useless nested JSON bloat)
    clean_records = []
    for v in vehicles:
        if 'vehicle' in v and 'position' in v['vehicle']:
            pos = v['vehicle']['position']
            clean_records.append({
                "vehicle_id": v['vehicle'].get('vehicle', {}).get('id', 'unknown'),
                "latitude": pos.get('latitude'),
                "longitude": pos.get('longitude'),
                "speed_mps": pos.get('speed', 0), # Feed provides meters per second
                "timestamp": v['vehicle'].get('timestamp')
            })

    # 3. Hand off to Polars for instant, high-performance transformation
    if clean_records:
        df = pl.DataFrame(clean_records)
        
        # Transformation: Convert speed to km/h and filter out bad data
        df = df.with_columns(
            (pl.col("speed_mps") * 3.6).alias("speed_kmh")
        ).drop("speed_mps").drop_nulls()

        print(f"✅ Successfully processed {len(df)} vehicles in milliseconds.")
        print(df.head(3)) # Show a sneak peek of the clean data
        
        # ---> THIS IS WHERE THE SCRIPT WOULD PUSH TO CLICKHOUSE/TINYBIRD <---
        
# 4. The Infinite Loop (The "Stream")
if __name__ == "__main__":
    print("Starting telemetry stream... Press Ctrl+C to stop.")
    try:
        while True:
            fetch_and_process()
            time.sleep(15) # The script sleeps and uses ZERO resources for 15s
    except KeyboardInterrupt:
        print("\nStreaming gracefully stopped.")