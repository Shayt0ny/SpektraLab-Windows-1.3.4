"""An sRGB neutral ramp must not gain a second highlight shoulder at output.

The Mac ColourManagement.gamutCompressionWithoutLightness is the reference:
the film pipeline owns the shoulder; the destination conversion owns chroma.
Uses synthetic pixels only, independent of camera decode or film appearance.
"""
import sys
import tempfile
from pathlib import Path
from PIL import Image
from host_smoke import Host

host = Host([sys.argv[1], '--resources', sys.argv[2]])
def call(method, params=None):
    h, px = host.call(method, params)
    assert h['ok'], h
    return h['result'], px

try:
    call('hello')
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / 'neutral.png'
        levels = [0, 32, 64, 96, 128, 160, 192, 224, 240, 248, 255]
        image = Image.new('RGB', (len(levels), 1))
        image.putdata([(v, v, v) for v in levels])
        image.save(source)
        o, _ = call('open', {'path': str(source)})
        sid = o['session']
        r, px = call('render_view', {'session': sid, 'tier': 'full', 'format': 'rgba8', 'display': 'srgb', 'no_film': True})
        actual = [tuple(px[i*4:i*4+3]) for i in range(len(levels))]
        print('source gray:', levels)
        print('output RGB:', actual)
        assert max(abs(c-v) for v, rgb in zip(levels, actual) for c in rgb) <= 2, 'unexpected output lightness compression'
        # Exercise destination switches and cached transforms, not just a first call.
        for space in ['srgb', 'display-p3', 'prophoto', 'srgb']:
            target = Path(tmp) / (space + '.png')
            call('export_frame', {'session': sid, 'source_path': str(source), 'path': str(target), 'format': 'png', 'color_space': space, 'overwrite': True, 'no_film': True})
            with Image.open(target) as result:
                assert result.info.get('icc_profile'), 'missing output ICC profile'
                if space == 'srgb': assert result.convert('RGBA').tobytes() == px, 'preview/export disagree'
                # White is the destination white in all three spaces.
                assert min(result.getpixel((len(levels)-1, 0))) >= 253, (space, result.getpixel((len(levels)-1, 0)))
        call('close', {'session': sid})
    print('PASS: neutral ramp, highlight white, preview/export agreement and tagged destinations')
finally:
    host.call('shutdown')
    host.p.wait(timeout=10)
