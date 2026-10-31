import {expect,test} from '@playwright/test';

for(const language of ['english','simplifiedChinese'])for(const scale of [100,115,130]){
  test(`settings stay aligned: ${language} ${scale}%`,async({page})=>{
    await page.setViewportSize({width:1100,height:680});
    await page.goto('/?open=');
    await expect(page.getByTestId('tier-badge')).toHaveText('full',{timeout:25000});
    await page.evaluate(({language,scale})=>{
      const app=(window as unknown as {__spk:{settingsStore:{getState():{set:(k:string,v:unknown)=>void}}}}).__spk;
      app.settingsStore.getState().set('language',language);app.settingsStore.getState().set('interfaceScale',scale);
    },{language,scale});
    await page.keyboard.press('Control+,');const dialog=page.getByTestId('settings');
    await expect(dialog).toBeVisible();
    for(let i=0;i<5;i++){
      await dialog.locator('.settings-nav button').nth(i).click();
      const failures=await dialog.evaluate(el=>{
        const content=el.querySelector('.settings-content')!;
        const groups=Array.from(content.querySelectorAll(':scope > .settings-group')).map(g=>g.getBoundingClientRect());
        const bad=[];
        if(content.scrollWidth>content.clientWidth+1)bad.push('horizontal overflow');
        for(let j=1;j<groups.length;j++)if(groups[j-1]!.bottom>groups[j]!.top+1)bad.push('overlapping groups');
        const actions=el.querySelector('.dialog-actions')!.getBoundingClientRect();
        if(actions.bottom>window.innerHeight||actions.top<0)bad.push('footer outside window');
        return bad;
      });
      expect(failures).toEqual([]);
      if(language==='simplifiedChinese'&&scale===115&&(i===1||i===4))await page.screenshot({path:test.info().outputPath(`settings-page-${i}.png`)});
    }
    await dialog.locator('.settings-nav button').first().click();
    await page.screenshot({path:test.info().outputPath(`settings-${language}-${scale}.png`)});
  });
}

test('automatic curve is visible, editable and undone in one step',async({page})=>{
  await page.goto('/?open=');await expect(page.getByTestId('tier-badge')).toHaveText('full',{timeout:25000});
  await page.getByRole('tab',{name:'Post-Dev',exact:true}).click();
  const auto=page.getByTestId('auto-curve');await auto.scrollIntoViewIfNeeded();await expect(auto).toBeEnabled();
  await auto.click();await expect(page.getByTestId('auto-curve-message')).toContainText('Luma curve applied');
  await expect(page.getByTestId('curve-editor').locator('circle')).toHaveCount(7);
  await page.keyboard.press('Control+z');await expect(page.getByTestId('curve-editor').locator('circle')).toHaveCount(2);
  await page.screenshot({path:test.info().outputPath('editor-studio.png')});
});
