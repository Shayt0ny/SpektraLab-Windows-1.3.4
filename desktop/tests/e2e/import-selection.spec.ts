import { test, expect } from '@playwright/test';

test('opening one photograph shows only it; the default picker loads just selected photographs', async ({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{
    (window as unknown as {__spkOpenPaths:(paths:string[])=>void}).__spkOpenPaths(['/mock/Roll 01/DSC_0001.NEF']);
  });
  await expect(page.locator('.filmstrip .thumb')).toHaveCount(1);
  await page.getByTestId('open-button').click();
  await expect(page.locator('.filmstrip .thumb')).toHaveCount(3);
  await page.evaluate(async()=>{
    // @ts-expect-error Vite source.
    const {platform}=await import('/src/platform/index.ts');
    platform().pickFiles=async()=>[];
  });
  await page.getByTestId('open-button').click();
  await expect(page.locator('.filmstrip .thumb')).toHaveCount(3);
});

test('a failed image open is visible in the canvas, not only a status-bar message',async({page})=>{
  await page.goto('/?open=');
  await expect(page.getByTestId('tier-badge')).toHaveText('full',{timeout:20000});
  await page.evaluate(()=>{
    const app=(window as unknown as {__spk:{sessionStore:{setState:(s:object)=>void;getState:()=>{imageVersion:number}};frameImages:{print:unknown;original:unknown}}}).__spk;
    app.frameImages.print=null;
    app.frameImages.original=null;
    app.sessionStore.setState({selection:'/mock/failure.NEF',lastError:'RAW decode failed: test failure',imageVersion:app.sessionStore.getState().imageVersion+1});
  });
  await expect(page.locator('.canvas-message')).toContainText('RAW decode failed: test failure');
});
