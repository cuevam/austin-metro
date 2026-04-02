import { NextResponse } from "next/server";

const QUERY = (routeId: string) => `
  SELECT s.shape_id, s.shape_pt_lon, s.shape_pt_lat
  FROM dim_shapes s
  JOIN dim_trips t ON t.shape_id = s.shape_id
  WHERE t.route_id = (
    SELECT route_id FROM dim_routes WHERE route_short_name = '${routeId.replace(/'/g, "''")}'
    LIMIT 1
  )
  ORDER BY s.shape_id, s.shape_pt_sequence
  FORMAT JSONEachRow
`;

export async function GET(
  _req: Request,
  { params }: { params: { routeId: string } }
) {
  const url = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
  const user = process.env.CLICKHOUSE_USER ?? "default";
  const password = process.env.CLICKHOUSE_PASSWORD ?? "";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-ClickHouse-User": user,
        "X-ClickHouse-Key": password,
        "Content-Type": "text/plain",
      },
      body: QUERY(params.routeId),
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }

    const text = await res.text();
    const rows: { shape_id: string; shape_pt_lon: number; shape_pt_lat: number }[] = text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    // Group rows into separate paths per shape_id
    const byShape: Record<string, [number, number][]> = {};
    for (const row of rows) {
      if (!byShape[row.shape_id]) byShape[row.shape_id] = [];
      byShape[row.shape_id].push([row.shape_pt_lon, row.shape_pt_lat]);
    }
    const paths = Object.values(byShape);

    return NextResponse.json({ paths });
  } catch (err) {
    console.error("[/api/shapes]", err);
    return NextResponse.json(
      { error: "Failed to query shapes", detail: String(err) },
      { status: 500 }
    );
  }
}
