import { describe, expect, it } from 'vitest';
import { SCENE_LATITUDE_DEFAULT as base } from './params';
import { placementFit, placementWindow, placementLanding, solveKnee } from './placement';

const at = { highlight: { scene_extreme_ev: 6, medium_boundary_ev: 4 }, shadow: { scene_extreme_ev: -5, medium_boundary_ev: -3 } };
describe('upstream scene placement', () => {
  it('matches the Vulkan engine fit on the synthetic CineStill probe', () => {
    const measured = {
      highlight: { scene_extreme_ev: 1.6855177178315188, medium_boundary_ev: 2.6168238082176964 },
      shadow: { scene_extreme_ev: -0.7129894659931145, medium_boundary_ev: -6.3060923094545975 },
    };
    const f = placementFit(measured, 3, 0, base);
    expect(f.params?.highlightKnee).toBeCloseTo(-9.614632217539267, 10);
    expect(f.params?.highlightRoom).toBeCloseTo(12.231456025756962, 10);
  });
  it('lands the measured highlight at the requested pull-back', () => {
    const k = solveKnee(6, 4, 3, 2)!;
    const d = 6 - k, h = 4 - k;
    expect(k + d * h / Math.sqrt(h * h + d * d)).toBeCloseTo(3, 10);
    expect(placementFit(at, 2, 0, base).issue).toBe('pull_back_below_minimum');
  });
  it('clamps to hundredths the engine accepts, while zero remains off', () => {
    const w = placementWindow(at, 'shadow', 0, base);
    expect(w.span).not.toBeNull();
    expect(w.span![0]).toBeGreaterThan(2);
    expect(w.span![1]).toBeLessThan(4);
    for (const x of w.span!) expect(placementFit(at, 0, x, base).params).toBeDefined();
    expect(placementLanding(w, 1).value).toBe(w.span![0]);
    expect(placementLanding(w, 8).value).toBe(w.span![1]);
    expect(placementLanding(w, 0)).toEqual({ value: 0 });
  });
  it('refuses impossible shadows and does not commit a stale fitted curve', () => {
    const deep = { ...at, shadow: { scene_extreme_ev: -12, medium_boundary_ev: -3 } };
    expect(placementLanding(placementWindow(deep, 'shadow', 0, base), 3)).toEqual({ value: 0, issue: 'no_window' });
    expect(placementFit(at, 3, 4, base).params).toBeUndefined();
    expect(placementFit(at, 0, 0, base).params?.active).toBe(false);
  });
});
