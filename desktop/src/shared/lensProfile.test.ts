// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { parseLcp } from './lensProfile';
import { decodeSidecar, encodeSidecar, newSidecar } from './sidecar';
import { decodeWire } from './whiteBalance';

const xml = `<x:xmpmeta xmlns:x="adobe:ns:meta/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:p="http://ns.adobe.com/photoshop/1.0/" xmlns:c="http://ns.adobe.com/photoshop/1.0/camera-profile"><rdf:RDF><rdf:Description><p:CameraProfiles><rdf:Seq><rdf:li c:Lens="Fixture 50mm" c:FocalLength="50" c:CameraRawProfile="True" c:SensorFormatFactor="1"><c:PerspectiveModel c:FocalLengthX="1.2" c:FocalLengthY="1.2" c:ImageXCenter="0.49" c:RadialDistortParam1="0.1"><c:VignetteModel c:VignetteModelParam1="-0.1" /></c:PerspectiveModel></rdf:li></rdf:Seq></p:CameraProfiles></rdf:Description></rdf:RDF></x:xmpmeta>`;
it('reads Adobe Photoshop namespace and preserves calibrated centres and distortion/vignetting', () => {
  const profile = parseLcp('fixture.lcp', xml);
  expect(profile.calibration).toMatchObject({ raw: true, entries: [{ focal: 50, crop: 1, base: { fx: 1.2, cx: .49, k: [.1, 0, 0, 0, 0] }, vignette: { k: [-.1, 0, 0, 0, 0] } }] });
  expect(parseLcp('jpeg.lcp', xml.replace('c:CameraRawProfile="True"', 'c:CameraRawProfile=" False "')).calibration.raw).toBe(false);
  expect(parseLcp('fixture.lcp', xml.replace('c:RadialDistortParam1="0.1"', '').replace('<c:VignetteModel', '<c:RadialDistortParam1>0.1</c:RadialDistortParam1><c:VignetteModel')).calibration.entries[0]?.base.k[0]).toBe(.1);
});
it('rejects entities, missing calibration and non-finite numbers', () => {
  for (const bad of ['<!DOCTYPE x>' + xml, xml.replace('0.1', 'NaN'), xml.replaceAll('PerspectiveModel', 'UnknownModel')]) expect(() => parseLcp('fixture.lcp', bad)).toThrow();
});
it('freezes the imported calibration into this photo and its decode/export wire', () => {
  const sidecar = newSidecar(), profile = parseLcp('fixture.lcp', xml);
  sidecar.decode = { ...sidecar.decode, lensCorrection: true, lensProfile: profile.calibration };
  const restored = decodeSidecar(JSON.parse(JSON.stringify(encodeSidecar(sidecar))));
  expect(decodeWire(restored.decode, true)).toMatchObject({ lens_correction: true, lens_profile: profile.calibration });
  expect(decodeWire({ ...restored.decode, lensCorrection: false }, true)).not.toHaveProperty('lens_profile');
});
