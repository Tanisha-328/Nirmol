import { BANGLADESH_POLYGONS } from "./data/bangladesh";

export type Place = { id: string; lat: number; lon: number; name: { bn: string; en: string } };

export const PLACES: Place[] = [
  { id: "dhaka", lat: 23.7808, lon: 90.4067, name: { bn: "ঢাকা", en: "Dhaka" } },
  { id: "dhaka-reference", lat: 23.796374, lon: 90.424614, name: { bn: "ঢাকার মূল্যায়িত পর্যবেক্ষণ স্থান (বারিধারা)", en: "Dhaka evaluation reference (Baridhara)" } },
  { id: "chattogram", lat: 22.3569, lon: 91.7832, name: { bn: "চট্টগ্রাম", en: "Chattogram" } },
  { id: "gazipur", lat: 23.9999, lon: 90.4203, name: { bn: "গাজীপুর", en: "Gazipur" } },
  { id: "narayanganj", lat: 23.6238, lon: 90.5, name: { bn: "নারায়ণগঞ্জ", en: "Narayanganj" } },
  { id: "khulna", lat: 22.8456, lon: 89.5403, name: { bn: "খুলনা", en: "Khulna" } },
  { id: "rajshahi", lat: 24.3745, lon: 88.6042, name: { bn: "রাজশাহী", en: "Rajshahi" } },
  { id: "sylhet", lat: 24.8949, lon: 91.8687, name: { bn: "সিলেট", en: "Sylhet" } },
  { id: "barishal", lat: 22.701, lon: 90.3535, name: { bn: "বরিশাল", en: "Barishal" } },
  { id: "rangpur", lat: 25.7439, lon: 89.2752, name: { bn: "রংপুর", en: "Rangpur" } },
  { id: "mymensingh", lat: 24.7471, lon: 90.4203, name: { bn: "ময়মনসিংহ", en: "Mymensingh" } },
  { id: "cumilla", lat: 23.4607, lon: 91.1809, name: { bn: "কুমিল্লা", en: "Cumilla" } },
];

/** Pinned ADM0 polygon, including holes/islands. Not a cadastral or legal border service. */
export function inBangladesh(lat: number, lon: number): boolean {
  if (!validCoordinates(lat, lon) || lat < 20.5 || lat > 26.7 || lon < 88 || lon > 92.7) return false;
  return BANGLADESH_POLYGONS.some(([outer, ...holes]) => inRing(lat, lon, outer) &&
    !holes.some((hole) => inRing(lat, lon, hole)));
}

export function validCoordinates(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function inRing(lat: number, lon: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i], [px, py] = ring[j];
    const cross = (lon - px) * (y - py) - (lat - py) * (x - px);
    if (Math.abs(cross) < 1e-12 && lon >= Math.min(x, px) && lon <= Math.max(x, px) &&
        lat >= Math.min(y, py) && lat <= Math.max(y, py)) return true;
    if ((y > lat) !== (py > lat) && lon < (px - x) * (lat - y) / (py - y) + x) inside = !inside;
  }
  return inside;
}

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Evaluated at one reference site only. Numeric tolerance is not a coverage radius. */
export function inDhakaModelArea(lat: number, lon: number): boolean {
  return validCoordinates(lat, lon) && Math.abs(lat - 23.796374) <= 1e-6 && Math.abs(lon - 90.424614) <= 1e-6;
}

export function nearestPlace(lat: number, lon: number): Place {
  return PLACES.reduce((best, p) =>
    distanceKm(lat, lon, p.lat, p.lon) < distanceKm(lat, lon, best.lat, best.lon) ? p : best,
  );
}
