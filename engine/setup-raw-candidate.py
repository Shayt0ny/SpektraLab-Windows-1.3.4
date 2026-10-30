#!/usr/bin/env python3
"""Fetch and verify the optional, pinned RAW candidate (build time only)."""
import argparse
import hashlib
from pathlib import Path
import tarfile
import urllib.request

PIN = 'f4956c404fba0c6035ce9e06353d4b4ffe068fc7'
SHA256 = '316b25600f0d8cc00518464f5558060beb756ffa7fa619a02a0bbe877bf8686e'
URL = f'https://codeload.github.com/pdcgomes/redlamp-libraw/tar.gz/{PIN}'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--deps', type=Path, default=Path(__file__).resolve().parents[2] / 'deps')
    args = parser.parse_args()
    root = args.deps.resolve()
    root.mkdir(parents=True, exist_ok=True)
    archive = root / 'redlamp-libraw-f4956c4.tar.gz'
    if not archive.exists():
        with urllib.request.urlopen(URL, timeout=60) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != SHA256:
            raise RuntimeError('Candidate archive checksum mismatch')
        with archive.open('xb') as output:
            output.write(data)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
        raise RuntimeError('Candidate archive checksum mismatch')
    source = root / f'redlamp-libraw-{PIN}'
    with tarfile.open(archive) as bundle:
        expected = {}
        for item in bundle.getmembers():
            target = (root / item.name).resolve()
            if not target.is_relative_to(source) or not (item.isdir() or item.isfile()):
                raise RuntimeError('Unsafe archive entry')
            if item.isfile():
                expected[target] = hashlib.sha256(bundle.extractfile(item).read()).hexdigest()
        if source.exists():
            actual = {p.resolve() for p in source.rglob('*') if p.is_file()}
            if actual != set(expected):
                raise RuntimeError('Incomplete or modified candidate source tree')
            if any(hashlib.sha256(p.read_bytes()).hexdigest() != digest for p, digest in expected.items()):
                raise RuntimeError('Modified candidate source file; nothing overwritten')
        else:
            bundle.extractall(root, filter='data')
    print(f'Candidate {PIN}: verified {source}')

if __name__ == '__main__':
    main()
