import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADJUSTMENTS_DEFAULT } from '@shared/adjustments';
import { GEOMETRY_DEFAULT } from '@shared/geometry';
import { FILM_PARAMS_DEFAULT } from '@shared/params';
import { EMPTY_CATALOG } from '@shared/stocks';
import { DEFAULT_RECIPES } from './recipes';
import type * as PlatformAPI from '../platform';

const mocks = vi.hoisted(() => ({
  native: vi.fn(), request: vi.fn(), pixels: vi.fn(),
  platform: { ensureDir: vi.fn(), pathExists: vi.fn() },
}));
vi.mock('../host/client', () => ({ host: () => ({ exportImage: mocks.native, transport: { request: mocks.request } }) }));
vi.mock('./pixelWorker', () => ({ processExportPixels: mocks.pixels }));
vi.mock('../platform', async (original) => ({
  ...await original<typeof PlatformAPI>(), platform: () => mocks.platform,
}));
import { exportFrame } from './exporter';

const recipe = { ...DEFAULT_RECIPES[0]!, longEdge: 0 };
const frame = {
  path: '/photos/large.png', session: 's1', params: FILM_PARAMS_DEFAULT,
  adjustments: ADJUSTMENTS_DEFAULT, geometry: GEOMETRY_DEFAULT,
  native: { width: 7168, height: 10240 },
};

describe('large image export routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platform.pathExists.mockResolvedValue(false);
    mocks.native.mockResolvedValue({ path: '/photos/export.jpg', width: 7168, height: 10240 });
    mocks.request.mockImplementation(async (method: string) => method === 'render'
      ? { result: { image: { width: 3, height: 2, row_bytes: 24 } }, payload: new Uint8Array(48) }
      : { result: { path: '/photos/edited.jpg' }, payload: new Uint8Array() });
    mocks.pixels.mockResolvedValue(new Uint16Array(24));
  });

  it('exports an unchanged 73 MP print without a full-frame webview round trip', async () => {
    const result = await exportFrame(recipe, frame, EMPTY_CATALOG, ['write_image', 'export_image']);
    expect(result).toMatchObject({ kind: 'written', width: 7168, height: 10240, carriesEdits: true });
    expect(mocks.native).toHaveBeenCalledWith(expect.objectContaining({ session: 's1', long_edge: undefined }));
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.pixels).not.toHaveBeenCalled();
  });

  it('passes bypass to both native and edited export routes', async () => {
    await exportFrame(recipe, { ...frame, noFilm: true }, EMPTY_CATALOG, ['write_image', 'export_image']);
    expect(mocks.native).toHaveBeenCalledWith(expect.objectContaining({ no_film: true }));
    await exportFrame(recipe, { ...frame, noFilm: true, adjustments: { ...ADJUSTMENTS_DEFAULT, exposure: 1 } }, EMPTY_CATALOG, ['write_image', 'export_image']);
    expect(mocks.request).toHaveBeenCalledWith('render', expect.objectContaining({ no_film: true }), expect.any(Object));
  });

  it('keeps crop, rotation and grading in the worker export path', async () => {
    const edited = {
      ...frame,
      geometry: { ...GEOMETRY_DEFAULT, quarterTurns: 1, crop: { x: 0.1, y: 0, width: 0.8, height: 1 } },
      adjustments: { ...ADJUSTMENTS_DEFAULT, exposure: 0.5 },
    };
    const result = await exportFrame(recipe, edited, EMPTY_CATALOG, ['write_image', 'export_image']);
    expect(result).toMatchObject({ kind: 'written', carriesEdits: true });
    expect(mocks.native).not.toHaveBeenCalled();
    expect(mocks.pixels).toHaveBeenCalledWith(expect.any(Uint8Array), { width: 3, height: 2 },
      edited.geometry, edited.adjustments, expect.any(Object), expect.any(Number));
    expect(mocks.request.mock.calls.map((call) => call[0])).toEqual(['render', 'write_image']);
    expect(mocks.request).toHaveBeenCalledWith('render', expect.objectContaining({ display: 'prophoto' }), expect.any(Object));
    expect(mocks.request).toHaveBeenCalledWith('write_image', expect.objectContaining({ input_color_space: 'prophoto', color_space: recipe.colorSpace }), expect.any(Object));
  });

  it('surfaces worker failures without writing an incomplete image', async () => {
    mocks.pixels.mockRejectedValueOnce(new Error('pixel worker ran out of memory'));
    const result = await exportFrame(recipe, { ...frame, adjustments: { ...ADJUSTMENTS_DEFAULT, exposure: 1 } },
      EMPTY_CATALOG, ['write_image', 'export_image']);
    expect(result).toEqual({ kind: 'failed', message: 'pixel worker ran out of memory' });
    expect(mocks.request.mock.calls.map((call) => call[0])).toEqual(['render']);
  });
});
