import { expect, test } from '@playwright/test';

test('rebuilds a lost display even when the browser never sends a restored event', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => {
    const w = window as unknown as { __spk?: { sessionStore: { getState(): { hostState: { phase: string } } } } };
    return w.__spk?.sessionStore.getState().hostState.phase;
  })).toBe('ready');
  await page.evaluate(async () => {
    const sessionPath = '/src/state/session.ts', sidecarPath = '/src/shared/sidecar.ts', framesPath = '/src/state/frames.ts';
    const { sessionStore } = await import(sessionPath);
    const { frameImages } = await import(framesPath);
    const { newSidecar } = await import(sidecarPath);
    frameImages.print = null;
    frameImages.original = { width: 4, height: 2, colorSpace: 'sRGB', format: 'rgba8',
      data: new Uint8Array(Array.from({ length: 8 }, () => [48, 96, 160, 255]).flat()) };
    sessionStore.setState({ selection: '/owned/recovery.ARW', engineSession: null, nativeSize: null,
      sidecar: newSidecar(), imageVersion: sessionStore.getState().imageVersion + 1 });
  });
  await expect(page.locator('[data-testid="navigator"] canvas')).toBeVisible();
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="canvas"] > canvas')!;
    canvas.dataset.lost = 'yes';
    canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await expect(page.locator('[data-testid="canvas"] > canvas[data-lost]')).toHaveCount(0, { timeout: 8000 });
  await expect(page.locator('.canvas-message')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="canvas"] > canvas')!;
    const gl = canvas.getContext('webgl2')!;
    const float = (gl as WebGL2RenderingContext & { drawingBufferFormat?: number }).drawingBufferFormat === gl.RGBA16F;
    const data = float ? new Float32Array(4) : new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1,
      gl.RGBA, float ? gl.FLOAT : gl.UNSIGNED_BYTE, data);
    return { lost: gl.isContextLost(), red: Math.round(data[0]! * (float ? 255 : 1)) };
  })).toEqual({ lost: false, red: 48 });
});
