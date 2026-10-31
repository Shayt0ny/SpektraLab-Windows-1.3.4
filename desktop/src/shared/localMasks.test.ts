import {describe,expect,it} from 'vitest';
import {decodeLocalMasks,maskCoverage,newLocalMask,rasterizeBrush} from './localMasks';
import {ADJUSTMENTS_DEFAULT,applyLayer2,decodeAdjustments,PROPHOTO_MID_GREY} from './adjustments';
import {decodeSidecar,encodeSidecar,newSidecar} from './sidecar';
import {filePixels} from '../export/pixels';
import {GEOMETRY_DEFAULT} from './geometry';

describe('local Post-Dev regions',()=>{
  it('feathers gradients, inverts coverage and applies amount independently',()=>{
    const m={...newLocalMask('linear','a'),start:{x:.25,y:.5},end:{x:.75,y:.5}};
    expect(maskCoverage(m,{x:.1,y:.5})).toBe(1);expect(maskCoverage(m,{x:.9,y:.5})).toBe(0);
    expect(maskCoverage(m,{x:.5,y:.5})).toBeCloseTo(.5);
    expect(maskCoverage({...m,inverted:true,amount:.4},{x:.9,y:.5})).toBeCloseTo(.4);
    expect(maskCoverage({...m,enabled:false,inverted:true},{x:.9,y:.5})).toBe(0);
    const radial={...m,kind:'radial' as const,start:{x:.5,y:.5},end:{x:.8,y:.7}};
    expect(maskCoverage(radial,{x:.5,y:.5})).toBe(1);expect(maskCoverage(radial,{x:.9,y:.5})).toBe(0);
    expect(maskCoverage(radial,{x:.5,y:.9})).toBe(0);
  });
  it('joins sparse brush points without gaps and erases only the covered region',()=>{
    const m=newLocalMask('brush','a');m.strokes=[{points:[{x:.2,y:.5},{x:.8,y:.5}],radius:.12,erase:false}];
    let r=rasterizeBrush(m,1.5,192);expect(maskCoverage(m,{x:.5,y:.5},r)).toBe(1);expect(maskCoverage(m,{x:.5,y:.1},r)).toBe(0);
    m.strokes.push({points:[{x:.5,y:.5}],radius:.15,erase:true});r=rasterizeBrush(m,1.5,192);
    expect(maskCoverage(m,{x:.5,y:.5},r)).toBe(0);expect(maskCoverage(m,{x:.25,y:.5},r)).toBe(1);
  });
  it('rejects corrupt/unbounded saved shapes and duplicate identities',()=>{
    const m=newLocalMask('linear','a');
    for(const bad of [null,{},[m,m],Array(9).fill(m),[{...m,amount:NaN}],[{...m,start:{x:2,y:0}}],[{...m,adjustments:{exposure:4}}]])expect(()=>decodeLocalMasks(bad)).toThrow();
    expect(decodeLocalMasks(undefined)).toEqual([]);
  });
  it('round trips through adjustments and sidecars, retaining legacy Mac mask data',()=>{
    const s=newSidecar(),m=newLocalMask('brush','a');m.adjustments.exposure=.7;s.adjustments={...s.adjustments,localMasks:[m]};
    const encoded={...encodeSidecar(s),masks:{legacy:['keep']}};
    const decoded=decodeSidecar(encoded);expect(decoded.adjustments.localMasks).toEqual([m]);
    expect(encodeSidecar(decoded).masks).toEqual(encoded.masks);
    expect(decodeAdjustments(ADJUSTMENTS_DEFAULT).localMasks).toBeUndefined();
  });
  it('grades selected pixels and keeps crop/turn/flip file pixels attached to the print',()=>{
    const w=12,h=8,src=new Uint16Array(w*h*4).fill(20000);for(let i=3;i<src.length;i+=4)src[i]=65535;
    const m={...newLocalMask('linear','a'),start:{x:.25,y:.5},end:{x:.75,y:.5}};m.adjustments.exposure=1;
    const a={...ADJUSTMENTS_DEFAULT,localMasks:[m]},float=Float32Array.from(src,v=>v/65535);
    applyLayer2(float,w,h,a,PROPHOTO_MID_GREY);expect(float[0]).toBeGreaterThan(src[0]!/65535);expect(float[(w-1)*4]).toBeCloseTo(src[0]!/65535);
    const geo={...GEOMETRY_DEFAULT,crop:{x:.25,y:.25,width:.5,height:.5},quarterTurns:1,flipH:true};
    const output=filePixels(src,{width:w,height:h},geo,a,{width:4,height:6},PROPHOTO_MID_GREY);
    for(let y=0;y<6;y++)for(let x=0;x<4;x++)expect(output[(y*4+x)*4]).toBe(Math.round(float[((y+3)+(x+2)*w)*4]!*65535));
    const bypass=filePixels(src,{width:w,height:h},GEOMETRY_DEFAULT,{...a,enabled:false},{width:w,height:h},PROPHOTO_MID_GREY);expect(bypass).toEqual(src);
  });
  it('negative black and white move in both directions and neutral stays exact',()=>{
    const src=new Float32Array([.3,.3,.3,1]);const run=(blackPoint:number,whitePoint:number)=>{const px=src.slice();applyLayer2(px,1,1,{...ADJUSTMENTS_DEFAULT,blackPoint,whitePoint},PROPHOTO_MID_GREY);return px[0]!;};
    expect(run(-15,0)).toBeGreaterThan(run(0,0));expect(run(15,0)).toBeLessThan(run(0,0));
    expect(run(0,-15)).toBeLessThan(run(0,0));expect(run(0,15)).toBeGreaterThan(run(0,0));
  });
});
