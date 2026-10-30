import { useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { host } from '../host/client';
import { platform } from '../platform';
import { tz } from '../i18n';
import { setDecode, sessionStore, useSession } from '../state/session';
import type { CameraProfile } from '@shared/rawDevelopment';

export function RawDevelopmentControl() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const sid = useSession((s) => s.engineSession);
  const raw = useSession((s) => s.frameKind === 'raw' && !s.pair);
  const supported = useSession((s) => !!s.hello?.view_options?.includes('camera_curve'));
  const blocked = useSession((s) => s.batchExporting || s.redecoding);
  const config = useSession((s) => s.sidecar.decode.cameraCurve);
  const active = useSession((s) => s.sidecar.decode.apply_camera_curve === true);
  const applied = useSession((s) => s.metadata?.camera_curve);
  const decodeError = useSession((s) => s.decodeError);
  const [error, setError] = useState<string | null>(null);
  const current = (id: string) => sessionStore.getState().engineSession === id;

  async function enable(file?: File) {
    if (!sid || busy || !raw || blocked) return;
    const id = sid;
    setBusy(true); setError(null);
    try {
      let profile: CameraProfile | null = config?.profile ?? null;
      if (file) {
        if (!/\.dcp$/i.test(file.name) || file.size === 0 || file.size > 8 * 1024 * 1024)
          throw new Error(tz('Choose a DCP camera profile up to 8 MB.', '请选择不超过 8 MB 的 DCP 相机配置文件。'));
        profile = (await host().cameraProfile(id, { name: file.name, data: Array.from(new Uint8Array(await file.arrayBuffer())) })).profile;
      } else if (!profile) {
        const model = sessionStore.getState().metadata?.model ?? '';
        const saved = await platform().storeRead('CameraProfiles', model.replace(/[^a-z0-9]/gi, '_'));
        if (saved && typeof saved === 'object' && (saved as CameraProfile).version === 1) profile = saved as CameraProfile;
        else profile = (await host().cameraProfile(id)).profile;
      }
      if (!current(id)) return;
      const message = profile ? undefined : tz('No matching camera profile. Linear original retained; import a DCP to enable development.', '没有匹配的相机配置，已保留线性原图。可导入 DCP 后启用显影。');
      setDecode((d) => ({ ...d, apply_camera_curve: !!profile, cameraCurve: { ...(profile ? { profile } : {}), message } }));
      if (profile && file) await platform().storeWrite('CameraProfiles', (sessionStore.getState().metadata?.model ?? '').replace(/[^a-z0-9]/gi, '_'), profile);
    } catch (e) { if (current(id)) setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  if (!raw) return null;
  const message = error ?? (active && decodeError ? decodeError : config?.message);
  return <div style={{ display: 'grid', gap: 2 }}>
    <input type="file" ref={input} accept=".dcp" hidden data-testid="raw-profile-input" onChange={(e) => {
      const file = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (file) void enable(file);
    }} />
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild><button className={'action-pill' + (active ? ' active' : '')}
        disabled={!sid || !supported || busy || blocked} data-testid="raw-development"
        title={message ?? (active ? `${config?.profile?.name ?? ''} · ${tz('Applied before film simulation', '应用于胶片渲染之前')}` : tz('Camera colour curve before film simulation. Off preserves the original pipeline.', '在胶片渲染前应用相机曲线色彩。关闭时保留原有管线。'))}>
        {busy ? tz('Loading profile…', '读取配置…') : active ? tz('Camera curve: On', '机内曲线色彩：开') : tz('Camera curve: Off', '机内曲线色彩：关')}
      </button></DropdownMenu.Trigger>
      <DropdownMenu.Portal><DropdownMenu.Content className="menu" sideOffset={4}>
        <DropdownMenu.Item className="menu-item" onSelect={() => void enable()}><span className="check">{active ? '✓' : ''}</span>{tz('On — apply before film', '开启——应用到胶片渲染前')}</DropdownMenu.Item>
        <DropdownMenu.Item className="menu-item" onSelect={() => setDecode((d) => ({ ...d, apply_camera_curve: false, cameraCurve: { ...d.cameraCurve, message: undefined } }))}><span className="check">{!active ? '✓' : ''}</span>{tz('Off — original pipeline', '关闭——原有管线')}</DropdownMenu.Item>
        <DropdownMenu.Item className="menu-item" onSelect={() => input.current?.click()}>{tz('Import camera profile (.dcp)…', '导入相机配置（.dcp）…')}</DropdownMenu.Item>
        <DropdownMenu.Label className="caption" style={{ maxWidth: 350, padding: 8, overflowWrap: 'anywhere' }}>{config?.profile ? `${tz('Configuration source: DCP', '配置来源：DCP')} · ${config.profile.name}` : tz('Unconfigured: choose a local camera DCP. No generic curve is substituted.', '未配置：请选择本机相机 DCP，不会自动套用通用曲线。')}</DropdownMenu.Label>
        {active && applied?.applied && <DropdownMenu.Label className="caption" style={{ padding: 8 }}>{tz('Film input: colored_raw', '胶片输入：colored_raw')}</DropdownMenu.Label>}
      </DropdownMenu.Content></DropdownMenu.Portal>
    </DropdownMenu.Root>
    {message && <span className="caption" role="status" data-testid="raw-development-message" style={{ maxWidth: 300 }}>{message}</span>}
  </div>;
}
