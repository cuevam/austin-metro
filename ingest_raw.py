import requests
import time
from clickhouse_connect import get_client

# 1. Configuration
# Austin CapMetro Vehicle Positions (JSON Feed)
API_URL = "https://data.texas.gov/download/cuc7-ywmd/text%2Fplain"
CH_HOST = 'localhost'
CH_PORT = 8123

def run_ingestion():
    # 2. Connect to the Warehouse
    client = client = get_client(
        host=CH_HOST, 
        port=CH_PORT, 
        username='default', 
        password='vanguard_pass'
    )
    
    try:
        print(f"[{time.strftime('%H:%M:%S')}] Fetching Austin fleet snapshot...")
        
        # 3. Extraction (The Fetch)
        # We use a timeout to ensure the script doesn't hang if the city server is slow
        response = requests.get(API_URL, timeout=10)
        response.raise_for_status()
        
        # 4. Landing (The Dump)
        # We store the entire payload as a raw string
        raw_payload = response.text
        
        # Inserting into the Bronze Layer
        client.insert('bronze_raw_json', [[raw_payload]], column_names=['raw_payload'])
        
        print(f"✅ Successfully dumped snapshot to Bronze Layer.")

    except Exception as e:
        print(f"❌ Ingestion Failed: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    print("Starting Vanguard-1 Ingestor (Sprint 1)...")
    # For now, we run a simple manual loop. 
    # In Phase 4, we will move this logic into a Dagster Asset.
    try:
        while True:
            run_ingestion()
            print("Sleeping 15s...")
            time.sleep(15)
    except KeyboardInterrupt:
        print("\nIngestor stopped by user.")