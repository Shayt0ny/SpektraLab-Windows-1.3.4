import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADJUSTMENTS_DEFAULT, PROPHOTO_MID_GREY } from '@shared/adjustments';
import { GEOMETRY_DEFAULT, outputSize } from '@shared/geometry';
import { filePixels } from './pixels';
import { processExportPixels, type PixelJob } from './pixelWorker';

describe('export worker ownership and errors', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('transfers the input buffer and returns the same crop/turn/grade pixels', async () => {
    let terminated = false;
    class TestWorker {
      onmessage?: (event: { data: { pixels: Uint16Array } }) => void;
      postMessage(job: PixelJob, transfer: Transferable[]) {
        const received = structuredClone(job, { transfer });
        queueMicrotask(() => {
          const j = received;
          const pixels = filePixels(new Uint16Array(j.payload.buffer, j.payload.byteOffset, j.payload.byteLength / 2),
            j.source, j.geometry, j.adjustments, j.output, j.midGrey);
          this.onmessage?.({ data: { pixels } });
        });
      }
      terminate() { terminated = true; }
    }
    vi.stubGlobal('Worker', TestWorker);
    const source = { width: 4, height: 3 };
    const pixels = Uint16Array.from({ length: 48 }, (_, index) => (index * 1297) % 65536);
    const geometry = { ...GEOMETRY_DEFAULT, quarterTurns: 1, crop: { x: 0.25, y: 0, width: 0.75, height: 1 } };
    const adjustments = { ...ADJUSTMENTS_DEFAULT, exposure: 0.5 };
    const output = outputSize(geometry, source);
    const expected = filePixels(pixels, source, geometry, adjustments, output, PROPHOTO_MID_GREY);
    const result = processExportPixels(new Uint8Array(pixels.buffer), source, geometry, adjustments, output, PROPHOTO_MID_GREY);
    expect(pixels.byteLength).toBe(0);
    expect(await result).toEqual(expected);
    expect(terminated).toBe(true);
  });

  it('reports failure instead of doing heavy work on the UI thread', async () => {
    const terminate = vi.fn();
    class FailedWorker {
      onmessage?: (event: { data: { error: string } }) => void;
      postMessage() { queueMicrotask(() => this.onmessage?.({ data: { error: 'allocation failed' } })); }
      terminate = terminate;
    }
    vi.stubGlobal('Worker', FailedWorker);
    await expect(processExportPixels(new Uint8Array(8), { width: 1, height: 1 }, GEOMETRY_DEFAULT,
      ADJUSTMENTS_DEFAULT, { width: 1, height: 1 }, PROPHOTO_MID_GREY)).rejects.toThrow('allocation failed');
    expect(terminate).toHaveBeenCalledOnce();
  });
});
