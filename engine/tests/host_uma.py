#!/usr/bin/env python3
"""Compare a read-only RAW on normal vs forced compatible system-heap compute.
Requires a device exposing a non-local buffer-compatible heap; not a claim of
testing a different vendor's hardware. No original or export file is written.
"""
import argparse
import hashlib
import json
import os
from host_smoke import Host
from host_proof import good


def exercise(args, shared):
    if shared: os.environ['SPEKTRAFILM_TEST_VULKAN_LOCAL_BUDGET_MB'] = '1'
    else: os.environ.pop('SPEKTRAFILM_TEST_VULKAN_LOCAL_BUDGET_MB', None)
    host = Host([args.host, '--resources', args.resources])
    try:
        opened, _ = good(host, 'open', {'path': args.raw, 'params': {
            'grain_active': False, 'glare_active': False, 'halation_active': False, 'preview_long_edge': 800}})
        sid = opened['session']
        request = {'session': sid, 'display': 'srgb', 'long_edge': 512, 'format': 'rgba16'}
        _, source = good(host, 'render_source', request)
        _, film = good(host, 'render_view', dict(request, tier='live'))
        proof, pixels = good(host, 'render_proof', {'session': sid, 'format': 'tiff16', 'color_space': 'sRGB',
                            'no_film': True, 'long_edge': 0, 'proof_long_edge': 128, 'generation': 13})
        assert (proof['file_width'], proof['file_height']) == (opened['width'], opened['height']), 'export was downscaled'
        row = {'source_sha': hashlib.sha256(source).hexdigest(), 'film_sha': hashlib.sha256(film).hexdigest(),
               'proof_sha': hashlib.sha256(pixels).hexdigest(), 'export_size': [proof['file_width'], proof['file_height']]}
        if shared: assert any('vulkan_compute_fallback' in line for line in host.stderr), 'system heap path not exercised'
        print(json.dumps({'shared': shared, **row}), flush=True)
        return row
    finally:
        if host.p.poll() is None: good(host, 'shutdown'); host.p.wait(timeout=20)


def main():
    p = argparse.ArgumentParser(); p.add_argument('--host', required=True); p.add_argument('--resources', required=True); p.add_argument('--raw', required=True)
    args = p.parse_args()
    assert exercise(args, False) == exercise(args, True), 'normal and shared compute pixels differ'
    print('PASS RAW opens with local budget 1 MiB; source, film and proof byte-identical; native export dimensions retained', flush=True)


if __name__ == '__main__': main()
