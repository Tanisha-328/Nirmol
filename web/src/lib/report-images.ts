import sharp from "sharp";
import { createHash } from "node:crypto";
import { RAW_PHOTO_LIMIT, STORED_PHOTO_LIMIT, ReportError } from "./reports";

export type NormalizedPhoto = { bytes: Uint8Array; sha256: string; width: number; height: number };
export function photoFormat(bytes: Uint8Array, mime: string, filename: string): "jpeg" | "png" | "webp" {
  if (!bytes.length || bytes.length > RAW_PHOTO_LIMIT || filename.length > 200 || /[\u0000-\u001f\\/]/.test(filename)) throw new ReportError("invalid_photo");
  const b = Buffer.from(bytes);
  const ext = filename.toLowerCase().split(".").pop();
  if (mime === "image/jpeg" && ["jpg", "jpeg"].includes(ext ?? "") && b[0] === 255 && b[1] === 216 && b[2] === 255) return "jpeg";
  if (mime === "image/png" && ext === "png" && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "png";
  if (mime === "image/webp" && ext === "webp" && b.toString("ascii",0,4) === "RIFF" && b.toString("ascii",8,12) === "WEBP") return "webp";
  throw new ReportError("invalid_photo");
}
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
/** Decode bounded pixels, auto-orient, flatten, resize and re-encode; never keep metadata or raw bytes. */
export async function normalizeReportPhoto(bytes: Uint8Array, mime: string, filename: string): Promise<NormalizedPhoto> {
  const expected = photoFormat(bytes, mime, filename);
  try {
    const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning", sequentialRead: true });
    const metadata = await image.metadata();
    if (metadata.format !== expected || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1 || metadata.width * metadata.height > 20_000_000) throw new Error("Invalid image");
    const { data, info } = await image.rotate().flatten({ background: "#ffffff" }).resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: false }).timeout({ seconds: 6 }).toBuffer({ resolveWithObject: true });
    if (!data.length || data.length > STORED_PHOTO_LIMIT) throw new ReportError("photo_too_large", 413);
    return { bytes: data, sha256: sha256(data), width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof ReportError) throw error;
    throw new ReportError("invalid_photo");
  }
}
