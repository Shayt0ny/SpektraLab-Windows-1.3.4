import { test, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { FrameDecoder, encodeFrame } from '../../src/shared/framing';

const dir = process.env.SPEKTRALAB_HOST_DIR;
const python = process.env.SPEKTRALAB_TEST_PYTHON;
const exe = dir ? join(dir, 'spektralab-host.exe') : '';
test.skip(!dir || !python || !existsSync(exe), 'requires staged Vulkan host and Pillow Python');

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(path: string) {
  const colours = [[0, 0, 0], [64, 64, 64], [128, 128, 128], [224, 224, 224], [255, 255, 255],
    [140, 100, 90], [90, 140, 100], [100, 100, 140], [170, 150, 130]];
  const chunk = (name: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(name), data]), out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4); return out;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(colours.length); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(path, Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, ...colours.flat()]))), chunk('IEND', Buffer.alloc(0))]));
}

test('the 73 MP working preview uploads half-floats without a full float32 copy', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite source module.
    const { GLRenderer } = await import('/src/canvas/glRenderer.ts');
    // @ts-expect-error Vite source module.
    const { ADJUSTMENTS_DEFAULT } = await import('/src/shared/adjustments.ts');
    // @ts-expect-error Vite source module.
    const { GEOMETRY_DEFAULT } = await import('/src/shared/geometry.ts');
    const width = 7168, height = 10240;
    const data = new Uint16Array(width * height * 4);
    data.fill(0x3800); // encoded working value 0.5, binary16
    const renderer = new GLRenderer(new OffscreenCanvas(16, 16));
    try {
      renderer.setImage({ width, height, data: new Uint8Array(data.buffer), format: 'rgba16f', colorSpace: 'ProPhoto RGB', displayMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] });
      const out = renderer.renderOutput({ viewport: { width: 16, height: 16 }, offset: { x: 0, y: 0 }, outSize: { width: 16, height: 16 }, display: GEOMETRY_DEFAULT,
        editingCrop: null, sourceSize: { width, height }, adjustments: ADJUSTMENTS_DEFAULT, compare: 0, split: 0.5, surround: 0 }, 16, 16);
      return { error: renderer.gl.getError(), pixel: Array.from(out!.subarray(0, 4)), bytes: data.byteLength };
    } finally { renderer.dispose(); }
  });
  expect(result.bytes).toBe(7168 * 10240 * 8);
  expect(result.error).toBe(0);
  expect(result.pixel[3]).toBe(255);
  expect(result.pixel[0]).toBeGreaterThan(100);
});

test('ProPhoto grading agrees with native export, independent of reported P3 support', async ({ page }) => {
  const work = mkdtempSync(join(tmpdir(), 'spektralab-colour-'));
  const path = join(work, 'patches.png'); png(path);
  const process = spawn(exe, ['--resources', join(dir!, 'engine')], { stdio: ['pipe', 'pipe', 'ignore'] });
  const decoder = new FrameDecoder();
  let next = 1;
  const pending = new Map<number, (r: { header: Record<string, unknown>; payload: Uint8Array }) => void>();
  process.stdout.on('data', (bytes: Buffer) => {
    for (const frame of decoder.push(new Uint8Array(bytes))) {
      const h = frame.header as Record<string, unknown>;
      pending.get(h.id as number)?.({ header: h, payload: frame.payload });
    }
  });
  const call = (method: string, params = {}, payload?: Uint8Array) => {
    const id = next++;
    return new Promise<{ result: Record<string, unknown>; payload: Uint8Array }>((resolve, reject) => {
      pending.set(id, (r) => { pending.delete(id); if (r.header.ok) resolve({ result: r.header.result as Record<string, unknown>, payload: r.payload }); else reject(new Error(JSON.stringify(r.header))); });
      process.stdin.write(encodeFrame({ id, method, params }, payload));
    });
  };
  try {
    await call('hello');
    const opened = await call('open', { path });
    const session = opened.result.session;
    const half = await call('render', { session, no_film: true, tier: 'full', format: 'rgba16f', display: 'prophoto' });
    const unorm = await call('render', { session, no_film: true, tier: 'full', format: 'rgba16', display: 'prophoto' });
    const image = half.result.image as { width: number; height: number; display_matrix: number[] };
    // Drive the real WebGL shader, and the real transferable worker exporter.
    // Both paths start with the same working pixels from the native decoder.
    for (const gamut of [false, true]) {
      await page.addInitScript((p3) => {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (query) => query.includes('color-gamut') ? { ...original(query), matches: p3 } as MediaQueryList : original(query);
      }, gamut);
      await page.goto('/');
      for (const edit of [{}, { exposure: -0.75 }, { highlights: -60 }, { saturation: 35 }]) {
        const result = await page.evaluate(async ({ image, half, unorm, edit }) => {
          // @ts-expect-error Vite serves source to the integration test.
          const { GLRenderer } = await import('/src/canvas/glRenderer.ts');
          // @ts-expect-error Vite source.
          const { ADJUSTMENTS_DEFAULT, PROPHOTO_MID_GREY } = await import('/src/shared/adjustments.ts');
          // @ts-expect-error Vite source.
          const { GEOMETRY_DEFAULT } = await import('/src/shared/geometry.ts');
          // @ts-expect-error Vite source.
          const { processExportPixels } = await import('/src/export/pixelWorker.ts');
          const adjustments = { ...ADJUSTMENTS_DEFAULT, ...edit };
          const canvas = new OffscreenCanvas(image.width, image.height), renderer = new GLRenderer(canvas);
          try {
            renderer.setImage({ ...image, data: new Uint8Array(half), colorSpace: 'ProPhoto RGB', format: 'rgba16f', displayMatrix: image.display_matrix });
            const preview = renderer.renderOutput({ viewport: image, offset: { x: 0, y: 0 }, outSize: image, display: GEOMETRY_DEFAULT,
              editingCrop: null, sourceSize: image, adjustments, compare: 0, split: 0.5, surround: 0 }, image.width, image.height);
            const file = await processExportPixels(new Uint8Array(unorm), image, GEOMETRY_DEFAULT, adjustments, image, PROPHOTO_MID_GREY);
            return { preview: Array.from(preview as Uint8Array), file: Array.from(new Uint8Array(file.buffer)), space: renderer.gl.drawingBufferColorSpace };
          } finally { renderer.dispose(); }
        }, { image, half: Array.from(half.payload), unorm: Array.from(unorm.payload), edit });
        expect(result.space).toBe('srgb');
        const target = join(work, `grade-${gamut}-${Object.keys(edit)[0] ?? 'neutral'}.png`);
        await call('write_image', { path: target, width: image.width, height: image.height, format: 'png', input_color_space: 'prophoto', color_space: 'srgb' }, new Uint8Array(result.file));
        const exported: number[] = JSON.parse(execFileSync(python!, ['-c', 'from PIL import Image; import json,sys; print(json.dumps(list(Image.open(sys.argv[1]).convert("RGBA").tobytes())))', target], { encoding: 'utf8' }));
        const largest = Math.max(...exported.map((v, i) => Math.abs(v - result.preview[i]!)));
        // Mac's main canvas uses a matrix/TRC display conversion; exports
        // retain the destination CAM16 chroma knee. Saturated patches can
        // differ slightly by design. Neutral ramps/highlights must agree.
        expect(largest, JSON.stringify({ gamut, edit, preview: result.preview, exported })).toBeLessThanOrEqual('saturation' in edit ? 4 : 2);
      }
    }
  } finally {
    await call('shutdown').catch(() => {});
    process.stdin.end();
  }
});
