import { expect, test } from '@playwright/test';

test('RAW decoder selection changes the real decode snapshot and persists the preference', async ({ page }) => {
  await page.goto('/?open=');
  await expect(page.getByTestId('tier-badge')).toHaveText('full', { timeout:25000 });
  await page.evaluate(async () => {
    const sessionPath = '/src/state/session.ts';
    const { sessionStore } = await import(sessionPath);
    const s = sessionStore.getState();
    // The mock does not simulate a real decoder. Supply its selectable wire
    // capability only to verify UI -> preference -> per-photo snapshot.
    sessionStore.setState({ hello: { ...s.hello, raw_decoders:['auto','libraw','candidate'] } });
  });
  await page.keyboard.press('Control+,');
  const dialog = page.getByTestId('settings');
  await dialog.getByRole('button', { name:'Rendering', exact:true }).click();
  await dialog.getByTestId('raw-decoder').click();
  await page.getByRole('menuitem', { name:'Candidate decoder', exact:true }).click();
  await expect(dialog.getByTestId('raw-decoder')).toHaveText('Candidate decoder');
  const state = await page.evaluate(() => {
    const w = window as unknown as { __spk:{ sessionStore:{getState():{sidecar:{decode:{rawDecoder:string}}}}; settingsStore:{getState():{rawDecoder:string}} } };
    return { saved:w.__spk.settingsStore.getState().rawDecoder, decode:w.__spk.sessionStore.getState().sidecar.decode.rawDecoder };
  });
  expect(state).toEqual({ saved:'candidate', decode:'candidate' });
});
