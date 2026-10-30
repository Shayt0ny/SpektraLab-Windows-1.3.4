#!/usr/bin/env python3
"""Functional imported-LCP check with owned synthetic coefficients and a
caller-selected, read-only RAW. Does not claim optical calibration accuracy.
"""
import argparse
import hashlib
from pathlib import Path
import tempfile
from host_smoke import Host
from host_proof import good, tiff_pixels


def main():
    p = argparse.ArgumentParser(); p.add_argument('--host', required=True); p.add_argument('--resources', required=True); p.add_argument('--raw', required=True, type=Path)
    a = p.parse_args(); original_hash = hashlib.sha256(a.raw.read_bytes()).hexdigest()
    host = Host([a.host, '--resources', a.resources])
    try:
        opened, _ = good(host, 'open', {'path': str(a.raw), 'params': {'grain_active': False, 'glare_active': False, 'halation_active': False, 'auto_exposure': False, 'preview_long_edge': 800}})
        sid = opened['session']
        request = {'session': sid, 'display': 'srgb', 'long_edge': 256, 'format': 'rgba16'}
        before = good(host, 'render_source', request)[1]
        calibration = {'version': 1, 'name': 'Owned synthetic RAW calibration.lcp', 'lens': 'Data-flow test only', 'raw': True,
                       'entries': [{'focal': opened['metadata'].get('focal_mm', 50), 'aperture': 4, 'distance': 1000, 'crop': 1, 'fisheye': False,
                                    'base': {'fx': 1, 'fy': 1, 'cx': .5, 'cy': .5, 'scale': 1, 'k': [.15, 0, 0, 0, 0]}}]}
        decode = {'lens_correction': True, 'lens_profile': calibration}
        corrected, _ = good(host, 'redecode', {'session': sid, 'decode': decode})
        assert corrected['metadata']['lens_correction']['applied']
        assert corrected['metadata']['lens_correction']['profile'] == calibration['name']
        assert corrected['metadata']['lens_correction']['scale'] > 1
        assert good(host, 'render_source', request)[1] != before
        print('PASS imported LCP changes real RAW pixels and automatically crops the distorted border', flush=True)
        view = dict(request, tier='full', no_film=True)
        preview = good(host, 'render_view', view)[1]
        with tempfile.TemporaryDirectory(prefix='spk-lcp-') as directory:
            root = Path(directory)
            export = {'session': sid, 'decode': decode, 'no_film': True, 'format': 'tiff16', 'color_space': 'sRGB', 'long_edge': 256}
            good(host, 'export_frame', dict(export, path=str(root / 'active.tif')))
            import struct
            rgba = [v for (v,) in struct.iter_unpack('<H', preview)]
            rgb = b''.join(struct.pack('<H', v) for i, v in enumerate(rgba) if i % 4 != 3)
            assert tiff_pixels(root / 'active.tif') == rgb, 'LCP preview differs from exported pixels'
            good(host, 'redecode', {'session': sid, 'decode': {'lens_correction': False}})
            assert good(host, 'render_source', request)[1] == before
            good(host, 'export_frame', dict(export, path=str(root / 'frozen.tif')))
            assert tiff_pixels(root / 'active.tif') == tiff_pixels(root / 'frozen.tif'), 'private export ignored the frozen LCP'
            assert good(host, 'render_source', request)[1] == before
        assert hashlib.sha256(a.raw.read_bytes()).hexdigest() == original_hash
        print('PASS LCP preview/export byte identity, exact OFF restoration, frozen private export, original RAW unchanged', flush=True)
    finally:
        if host.p.poll() is None: good(host, 'shutdown'); host.p.wait(timeout=20)


if __name__ == '__main__': main()
