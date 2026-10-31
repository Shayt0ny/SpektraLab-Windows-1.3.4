// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { newSidecar, type Sidecar, type DecodeSettings } from '@shared/sidecar';
interface TestState { engineSession: string | null; frameKind: string; hello: {view_options: string[]}; sidecar: Sidecar; metadata: {model: string} }
const fake = vi.hoisted(() => ({ state: {} as TestState, cameraProfile: vi.fn(), setDecode: vi.fn() }));
vi.mock('../state/session', () => ({ useSession: (f: (s: TestState) => unknown) => f(fake.state),
  sessionStore: { getState: () => fake.state }, setDecode: (f: (d: DecodeSettings) => DecodeSettings) => { fake.setDecode(f); fake.state.sidecar.decode = f(fake.state.sidecar.decode); } }));
vi.mock('../host/client', () => ({ host: () => ({ cameraProfile: fake.cameraProfile }) }));
vi.mock('../platform', () => ({ platform: () => ({ storeRead: async () => null, storeWrite: async () => {} }) }));
vi.mock('../i18n', () => ({ tz: (s: string) => s }));
vi.mock('@radix-ui/react-dropdown-menu', () => {
  const Plain = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return { Root: Plain, Trigger: Plain, Portal: Plain, Content: Plain, Label: Plain,
    Item: ({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) => <button onClick={onSelect}>{children}</button> };
});
import { RawDevelopmentControl } from './RawDevelopmentControl';
let root: Root, div: HTMLDivElement;
const profile = { version: 1, name: 'Owned Camera.dcp', camera: 'Fixture', tags: {} };
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  fake.state = { engineSession: 's1', frameKind: 'raw', hello: { view_options: ['camera_curve'] }, sidecar: structuredClone(newSidecar()), metadata: { model: 'Fixture' } };
  fake.cameraProfile.mockResolvedValue({ profile });
  div = document.createElement('div'); document.body.append(div); root = createRoot(div);
});
afterEach(async () => { await act(async () => root.unmount()); div.remove(); vi.unstubAllGlobals(); });
const button = (text: string) => [...div.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;
it('starts OFF, reads a real camera configuration, and sends a decode change rather than a display grade', async () => {
  await act(async () => root.render(<RawDevelopmentControl />));
  expect(button('Camera curve: Off')).toBeTruthy();
  expect(fake.setDecode).not.toHaveBeenCalled();
  await act(async () => button('On — apply before film').click());
  expect(fake.cameraProfile).toHaveBeenCalledWith('s1');
  expect(fake.state.sidecar.decode).toMatchObject({ apply_camera_curve: true, cameraCurve: { profile } });
  await act(async () => root.render(<RawDevelopmentControl />));
  expect(div.textContent).toContain('Configuration source: DCP');
  await act(async () => button('Off — original pipeline').click());
  expect(fake.state.sidecar.decode.apply_camera_curve).toBe(false);
});
it('leaves the switch OFF and visibly identifies a missing profile', async () => {
  fake.cameraProfile.mockResolvedValue({ profile: null });
  await act(async () => root.render(<RawDevelopmentControl />));
  await act(async () => button('On — apply before film').click());
  await act(async () => root.render(<RawDevelopmentControl />));
  expect(fake.state.sidecar.decode.apply_camera_curve).toBe(false);
  expect(div.querySelector('[role="status"]')?.textContent).toContain('No matching camera profile');
});
it('does not apply an asynchronously loaded profile to a different photograph', async () => {
  let finish!: (v: unknown) => void;
  fake.cameraProfile.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => root.render(<RawDevelopmentControl />));
  await act(async () => button('On — apply before film').click());
  fake.state.engineSession = 's2';
  await act(async () => finish({ profile }));
  expect(fake.setDecode).not.toHaveBeenCalled();
});
