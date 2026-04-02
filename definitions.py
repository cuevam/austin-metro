from dagster import (
    Definitions, 
    define_asset_job, 
    ScheduleDefinition, 
    DefaultScheduleStatus,
    load_assets_from_modules
)

# 1. Import your organized logic modules
from assets import telemetry, dimensions

# 2. Define Jobs
transit_sync_job = define_asset_job(
    name="transit_sync_job",
    selection=["bronze_transit_snapshot", "silver_telemetry"], 
    tags={"dagster/max_concurrent_runs": "1"},
)

dimension_sync_job = define_asset_job(
    name="dimension_sync_job",
    selection=["static_gtfs_dimensions"]
)

# 3. Define Schedules (Only the telemetry runs on a timer)
transit_schedule = ScheduleDefinition(
    job=transit_sync_job,
    cron_schedule="* * * * *",
    default_status=DefaultScheduleStatus.STOPPED,
)

# 4. The Master Registry
defs = Definitions(
    assets=load_assets_from_modules([telemetry, dimensions]),
    jobs=[transit_sync_job, dimension_sync_job],
    schedules=[transit_schedule],
)