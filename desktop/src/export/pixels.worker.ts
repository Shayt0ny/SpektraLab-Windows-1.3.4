import { filePixels } from './pixels';
import type { PixelJob } from './pixelWorker';

self.onmessage = (event: MessageEvent<PixelJob>) => {
  try {
    const { payload, source, geometry, adjustments, output, midGrey } = event.data;
    const bytes = source.width * source.height * 8;
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || payload.byteLength !== bytes)
      throw new Error('The export image payload has an invalid size');
    // Framing headers can leave the uint16 payload at an odd byte offset.
    // Only that case needs an alignment copy; the usual aligned view is free.
    const src = payload.byteOffset % 2 === 0
      ? new Uint16Array(payload.buffer, payload.byteOffset, bytes / 2)
      : new Uint16Array(payload.slice().buffer);
    const pixels = filePixels(src, source, geometry, adjustments, output, midGrey);
    self.postMessage({ pixels }, { transfer: [pixels.buffer] });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
