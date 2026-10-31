import {expect,test,type Page} from '@playwright/test';
import type {sessionStore} from '../../src/state/session';
import type {frameImages} from '../../src/state/frames';
type App={sessionStore:typeof sessionStore;frameImages:typeof frameImages};
const state=(page:Page)=>page.evaluate(()=>{const a=(window as unknown as{__spk:App}).__spk,s=a.sessionStore.getState(),p=a.frameImages.print;return{masks:s.sidecar.adjustments.localMasks??[],undo:s.undo.length,error:s.lastError,selection:s.selection,
  geometry:s.sidecar.geometry,checksum:p?.data.reduce((sum,v,i)=>i%31===0?sum+v:sum,0)};});
async function open(page:Page){await page.goto('/?open=');await expect(page.getByTestId('tier-badge')).toHaveText('full',{timeout:25000});await page.getByRole('tab',{name:'Post-Dev',exact:true}).click();}
async function draw(page:Page){const box=(await page.getByTestId('local-mask-overlay').boundingBox())!;
  await page.mouse.move(box.x+box.width*.38,box.y+box.height*.45);await page.mouse.down();await page.mouse.move(box.x+box.width*.62,box.y+box.height*.55,{steps:8});await page.mouse.up();}

test('brush strokes grade, erase, undo and persist on reopening the photo',async({page})=>{
  await open(page);const before=await state(page);await page.getByTestId('add-mask-brush').click();
  await expect(page.getByTestId('local-mask-overlay')).toBeVisible();await draw(page);
  expect((await state(page)).masks[0]!.strokes.length).toBe(1);
  const field=page.getByTestId('mask-exposure').locator('input');await field.fill('1.0');await field.press('Enter');
  await expect.poll(async()=>(await state(page)).checksum).not.toBe(before.checksum);
  await page.getByRole('button',{name:'Eraser',exact:true}).click();await draw(page);
  expect((await state(page)).masks[0]!.strokes.at(-1)!.erase).toBe(true);
  await page.keyboard.press('Control+z');expect((await state(page)).masks[0]!.strokes.length).toBe(1);
  const name=page.getByRole('textbox',{name:'Mask name',exact:true});await name.fill('Face light');await name.press('Tab');
  const saved=(await state(page)).masks;await page.getByRole('button',{name:'Finish drawing',exact:true}).click();
  await expect(page.getByTestId('local-mask-overlay')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('sidecar:/mock/Roll 01/DSC_0001.NEF')??'{}').adjustments?.localMasks)).toEqual(saved);
  await page.locator('.thumb').nth(1).click();await expect.poll(async()=>(await state(page)).selection).not.toBe(before.selection);
  await page.locator('.thumb').first().click();await expect.poll(async()=>(await state(page)).selection).toBe(before.selection);
  await expect.poll(async()=>(await state(page)).masks).toEqual(saved);
  await page.getByTestId('select-mask-0').click();await expect(page.getByTestId('local-mask-overlay')).toBeVisible();
  await page.screenshot({path:test.info().outputPath('brush-studio.png')});
  await page.keyboard.press('Escape');await expect(page.getByTestId('local-mask-overlay')).toHaveCount(0);
  await page.getByTestId('export-button').click();await expect(page.getByTestId('export-proof')).toBeVisible({timeout:20000});
  const quality=page.getByTestId('jpeg-quality').locator('input');await expect(quality).toHaveValue('92 %');await quality.fill('100 %');await quality.press('Enter');await expect(quality).toHaveValue('100 %');
  expect((await state(page)).error).toBeNull();
});

for(const kind of ['linear','radial']as const)test(`${kind} region handles, inversion and undo stay editable`,async({page})=>{
  await open(page);await page.getByTestId(`add-mask-${kind}`).click();await draw(page);
  const initial=(await state(page)).masks[0]!;expect(initial.start).not.toEqual(initial.end);
  await page.getByRole('switch',{name:'Invert region',exact:true}).click();expect((await state(page)).masks[0]!.inverted).toBe(true);
  await page.keyboard.press('Control+z');expect((await state(page)).masks[0]!.inverted).toBe(false);
  const overlay=page.getByTestId('local-mask-overlay'),end=overlay.locator('[data-handle=end]'),p=(await end.boundingBox())!;
  await page.mouse.move(p.x+p.width/2,p.y+p.height/2);await page.mouse.down();await page.mouse.move(p.x+40,p.y+30,{steps:5});await page.mouse.up();
  expect((await state(page)).masks[0]!.end).not.toEqual(initial.end);
  await page.keyboard.press('Control+z');expect((await state(page)).masks[0]!.end).toEqual(initial.end);
});

test('film strengths are visible without settings, percent input and negative black/white work',async({page})=>{
  await open(page);await page.getByRole('tab',{name:'Pre-Dev',exact:true}).click();
  const effects=page.locator('[data-section=filmEffects]');await expect(effects).toBeVisible();
  for(const key of ['grain','halation','glare'])await expect(page.getByTestId(`effect-strength-${key}`)).toBeVisible();
  const strength=page.getByTestId('effect-strength-halation').locator('input');await strength.fill('150 %');await strength.press('Enter');
  await expect(strength).toHaveValue('150 %');
  await page.getByRole('tab',{name:'Post-Dev',exact:true}).click();
  for(const label of ['Black Point','White Point']){const input=page.getByRole('textbox',{name:`${label} value`,exact:true});await input.fill('-15');await input.press('Enter');await expect(input).toHaveValue('−15');}
  await page.setViewportSize({width:1100,height:680});await page.getByTestId('add-mask-radial').click();
  const overflow=await page.locator('[data-section=localMasks]').evaluate(el=>el.scrollWidth>el.clientWidth+1);expect(overflow).toBe(false);
});
