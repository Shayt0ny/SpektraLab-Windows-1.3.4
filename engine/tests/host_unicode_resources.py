"""Regression: a Windows install under a Unicode folder must load its fonts.

Usage: host_unicode_resources.py HOST RESOURCES
Copies only the executable and resources to a temporary Unicode installation;
no user's photographs or settings are read or changed.
"""
from pathlib import Path
import shutil
import sys
import tempfile
from host_smoke import Host, write_png

with tempfile.TemporaryDirectory(prefix='spektralab-') as tmp:
    install = Path(tmp) / '柯达 用户 🧪' / 'SpektraLab Windows (1)'
    install.mkdir(parents=True)
    exe = install / Path(sys.argv[1]).name
    shutil.copy2(sys.argv[1], exe)
    resources = install / 'host' / 'engine'
    shutil.copytree(sys.argv[2], resources)
    host = Host([str(exe), '--resources', str(resources)])
    try:
        h, _ = host.call('hello')
        assert h['ok'], h
        assert h['result']['backend']['available'], h['result']['backend']
        source = install / '测试照片.png'
        write_png(source, 48, 32)
        h, _ = host.call('open', {'path': str(source), 'params': {'grain_active': False, 'overscan_active': True, 'date_imprint_active': True}})
        assert h['ok'], h
        sid = h['result']['session']
        h, pixels = host.call('render', {'session': sid, 'tier': 'full', 'format': 'rgba8', 'display': 'srgb'})
        assert h['ok'] and pixels, h
        host.call('close', {'session': sid})
        print('PASS: Unicode install loads fonts, starts Vulkan and renders a Unicode image path', flush=True)
    finally:
        host.call('shutdown')
        host.p.wait(timeout=10)
