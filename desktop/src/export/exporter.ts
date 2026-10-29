// exporter.ts — write the open frame through a recipe (`Export/Exporter.swift`).
//
// The file is the canvas's frame (trap 33): the engine's print, Layer 2, then
// the geometry. With the host's `write_image` (PROTOCOL-REQUESTS R1) the app
// renders `full` as rgba16 in ProPhoto, grades and crops in a worker —
// the same arithmetic as the canvas shader (`layer2Pixel`, `sourcePoint`) —
// and hands the pixels to the host, which converts into the recipe's space,
// embeds the ICC profile and lands
// the file whole. Without it, `export_image` writes the engine's print and the
// page says that the crop and the grade are not in the file.

import { type Adjustments, PROPHOTO_MID_GREY, isNeutral } from '@shared/adjustments';
import { type Geometry, isIdentity, outputSize } from '@shared/geometry';
import type { FilmParams } from '@shared/params';
import type { StockCatalog } from '@shared/stocks';
import { host } from '../host/client';
import { baseName, dirName, joinPath, platform } from '../platform';
import { processExportPixels } from './pixelWorker';
import { type ExportRecipe, extensionOf, hostFormat, resolveTarget, stem, stockToken } from './recipes';

export interface FrameToExport {
  path: string;
  session: string;
  params: FilmParams;
  adjustments: Adjustments;
  geometry: Geometry;
  native: { width: number; height: number };
  dateTaken?: string;
  noFilm?: boolean;
}

export type ExportOutcome =
  | { kind: 'written'; path: string; width: number; height: number; carriesEdits: boolean }
  | { kind: 'skipped'; path: string }
  | { kind: 'failed'; message: string };

export function hostWrites(methods: readonly string[] | undefined): boolean {
  return !!methods?.includes('write_image');
}

export async function targetFor(r: ExportRecipe, f: FrameToExport, catalog: StockCatalog) {
  const dir0 = r.folder.kind === 'fixed' ? r.folder.path : dirName(f.path);
  const dir = r.subfolder.trim() ? joinPath(dir0, r.subfolder.trim()) : dir0;
  const name = baseName(f.path).replace(/\.[^.]+$/, '');
  const date = f.dateTaken ? new Date(f.dateTaken) : new Date();
  const base = stem(r, {
    originalName: name,
    filmStock: stockToken(catalog.stock(f.params.filmStock)?.name ?? f.params.filmStock),
    printStock: f.params.scanFilm ? 'Scan' : stockToken(catalog.stock(f.params.printStock)?.name ?? f.params.printStock),
    date: Number.isFinite(date.getTime()) ? date : new Date(),
  });
  return { dir, base };
}

export { filePixels } from './pixels';

export function outputFor(r: ExportRecipe, g: Geometry, native: { width: number; height: number }) {
  const o = outputSize(g, native);
  if (!r.longEdge || r.longEdge >= Math.max(o.width, o.height)) return o;
  const k = r.longEdge / Math.max(o.width, o.height);
  return { width: Math.max(1, Math.round(o.width * k)), height: Math.max(1, Math.round(o.height * k)) };
}

export async function exportFrame(r: ExportRecipe, f: FrameToExport, catalog: StockCatalog, methods: readonly string[] | undefined): Promise<ExportOutcome> {
  try {
    const { dir, base } = await targetFor(r, f, catalog);
    await platform().ensureDir(dir);
    const target = await resolveTarget(dir, base, extensionOf(r), r.existing, (p) => platform().pathExists(p), joinPath);
    if (!target) return { kind: 'skipped', path: joinPath(dir, `${base}.${extensionOf(r)}`) };
    if (r.format === 'di') {
      // The Cineon DI where the host has it (the Mac's export), else the
      // first port's normalised-density tap.
      if (methods?.includes('export_cineon_di')) {
        const res = await host().exportCineonDi(f.session, target.path);
        return { kind: 'written', path: res.path, width: res.width, height: res.height, carriesEdits: false };
      }
      const res = await host().exportDi(f.session, f.params.printStock, target.path);
      return { kind: 'written', path: res.path, width: 0, height: 0, carriesEdits: false };
    }
    const edited = !isIdentity(f.geometry) || (f.adjustments.enabled && !isNeutral(f.adjustments));
    // An unedited print can be written entirely by the host. Sending the full
    // frame through the webview and back would need several huge IPC buffers
    // and a synchronous per-pixel pass, even though it changes no pixel.
    if (edited && hostWrites(methods)) {
      const rr = await host().transport.request(
        'render',
        { session: f.session, tier: 'full', format: 'rgba16', display: 'prophoto', no_film: f.noFilm === true },
        { timeoutMs: 1_800_000 },
      );
      const info = rr.result.image as { width: number; height: number; row_bytes: number };
      const out = outputFor(r, f.geometry, { width: info.width, height: info.height });
      const px = await processExportPixels(rr.payload, { width: info.width, height: info.height }, f.geometry, f.adjustments, out, PROPHOTO_MID_GREY);
      const w = await host().transport.request(
        'write_image',
        {
          path: target.path,
          format: hostFormat(r),
          quality: r.format === 'jpeg' ? r.quality : undefined,
          color_space: r.colorSpace,
          input_color_space: 'prophoto',
          width: out.width,
          height: out.height,
          overwrite: target.overwrite,
          source_path: f.path,
        },
        { payload: new Uint8Array(px.buffer), timeoutMs: 600_000 },
      );
      return { kind: 'written', path: String(w.result.path), width: out.width, height: out.height, carriesEdits: true };
    }
    const res = await host().exportImage({
      session: f.session,
      no_film: f.noFilm === true,
      path: target.path,
      format: hostFormat(r),
      quality: r.format === 'jpeg' ? r.quality : undefined,
      color_space: r.colorSpace,
      long_edge: r.longEdge || undefined,
      overwrite: target.overwrite,
    });
    return { kind: 'written', path: res.path, width: res.width, height: res.height, carriesEdits: !edited };
  } catch (e) {
    return { kind: 'failed', message: (e as Error).message };
  }
}

export async function exportCube(printStock: string, suggested: string): Promise<string | null> {
  const p = await platform().pickSave('Export .cube', suggested, 'cube');
  if (!p) return null;
  const r = await host().exportCube(printStock, p);
  return r.path;
}
