import { describe, expect, it, vi } from 'vitest';
import { Host } from './client';
import type { Transport } from './transport';
import { ADJUSTMENTS_DEFAULT } from '@shared/adjustments';
import { GEOMETRY_DEFAULT } from '@shared/geometry';

const options = () => ({ adjustments: structuredClone(ADJUSTMENTS_DEFAULT), geometry: structuredClone(GEOMETRY_DEFAULT),
  display: 'display-p3' as const, generation: 12 });
const response = (generation: number) => ({ result: { generation, tier: 'live', print_cached: true,
  image: { width: 1, height: 1, format: 'rgba8', color_space: 'Display P3', row_bytes: 4 } },
  payload: new Uint8Array([180, 120, 80, 255]) });
const state = async () => ({ phase: 'ready', hello: { view_formats: ['rgba8'] } });

describe('Host.renderView', () => {
  it('requires an advertised no_film option before sending a bypass request', async () => {
    const request = vi.fn().mockResolvedValue(response(12));
    const legacy = new Host({ request, state } as unknown as Transport);
    await expect(legacy.renderView('s1', 'live', { ...options(), no_film: true })).rejects.toThrow('no_film');
    expect(request).not.toHaveBeenCalled();
    const host = new Host({ request, state: async () => ({ phase: 'ready', hello: { view_options: ['no_film'] } }) } as unknown as Transport);
    await host.renderView('s1', 'live', { ...options(), no_film: true });
    expect(request).toHaveBeenLastCalledWith('render_view', expect.objectContaining({ no_film: true }), expect.anything());
  });
  it('sends display, generation, grade and geometry and preserves display metadata', async () => {
    const request = vi.fn().mockResolvedValue(response(12));
    const host = new Host({ request, state } as unknown as Transport);
    const opts = options();
    const view = await host.renderView('s1', 'live', opts);
    expect(request).toHaveBeenCalledWith('render_view', { session: 's1', tier: 'live', ...opts, format: 'rgba8' }, expect.anything());
    expect(view).toMatchObject({ colorSpace: 'Display P3', tier: 'live', reprinted: true, processedGeometry: opts.geometry });
    expect(Array.from(view.data)).toEqual([180, 120, 80, 255]);
  });

  it('rejects a response belonging to another requested generation', async () => {
    const host = new Host({ request: async () => response(11), state } as unknown as Transport);
    await expect(host.renderView('s1', 'live', options())).rejects.toThrow('generation mismatch');
  });

  it('keeps the geometry snapshot from request time even if the caller later edits it', async () => {
    let resolve!: (r: ReturnType<typeof response>) => void;
    const host = new Host({ request: () => new Promise((r) => { resolve = r; }), state } as unknown as Transport);
    const opts = options();
    const pending = host.renderView('s1', 'live', opts);
    opts.geometry.crop.width = 0.5;
    await Promise.resolve();
    resolve(response(12));
    expect((await pending).processedGeometry?.crop.width).toBe(1);
  });

  it('negotiates 16-bit display only when the host advertises it', async () => {
    const r = response(12);
    const request = vi.fn().mockResolvedValue({ result: { ...r.result,
      image: { ...r.result.image, format: 'rgba16', row_bytes: 8 } }, payload: new Uint8Array(8) });
    const host = new Host({ request, state: async () => ({ phase: 'ready', hello: { view_formats: ['rgba8', 'rgba16'] } }) } as unknown as Transport);
    expect((await host.renderView('s1', 'live', options())).format).toBe('rgba16');
    expect(request.mock.calls[0]![1].format).toBe('rgba16');
  });
});

describe('Host.renderSource precision', () => {
  const opts = { long_edge:2048, display:'srgb' as const, generation:12 };
  it('preserves 16-bit source codes when source-specific capability is advertised', async () => {
    const pixels=new Uint16Array([50001,50002,50003,65535]);
    const request=vi.fn().mockResolvedValue({result:{generation:12,image:{width:1,height:1,format:'rgba16',color_space:'sRGB',row_bytes:8}},payload:new Uint8Array(pixels.buffer)});
    const host=new Host({request,state:async()=>({phase:'ready',hello:{source_formats:['rgba8','rgba16']}})} as unknown as Transport);
    const result=await host.renderSource('s1',opts);
    expect(request).toHaveBeenCalledWith('render_source',{session:'s1',...opts,format:'rgba16'},expect.anything());
    expect(result.format).toBe('rgba16');
    expect([...new Uint16Array(result.data.buffer)]).toEqual([...pixels]);
  });
  it('keeps legacy original transport at eight bits even if film views support 16 bits', async () => {
    const request=vi.fn().mockResolvedValue(response(12));
    const host=new Host({request,state:async()=>({phase:'ready',hello:{view_formats:['rgba8','rgba16']}})} as unknown as Transport);
    expect((await host.renderSource('s1',opts)).format).toBe('rgba8');
    expect(request.mock.calls[0]![1].format).toBe('rgba8');
  });
  it('rejects a host silently reducing source precision', async () => {
    const host=new Host({request:async()=>response(12),state:async()=>({phase:'ready',hello:{source_formats:['rgba16']}})} as unknown as Transport);
    await expect(host.renderSource('s1',opts)).rejects.toThrow('invalid or outdated');
  });
});
