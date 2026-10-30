// Copyright (C) 2026 shayt0ny. SPDX-License-Identifier: GPL-3.0-or-later
// Conservative auto tone for the existing Post-Dev controls. This is an
// independent implementation, not Adobe's algorithm or a film-profile edit.
import type { Adjustments } from './adjustments.ts';
import { clamp } from './params.ts';

export const AUTO_TONE_KEYS = ['exposure', 'contrast', 'highlights', 'shadows', 'blackPoint', 'whitePoint', 'saturation'] as const;
export type AutoTonePatch = Pick<Adjustments, typeof AUTO_TONE_KEYS[number]>;
export interface AnalysisImage {
  width: number; height: number; data: Uint8Array;
  format?: 'rgba8' | 'rgba16'; colorSpace: string;
}
export interface ToneStatistics {
  count: number;
  p01: number; p10: number; p50: number; p90: number; p99: number;
  peak99: number;
  meanSaturation: number;
  highlightClipped: number; shadowClipped: number;
}
export type AutoRegion = readonly (readonly [number, number])[];

/** Inset gate quads keep rebate, rounded corners and penumbra out of metering. */
export function insetAutoRegion(region: AutoRegion): AutoRegion {
  if (region.length !== 4 || region.some((point) => point.length !== 2 || point.some((v) => !Number.isFinite(v))))
    throw new Error('Invalid automatic tone metering region');
  const cx = region.reduce((sum,p) => sum+p[0],0)/4, cy = region.reduce((sum,p) => sum+p[1],0)/4;
  return region.map(([x,y]) => [cx+(x-cx)*.94, cy+(y-cy)*.94] as const);
}
function inside(x: number, y: number, region: AutoRegion): boolean {
  let positive = false, negative = false;
  for (let i=0;i<region.length;++i) {
    const a=region[i]!, b=region[(i+1)%region.length]!;
    const cross=(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);
    positive ||= cross>1e-9; negative ||= cross< -1e-9;
  }
  return !(positive && negative);
}

const linear = (x: number) => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
const encoded = (x: number) => x <= .0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - .055;

/** Reset only the seven automatic controls before measuring. Repeated clicks
 * therefore measure the same baseline instead of stacking previous results.
 * RAW WB, stock, geometry and all other saved grade controls are untouched. */
export function autoToneBaseline(current: Adjustments): Adjustments {
  const out = { ...current, enabled: true };
  for (const key of AUTO_TONE_KEYS) out[key] = 0;
  return out;
}

/** Fixed sRGB measurement, independent of monitor gamut. Bounded deterministic
 * sampling, transparent pixels excluded; all 16 source bits are retained. */
export function toneStatistics(image: AnalysisImage, regions?: readonly AutoRegion[]): ToneStatistics {
  if (image.colorSpace.toLowerCase() !== 'srgb') throw new Error('Auto tone analysis requires an sRGB preview');
  const { width, height, data } = image;
  const wide = image.format === 'rgba16';
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
      data.byteLength !== width * height * (wide ? 8 : 4)) throw new Error('Invalid auto tone preview');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const bins = 4096, luma = new Uint32Array(bins), peak = new Uint32Array(bins);
  let count = 0, saturation = 0, high = 0, black = 0;
  const cols = Math.min(width, Math.max(1,Math.floor(Math.sqrt(65536*width/height))));
  const rows = Math.min(height, Math.max(1,Math.floor(65536/cols)));
  const code = (pixel: number, channel: number) => wide ? view.getUint16(pixel * 8 + channel * 2, true) / 65535 : data[pixel * 4 + channel]! / 255;
  for (let row=0;row<rows;++row) for (let col=0;col<cols;++col) {
    const y=Math.floor((row+.5)*height/rows), x=Math.floor((col+.5)*width/cols);
    if (regions && !regions.some((region) => inside((x+.5)/width,(y+.5)/height,region))) continue;
    const at = y * width + x;
    if (code(at, 3) < .5) continue;
    const r = code(at, 0), g = code(at, 1), b = code(at, 2);
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const yCode = encoded(.2126 * linear(r) + .7152 * linear(g) + .0722 * linear(b));
    luma[Math.round(clamp(yCode, 0, 1) * (bins - 1))]!++;
    peak[Math.round(max * (bins - 1))]!++;
    if (max > .05) saturation += (max - min) / max;
    if (max >= .999) high++;
    if (yCode <= .001) black++;
    count++;
  }
  const percentile = (histogram: Uint32Array, q: number) => {
    const target = Math.max(1, Math.ceil(count * q)); let n = 0;
    for (let i = 0; i < bins; ++i) { n += histogram[i]!; if (n >= target) return i / (bins - 1); }
    return 0;
  };
  return { count, p01: percentile(luma,.01), p10: percentile(luma,.1), p50: percentile(luma,.5),
    p90: percentile(luma,.9), p99: percentile(luma,.99), peak99: percentile(peak,.99),
    meanSaturation: count ? saturation / count : 0, highlightClipped: count ? high / count : 0,
    shadowClipped: count ? black / count : 0 };
}

/** Bounded starting point. The session validates this through the real native
 * grade before committing, rather than predicting ProPhoto grading in sRGB. */
export function autoToneProposal(s: ToneStatistics): AutoTonePatch | null {
  const span = s.p99 - s.p01, middleSpan = s.p90 - s.p10;
  if (s.count < 32 || span < .025 || s.p99 <= .01 || s.p01 >= .99) return null;
  let exposure = clamp(2.2 * Math.log2(.46 / Math.max(s.p50,.02)) * .6, -1.2, 1.2);
  if (exposure > 0) exposure = Math.min(exposure, Math.max(0, 2.2 * Math.log2(.97 / Math.max(s.peak99,.02))));
  exposure = Math.round(exposure * 100) / 100;
  const gain = 2 ** (exposure / 2.2), peak = s.peak99 * gain, low = s.p10 * gain;
  const contrast = middleSpan > .12 && middleSpan < .5 && peak < .96 ? Math.round(Math.min(12, (.5-middleSpan)*30))
    : middleSpan > .85 ? -5 : 0;
  const highlights = peak > .94 ? -Math.round(clamp((peak-.9)*250,0,45)) : 0;
  const shadows = span > .25 && low < .2 ? Math.round(clamp((.2-low)*160,0,30)) : 0;
  const blackPoint = span > .25 && s.p01 > .005 ? Math.round(clamp(s.p01*gain*15,0,1.5)) : 0;
  const whitePoint = span > .2 && peak < .9 ? Math.round(clamp((.97-peak)*20,0,3)) : 0;
  const saturation = s.meanSaturation > .03 && s.meanSaturation < .3 && span > .2
    ? Math.round(clamp((.3-s.meanSaturation)/.3*8,0,8)) : s.meanSaturation > .7 && s.highlightClipped > .01 ? -5 : 0;
  return { exposure, contrast, highlights, shadows, blackPoint, whitePoint, saturation };
}

export function addsClipping(before: ToneStatistics, after: ToneStatistics): boolean {
  return after.highlightClipped > before.highlightClipped + .003 || after.shadowClipped > before.shadowClipped + .005;
}

export function saferAutoTone(patch: AutoTonePatch): AutoTonePatch {
  return { ...patch, exposure: Math.min(0,patch.exposure), contrast: Math.min(0,patch.contrast),
    shadows: Math.min(20,patch.shadows), blackPoint:0, whitePoint:0, saturation:Math.min(0,patch.saturation) };
}
