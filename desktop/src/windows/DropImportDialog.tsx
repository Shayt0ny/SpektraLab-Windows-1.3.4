import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { useStore } from 'zustand';
import { tz } from '../i18n';
import { browseDropFolders, closeDropImport, dropImportStore, selectDropPaths, showDroppedOnly } from '../state/dropImport';
import { openPaths, useSession } from '../state/session';

export function DropImportDialog() {
  const open = useStore(dropImportStore, (s) => s.open);
  const requestId = useStore(dropImportStore, (s) => s.requestId);
  return <Dialog.Root open={open} onOpenChange={(o) => !o && closeDropImport()}>{open && <Contents key={requestId} />}</Dialog.Root>;
}

function Contents() {
  const s = useStore(dropImportStore);
  const batch = useSession((st) => st.batchExporting);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(100);
  const [importing, setImporting] = useState(false);
  const selected = new Set(s.selected);
  const filtered = s.entries.filter((e) => `${e.name} ${e.path}`.toLowerCase().includes(search.trim().toLowerCase()));
  const disabled = s.busy || importing || batch;
  async function confirm() {
    if (disabled || !s.selected.length) return;
    const paths = s.entries.filter((e) => selected.has(e.path)).map((e) => e.path);
    setImporting(true);
    try {
      await openPaths(paths);
      // A new drop arriving while the old import finishes owns its own dialog.
      if (dropImportStore.getState().dropped === s.dropped) closeDropImport();
    } finally { setImporting(false); }
  }
  return <Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay" />
    <Dialog.Content className="dialog drop-import-dialog" data-testid="drop-import" aria-describedby="drop-import-description"
      onEscapeKeyDown={(e) => { if (importing) e.preventDefault(); }}
      onPointerDownOutside={(e) => e.preventDefault()}>
      <Dialog.Title asChild><h2>{tz('Choose photographs to import', '选择要导入的照片')}</h2></Dialog.Title>
      <div className="dialog-body">
        <Dialog.Description id="drop-import-description" className="caption">
          {tz('Import only the dropped photographs, or choose others in their folders. Images load after you confirm.', '可只导入拖入的照片，也可从所在文件夹中另选几张。确认后才读取照片和缩略图。')}
        </Dialog.Description>
        <div className="drop-import-tools">
          <button className="btn" disabled={disabled} onClick={() => { showDroppedOnly(); setSearch(''); setLimit(100); }}>{tz('Dropped photographs only', '仅拖入的照片')}</button>
          <button className="btn" data-testid="drop-import-folder" disabled={disabled || !s.dropped.length} onClick={() => { setSearch(''); setLimit(100); void browseDropFolders(); }}>{tz('Choose from their folders…', '从所在文件夹选择…')}</button>
        </div>
        <input className="drop-import-search" data-testid="drop-import-search" type="search" value={search} disabled={disabled}
          aria-label={tz('Search file names', '搜索文件名')} placeholder={tz('Search file names', '搜索文件名')}
          onChange={(e) => { setSearch(e.currentTarget.value); setLimit(100); }} />
        <div className="drop-import-tools">
          <button className="btn" data-testid="drop-import-all" disabled={disabled || !filtered.length} onClick={() => selectDropPaths(filtered.map((e) => e.path), true)}>{tz('Select search results', '全选当前列表')}</button>
          <button className="btn" data-testid="drop-import-none" disabled={disabled || !s.selected.length} onClick={() => selectDropPaths(s.selected, false)}>{tz('Clear selection', '全部取消选择')}</button>
          <span className="caption" aria-live="polite">{tz(`${s.selected.length} selected / ${s.entries.length} files`, `已选 ${s.selected.length} 张 / 共 ${s.entries.length} 张`)}</span>
        </div>
        {s.busy && <p role="status">{tz('Reading file names…', '正在读取文件列表…')}</p>}
        {s.error && <p role="alert">{tz('Could not read the file list: ', '无法读取文件列表：') + s.error}</p>}
        {!s.busy && !s.error && !filtered.length && <p>{tz('No supported photographs found.', '未找到支持的照片。')}</p>}
        <div className="drop-import-list" data-testid="drop-import-list" aria-busy={s.busy}>
          {filtered.slice(0, limit).map((e) => <label key={e.path} className="drop-import-file" title={e.path}>
            <input type="checkbox" checked={selected.has(e.path)} disabled={disabled} onChange={(event) => selectDropPaths([e.path], event.currentTarget.checked)} />
            <span>{e.name}<small>{e.path}</small></span>
          </label>)}
          {filtered.length > limit && <button className="btn" disabled={disabled} onClick={() => setLimit((n) => n + 100)}>{tz('Show 100 more', '再显示 100 张')}</button>}
        </div>
      </div>
      <div className="dialog-actions">
        <button className="btn" data-testid="drop-import-cancel" disabled={importing} onClick={closeDropImport}>{tz('Cancel', '取消')}</button>
        <button className="btn primary" data-testid="drop-import-confirm" disabled={disabled || !s.selected.length} onClick={() => void confirm()}>
          {importing ? tz('Importing…', '正在导入…') : tz(`Import ${s.selected.length} photographs`, `导入 ${s.selected.length} 张照片`)}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>;
}
