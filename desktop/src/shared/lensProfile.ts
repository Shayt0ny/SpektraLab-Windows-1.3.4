// LCP intake only. Saving a profile does not enable a correction backend.
export const LCP_MAX_BYTES = 8 * 1024 * 1024;
const CAMERA_NS = 'http://ns.adobe.com/photoshop/1.0/camera-profile';

export interface ImportedLensProfile {
  version: 1;
  name: string;
  lens: string;
  xml: string;
}

export function parseLcp(name: string, xml: string): ImportedLensProfile {
  if (!/\.lcp$/i.test(name)) throw new Error('extension');
  if (!xml.trim() || new TextEncoder().encode(xml).length > LCP_MAX_BYTES) throw new Error('size');
  // LCP does not need a DTD. Reject entities rather than depending on parser behaviour.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('xml');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('xml');
  const profiles = doc.getElementsByTagNameNS(CAMERA_NS, 'CameraProfiles');
  const profile = profiles.item(0);
  if (profiles.length !== 1 || !profile) throw new Error('profile');
  const elements = [...profile.getElementsByTagName('*')];
  if (!elements.some((e) => e.namespaceURI === CAMERA_NS && ['PerspectiveModel', 'FisheyeModel'].includes(e.localName)))
    throw new Error('profile');
  let lens = '';
  let coefficients = 0;
  const read = (key: string, value: string) => {
    if (key === 'Lens' && !lens) lens = value.trim();
    if (/^(?:RadialDistortParam\d+|TangentialDistortParam\d+|VignetteModelParam\d+|ScaleFactor|Image[XY]Center|FocalLength[XY]?)$/.test(key)) {
      if (!value.trim() || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > 1e9) throw new Error('number');
      if (/^(RadialDistortParam|TangentialDistortParam|VignetteModelParam)/.test(key)) coefficients++;
    }
  };
  for (const e of elements) {
    if (e.namespaceURI === CAMERA_NS && e.children.length === 0) read(e.localName, e.textContent ?? '');
    for (const a of [...e.attributes]) if (a.namespaceURI === CAMERA_NS) read(a.localName, a.value);
  }
  if (!coefficients) throw new Error('profile');
  return { version: 1, name, lens, xml };
}
