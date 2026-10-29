"""RAW white-balance regression: Kelvin and tint separately, then As Shot.
No photograph is bundled; pass local read-only RAW paths after resources.
"""
import sys
from pathlib import Path
import numpy as np
from host_smoke import Host

host=Host([sys.argv[1],'--resources',sys.argv[2]])
def call(method,params=None):
    h,px=host.call(method,params)
    assert h['ok'],h
    return h['result'],px
try:
    call('hello')
    for name in sys.argv[3:]:
        o,_=call('open',{'path':str(Path(name).resolve()),'params':{'preview_long_edge':800,'grain_active':False}})
        assert o['kind']=='raw'
        assert 'as_shot' in o['metadata'], 'missing camera white-balance readout'
        sid=o['session']; request={'session':sid,'tier':'live','format':'rgba8','display':'srgb'}
        _,original=call('render',request)
        images=[]
        for temp,tint in [(3000,0),(9000,0),(6500,-30),(6500,30)]:
            call('redecode',{'session':sid,'decode':{'white_balance':{'mode':'custom','temperature_k':temp,'tint':tint}}})
            _,px=call('render',request)
            images.append(np.frombuffer(px,dtype=np.uint8).astype(np.float32))
        kelvin=float(np.mean(np.abs(images[0]-images[1])))
        tint=float(np.mean(np.abs(images[2]-images[3])))
        assert kelvin>0.1 and tint>0.1,(kelvin,tint)
        call('redecode',{'session':sid,'decode':{'white_balance':{'mode':'as_shot'}}})
        _,restored=call('render',request)
        assert original==restored,'As Shot did not restore the original pixels'
        print(f"PASS {o['metadata']['model']}: Kelvin changes pixels ({kelvin:.2f}), tint changes pixels ({tint:.2f}), As Shot restores exact pixels",flush=True)
        call('close',{'session':sid})
finally:
    host.call('shutdown');host.p.wait(timeout=10)
