import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileEntry } from '../platform';

const mock = vi.hoisted(() => ({
  platform: { expandPaths: vi.fn(), listImages: vi.fn(), sidecarLoad: vi.fn(), sidecarSave: vi.fn(), setTitle: vi.fn(), storeRead: vi.fn(), log: vi.fn() },
}));
vi.mock('../platform', () => ({
  platform: () => mock.platform,
  baseName: (p: string) => p.split('/').pop() ?? p,
  dirName: (p: string) => p.slice(0,p.lastIndexOf('/')),
}));
vi.mock('../host/client', () => ({
  HostCallError: class extends Error {},
  host: () => ({ thumbnail: async () => ({width:1,height:1,data:new Uint8Array(4),colorSpace:'sRGB'}), close: async () => {} }),
}));
import { openPaths, openFolder, sessionStore } from './session';

const file = (name: string): FileEntry => ({name,path:'/photos/'+name,size:100,mtime_ms:0});
const all = [file('one.NEF'),file('two.NEF'),file('other.ARW')];
beforeEach(() => {
  vi.clearAllMocks();
  mock.platform.expandPaths.mockImplementation(async (paths:string[])=>all.filter(f=>paths.includes(f.path)));
  mock.platform.listImages.mockResolvedValue(all);
  mock.platform.sidecarLoad.mockResolvedValue(null);
  mock.platform.storeRead.mockResolvedValue(null);
  sessionStore.setState({hostState:{phase:'starting'},engineSession:null,selection:null,frames:[],batchExporting:false});
});
describe('selected photo import',()=>{
  it('opening one file does not enumerate its neighbours',async()=>{
    await openPaths([all[0]!.path]);
    expect(mock.platform.listImages).not.toHaveBeenCalled();
    expect(mock.platform.storeRead).not.toHaveBeenCalled();
    expect(sessionStore.getState().frames.map(f=>f.name)).toEqual(['one.NEF']);
  });
  it('replaces an existing folder with exactly the selected subset',async()=>{
    sessionStore.setState({frames:all,selection:null});
    await openPaths([all[0]!.path,all[1]!.path]);
    expect(sessionStore.getState().frames.map(f=>f.name)).toEqual(['one.NEF','two.NEF']);
    expect(mock.platform.listImages).not.toHaveBeenCalled();
  });
  it('an explicit folder command still loads that folder',async()=>{
    await openFolder('/photos');
    expect(mock.platform.listImages).toHaveBeenCalledWith('/photos');
    expect(sessionStore.getState().frames.map(f=>f.name)).toEqual(all.map(f=>f.name));
  });
});
