"use client";

import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import type { MultiPolygon } from "geojson";
import "leaflet/dist/leaflet.css";
import { BANGLADESH_POLYGONS } from "@/lib/data/bangladesh";
import type { ReportCell } from "@/lib/community";

const BOUNDS: L.LatLngBoundsExpression = [[20.4, 87.9], [26.8, 92.8]];
export default function CommunityMapCanvas({ cells, selected, onSelect, lang }: {
  cells: ReportCell[]; selected: string | null; onSelect: (key: string) => void; lang: "en" | "bn";
}) {
  const container = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), markers = useRef<L.LayerGroup | null>(null);
  const [tiles, setTiles] = useState(false), [tileFailure, setTileFailure] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!container.current) return;
    const view = L.map(container.current, { minZoom: 6, maxZoom: 11, maxBounds: BOUNDS, maxBoundsViscosity: 1, scrollWheelZoom: false, zoomControl: false });
    map.current = view; view.fitBounds(BOUNDS);
    const boundary: MultiPolygon = { type: "MultiPolygon", coordinates: BANGLADESH_POLYGONS };
    L.geoJSON(boundary, { style: { color: "#0b686b", weight: 2, fillColor: "#c2e3db", fillOpacity: 0.35 }, interactive: false,
      attribution: 'Boundary: <a href="https://www.geoboundaries.org/" target="_blank" rel="noopener">geoBoundaries</a> (CC0)' }).addTo(view);
    markers.current = L.layerGroup().addTo(view);
    const observer = new ResizeObserver(() => view.invalidateSize()); observer.observe(container.current);
    return () => { observer.disconnect(); view.remove(); map.current = null; markers.current = null; };
  }, []);
  useEffect(() => {
    const view = map.current; if (!view) return;
    const zoom = L.control.zoom({ zoomInTitle: lang === "en" ? "Zoom in" : "বড় করুন", zoomOutTitle: lang === "en" ? "Zoom out" : "ছোট করুন" }).addTo(view);
    return () => { zoom.remove(); };
  }, [lang]);
  useEffect(() => {
    const group = markers.current; if (!group) return;
    group.clearLayers();
    for (const cell of cells) {
      const label = lang === "en" ? `Approximate area ${cell.lat}, ${cell.lon}: ${cell.reports.length} loaded reports` : `আনুমানিক এলাকা ${cell.lat}, ${cell.lon}: ${cell.reports.length}টি আনা রিপোর্ট`;
      L.rectangle([[cell.lat - 0.025, cell.lon - 0.025], [cell.lat + 0.025, cell.lon + 0.025]], { color: "#0b686b", weight: 2, fillOpacity: 0.2, interactive: false }).addTo(group);
      const marker = L.marker([cell.lat, cell.lon], { title: label, alt: label, keyboard: true,
        icon: L.divIcon({ className: `community-marker${selected === cell.key ? " selected" : ""}`, html: String(cell.reports.length), iconSize: [36, 36], iconAnchor: [18, 18] }) });
      marker.on("click", () => onSelect(cell.key)); marker.addTo(group);
      const element = marker.getElement();
      if (element) {
        element.setAttribute("role", "button"); element.setAttribute("aria-label", label);
        L.DomEvent.on(element, "keydown", event => {
          const key = (event as KeyboardEvent).key;
          if (key === "Enter" || key === " ") { L.DomEvent.stop(event); onSelect(cell.key); }
        });
      }
    }
  }, [cells, selected, onSelect, lang]);
  useEffect(() => {
    const view = map.current; if (!tiles || !view) return;
    let live = true;
    // No prefetch, offline download, retina doubling, third-party scripts or tile proxy.
    const layer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
      minZoom: 6, maxZoom: 11, bounds: BOUNDS, keepBuffer: 0, updateWhenIdle: true, updateWhenZooming: false,
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    const fail = () => { if (live) { setTileFailure(true); view.removeLayer(layer); } };
    const timer = setTimeout(fail, 10000);
    layer.on("tileerror", fail); layer.on("tileload", () => clearTimeout(timer)); layer.addTo(view);
    return () => { live = false; clearTimeout(timer); layer.off(); view.removeLayer(layer); };
  }, [tiles, attempt]);
  return <div className="space-y-3">
    <div ref={container} role="region" aria-label={lang === "en" ? "Bangladesh community report map" : "বাংলাদেশের কমিউনিটি রিপোর্টের মানচিত্র"} className="community-canvas h-[380px] w-full rounded-xl border border-[var(--border)] sm:h-[480px]" />
    <p className="text-sm text-[var(--muted)]">{lang === "en" ? "Use arrow keys and + / − on the map. Each numbered marker groups loaded reports in one coarse cell. Use the report list for full keyboard access." : "মানচিত্রে তীরচিহ্ন ও + / − কী ব্যবহার করুন। প্রতিটি সংখ্যার পিনে একটি আনুমানিক সেলের আনা রিপোর্টগুলো আছে। কীবোর্ডে সব তথ্য পেতে রিপোর্টের তালিকা ব্যবহার করুন।"}</p>
    {tileFailure && <p role="status">{lang === "en" ? "Background tiles are unavailable. The boundary, report cells and list still work." : "পটভূমির মানচিত্র পাওয়া যাচ্ছে না। সীমানা, রিপোর্টের সেল ও তালিকা ব্যবহার করতে পারেন।"}</p>}
    <button type="button" className="community-button" onClick={() => { if (tiles && !tileFailure) setTiles(false); else { setTileFailure(false); setTiles(true); setAttempt(n => n + 1); } }}>
      {lang === "en" ? (tileFailure ? "Retry background map" : tiles ? "Hide background map" : "Load background map") : (tileFailure ? "পটভূমি আবার আনুন" : tiles ? "পটভূমি লুকান" : "পটভূমির মানচিত্র আনুন")}
    </button>
    <p className="text-xs text-[var(--muted)]">{lang === "en" ? "Optional background tiles connect your browser to OpenStreetMap, sharing IP address, site origin and viewed map area. Availability and usage limits apply." : "ঐচ্ছিক পটভূমি আনলে ব্রাউজার OpenStreetMap-এ IP ঠিকানা, সাইটের উৎস ও দেখা এলাকার তথ্য পাঠায়। সেবার প্রাপ্যতা ও ব্যবহারের সীমা প্রযোজ্য।"} <a className="underline" href="https://operations.osmfoundation.org/policies/tiles/" target="_blank" rel="noopener">{lang === "en" ? "Tile policy" : "টাইল নীতিমালা"}</a></p>
  </div>;
}
