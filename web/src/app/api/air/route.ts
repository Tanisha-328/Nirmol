import { NextResponse } from "next/server";
import { getAirReport } from "@/lib/air";
import { inBangladesh } from "@/lib/places";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBangladesh(lat, lon)) {
    return NextResponse.json({ error: "Location must be inside Bangladesh." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    return NextResponse.json(await getAirReport(lat, lon, request.signal), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Air-quality data is temporarily unavailable." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
