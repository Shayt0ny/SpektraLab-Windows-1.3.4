#!/usr/bin/env python3
"""Real RAW decoder policy regression; inputs are read-only, never bundled."""
import argparse
import hashlib
from pathlib import Path
import tempfile
from host_smoke import Host
from host_proof import good

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--host', required=True)
    p.add_argument('--resources', required=True)
    p.add_argument('--he', required=True)
    p.add_argument('--ordinary', required=True)
    args = p.parse_args()
    paths = [Path(args.he), Path(args.ordinary)]
    before = [hashlib.sha256(path.read_bytes()).digest() for path in paths]
    host = Host([args.host, '--resources', args.resources])
    try:
        hello, _ = good(host, 'hello')
        assert hello['raw_decoders'] == ['auto','libraw','candidate']
        params = {'preview_long_edge': 800, 'grain_active': False, 'glare_active': False, 'halation_active': False}
        def open_file(path, mode):
            return host.call('open', {'path': str(path), 'decode': {'raw_decoder': mode}, 'params': params})[0]
        invalid = open_file(paths[0], 'unknown')
        assert not invalid['ok'] and invalid['error']['code'] == 'bad_request'
        strict = open_file(paths[0], 'libraw')
        assert not strict['ok'] and strict['error']['code'] == 'decode_failed', strict
        results = []
        for mode in ('auto','candidate'):
            opened = open_file(paths[0], mode)
            assert opened['ok'], opened
            result = opened['result']; sid = result['session']
            assert result['metadata']['raw_decoder'] == 'candidate-f4956c4'
            view = {'session': sid, 'long_edge': 192, 'display': 'srgb', 'format': 'rgba16'}
            _, source = good(host, 'render_source', view)
            _, film = good(host, 'render_view', dict(view, tier='live'))
            assert source and film and len(set(source)) > 16 and len(set(film)) > 16
            results.append((hashlib.sha256(source).hexdigest(), hashlib.sha256(film).hexdigest()))
            good(host, 'redecode', {'session': sid, 'decode': {'raw_decoder': mode,
                'white_balance': {'mode':'custom','temperature_k':3500,'tint':10}}})
            _, custom = good(host, 'render_source', view)
            assert custom != source, 'candidate custom WB had no effect'
            good(host, 'redecode', {'session': sid, 'decode': {'raw_decoder':mode}})
            _, restored = good(host, 'render_source', view)
            assert restored == source, 'candidate As Shot restore drifted'
            proof, pixels = good(host, 'render_proof', {'session':sid,'format':'tiff16','color_space':'sRGB',
                'source_path':str(paths[0]), 'decode':{'raw_decoder':mode}, 'long_edge':192,'proof_long_edge':192,
                'no_film':True,'generation':1})
            assert pixels and max(proof['file_width'],proof['file_height']) == 192
            good(host, 'close', {'session':sid})
            print(f'PASS HE {mode}: pre-film source, film, WB change/restore, export proof', flush=True)
        assert results[0] == results[1], 'automatic fallback and forced candidate differ'
        for mode, expected in [('auto','libraw-0.22.2'),('libraw','libraw-0.22.2'),('candidate','candidate-f4956c4')]:
            opened = open_file(paths[1], mode)
            assert opened['ok'], opened
            assert opened['result']['metadata']['raw_decoder'] == expected
            good(host, 'close', {'session':opened['result']['session']})
        with tempfile.TemporaryDirectory(prefix='spektralab-decoder-policy-') as folder:
            broken = Path(folder)/'broken.NEF'; broken.write_bytes(b'not a RAW file')
            failed = open_file(broken, 'auto')
            assert not failed['ok'] and 'LibRaw:' in failed['error']['message'] and 'candidate:' in failed['error']['message']
        assert before == [hashlib.sha256(path.read_bytes()).digest() for path in paths]
        print('PASS strict selection; ordinary RAW keeps stable decoder; both failures reported; input SHA unchanged', flush=True)
    finally:
        if host.p.poll() is None:
            good(host, 'shutdown'); host.p.wait(timeout=20)

if __name__ == '__main__': main()
