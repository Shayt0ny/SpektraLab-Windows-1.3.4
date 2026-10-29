import { test, expect } from '@playwright/test';

const xml = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:c="http://ns.adobe.com/photoshop/1.0/camera-profile"><rdf:Description><c:CameraProfiles><rdf:Seq><rdf:li c:Lens="Test Lens 40mm" c:FocalLength="40"><c:PerspectiveModel c:RadialDistortParam1="0.01" /></rdf:li></rdf:Seq></c:CameraProfiles></rdf:Description></rdf:RDF>`;

test('LCP import saves a private copy, survives reopening, and states that correction is not applied', async ({ page }) => {
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('import-lens-profile').click();
  await (await chooser).setFiles({ name: 'my-lens.lcp', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await expect(page.getByTestId('lens-profile-name')).toContainText('my-lens.lcp');
  await expect(page.getByTestId('lens-profile-name')).toContainText('Test Lens 40mm');
  await expect(page.getByTestId('lens-profile-status')).toContainText(/not applied|尚未应用/);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('store:LensProfiles/imported')!));
  expect(stored.xml).toBe(xml);
  await page.reload();
  await expect(page.getByTestId('lens-profile-name')).toContainText('my-lens.lcp');
  await page.getByTestId('remove-lens-profile').click();
  await expect(page.getByTestId('lens-profile-name')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('lens-profile-name')).toHaveCount(0);
});

test('an invalid profile leaves the previous saved profile untouched', async ({ page }) => {
  await page.goto('/');
  const input = page.getByTestId('lens-profile-input');
  await input.setInputFiles({ name: 'valid.lcp', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await expect(page.getByTestId('lens-profile-name')).toContainText('valid.lcp');
  for (const invalid of ['<html>not LCP</html>', xml.replace('0.01', 'NaN'), '<!DOCTYPE x [<!ENTITY y "bad">]>' + xml]) {
    await input.setInputFiles({ name: 'bad.lcp', mimeType: 'application/xml', buffer: Buffer.from(invalid) });
    await expect(page.getByTestId('lens-profile-error')).toBeVisible();
    await expect(page.getByTestId('lens-profile-name')).toContainText('valid.lcp');
  }
  await input.setInputFiles([]);
  await expect(page.getByTestId('lens-profile-name')).toContainText('valid.lcp');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('store:LensProfiles/imported')!).name)).toBe('valid.lcp');
  await page.evaluate(() => {
    // Fail at the storage boundary, independent of Vite's HMR module URLs.
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'store:LensProfiles/imported') throw new DOMException('storage full', 'QuotaExceededError');
      write.call(this, key, value);
    };
  });
  await input.setInputFiles({ name: 'replacement.lcp', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await expect(page.getByTestId('lens-profile-error')).toBeVisible();
  await expect(page.getByTestId('lens-profile-name')).toContainText('valid.lcp');
});
