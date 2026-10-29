// frames.ts — the pixels on the canvas, outside the reactive store (a 45 MP
// frame is 180 MB; the store carries a version number instead).

import type { RenderReply, RgbaImage } from '../host/client';
import { GLRenderer } from '../canvas/glRenderer';
import { GEOMETRY_DEFAULT } from '@shared/geometry';
import { ADJUSTMENTS_DEFAULT, type Adjustments } from '@shared/adjustments';

export const frameImages: {
  /** The engine's print at its tier (encoded ProPhoto rgba16f). */
  print: RenderReply | null;
  /** The decode as the camera's embedded preview shows it (Original, Before). */
  original: RgbaImage | null;
} = { print: null, original: null };

export const THUMB_EDGE = 320;

/** rgba8 → a small JPEG object URL (for an <img>). */
export async function rgbaToURL(img: RgbaImage, longEdge = THUMB_EDGE, adjustments: Adjustments = ADJUSTMENTS_DEFAULT): Promise<string | null> {
  try {
    const s = Math.min(1, longEdge / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * s));
    const h = Math.max(1, Math.round(img.height * s));
    let pixels = img.data;
    if (img.format === 'rgba16f') {
      // A thumbnail must not allocate another full-size floating GPU texture.
      const small = new Uint8Array(w * h * 8);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const sx = Math.min(img.width - 1, Math.floor((x + 0.5) * img.width / w));
        const sy = Math.min(img.height - 1, Math.floor((y + 0.5) * img.height / h));
        const at = (sy * img.width + sx) * 8;
        small.set(img.data.subarray(at, at + 8), (y * w + x) * 8);
      }
      const renderer = new GLRenderer(new OffscreenCanvas(w, h));
      try {
        renderer.setImage({ ...img, width: w, height: h, data: small });
        pixels = renderer.renderOutput({ viewport: { width: w, height: h }, offset: { x: 0, y: 0 }, outSize: { width: w, height: h }, display: GEOMETRY_DEFAULT, editingCrop: null,
          sourceSize: img, adjustments, compare: 0, split: 0.5, surround: 0 }, w, h)!;
      } finally { renderer.dispose(); }
      if (!pixels) return null;
    }
    const sw = img.format === 'rgba16f' ? w : img.width, sh = img.format === 'rgba16f' ? h : img.height;
    const src = new ImageData(new Uint8ClampedArray(pixels.buffer as ArrayBuffer, pixels.byteOffset, sw * sh * 4), sw, sh);
    const bmp = await createImageBitmap(src, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0);
    bmp.close();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export const makeThumbFromPrint = (img: RgbaImage, adjustments?: Adjustments) => rgbaToURL(img, THUMB_EDGE, adjustments);
