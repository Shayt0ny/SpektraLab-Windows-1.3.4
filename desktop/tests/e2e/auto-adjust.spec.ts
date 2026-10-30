// Copyright (C) 2026 shayt0ny. SPDX-License-Identifier: GPL-3.0-or-later
import {expect,test} from '@playwright/test';

test('automatic grade updates visible controls and a single undo restores the prior edit',async({page})=>{
  await page.goto('/?open=');
  await expect(page.getByTestId('tier-badge')).toHaveText('full',{timeout:25000});
  await page.getByRole('tab',{name:'Post-Dev',exact:true}).click();
  const button=page.getByTestId('auto-adjust');
  console.log('Auto readiness',await page.evaluate(()=>{
    const w=window as unknown as {__spk:{sessionStore:{getState():Record<string,unknown>};frameImages:{print:unknown}}};
    const s=w.__spk.sessionStore.getState();
    return{selection:s.selection,session:s.engineSession,badge:s.badge,developing:s.developing,redecoding:s.redecoding,
      decodeError:s.decodeError,batch:s.batchExporting,busy:s.autoAdjusting,pair:s.pair,pairPlacing:s.pairPlacing,tool:s.tool,print:!!w.__spk.frameImages.print};
  }));
  await expect(button).toBeEnabled();
  const before=await page.evaluate(()=>{
    const w=window as unknown as {__spk:{sessionStore:{getState():{sidecar:unknown;undo:unknown[]}}}};
    const s=w.__spk.sessionStore.getState();return{sidecar:structuredClone(s.sidecar),undos:s.undo.length};
  });
  await button.click();
  await expect(page.getByTestId('auto-adjust-message')).toContainText('Auto applied',{timeout:15000});
  const after=await page.evaluate(()=>{
    const w=window as unknown as {__spk:{sessionStore:{getState():{sidecar:unknown;undo:unknown[]}}}};
    const s=w.__spk.sessionStore.getState();return{sidecar:structuredClone(s.sidecar),undos:s.undo.length};
  });
  expect(after.sidecar).not.toEqual(before.sidecar);expect(after.undos).toBe(before.undos+1);
  await page.keyboard.press('Control+z');
  const restored=await page.evaluate(()=>{
    const w=window as unknown as {__spk:{sessionStore:{getState():{sidecar:unknown}}}};
    return w.__spk.sessionStore.getState().sidecar;
  });
  // The existing undo decoder normalizes optional heldCrop to null. All
  // previously saved settings must be restored without requiring omission.
  expect(restored).toMatchObject(before.sidecar as Record<string,unknown>);
});
