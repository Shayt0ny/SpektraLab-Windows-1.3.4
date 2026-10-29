"""Render/export recovery under VRAM pressure; optional full-size synthetic gate.

python engine/tests/host_memory.py --host <exe> --resources <dir> [--full-size]
All images, exports and reports belong to a new temporary test directory.
"""
import argparse
import json
import os
from pathlib import Path
import struct
import tempfile
import zlib
from host_smoke import Host


def write_ramp(path, width, height):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    compressor = zlib.compressobj(1)
    ramp = bytes(v for x in range(width) for v in (32 + 180 * x // width, 100, 140))
    with open(path, 'wb') as stream:
        stream.write(b'\x89PNG\r\n\x1a\n')
        stream.write(chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)))
        for _ in range(height):
            data = compressor.compress(b'\x00' + ramp)
            if data:
                stream.write(chunk(b'IDAT', data))
        stream.write(chunk(b'IDAT', compressor.flush()))
        stream.write(chunk(b'IEND', b''))


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument('--host', required=True)
    parser.add_argument('--resources', required=True)
    parser.add_argument('--full-size', action='store_true')
    args = parser.parse_args()
    work = Path(tempfile.mkdtemp(prefix='spektralab-memory-'))
    if not args.full_size:
        os.environ['SPEKTRAFILM_VULKAN_MEMORY_LIMIT_MB'] = '128'
    width, height = (7168, 10240) if args.full_size else (1280, 1800)
    source = work / 'synthetic.png'
    write_ramp(source, width, height)
    host = Host([str(Path(args.host).resolve()), '--resources', str(Path(args.resources).resolve())])
    report = {'width': width, 'height': height, 'full_size': args.full_size, 'checks': []}

    def call(method, params=None):
        header, payload = host.call(method, params)
        return header, payload

    def expect(condition, label):
        report['checks'].append({'label': label, 'passed': bool(condition)})
        print(('PASS ' if condition else 'FAIL ') + label, flush=True)
        if not condition:
            raise AssertionError(label + '\n' + '\n'.join(host.stderr[-8:]))

    try:
        hello, _ = call('hello')
        expect(hello['ok'] and hello['result']['backend']['available'], 'Vulkan host initialized')
        opened, _ = call('open', {'path': str(source), 'params': {'preview_long_edge': 800}})
        expect(opened['ok'], 'source opened')
        sid = opened['result']['session']
        live, pixels = call('render', {'session': sid, 'tier': 'live', 'format': 'rgba8', 'display': 'srgb'})
        expect(live['ok'] and bool(pixels), 'editing preview renders')
        full, _ = call('render', {'session': sid, 'tier': 'full', 'format': 'rgba8', 'display': 'srgb'})
        if args.full_size:
            expect(full['ok'], '7168x10240 default-effects full render succeeds')
        else:
            expect(not full['ok'] and 'memory' in full['error']['message'].lower(), 'full render safely refuses insufficient VRAM')
        export_path = work / 'export.tif'
        exported, _ = call('export_image', {'session': sid, 'path': str(export_path), 'format': 'tiff16'})
        if args.full_size:
            expect(exported['ok'] and export_path.exists(), 'full-size TIFF16 export succeeds')
            expect(exported['result']['width'] == width and exported['result']['height'] == height,
                   'export preserves original resolution')
        else:
            expect(not exported['ok'] and not export_path.exists(), 'failed export leaves no output file')
            expect(not list(work.glob('*.partial-*')) and not list(work.glob('.*.partial-*')), 'failed export leaves no partial file')
        memory, _ = call('memory_report')
        expect(memory['ok'] and memory['result']['pool']['free_bytes'] == 0, 'idle render buffers are reclaimed')
        recovered, pixels = call('render', {'session': sid, 'tier': 'live', 'format': 'rgba8', 'display': 'srgb'})
        expect(recovered['ok'] and bool(pixels), 'same session can render again after full render/export')
        expect(call('ping')[0]['ok'], 'host remains responsive')
        call('close', {'session': sid})
        if not args.full_size:
            small = work / 'small.png'
            write_ramp(small, 128, 96)
            opened, _ = call('open', {'path': str(small)})
            expect(opened['ok'], 'another photo opens after memory failure')
            exported, _ = call('export_image', {'session': opened['result']['session'], 'path': str(work / 'small.tif'), 'format': 'tiff16'})
            expect(exported['ok'], 'another photo exports without restarting')
        report['success'] = True
    finally:
        call('shutdown')
        host.p.wait(timeout=20)
        (work / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print('Report: ' + str(work / 'report.json'), flush=True)


if __name__ == '__main__':
    main()
