import type { Adjustments } from '@shared/adjustments';
import type { Geometry } from '@shared/geometry';

export interface PixelJob {
  payload: Uint8Array;
  source: { width: number; height: number };
  geometry: Geometry;
  adjustments: Adjustments;
  output: { width: number; height: number };
  midGrey: number;
}

/** Transfer ownership, rather than cloning a 587 MB frame into another heap.
 * Never fall back to processing on the UI thread: an unavailable worker is a
 * visible export failure, while the preview and controls remain usable. */
export function processExportPixels(
  payload: Uint8Array,
  source: PixelJob['source'],
  geometry: Geometry,
  adjustments: Adjustments,
  output: PixelJob['output'],
  midGrey: number,
): Promise<Uint16Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pixels.worker.ts', import.meta.url), { type: 'module' });
    const fail = (message: string) => {
      worker.terminate();
      reject(new Error(message));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail(event.message || 'Export pixel worker failed');
    };
    worker.onmessageerror = () => fail('Could not receive the processed export pixels');
    worker.onmessage = (event: MessageEvent<{ pixels?: Uint16Array; error?: string }>) => {
      worker.terminate();
      if (event.data.pixels instanceof Uint16Array) resolve(event.data.pixels);
      else reject(new Error(event.data.error || 'Export pixel worker returned no image'));
    };
    try {
      if (!(payload.buffer instanceof ArrayBuffer)) throw new Error('Export requires transferable image memory');
      worker.postMessage({ payload, source, geometry, adjustments, output, midGrey } satisfies PixelJob, [payload.buffer]);
    } catch (error) {
      fail((error as Error).message);
    }
  });
}
