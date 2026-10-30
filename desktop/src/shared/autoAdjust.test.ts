// Copyright (C) 2026 shayt0ny. SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { ADJUSTMENTS_DEFAULT } from './adjustments';
import { addsClipping, autoToneBaseline, autoToneProposal, insetAutoRegion, saferAutoTone, toneStatistics } from './autoAdjust';

function image(values: number[], wide = false) {
  const codes = Array.from({length:256},(_,i) => [values[i%values.length]!,values[i%values.length]!,values[i%values.length]!,1]).flat();
  return { width:16,height:16,colorSpace:'sRGB',format:wide?'rgba16' as const:'rgba8' as const,
    data:wide?new Uint8Array(Uint16Array.from(codes,x=>Math.round(x*65535)).buffer):Uint8Array.from(codes,x=>Math.round(x*255)) };
}

describe('conservative automatic Post-Dev tone', () => {
  it('lifts a dark frame, lowers a bright frame and stays within conservative bounds', () => {
    const dark = autoToneProposal(toneStatistics(image([.04,.08,.12,.18,.25,.35])))!;
    const bright = autoToneProposal(toneStatistics(image([.45,.6,.75,.85,.95])))!;
    expect(dark.exposure).toBeGreaterThan(0); expect(dark.exposure).toBeLessThanOrEqual(1.2);
    expect(bright.exposure).toBeLessThan(0); expect(bright.exposure).toBeGreaterThanOrEqual(-1.2);
    expect(dark.shadows).toBeGreaterThan(0); expect(dark.saturation).toBe(0);
  });
  it('protects existing bright channels instead of raising global exposure into them', () => {
    const frame = image([.03,.06,.1,.2,.99]);
    const proposal = autoToneProposal(toneStatistics(frame))!;
    expect(proposal.exposure).toBe(0); expect(proposal.highlights).toBeLessThan(0);
  });
  it('does not infer recoverable detail in blank black, white or constant grey images', () => {
    for (const value of [0,.2,.5,1]) expect(autoToneProposal(toneStatistics(image([value])))).toBeNull();
    const transparent=image([.2,.8]);for(let i=3;i<transparent.data.length;i+=4)transparent.data[i]=0;
    expect(toneStatistics(transparent).count).toBe(0);expect(autoToneProposal(toneStatistics(transparent))).toBeNull();
  });
  it('uses equivalent 8/16-bit encodings and excludes transparent pixels', () => {
    const byte=toneStatistics(image([.1,.2,.4,.6,.8])); const wide=toneStatistics(image([.1,.2,.4,.6,.8],true));
    expect(Math.abs(byte.p50-wide.p50)).toBeLessThan(.003);
    expect(Math.abs(autoToneProposal(byte)!.exposure-autoToneProposal(wide)!.exposure)).toBeLessThanOrEqual(.02);
    expect(()=>toneStatistics({...image([.2]),colorSpace:'ProPhoto RGB'})).toThrow(/sRGB/);
  });
  it('measures without stacking previous auto values or changing retained manual controls', () => {
    const current={...ADJUSTMENTS_DEFAULT,exposure:1,highlights:-40,brightness:8,temperature:20};
    const before=structuredClone(current), base=autoToneBaseline(current);
    expect(base).toMatchObject({exposure:0,highlights:0,brightness:8,temperature:20});expect(current).toEqual(before);
    expect(autoToneBaseline(base)).toEqual(base);
  });
  it('falls back when clipping increases and never introduces positive gain in the safe recipe', () => {
    const before=toneStatistics(image([.1,.5,.9])); const after={...before,highlightClipped:.02};
    expect(addsClipping(before,after)).toBe(true);expect(addsClipping(before,before)).toBe(false);
    const safe=saferAutoTone({exposure:1,contrast:12,highlights:-20,shadows:30,whitePoint:3,blackPoint:2,saturation:8});
    expect(safe).toEqual({exposure:0,contrast:0,highlights:-20,shadows:20,whitePoint:0,blackPoint:0,saturation:0});
  });
  it('meters the photograph inside a film gate and excludes its black rebate', () => {
    const frame=image([.1,.4,.7]);
    for(let y=0;y<16;++y)for(let x=0;x<16;++x)if(x<4||x>=12||y<4||y>=12)
      frame.data.set([0,0,0,255],(y*16+x)*4);
    const region=insetAutoRegion([[.25,.25],[.75,.25],[.75,.75],[.25,.75]]);
    expect(toneStatistics(frame).shadowClipped).toBeGreaterThan(.5);
    expect(toneStatistics(frame,[region]).shadowClipped).toBe(0);
    expect(toneStatistics(frame,[region]).count).toBe(64);
  });
  it('excludes a half-frame gap using two picture regions',()=>{
    const frame=image([.1,.4,.7]);
    for(let y=0;y<16;++y)for(let x=6;x<10;++x)frame.data.set([0,0,0,255],(y*16+x)*4);
    const regions=[insetAutoRegion([[0,0],[.375,0],[.375,1],[0,1]]),insetAutoRegion([[.625,0],[1,0],[1,1],[.625,1]])];
    expect(toneStatistics(frame).shadowClipped).toBe(.25);
    expect(toneStatistics(frame,regions).shadowClipped).toBe(0);
  });
  it('keeps sample count bounded even on an extremely thin image',()=>{
    const count=131073,data=new Uint8Array(count*4);data.fill(128);for(let i=3;i<data.length;i+=4)data[i]=255;
    const stats=toneStatistics({width:1,height:count,data,colorSpace:'sRGB'});
    expect(stats.count).toBe(65536);
  });
});
