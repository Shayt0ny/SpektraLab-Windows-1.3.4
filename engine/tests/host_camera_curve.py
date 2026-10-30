#!/usr/bin/env python3
"""Camera-curve data-flow regression. Uses an explicitly supplied private RAW;
the input is read only, all outputs go to a temporary directory.
"""
import argparse
import hashlib
from pathlib import Path
import tempfile
from host_smoke import Host
from host_proof import good, tiff_pixels


PARAMS = {"grain_active": False, "glare_active": False, "halation_active": False,
          "auto_exposure": False, "preview_long_edge": 800}


def originals(host, sid):
    return good(host, "render_source", {"session": sid, "display": "srgb", "long_edge": 256, "format": "rgba16"})[1]


def film(host, sid):
    return good(host, "render_view", {"session": sid, "display": "srgb", "tier": "live", "long_edge": 256, "format": "rgba16"})[1]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--host", required=True)
    p.add_argument("--resources", required=True)
    p.add_argument("--raw", type=Path, required=True)
    p.add_argument("--baseline-host")
    p.add_argument("--baseline-resources")
    args = p.parse_args()
    digest = hashlib.sha256(args.raw.read_bytes()).hexdigest()
    h = Host([args.host, "--resources", args.resources])
    try:
        hello, _ = good(h, "hello")
        assert "camera_curve" in hello.get("view_options", []), "camera curve not implemented by this host"
        opened, _ = good(h, "open", {"path": str(args.raw), "params": PARAMS})
        sid = opened["session"]
        before, film_before = originals(h, sid), film(h, sid)
        off, _ = good(h, "redecode", {"session": sid, "decode": {"apply_camera_curve": False}})
        assert "camera_curve" not in off["metadata"]
        assert originals(h, sid) == before and film(h, sid) == film_before, "explicit OFF changed the original pipeline"
        print("PASS omitted switch == explicit OFF, source and actual film pixels", flush=True)
        profile, _ = good(h, "camera_profile", {"session": sid})
        profile = profile["profile"]
        assert profile is not None, "install/import a camera DCP for this optional RAW integration check"
        enabled = {"apply_camera_curve": True, "camera_profile": profile}
        on, _ = good(h, "redecode", {"session": sid, "decode": enabled})
        assert on["metadata"]["camera_curve"] == {"applied": True, "profile": profile["name"], "input": "colored_raw"}
        assert originals(h, sid) != before, "ON did not change the pre-film source"
        colored_film = film(h, sid)
        assert colored_film != film_before, "film did not consume colored_raw"
        print("PASS ON changes both pre-film source and final film render:", profile["name"], flush=True)
        # On->off must restore the same source, not approximate an inverse curve.
        good(h, "redecode", {"session": sid, "decode": {"apply_camera_curve": False}})
        assert originals(h, sid) == before and film(h, sid) == film_before, "OFF failed to restore exact baseline"
        print("PASS toggling OFF restores exact baseline", flush=True)
        # Deliberately export while the resident editor is OFF: frozen ON must
        # cause a private re-decode, instead of quietly using the old session.
        with tempfile.TemporaryDirectory(prefix="spk-camera-curve-") as folder:
            root = Path(folder)
            request = {"session": sid, "source_path": str(args.raw), "params": PARAMS, "decode": enabled,
                       "format": "tiff16", "color_space": "sRGB", "long_edge": 256, "no_film": False,
                       "proof_long_edge": 256, "display": "srgb", "generation": 71}
            proof, rgba = good(h, "render_proof", request)
            written, _ = good(h, "export_frame", dict(request, path=str(root / "on.tif")))
            rgb = tiff_pixels(root / "on.tif")
            import struct
            codes = bytes((v * 255 + 32767) // 65535 for (v,) in struct.iter_unpack("<H", rgb))
            assert codes == bytes(n for i, n in enumerate(rgba) if i % 4 != 3), "proof and actual camera-curve export differ"
            good(h, "export_frame", dict(request, decode={"apply_camera_curve": False}, path=str(root / "off.tif")))
            assert tiff_pixels(root / "off.tif") != rgb, "camera curve was lost in export"
            assert originals(h, sid) == before, "private export changed the editor decode"
            print("PASS frozen ON export, proof/file identity, editor isolation", flush=True)
        if args.baseline_host:
            baseline = Host([args.baseline_host, "--resources", args.baseline_resources])
            try:
                good(baseline, "hello")
                old, _ = good(baseline, "open", {"path": str(args.raw), "params": PARAMS})
                assert originals(baseline, old["session"]) == before, "OFF differs from shipped source preview"
                assert film(baseline, old["session"]) == film_before, "OFF differs from shipped film rendering"
                print("PASS OFF byte-identical to shipped baseline", flush=True)
            finally:
                good(baseline, "shutdown"); baseline.p.wait(timeout=20)
        assert hashlib.sha256(args.raw.read_bytes()).hexdigest() == digest, "original RAW file changed"
        print("PASS original RAW SHA256 unchanged", flush=True)
    finally:
        if h.p.poll() is None:
            good(h, "shutdown"); h.p.wait(timeout=20)


if __name__ == "__main__":
    main()
