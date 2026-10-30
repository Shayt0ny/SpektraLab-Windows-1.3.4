import { useEffect, useRef, useState } from 'react';
import { tz } from '../i18n';
import { platform } from '../platform';
import { LCP_MAX_BYTES, parseLcp, type ImportedLensProfile } from '@shared/lensProfile';
import { sessionStore, setDecode, shownDecode, useSession } from '../state/session';
import { isRawPath } from '@shared/whiteBalance';

const area = 'LensProfiles', key = 'imported';

function errorText(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'extension') return tz('Choose an Adobe .lcp file.', '请选择 Adobe .lcp 文件。');
  if (code === 'size') return tz('The file is empty or larger than 8 MB.', '文件为空或超过 8 MB。');
  if (code === 'number') return tz('The profile contains an invalid calibration number.', '文件包含无效的矫正数值。');
  if (code === 'raw') return tz('Choose an LCP for RAW files, not a JPEG lens profile.', '请选择用于 RAW 的 LCP，不能使用 JPEG 镜头配置。');
  if (code === 'xml' || code === 'profile') return tz('This is not a readable Adobe LCP calibration profile.', '这不是可读取的 Adobe LCP 矫正文件，或文件内容已损坏。');
  return tz('The profile could not be read or saved. Please try again.', '无法读取或保存矫正文件，请重试。');
}

export function LensProfileImport() {
  const current = useSession(shownDecode);
  const selection = useSession((s) => s.selection);
  const kind = useSession((s) => s.frameKind);
  const pair = useSession((s) => !!s.pair);
  const batch = useSession((s) => s.batchExporting);
  const applying = useSession((s) => s.redecoding);
  const applied = useSession((s) => s.metadata?.lens_correction?.applied === true && s.metadata.lens_correction.profile === s.sidecar.decode.lensProfile?.name);
  const decodeError = useSession((s) => s.decodeError);
  const ready = !!selection && !pair && !batch && (kind === 'raw' || (!kind && isRawPath(selection)));
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
    const target = selection;
    try {
      if (file.size === 0 || file.size > LCP_MAX_BYTES) throw new Error('size');
      const parsed = parseLcp(file.name, await file.text());
      if (!parsed.calibration.raw) throw new Error('raw');
      await platform().storeWrite(area, key, parsed);
      setProfile(parsed);
      if (ready && sessionStore.getState().selection === target) setDecode((d) => ({ ...d, lensCorrection: true, lensProfile: parsed.calibration }));
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const target = selection;
    try {
      await platform().storeWrite(area, key, null);
      setProfile(null);
      if (sessionStore.getState().selection === target) setDecode((d) => { const next = { ...d, lensCorrection: false }; delete next.lensProfile; return next; });
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 6, padding: '4px 12px 8px', overflowWrap: 'anywhere' }}>
      <input ref={input} type="file" accept=".lcp" hidden data-testid="lens-profile-input"
        onChange={(e) => { const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void importFile(file); }} />
      <button type="button" disabled={busy || !ready} data-testid="import-lens-profile" onClick={() => input.current?.click()}>
        {tz('Import correction file (.lcp)…', '导入矫正文件（.lcp）…')}
      </button>
      {profile && <>
        <span className="caption" data-testid="lens-profile-name">{profile.name}{profile.lens ? ` · ${profile.lens}` : ''}</span>
        <button type="button" disabled={busy || !ready} onClick={() => setDecode((d) => ({ ...d, lensCorrection: true, lensProfile: profile.calibration }))}>{tz('Apply to this photograph', '应用到当前照片')}</button>
        <button type="button" disabled={busy || !ready} data-testid="remove-lens-profile" onClick={() => void remove()}>{tz('Remove imported profile', '移除导入配置')}</button>
      </>}
      <span className="caption" data-testid="lens-profile-status">
        {!ready ? tz('Select a single RAW photograph to import a profile.', '请选择一张 RAW 照片以导入配置。')
          : applying ? tz('Applying lens correction…', '正在应用镜头矫正…')
          : decodeError ? tz('Not applied. See the decode error below.', '未能应用，请查看下方错误。')
          : current.lensProfile && current.lensCorrection && applied ? `${current.lensProfile.name} · ${tz('Applied · automatic crop · preview and export', '已应用 · 自动裁边 · 预览与导出')}`
          : tz('Adobe RAW LCP, up to 8 MB. Import applies to this photograph.', '支持 Adobe RAW LCP，最大 8 MB。导入后应用到当前照片。')}
      </span>
      {error && <span className="caption" role="alert" data-testid="lens-profile-error">{error}</span>}
    </div>
  );
}
