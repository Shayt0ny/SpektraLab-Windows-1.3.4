import type { RgbaImage } from '../host/client';

/** Only the display copy is bounded during GPU recovery. Area-average exact
 * integer codes, retaining RGBA16 precision, gamut, geometry and native size.
 * The decoded frame, film render and file export are never changed here. */
export function displayUpload(image: RgbaImage, limit: number): RgbaImage {
  const edge = Math.max(image.width, image.height);
  if (edge <= limit) return image;
  const width = Math.max(1, Math.floor(image.width * limit / edge));
  const height = Math.max(1, Math.floor(image.height * limit / edge));
  const wide = image.format === 'rgba16';
  const bytes = wide && image.data.byteOffset % 2 ? image.data.slice() : image.data;
  const source = wide ? new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2) : bytes;
  const out = wide ? new Uint16Array(width * height * 4) : new Uint8Array(width * height * 4);
  const sx = image.width / width, sy = image.height / height, area = sx * sy;
  for (let y = 0; y < height; ++y) for (let x = 0; x < width; ++x) {
    const x0 = x * sx, x1 = (x + 1) * sx, y0 = y * sy, y1 = (y + 1) * sy;
    let red = 0, green = 0, blue = 0, alpha = 0;
    for (let j = Math.floor(y0); j < Math.min(image.height, Math.ceil(y1)); ++j) {
      const wy = Math.min(j + 1, y1) - Math.max(j, y0);
      for (let i = Math.floor(x0); i < Math.min(image.width, Math.ceil(x1)); ++i) {
        const weight = wy * (Math.min(i + 1, x1) - Math.max(i, x0));
        const at = (j * image.width + i) * 4;
        red += source[at]! * weight; green += source[at + 1]! * weight;
        blue += source[at + 2]! * weight; alpha += source[at + 3]! * weight;
      }
    }
    const at = (y * width + x) * 4;
    out[at] = Math.round(red / area); out[at + 1] = Math.round(green / area);
    out[at + 2] = Math.round(blue / area); out[at + 3] = Math.round(alpha / area);
  }
  return { ...image, width, height, data: new Uint8Array(out.buffer),
    nativeSize: image.nativeSize ?? { width: image.width, height: image.height } };
}

export function recoveryTextureLimit(previous: number | null): number {
  return Math.max(512, Math.min(2048, Math.floor((previous ?? 4096) / 2)));
}
