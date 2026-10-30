import { expect, it } from 'vitest';
import { decodeSidecar, encodeSidecar, newSidecar } from './sidecar';
import { decodeWire } from './whiteBalance';
import type { CameraProfile } from './rawDevelopment';
import { applyAEMethod, FILM_PARAMS_DEFAULT, fullDelta, delta } from './params';
const profile: CameraProfile = { version: 1, name: 'fixture.dcp', camera: 'Fixture', description: '', copyright: '', tags: { '50940': [0, 0, .5, .75, 1, 1] } };
it('defaults off and sends precisely the existing RAW decode when disabled', () => {
  const defaults = newSidecar().decode;
  expect(defaults.apply_camera_curve).toBe(false);
  expect(decodeSidecar({ decode: {} }).decode.apply_camera_curve).toBe(false);
  expect(decodeWire(defaults, true)).toEqual({ white_balance: { mode: 'as_shot' } });
  expect(decodeWire({ ...defaults, cameraCurve: { profile }, apply_camera_curve: false }, true)).toEqual(decodeWire(defaults, true));
});
it('persists a camera-curve snapshot and carries it to RAW redecode and export', () => {
  const sidecar = newSidecar();
  sidecar.decode = { ...sidecar.decode, apply_camera_curve: true, cameraCurve: { profile } };
  const restored = decodeSidecar(JSON.parse(JSON.stringify(encodeSidecar(sidecar))));
  expect(decodeWire(restored.decode, true)).toEqual({ white_balance: { mode: 'as_shot' }, apply_camera_curve: true, camera_profile: profile });
  expect(decodeWire(restored.decode, false)).toBeNull();
});
it('sends the original meter explicitly rather than leaving the previous meter active', () => {
  const next = applyAEMethod(FILM_PARAMS_DEFAULT, 'center_weighted');
  expect(delta(next, FILM_PARAMS_DEFAULT).delta.auto_exposure_method).toBe('center_weighted');
});
it('connects gamma and scanner controls to their owning stages without changing defaults', () => {
  const p = { ...FILM_PARAMS_DEFAULT, densityCurveGamma: 1.2, scannerWhiteCorrection: true, scannerBlackCorrection: true, scannerLensBlur: 2 };
  expect(fullDelta(p)).toMatchObject({ density_curve_gamma: 1.2, scanner_white_correction: true, scanner_black_correction: true, scanner_lens_blur: 2 });
  expect(fullDelta({ ...p, scanFilm: true })).toMatchObject({ scanner_white_correction: false, scanner_black_correction: false });
});
