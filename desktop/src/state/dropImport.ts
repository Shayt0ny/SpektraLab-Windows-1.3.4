// Staging only: directory enumeration returns metadata, never decoded images.
// No editor/library state changes until the dialog calls openPaths explicitly.
import { createStore } from 'zustand/vanilla';
import { dirName, platform, type FileEntry } from '../platform';

interface DropImportState {
  requestId: number;
  open: boolean;
  busy: boolean;
  entries: FileEntry[];
  dropped: FileEntry[];
  selected: string[];
  folderMode: boolean;
  error: string | null;
}
const empty: DropImportState = { requestId: 0, open: false, busy: false, entries: [], dropped: [], selected: [], folderMode: false, error: null };
export const dropImportStore = createStore<DropImportState>(() => empty);
let generation = 0;
const unique = (entries: FileEntry[]) => [...new Map(entries.map((e) => [e.path, e])).values()];

export function closeDropImport() {
  generation++;
  dropImportStore.setState(empty);
}

export async function requestDropImport(paths: string[]) {
  if (!paths.length) return;
  const gen = ++generation;
  dropImportStore.setState({ ...empty, requestId: gen, open: true, busy: true });
  try {
    const entries = unique(await platform().expandPaths(paths));
    if (gen === generation) dropImportStore.setState({ entries, dropped: entries, selected: entries.map((e) => e.path), busy: false });
  } catch (e) {
    if (gen === generation) dropImportStore.setState({ busy: false, error: String(e) });
  }
}

export async function browseDropFolders() {
  const s = dropImportStore.getState();
  if (!s.open || s.busy || !s.dropped.length) return;
  const gen = ++generation;
  dropImportStore.setState({ busy: true, error: null });
  try {
    const dirs = [...new Set(s.dropped.map((e) => dirName(e.path)))];
    const entries = unique((await Promise.all(dirs.map((d) => platform().listImages(d)))).flat());
    if (gen !== generation) return;
    const available = new Set(entries.map((e) => e.path));
    dropImportStore.setState({ entries, selected: s.selected.filter((p) => available.has(p)), folderMode: true, busy: false });
  } catch (e) {
    if (gen === generation) dropImportStore.setState({ busy: false, error: String(e) });
  }
}

export function showDroppedOnly() {
  const s = dropImportStore.getState();
  if (!s.busy) dropImportStore.setState({ entries: s.dropped, selected: s.dropped.map((e) => e.path), folderMode: false, error: null });
}

export function selectDropPaths(paths: string[], checked: boolean) {
  const s = dropImportStore.getState();
  if (s.busy) return;
  const available = new Set(s.entries.map((e) => e.path));
  const selected = new Set(s.selected);
  for (const p of paths) {
    if (checked && available.has(p)) selected.add(p);
    else selected.delete(p);
  }
  dropImportStore.setState({ selected: [...selected] });
}
