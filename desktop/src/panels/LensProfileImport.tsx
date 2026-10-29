import { useEffect, useRef, useState } from 'react';
import { tz } from '../i18n';
import { platform } from '../platform';
import { LCP_MAX_BYTES, parseLcp, type ImportedLensProfile } from '@shared/lensProfile';

const area = 'LensProfiles', key = 'imported';

function errorText(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'extension') return tz('Choose an Adobe .lcp file.', '请选择 Adobe .lcp 文件。');
  if (code === 'size') return tz('The file is empty or larger than 8 MB.', '文件为空或超过 8 MB。');
  if (code === 'number') return tz('The profile contains an invalid calibration number.', '文件包含无效的矫正数值。');
  if (code === 'xml' || code === 'profile') return tz('This is not a readable Adobe LCP calibration profile.', '这不是可读取的 Adobe LCP 矫正文件，或文件内容已损坏。');
  return tz('The profile could not be read or saved. Please try again.', '无法读取或保存矫正文件，请重试。');
}

export function LensProfileImport() {
  const input = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<ImportedLensProfile | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const saved = await platform().storeRead(area, key);
        if (saved && typeof saved === 'object') {
          const p = saved as Partial<ImportedLensProfile>;
          if (p.version !== 1 || typeof p.name !== 'string' || typeof p.xml !== 'string') throw new Error('profile');
          const parsed = parseLcp(p.name, p.xml);
          if (alive) setProfile(parsed);
        }
      } catch (e) { if (alive) setError(errorText(e)); }
      finally { if (alive) setBusy(false); }
    })();
    return () => { alive = false; };
  }, []);

  async function importFile(file: File | undefined) {
    if (!file) return; // Cancel leaves the existing saved copy alone.
    setBusy(true);
    setError(null);
    try {
      if (file.size === 0 || file.size > LCP_MAX_BYTES) throw new Error('size');
      const parsed = parseLcp(file.name, await file.text());
      await platform().storeWrite(area, key, parsed);
      setProfile(parsed);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await platform().storeWrite(area, key, null);
      setProfile(null);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 6, padding: '4px 12px 8px', overflowWrap: 'anywhere' }}>
      <input ref={input} type="file" accept=".lcp" hidden data-testid="lens-profile-input"
        onChange={(e) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void importFile(file); }} />
      <button type="button" disabled={busy} data-testid="import-lens-profile" onClick={() => input.current?.click()}>
        {tz('Import correction file (.lcp)…', '导入矫正文件（.lcp）…')}
      </button>
      {profile && <>
        <span className="caption" data-testid="lens-profile-name">{profile.name}{profile.lens ? ` · ${profile.lens}` : ''}</span>
        <button type="button" disabled={busy} data-testid="remove-lens-profile" onClick={() => void remove()}>{tz('Remove saved profile', '移除已保存的配置')}</button>
      </>}
      <span className="caption" data-testid="lens-profile-status">
        {profile
          ? tz('Saved, not applied. This version has no LCP correction engine; preview and export are unchanged.', '已保存，尚未应用。本版尚未接入 LCP 矫正处理，预览和导出不会应用此文件。')
          : tz('Adobe LCP only, up to 8 MB. Import currently saves a local copy; it does not apply correction.', '支持 Adobe LCP，最大 8 MB。目前导入仅保存本地副本，不会应用矫正。')}
      </span>
      {error && <span className="caption" role="alert" data-testid="lens-profile-error">{error}</span>}
    </div>
  );
}
