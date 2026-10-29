// Upstream 1.3.2 PlacementFit/PlacementWindow; engine latitude_fit.cpp is
// the reference. A measured frame is sufficient to solve slider edits locally.
import type { SceneLatitudeSettings } from './params';

export type PlacementSide = 'highlight' | 'shadow';
export interface MeasuredSide { scene_extreme_ev: number; medium_boundary_ev: number }
export interface PlacementMeasure { highlight: MeasuredSide; shadow: MeasuredSide }
export type Fit = { params: SceneLatitudeSettings; issue?: never } | { issue: string; params?: never };

function departure(d: number, h: number, m: number): number {
  if (!(d > 0)) return 0;
  if (m === 2) { const r = Math.sqrt(h * h + d * d); return -(d * d * d) / (r * (h + r)); }
  if (m === 1) return -(d * d) / (h + d);
  return d * (h / Math.pow(Math.pow(h, m) + Math.pow(d, m), 1 / m) - 1);
}

export function solveKnee(a: number, c: number, n: number, m: number): number | null {
  const t = a - n;
  if (!(n > 0) || !(t < c)) return null;
  const landing = (k: number) => k + ((a - k) + departure(a - k, c - k, m));
  let lo = t - Math.sqrt(Math.max(0, (a - t) * (c - t))) - 64, hi = t;
  if (!(landing(lo) < t)) return null;
  for (let i = 0; i < 200 && hi - lo > 1e-12; i++) {
    const mid = (lo + hi) / 2;
    if (landing(mid) > t) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export function placementFit(at: PlacementMeasure, highlight: number, shadow: number, base: SceneLatitudeSettings): Fit {
  const out = { ...base, active: highlight > 0 || shadow > 0,
    highlightPullBack: highlight, shadowPullBack: shadow, highlightRoom: 0, shadowRoom: 0 };
  const issues: string[] = [];
  let top: number | null = null, bottom: number | null = null;
  if (highlight > 0) {
    top = solveKnee(at.highlight.scene_extreme_ev, at.highlight.medium_boundary_ev, highlight, base.rolloff);
    if (top == null) issues.push('pull_back_below_minimum');
    else { out.highlightKnee = top; out.highlightRoom = at.highlight.medium_boundary_ev - top; }
  }
  if (shadow > 0) {
    const minimum = at.shadow.medium_boundary_ev - at.shadow.scene_extreme_ev;
    if (!(shadow > minimum)) issues.push('pull_back_below_minimum');
    else if (!(shadow < base.maxLift)) issues.push('pull_back_exceeds_max_lift');
    else {
      const lift = shadow * base.maxLift / Math.sqrt(base.maxLift ** 2 - shadow ** 2);
      const k = solveKnee(-at.shadow.scene_extreme_ev, -at.shadow.medium_boundary_ev, lift, base.rolloff);
      if (k == null) issues.push('pull_back_below_minimum');
      else { bottom = -k; out.shadowKnee = bottom; out.shadowRoom = bottom - at.shadow.medium_boundary_ev; }
    }
  }
  for (const [knee, room] of [[top, out.highlightRoom], [bottom, out.shadowRoom]] as [number | null, number][]) {
    if (knee == null) continue;
    if (room < 0.5) issues.push('room_below_minimum');
    if (room > 24 || Math.abs(knee) > 24) issues.push('out_of_range');
  }
  if (top != null && bottom != null && !(bottom < top)) issues.push('knees_cross');
  return issues.length ? { issue: issues[0]! } : { params: out };
}

export interface PlacementWindow { span: [number, number] | null; below: string; above?: string }
export function placementWindow(at: PlacementMeasure, side: PlacementSide, other: number, base: SceneLatitudeSettings): PlacementWindow {
  const v = (x: number) => placementFit(at, side === 'highlight' ? x : other, side === 'shadow' ? x : other, base);
  const a = at[side];
  const minimum = side === 'highlight' ? a.scene_extreme_ev - a.medium_boundary_ev : a.medium_boundary_ev - a.scene_extreme_ev;
  let bad = Math.max(minimum, 0), first: number | undefined, below = 'pull_back_below_minimum';
  for (let x = Math.floor(bad / 0.125) * 0.125 + 0.125; x <= 8 + 1e-9; x += 0.125) {
    const f = v(x);
    if (f.issue) { below = f.issue; bad = x; } else { first = x; break; }
  }
  if (first == null) return { span: null, below: 'no_window' };
  let good = first;
  while (good - bad > 0.005) {
    const mid = (good + bad) / 2, f = v(mid);
    if (f.issue) { below = f.issue; bad = mid; } else good = mid;
  }
  const least = Math.min(Math.ceil(good * 100) / 100, first);
  let most = 8, above = v(8).issue;
  if (above) {
    good = first; bad = 8;
    while (bad - good > 0.005) {
      const mid = (good + bad) / 2, f = v(mid);
      if (f.issue) { above = f.issue; bad = mid; } else good = mid;
    }
    most = Math.max(Math.floor(good * 100) / 100, least);
  }
  return { span: [least, most], below, above };
}

export function placementLanding(w: PlacementWindow, asked: number): { value: number; issue?: string } {
  if (!(asked > 0)) return { value: 0 };
  if (!w.span) return { value: 0, issue: w.below };
  if (asked < w.span[0]) return { value: w.span[0], issue: w.below };
  if (asked > w.span[1]) return { value: w.span[1], issue: w.above };
  return { value: asked };
}
