import { test, expect } from '@playwright/test';

for (const original of [false,true]) for (const wide of [false, true]) test(`fit ${original?'original':'film'} ${wide ? 'UNORM16' : 'RGBA8'} preview averages fine colour detail`, async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async ({wide,original}) => {
    // @ts-expect-error Vite source.
    const { GLRenderer } = await import('/src/canvas/glRenderer.ts');
    // @ts-expect-error Vite source.
    const { ADJUSTMENTS_DEFAULT } = await import('/src/shared/adjustments.ts');
    // @ts-expect-error Vite source.
    const { GEOMETRY_DEFAULT } = await import('/src/shared/geometry.ts');
    const width = 1024, height = 1024, size = { width: 64, height: 64 };
    const data = new Uint8Array(width * height * 4);
    for (let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const alternate = (Math.floor(x/16)+Math.floor(y/16))%2;
      const r = ((x+5)%16<8 ? 255 : 0) ^ (alternate ? 255 : 0);
      const at=(y*width+x)*4;
      data[at]=r;data[at+1]=128;data[at+2]=255-r;data[at+3]=255;
    }
    const renderer = new GLRenderer(new OffscreenCanvas(size.width,size.height));
    try {
      const codes = wide ? Uint16Array.from(data, v => v * 257) : null;
      const image={width,height,data:codes ? new Uint8Array(codes.buffer) : data,
        format:wide ? 'rgba16' as const : 'rgba8' as const,colorSpace:'sRGB'};
      if(original)renderer.setOriginal(image);else renderer.setImage(image);
      const out = renderer.renderOutput({viewport:size,offset:{x:0,y:0},outSize:size,display:GEOMETRY_DEFAULT,editingCrop:null,
        sourceSize:{width,height},adjustments:ADJUSTMENTS_DEFAULT,compare:original?2:0,split:0.5,surround:0},size.width,size.height);
      let maxChroma=0;
      for(let i=0;i<out!.length;i+=4) maxChroma=Math.max(maxChroma,Math.abs(out![i]!-out![i+2]!));
      return {maxChroma,error:renderer.gl.getError()};
    } finally {renderer.dispose();}
  }, {wide,original});
  expect(result.error).toBe(0);
  expect(result.maxChroma).toBeLessThanOrEqual(2);
});
