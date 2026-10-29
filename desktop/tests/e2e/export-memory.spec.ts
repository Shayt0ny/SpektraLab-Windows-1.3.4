import { expect, test } from '@playwright/test';

test('a lost display context shows a message and restores the displayed frame', async ({ page }) => {
  await page.goto('/?open=');
  await expect(page.getByTestId('tier-badge')).toHaveText('full', { timeout: 20000 });
  const supported = await page.locator('.canvas-gl').evaluate((node) => {
    const gl = (node as HTMLCanvasElement).getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    (window as unknown as { restoreDisplay: () => void }).restoreDisplay = () => extension.restoreContext();
    extension.loseContext();
    return true;
  });
  expect(supported).toBe(true);
  await expect(page.locator('.canvas-message')).toContainText('Display connection lost');
  await page.evaluate(() => (window as unknown as { restoreDisplay: () => void }).restoreDisplay());
  await expect(page.locator('.canvas-message')).toHaveCount(0, { timeout: 20000 });
  await expect.poll(() => page.locator('.canvas-gl').evaluate((node) => {
    const gl = (node as HTMLCanvasElement).getContext('webgl2')!;
    const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) as number;
    const px = type === gl.FLOAT ? new Float32Array(4) : type === gl.HALF_FLOAT ? new Uint16Array(4) : new Uint8Array(4);
    gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1,
      gl.RGBA, type, px);
    return { error: gl.getError(), type, pixels: Array.from(px), valid: !gl.isContextLost() && px[3] === (type === gl.FLOAT ? 1 : type === gl.HALF_FLOAT ? 0x3c00 : 255) && px[0]! + px[1]! + px[2]! > 0 };
  })).toMatchObject({ error: 0, valid: true });
});

test('a real worker processes a 73 MP edited export while the interface keeps ticking', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // Exercise Vite's actual module worker and transferable buffers in Chromium,
    // rather than a mock worker or the engine-only export route.
    // @ts-expect-error Vite serves the source module to this browser test.
    const { processExportPixels } = await import('/src/export/pixelWorker.ts');
    // @ts-expect-error Vite source module.
    const { filePixels } = await import('/src/export/pixels.ts');
    // @ts-expect-error Vite source module.
    const { ADJUSTMENTS_DEFAULT, PROPHOTO_MID_GREY } = await import('/src/shared/adjustments.ts');
    // @ts-expect-error Vite source module.
    const { GEOMETRY_DEFAULT } = await import('/src/shared/geometry.ts');
    const source = { width: 7168, height: 10240 };
    const pixels = new Uint16Array(source.width * source.height * 4);
    pixels.fill(32768);
    const adjustments = { ...ADJUSTMENTS_DEFAULT, exposure: 0.3 };
    const geometry = { ...GEOMETRY_DEFAULT, quarterTurns: 2 };
    const expected = filePixels(new Uint16Array([32768, 32768, 32768, 32768]),
      { width: 1, height: 1 }, GEOMETRY_DEFAULT, adjustments, { width: 1, height: 1 }, PROPHOTO_MID_GREY);
    let ticks = 0;
    let largestGap = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      largestGap = Math.max(largestGap, now - last);
      last = now;
      ticks++;
    }, 20);
    const started = performance.now();
    try {
      const job = processExportPixels(new Uint8Array(pixels.buffer), source, geometry, adjustments, source, PROPHOTO_MID_GREY);
      const detached = pixels.byteLength === 0;
      const output: Uint16Array = await job;
      return {
        detached, ticks, largestGap, ms: performance.now() - started,
        count: output.length, first: Array.from(output.subarray(0, 4)),
        last: Array.from(output.subarray(output.length - 4)), expected: Array.from(expected),
      };
    } finally {
      clearInterval(timer);
    }
  });
  expect(result.detached).toBe(true);
  expect(result.ticks).toBeGreaterThan(3);
  expect(result.largestGap).toBeLessThan(2000);
  expect(result.count).toBe(7168 * 10240 * 4);
  expect(result.first).toEqual(result.expected);
  expect(result.last).toEqual(result.expected);
  console.log('73 MP worker:', JSON.stringify(result));
});
