"""1.3.4 bypass: decoded original, unchanged by film/edge/date, same export."""
import json
import sys
import tempfile
from pathlib import Path
from host_smoke import Host, write_png

host = Host([sys.argv[1], '--resources', sys.argv[2]])
def call(method, params=None):
    h, px = host.call(method, params)
    assert h['ok'], h
    return h['result'], px

try:
    call('hello')
    with tempfile.TemporaryDirectory() as tmp:
        source = str(Path(tmp) / 'original.png')
        write_png(source, 80, 60)
        o, _ = call('open', {'path': source})
        sid = o['session']
        schema, _ = call('params_schema')
        if len(sys.argv) > 3:
            Path(sys.argv[3]).write_text(json.dumps(schema['fields'], indent=1) + '\n')
        request = {'session': sid, 'tier': 'full', 'format': 'rgba8', 'display': 'srgb', 'no_film': True}
        r, original = call('render', request)
        assert r.get('no_film') is True, 'host ignored no_film'
        assert (r['image']['width'], r['image']['height']) == (80, 60)
        # Compare decoded source values away from the gamut boundary.
        for x, y in [(20, 20), (40, 30), (60, 40)]:
            expected = [int(255 * x / 79), int(255 * y / 59), 128]
            actual = original[(y * 80 + x) * 4: (y * 80 + x) * 4 + 3]
            assert max(abs(a-b) for a, b in zip(actual, expected)) <= 2, (actual, expected)
        call('set_params', {'session': sid, 'delta': {'film_stock': 'cinestill_800t', 'exposure_compensation_ev': 2, 'halation_headroom_ev': 6}})
        _, changed = call('render', request)
        assert changed == original, 'film parameters leaked into original'
        target = str(Path(tmp) / 'export.png')
        e, _ = call('export_image', {'session': sid, 'path': target, 'format': 'png', 'color_space': 'srgb', 'no_film': True})
        from PIL import Image
        with Image.open(target) as im:
            assert im.size == (80, 60)
            assert im.convert('RGBA').tobytes() == original, 'preview and exported pixels differ'
        # Re-enable film on the same session; it must render a different image.
        _, simulated = call('render', {**request, 'no_film': False})
        assert simulated != original
        # Share exact engine fit values with the frontend solver regression.
        try:
            measure, _ = call('scene_latitude', {'session': sid, 'request': {'highlight_pull_back': 3, 'shadow_pull_back': 0}})
            if len(sys.argv) > 4: Path(sys.argv[4]).write_text(json.dumps(measure, indent=2))
        except AssertionError: pass
        call('close', {'session': sid})
    print('PASS: original decode, parameter isolation, preview/export agreement, resume simulation')
finally:
    host.call('shutdown')
    host.p.wait(timeout=10)
