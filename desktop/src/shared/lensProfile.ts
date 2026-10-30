// Portable, frozen LCP calibration. Sidecars retain the numbers used by export;
// changing/removing the library copy never changes an existing photograph.
export const LCP_MAX_BYTES = 8 * 1024 * 1024;
const CAMERA_NS = 'http://ns.adobe.com/photoshop/1.0/camera-profile';
const PHOTOSHOP_NS = 'http://ns.adobe.com/photoshop/1.0/';

export interface LcpModel {
  fx: number; fy: number; cx: number; cy: number; scale: number; k: number[];
}
export interface LcpCalibration {
  focal: number; aperture: number; distance: number; crop: number; fisheye: boolean;
  base: LcpModel; green?: LcpModel; red?: LcpModel; blue?: LcpModel; vignette?: LcpModel;
}
export interface LensCalibrationProfile {
  version: 1; name: string; lens: string; raw: boolean; entries: LcpCalibration[];
}

export interface ImportedLensProfile {
  version: 1;
  name: string;
  lens: string;
  xml: string;
  calibration: LensCalibrationProfile;
}

export function parseLcp(name: string, xml: string): ImportedLensProfile {
  if (!/\.lcp$/i.test(name)) throw new Error('extension');
  if (!xml.trim() || new TextEncoder().encode(xml).length > LCP_MAX_BYTES) throw new Error('size');
  // LCP does not need a DTD. Reject entities rather than depending on parser behaviour.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('xml');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('xml');
  const profiles = [...doc.getElementsByTagNameNS(PHOTOSHOP_NS, 'CameraProfiles'), ...doc.getElementsByTagNameNS(CAMERA_NS, 'CameraProfiles')];
  const profile = profiles[0];
  if (profiles.length !== 1 || !profile) throw new Error('profile');
  const elements = [...profile.getElementsByTagName('*')];
  if (!elements.some((e) => e.namespaceURI === CAMERA_NS && ['PerspectiveModel', 'FisheyeModel'].includes(e.localName)))
    throw new Error('profile');
  let lens = '';
  let raw = true;
  let defaultCrop: number | null = null;
  let coefficients = 0;
  const read = (key: string, value: string) => {
    if (key === 'Lens' && !lens) lens = value.trim();
    if (key === 'CameraRawProfile' && value.trim().toLowerCase() === 'false') raw = false;
    if (key === 'SensorFormatFactor' && defaultCrop === null) {
      const crop = Number(value); if (!Number.isFinite(crop) || crop <= 0 || crop > 20) throw new Error('number'); defaultCrop = crop;
    }
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
  const direct = (e: Element, key: string): string | null => {
    const root = [...e.children].find((c) => c.localName === 'Description') ?? e;
    return root.getAttributeNS(CAMERA_NS, key) ?? [...root.children].find((c) => c.namespaceURI === CAMERA_NS && c.localName === key)?.textContent ?? null;
  };
  const number = (e: Element, key: string, fallback: number) => {
    const s = direct(e, key); if (s === null) return fallback;
    const n = Number(s); if (!s.trim() || !Number.isFinite(n) || Math.abs(n) > 1e6) throw new Error('number'); return n;
  };
  const child = (e: Element, key: string) => {
    const root = [...e.children].find((c) => c.localName === 'Description') ?? e;
    return [...root.children].find((c) => c.namespaceURI === CAMERA_NS && c.localName === key);
  };
  const model = (e: Element, vignette = false): LcpModel => ({
    fx: number(e, 'FocalLengthX', -1), fy: number(e, 'FocalLengthY', -1),
    cx: number(e, 'ImageXCenter', .5), cy: number(e, 'ImageYCenter', .5), scale: number(e, 'ScaleFactor', 1),
    k: Array.from({ length: 5 }, (_, i) => number(e, `${vignette ? 'VignetteModelParam' : 'RadialDistortParam'}${i + 1}`,
      !vignette && i >= 3 ? number(e, `TangentialDistortParam${i - 2}`, 0) : 0)),
  });
  const entries: LcpCalibration[] = [];
  for (const base of elements.filter((e) => e.namespaceURI === CAMERA_NS && ['PerspectiveModel', 'FisheyeModel'].includes(e.localName))) {
    const entry = base.parentElement; if (!entry) throw new Error('profile');
    const focal = number(entry, 'FocalLength', 0), crop = number(entry, 'SensorFormatFactor', defaultCrop ?? 1);
    if (focal <= 0 || crop <= 0) throw new Error('number');
    const rawField = direct(entry, 'CameraRawProfile');
    if (rawField?.trim().toLowerCase() === 'false') raw = false;
    const c: LcpCalibration = { focal, crop, aperture: number(entry, 'ApertureValue', 0), distance: number(entry, 'FocusDistance', 0), fisheye: base.localName === 'FisheyeModel', base: model(base) };
    for (const [key, tag] of [['green', 'ChromaticGreenModel'], ['red', 'ChromaticRedGreenModel'], ['blue', 'ChromaticBlueGreenModel'], ['vignette', 'VignetteModel']] as const) {
      const el = child(base, tag); if (el) c[key] = model(el, key === 'vignette');
    }
    entries.push(c);
  }
  if (!entries.length || entries.length > 4096 || new Set(entries.map((e) => e.fisheye)).size !== 1) throw new Error('profile');
  return { version: 1, name, lens, xml, calibration: { version: 1, name, lens, raw, entries } };
}
