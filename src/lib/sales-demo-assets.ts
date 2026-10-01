import sharp from "sharp";
import { z } from "zod";
import { MAX_LOGO_BYTES } from "@/lib/logo-upload";

export const demoAssetKindSchema = z.enum(["logo", "cover", "shop"]);
export type DemoAssetKind = z.infer<typeof demoAssetKindSchema>;
export async function normalizeDemoAsset(file: File, kind: DemoAssetKind): Promise<Buffer> {
  if (!file.size || file.size > MAX_LOGO_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("INVALID_IMAGE");
  }
  // Decode actual bytes, not just browser MIME. Bound decompression and strip EXIF.
  const bytes = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("INVALID_IMAGE");
  const image = sharp(bytes, { limitInputPixels: 40_000_000 }).rotate()
    .resize({ width: kind === "logo" ? 2000 : 1920, height: kind === "logo" ? 2000 : 1920, fit: "inside", withoutEnlargement: true });
  return kind === "logo" ? image.png().toBuffer() : image.webp({ quality: 80 }).toBuffer();
}
