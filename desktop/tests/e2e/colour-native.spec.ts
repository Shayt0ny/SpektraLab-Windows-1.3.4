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

test('the 73 MP display preview uploads UNORM16 without a full float32 copy', async ({ page }) => {
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
    data.fill(32768); // display UNORM16 value 0.5
    const renderer = new GLRenderer(new OffscreenCanvas(16, 16));
    try {
      renderer.setImage({ width, height, data: new Uint8Array(data.buffer), format: 'rgba16', colorSpace: 'sRGB' });
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

test('native graded UNORM16 display agrees with export regardless of browser P3 reporting', async ({ page }) => {
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
    const hello=await call('hello');
    expect(hello.result.source_formats).toContain('rgba16');
    const opened = await call('open', { path });
    const session = opened.result.session;
    for (const gamut of [false, true]) {
      await page.addInitScript((p3) => {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (query) => query.includes('color-gamut') ? { ...original(query), matches: p3 } as MediaQueryList : original(query);
      }, gamut);
      await page.goto('/');
      for (const edit of [{}, { exposure: -0.75 }, { highlights: -60 }, { saturation: 35 }]) {
        const native = await call('render_view', { session, no_film: true, tier: 'full', format: 'rgba16', display: 'srgb', adjustments: edit });
        const image = native.result.image as { width: number; height: number };
        const result = await page.evaluate(async ({ image, pixels, edit }) => {
          // @ts-expect-error Vite source.
          const { GLRenderer } = await import('/src/canvas/glRenderer.ts');
          // @ts-expect-error Vite source.
          const { ADJUSTMENTS_DEFAULT } = await import('/src/shared/adjustments.ts');
          // @ts-expect-error Vite source.
          const { GEOMETRY_DEFAULT } = await import('/src/shared/geometry.ts');
          const renderer = new GLRenderer(new OffscreenCanvas(image.width, image.height));
          try {
            renderer.setImage({ ...image, data: new Uint8Array(pixels), colorSpace: 'sRGB', format: 'rgba16', processedGeometry: GEOMETRY_DEFAULT });
            const preview = renderer.renderOutput({ viewport: image, offset: { x: 0, y: 0 }, outSize: image, display: GEOMETRY_DEFAULT,
              editingCrop: null, sourceSize: image, adjustments: {...ADJUSTMENTS_DEFAULT,...edit}, compare: 0, split: 0.5, surround: 0 }, image.width, image.height);
            return { preview: Array.from(preview as Uint8Array), space: renderer.gl.drawingBufferColorSpace };
          } finally { renderer.dispose(); }
        }, { image, pixels: Array.from(native.payload), edit });
        expect(result.space).toBe('srgb');
        const target = join(work, `grade-${gamut}-${Object.keys(edit)[0] ?? 'neutral'}.png`);
        await call('export_frame', { session, source_path: path, no_film: true, path: target, format: 'png', color_space: 'srgb', adjustments: edit });
        const exported: number[] = JSON.parse(execFileSync(python!, ['-c', 'from PIL import Image; import json,sys; print(json.dumps(list(Image.open(sys.argv[1]).convert("RGBA").tobytes())))', target], { encoding: 'utf8' }));
        const largest = Math.max(...exported.map((v, i) => Math.abs(v - result.preview[i]!)));
        // Preview and export share the chroma-only destination transform.
        // Allow only the 16-bit display / 8-bit file rounding difference.
        expect(largest, JSON.stringify({ gamut, edit, preview: result.preview, exported })).toBeLessThanOrEqual(2);
        if(Object.keys(edit).length===0){
          const source=await call('render_source',{session,display:'srgb',format:'rgba16',generation:27});
          const original=await page.evaluate(async ({image,pixels})=>{
            // @ts-expect-error Vite source.
            const {GLRenderer}=await import('/src/canvas/glRenderer.ts');
            // @ts-expect-error Vite source.
            const {ADJUSTMENTS_DEFAULT}=await import('/src/shared/adjustments.ts');
            // @ts-expect-error Vite source.
            const {GEOMETRY_DEFAULT}=await import('/src/shared/geometry.ts');
            const r=new GLRenderer(new OffscreenCanvas(image.width,image.height));
            try{
              r.setOriginal({...image,data:new Uint8Array(pixels),format:'rgba16',colorSpace:'sRGB'});
              const preview=r.renderOutput({viewport:image,offset:{x:0,y:0},outSize:image,display:GEOMETRY_DEFAULT,
                editingCrop:null,sourceSize:image,adjustments:{...ADJUSTMENTS_DEFAULT,exposure:3,saturation:70},compare:2,split:.5,surround:0},image.width,image.height);
              return {preview:Array.from(preview as Uint8Array),error:r.gl.getError()};
            }finally{r.dispose();}
          },{image:source.result.image as {width:number;height:number},pixels:Array.from(source.payload)});
          expect(original.error).toBe(0);
          expect(Math.max(...exported.map((v,i)=>Math.abs(v-original.preview[i]!)))).toBeLessThanOrEqual(2);
        }
      }
    }
  } finally {
    await call('shutdown').catch(() => {});
    process.stdin.end();
  }
});
