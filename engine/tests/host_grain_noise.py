"""Isolate full-resolution grain from decoder noise and display scaling.

Synthetic neutral patch, pixel pitch matching a 36 mm / 8280 px source.
Needs Pillow and numpy only for test input/statistics, never at runtime.
"""
import sys, tempfile, json
from pathlib import Path
import numpy as np
from PIL import Image
from host_smoke import Host

host=Host([sys.argv[1], '--resources', sys.argv[2]])
def call(method, params=None):
    h, px=host.call(method,params)
    assert h['ok'],h
    return h['result'],px
try:
    call('hello')
    with tempfile.TemporaryDirectory() as tmp:
        path=Path(tmp)/'flat.png'
        Image.new('RGB',(1024,1024),(128,128,128)).save(path)
        o,_=call('open',{'path':str(path),'params':{'film_stock':'kodak_portra_800','film_format_mm':36*1024/8280,'preview_long_edge':800}})
        sid=o['session']; outputs=[]; report=[]
        for active in [False,True]:
            call('set_params',{'session':sid,'delta':{'grain_active':active}})
            r,px=call('render',{'session':sid,'tier':'full','format':'rgba8','display':'srgb'})
            a=np.frombuffer(px,dtype=np.uint8).reshape(r['image']['height'],r['image']['width'],4)[:,:,:3].copy()
            outputs.append(a)
            small=np.asarray(Image.fromarray(a).resize((128,128),Image.Resampling.BOX))
            report.append({'grain':active,'mean':a.mean(axis=(0,1)).tolist(),'std_full':a.std(axis=(0,1)).tolist(),'std_reduced_area':small.std(axis=(0,1)).tolist(),'clip_fraction':float(np.mean((a==0)|(a==255)))})
        assert not np.array_equal(outputs[0],outputs[1]),'grain switch has no effect'
        assert np.max(outputs[0].std(axis=(0,1))) < 1,'noise exists with grain off on a constant input'
        assert report[1]['clip_fraction'] < 0.01,'grain is blowing out the neutral patch'
        assert max(report[1]['std_reduced_area']) < max(report[1]['std_full'])/3,'unexpected low-frequency grain field'
        print(json.dumps(report,indent=2),flush=True)
        call('close',{'session':sid})
finally:
    host.call('shutdown');host.p.wait(timeout=10)
