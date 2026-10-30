import { describe, expect, it } from 'vitest';
import { createSettingsStore, loadSettings } from './settings';

describe('RAW decoder preference', () => {
  it('defaults to automatic and rejects an unknown saved decoder', () => {
    expect(loadSettings(null).rawDecoder).toBe('auto');
    expect(loadSettings({ getItem: () => JSON.stringify({ rawDecoder:'unknown' }) }).rawDecoder).toBe('auto');
  });
  it('persists each of the three selections', async () => {
    let saved = '';
    const storage = { getItem: () => saved || null, setItem: (_key: string, value: string) => { saved = value; } };
    const store = createSettingsStore(storage);
    for (const mode of ['libraw','candidate','auto'] as const) {
      store.getState().set('rawDecoder', mode);
      await Promise.resolve();
      expect(loadSettings(storage).rawDecoder).toBe(mode);
    }
  });
});
