#!/usr/bin/env python3
# Copyright (C) 2026 shayt0ny. SPDX-License-Identifier: GPL-3.0-or-later
import argparse,hashlib,json,pathlib,struct,subprocess,sys,tempfile,zlib
sys.path.insert(0,'engine/tests')
from host_smoke import Host
from host_proof import good,tiff_pixels
parser=argparse.ArgumentParser();parser.add_argument('--host',required=True);parser.add_argument('--resources',required=True);parser.add_argument('--bridge',required=True);parser.add_argument('--raw');args=parser.parse_args()
root=pathlib.Path.cwd();owned=tempfile.TemporaryDirectory(prefix='spektralab-auto-tone-');scratch=pathlib.Path(owned.name)
counter=0
def png(path,kind,w=128,h=96):
    rows=bytearray()
    for y in range(h):
        rows.append(0)
        for x in range(w):
            t=(x+y)/(w+h-2)
            if kind=='dark':c=[.03+.32*t]*3
            elif kind=='bright':c=[.45+.52*t]*3
            elif kind=='backlit':c=[.04+.15*t]*3 if x<w*.8 else [.96+.04*t]*3
            elif kind=='red':c=[.8+.2*t,.03+.2*t,.02+.1*t]
            elif kind=='flat':c=[.5]*3
            else:c=[.03+.94*t]*3
            rows.extend(round(v*255) for v in c)
    def chunk(tag,data):return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b''))
def bridge(info,pixels,before=None,current=None,regions=None):
    global counter
    counter+=1;path=scratch/f'{counter}.rgba';path.write_bytes(pixels)
    request={'image':{'width':info['image']['width'],'height':info['image']['height'],'format':info['image']['format'],'colorSpace':info['image']['color_space']},
             'pixels':str(path),'before':before,'current':current or {},'regions':regions}
    proc=subprocess.run(['node',str(pathlib.Path(args.bridge).resolve())],input=json.dumps(request),text=True,capture_output=True)
    assert proc.returncode==0,proc.stderr
    return json.loads(proc.stdout)
host=Host([args.host,'--resources',args.resources])
def exercise(path,name,no_film=True,edge=False):
    before_hash=hashlib.sha256(path.read_bytes()).digest()
    params={'preview_long_edge':800,'grain_active':False,'glare_active':False,'halation_active':False,'auto_exposure':False}
    if edge:params.update(overscan_active=True,overscan_mode='strip')
    opened,_=good(host,'open',{'path':str(path),'params':params});sid=opened['session']
    base={'session':sid,'tier':'live','long_edge':512,'format':'rgba16','display':'srgb','no_film':no_film,'generation':77}
    first_info,first_pixels=good(host,'render_view',base)
    initial=bridge(first_info,first_pixels)
    baseline=initial['baseline']
    info,pixels=good(host,'render_view',dict(base,adjustments=baseline))
    regions=None
    if edge:
        layout,_=good(host,'overscan_geometry',{'session':sid});assert layout['valid']
        regions=[[[g[i],g[i+1]] for i in range(0,8,2)] for g in layout['gates']]
    measured=bridge(info,pixels,regions=regions);patch=measured['proposal']
    film_params,_=good(host,'get_params',{'session':sid})
    if patch is None:
        assert name=='flat',name
        print('PASS flat analysis preserves edits',flush=True)
    else:
        proposed={**baseline,**patch}
        after_info,after_pixels=good(host,'render_view',dict(base,adjustments=proposed))
        checked=bridge(after_info,after_pixels,before=measured['stats'],regions=regions)
        if checked['addedClipping']:
            patch=measured['safe'];proposed={**baseline,**patch}
            after_info,after_pixels=good(host,'render_view',dict(base,adjustments=proposed))
            checked=bridge(after_info,after_pixels,before=measured['stats'],regions=regions)
        assert not checked['addedClipping'],(name,measured['stats'],checked['stats'])
        assert before_hash==hashlib.sha256(path.read_bytes()).digest()
        assert good(host,'get_params',{'session':sid})[0]==film_params,'automatic tone changed film parameters'
        if name in ('dark','bright','raw'):
            assert pixels!=after_pixels,(name,patch)
        proof,proof_pixels=good(host,'render_proof',{'session':sid,'format':'tiff8','color_space':'sRGB','long_edge':192,
             'proof_long_edge':192,'no_film':no_film,'adjustments':proposed,'generation':11})
        target=scratch/f'{name}-auto.tif'
        if target.exists():target.unlink()
        result,_=good(host,'export_frame',{'session':sid,'path':str(target),'format':'tiff8','color_space':'sRGB',
             'long_edge':192,'no_film':no_film,'adjustments':proposed})
        file_pixels=tiff_pixels(target)
        expected=bytes(value for i,value in enumerate(proof_pixels) if i%4!=3)
        assert file_pixels==expected,(name,'proof/export differ')
        print('PASS native',name,json.dumps(patch),'clipping',checked['stats']['highlightClipped'],'proof/export identical',flush=True)
    good(host,'close',{'session':sid})
try:
    for name in ['dark','bright','backlit','red','grey','flat']:
        path=scratch/f'{name}.png';png(path,name);exercise(path,name)
    exercise(scratch/'dark.png','film',False)
    edge_path=scratch/'edge.png';png(edge_path,'dark',192,128)
    exercise(edge_path,'edge',False,True)
    if args.raw: exercise(pathlib.Path(args.raw),'raw',True)
    print('PASS real native auto tone + actual RAW; film/decode contract retained, files read-only',flush=True)
finally:
    good(host,'shutdown');host.p.wait(20);owned.cleanup()
