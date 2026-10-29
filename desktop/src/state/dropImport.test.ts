import { beforeEach, expect, it, vi } from 'vitest';
import type { FileEntry } from '../platform';
const mock = vi.hoisted(() => ({ expandPaths: vi.fn(), listImages: vi.fn() }));
vi.mock('../platform', () => ({ platform: () => mock, dirName: (p: string) => p.slice(0, p.lastIndexOf('/')) }));
import { browseDropFolders, closeDropImport, dropImportStore, requestDropImport } from './dropImport';
const a: FileEntry = { path: '/photos/a.NEF', name: 'a.NEF', size: 10, mtime_ms: 0 };
const b: FileEntry = { ...a, path: '/photos/b.NEF', name: 'b.NEF' };
beforeEach(() => { closeDropImport(); vi.resetAllMocks(); });

it('stages just dropped metadata; browsing neighbours preserves the explicit selection', async () => {
  mock.expandPaths.mockResolvedValue([a, a]);
  mock.listImages.mockResolvedValue([a, b]);
  await requestDropImport([a.path]);
  expect(mock.listImages).not.toHaveBeenCalled();
  expect(dropImportStore.getState().entries).toEqual([a]);
  await browseDropFolders();
  expect(mock.listImages).toHaveBeenCalledExactlyOnceWith('/photos');
  expect(dropImportStore.getState().entries).toEqual([a, b]);
  expect(dropImportStore.getState().selected).toEqual([a.path]);
});

it('a stale file-list response cannot replace a newer drop or reopen a cancelled dialog', async () => {
  let finish!: (v: FileEntry[]) => void;
  mock.expandPaths.mockReturnValueOnce(new Promise<FileEntry[]>((resolve) => { finish = resolve; }));
  const old = requestDropImport([a.path]);
  mock.expandPaths.mockResolvedValueOnce([b]);
  await requestDropImport([b.path]);
  finish([a]); await old;
  expect(dropImportStore.getState().selected).toEqual([b.path]);
  let finishFolder!: (v: FileEntry[]) => void;
  mock.listImages.mockReturnValueOnce(new Promise<FileEntry[]>((resolve) => { finishFolder = resolve; }));
  const folder = browseDropFolders();
  closeDropImport();
  finishFolder([a, b]); await folder;
  expect(dropImportStore.getState().open).toBe(false);
  expect(dropImportStore.getState().entries).toEqual([]);
});

it('a folder read failure keeps the already selected dropped file available', async () => {
  mock.expandPaths.mockResolvedValue([a]);
  mock.listImages.mockRejectedValue(new Error('access denied'));
  await requestDropImport([a.path]);
  await browseDropFolders();
  expect(dropImportStore.getState()).toMatchObject({ entries: [a], selected: [a.path], busy: false, error: 'Error: access denied' });
});
