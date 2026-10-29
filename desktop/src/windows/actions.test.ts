import { beforeEach, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({pickFiles:vi.fn(),pickFolder:vi.fn(),openPaths:vi.fn(),openFolder:vi.fn()}));
vi.mock('../platform',()=>({platform:()=>mock}));
vi.mock('../host/client',()=>({host:()=>({})}));
vi.mock('../state/session',()=>({sessionStore:{getState:()=>({batchExporting:false})},openPaths:mock.openPaths,openFolder:mock.openFolder,flushSave:vi.fn(),setPages:vi.fn()}));
import {openDialog} from './actions';
beforeEach(()=>{vi.clearAllMocks();mock.pickFiles.mockResolvedValue(['/photos/one.NEF']);mock.pickFolder.mockResolvedValue('/photos');});
it('the toolbar and Ctrl+O open a multiple-photo picker',async()=>{
  await openDialog();
  expect(mock.pickFiles).toHaveBeenCalledOnce();
  expect(mock.pickFolder).not.toHaveBeenCalled();
  expect(mock.openPaths).toHaveBeenCalledWith(['/photos/one.NEF']);
});
it('cancelling photo selection leaves the current library alone',async()=>{
  mock.pickFiles.mockResolvedValue([]);
  await openDialog();
  expect(mock.openPaths).not.toHaveBeenCalled();
  expect(mock.openFolder).not.toHaveBeenCalled();
});
