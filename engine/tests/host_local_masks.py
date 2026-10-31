#!/usr/bin/env python3
"""Owned images; real GPU masks, geometry, proof, file and cache agreement."""
import argparse
import copy
from pathlib import Path
import struct
import tempfile

from host_smoke import Host, write_png
from host_proof import good, tiff_pixels


def mask(kind="linear"):
    return dict(id="test", name="Test", kind=kind, enabled=True, amount=1,
                inverted=False, feather=.5, start=dict(x=.25, y=.5),
                end=dict(x=.75, y=.5), radius=.1, strokes=[],
                adjustments=dict(exposure=.8, contrast=0, brightness=0, saturation=0,
                                 temperature=0, tint=0, highlights=0, shadows=0))


def exercise(host, root):
    source = root / "source.png"
    write_png(str(source), 96, 64)
    params = dict(auto_exposure=False, grain_active=False, halation_active=False, glare_active=False)
    opened, _ = good(host, "open", dict(path=str(source), params=params))
    sid = opened["session"]
    base = dict(session=sid, tier="full", display="srgb", generation=1)
    for no_film in (False, True):
        view = dict(base, no_film=no_film)
        _, before = good(host, "render_view", view)
        m = mask()
        _, linear = good(host, "render_view", dict(view, adjustments=dict(localMasks=[m])))
        assert linear != before, "local mask was ignored"
        for y in range(64):
            assert linear[(y*96+80)*4:(y*96+96)*4] == before[(y*96+80)*4:(y*96+96)*4], "mask changed unselected pixels"
        for disabled in (dict(enabled=False), dict(amount=0), dict(adjustments=dict.fromkeys(m["adjustments"], 0))):
            _, unchanged = good(host, "render_view", dict(view, adjustments=dict(localMasks=[dict(m, **disabled)])))
            assert unchanged == before, "inactive/zero mask changed the frame"
        _, disabled = good(host, "render_view", dict(view, adjustments=dict(enabled=False, localMasks=[m])))
        assert disabled == before, "Post-Dev bypass did not bypass masks"
        _, inverted = good(host, "render_view", dict(view, adjustments=dict(localMasks=[dict(m, inverted=True)])))
        assert inverted != linear and inverted != before
        radial = dict(m, kind="radial", start=dict(x=.5, y=.5), end=dict(x=.8, y=.8))
        _, region = good(host, "render_view", dict(view, adjustments=dict(localMasks=[radial])))
        assert region != before and region[:16] == before[:16]
        brush = dict(m, kind="brush", feather=.4, strokes=[dict(points=[dict(x=.2, y=.5), dict(x=.8, y=.5)], radius=.12, erase=False)])
        _, painted = good(host, "render_view", dict(view, adjustments=dict(localMasks=[brush])))
        assert painted != before and painted[:96*4] == before[:96*4]
        erased = copy.deepcopy(brush)
        erased["strokes"].append(dict(points=[dict(x=.5, y=.5)], radius=.15, erase=True))
        _, erased_pixels = good(host, "render_view", dict(view, adjustments=dict(localMasks=[erased])))
        center = (32*96+48)*4
        assert erased_pixels[center:center+4] == before[center:center+4], "eraser did not remove coverage"
        assert erased_pixels != painted and erased_pixels != before
        # Crop on pixel boundaries, quarter turn, horizontal flip. Independently
        # map the already graded full frame, so a second misplaced mask fails.
        geo = dict(crop=dict(x=.125, y=.125, width=.75, height=.75), quarterTurns=1, flipH=True)
        shown, transformed = good(host, "render_view", dict(view, geometry=geo, adjustments=dict(localMasks=[brush])))
        assert (shown["image"]["width"], shown["image"]["height"]) == (48, 72)
        expected = bytearray()
        for y in range(72):
            for x in range(48):
                sx, sy = 12+y, 8+x
                expected.extend(painted[(sy*96+sx)*4:(sy*96+sx)*4+4])
        assert max(abs(a-b) for a,b in zip(expected, transformed)) <= 1, "mask drifted after crop/turn/flip"
        for fmt in ("tiff8", "tiff16"):
            request = dict(view, source_path=str(source), params=params, geometry=geo,
                           adjustments=dict(localMasks=[brush, radial], blackPoint=-15, whitePoint=-12),
                           long_edge=0, proof_long_edge=128, format=fmt, color_space="sRGB")
            proof, rgba = good(host, "render_proof", request)
            path = root / f"masks-{no_film}-{fmt}.tif"
            good(host, "export_frame", dict(request, path=str(path)))
            raw = tiff_pixels(path)
            codes = raw if fmt == "tiff8" else bytes((v*255+32767)//65535 for (v,) in struct.iter_unpack("<H", raw))
            assert codes == bytes(v for i,v in enumerate(rgba) if i%4 != 3), "mask proof differs from exported file"
            assert proof["stats"]["pixels"] == 48*72
            # Private/batch export rehydrates masks with its frozen adjustments.
            private_path=root/f"private-{no_film}-{fmt}.tif"
            private = dict(request, path=str(private_path)); del private["session"]
            good(host, "export_frame", private)
            assert raw == tiff_pixels(private_path), "background export lost masks"
        _, restored = good(host, "render_view", view)
        assert restored == before, "local edits overwrote the print cache"
    hello, _ = good(host, "hello")
    assert "local_masks" in hello.get("view_options", [])
    for patch in (dict(kind="ai"), dict(amount=2), dict(feather=-1), dict(enabled=1),
                  dict(radius=0), dict(start=dict(x=2,y=0)), dict(strokes=[dict(points=[],radius=.1,erase=False)]),
                  dict(adjustments=dict(exposure=4)), dict(adjustments=dict(mask()["adjustments"], command=1))):
        header, payload = host.call("render_view", dict(base, adjustments=dict(localMasks=[dict(mask(), **patch)])))
        assert not header.get("ok") and not payload, (patch, header)
    header, _ = host.call("render_view", dict(base, adjustments=dict(localMasks=[mask()]*9)))
    assert not header.get("ok")
    good(host, "render_view", base)
    good(host, "close", dict(session=sid))
    print("local masks: GPU region/erase/invert, crop/turn/flip, Post-Dev bypass, no-film, proof/file/private export, negative black/white, validation and print-cache isolation passed", flush=True)


def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--host",required=True); parser.add_argument("--resources",required=True)
    args=parser.parse_args(); host=Host([args.host,"--resources",args.resources])
    try:
        with tempfile.TemporaryDirectory(prefix="spk-masks-") as directory: exercise(host,Path(directory))
    finally:
        if host.p.poll() is None:
            try: good(host,"shutdown")
            finally: host.p.wait(timeout=20)


if __name__=="__main__": main()
