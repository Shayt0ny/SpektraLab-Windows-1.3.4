// Copyright (C) 2026 shayt0ny. SPDX-License-Identifier: GPL-3.0-or-later
import type { Curve } from './adjustments';
import type { ToneStatistics } from './autoAdjust';
import { clamp } from './params';

/** Neutral sRGB measurement -> encoded ProPhoto curve coordinates. These are
 * bounded suggestions; the session validates actual graded pixels natively. */
export function automaticLumaCurve(s: ToneStatistics): Curve | null {
  if (s.count < 32 || s.p99-s.p01 < .025 || s.p99 <= .01 || s.p01 >= .99) return null;
  const neutral = (x: number) => (x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4)**(1/1.8);
  const lift = clamp((neutral(.46)-neutral(s.p50))*.65,-.12,.12);
  const spread = clamp((.6-(s.p90-s.p10))*.12,-.04,.04);
  const knots = [0,.15,.35,.5,.7,.9,1];
  const points: Curve['points'] = knots.map((x) => {
    const weight = Math.sin(Math.PI*x);
    return [x, x===0 || x===1 ? x : clamp(x+lift*weight+spread*(x-.5)*weight,0,1)];
  });
  // No new black/white clipping, and a strictly increasing editable spline.
  for (let i=1;i<points.length-1;i++) points[i]![1]=clamp(points[i]![1],points[i-1]![1]+.001,1-(points.length-1-i)*.001);
  return {points};
}
