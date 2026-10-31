import {describe,it,expect} from 'vitest';
import {automaticLumaCurve} from './autoCurve';
import {evaluateCurve} from './adjustments';
import type {ToneStatistics} from './autoAdjust';
const stats:ToneStatistics={count:256,p01:.02,p10:.05,p50:.2,p90:.5,p99:.9,peak99:.95,meanSaturation:.2,highlightClipped:0,shadowClipped:0};
describe('automatic luma spline',()=>{
  it('lifts dark midtones and lowers bright ones with bounded monotonic output',()=>{
    for(const p50 of [.2,.8]){
      const curve=automaticLumaCurve({...stats,p50})!;expect(curve.points[0]).toEqual([0,0]);expect(curve.points.at(-1)).toEqual([1,1]);
      if(p50<.5)expect(evaluateCurve(curve,.5)).toBeGreaterThan(.5);else expect(evaluateCurve(curve,.5)).toBeLessThan(.5);
      let previous=0;for(let i=0;i<=1000;i++){const y=evaluateCurve(curve,i/1000);expect(y).toBeGreaterThanOrEqual(previous);expect(Math.abs(y-i/1000)).toBeLessThan(.14);previous=y;}
    }
  });
  it('keeps flat/empty frames unchanged and reproduces suggestions without accumulation',()=>{
    expect(automaticLumaCurve({...stats,count:0})).toBeNull();expect(automaticLumaCurve({...stats,p01:.5,p99:.5})).toBeNull();
    expect(automaticLumaCurve(stats)).toEqual(automaticLumaCurve(stats));
  });
});
