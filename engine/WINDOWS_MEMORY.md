# Vulkan memory protection (Windows/Linux)

The render boundary used by interactive filters and ordinary full-resolution
image export now discards idle compute buffers and upload/readback staging
before starting. It also drops inactive tiers in the current session. These
are disposable image caches; edits and the current negative are retained.
Render temporaries are released before end-of-frame cleanup on success and
failure. Vulkan results own CPU pixels, so an already returned frame remains
valid during cleanup.

On drivers exposing `VK_EXT_memory_budget`, every fresh allocation re-queries
the selected heap's current budget and usage. A reserve of 5% of that budget,
capped at 256 MiB, is left for the display and other applications. The budget
is advisory and can change immediately after the query; real allocation
failures are still handled. Vulkan 1.0 devices without the extension retain
allocation-failure recovery without claiming to know global available VRAM.

An allocation that fails for device/host memory first frees incompatible idle
pooled buffers and retries once. A second failure returns an actionable error
instead of an unbounded retry. Reprint failures are propagated instead of
starting another full film render. Staging growth releases its old capacity
before replacement because transfers are synchronous. Tiny parameters no
longer reuse a full image plane: reuse slack is bounded to the larger of the
requested size or 4096 bytes.

This does not lower export resolution, change profiles/shader mathematics,
or guarantee that every image fits. In particular, 7168 x 10240 is 73,400,320
pixels: one RGB float32 plane alone is 880,803,840 bytes (840 MiB), and effects
need several concurrent planes. Live/persistent data is never freed to force
an allocation through. The previous automatic stripe-budget limitation still
exists; this change does not silently enable a different rendering path.

## Validation

- `spk_vulkan_memory`: bounded pool reuse, live-buffer preservation across
  frame cleanup, allocation reclaim/retry, refusal under a 64 MiB per-engine
  ceiling, one-shot pressure reporting, and subsequent recovery. The same
  test fails against the original backend on oversized reuse.
- The existing Windows/Vulkan CTest suite covers transfers, kernels, geometry,
  LUT/DI, feature boundaries, deterministic repeated rendering and C ABI result
  ownership. These are local checks, not external Metal/Python film parity.
- `python engine/tests/host_memory.py --host <exe> --resources <dir>`:
  a synthetic image under a 128 MiB per-engine limit; preview works, full
  render/export safely fail, no partial output is written, and the same session
  and later exports remain usable without restarting the host.
- Add `--full-size` for a separate 7168 x 10240 synthetic default-effects render
  and TIFF16 export test with no artificial limit. Close other GPU applications
  first. This checks allocation and resolution, not a private camera RAW.

`SPEKTRAFILM_VULKAN_MEMORY_LIMIT_MB=<positive integer>` is an optional per-engine,
per-device-local-heap ceiling for repeatable low-memory tests. It can only
reduce the driver's budget. It is unset in the distributed runnable build.

## Reproduce this build

`build-tools.ps1` downloads checksum-verified portable GCC, CMake and glslang
inside `build/deps`, plus the repository's pinned Vulkan headers and LibRaw.
It changes no system installations. Configure the root CMake project with
`BUILD_TESTING=ON`, `SPEKTRALAB_BUILD_NATIVE_RAW=ON`,
`SPEKTRALAB_BUILD_HOST=ON`, `SPEKTRALAB_BUILD_DESKTOP=OFF`, and
`SPEKTRALAB_STATIC_RUNTIME=ON`; provide absolute paths for
`SPEKTRALAB_VULKAN_HEADERS`, `SPEKTRALAB_LIBRAW_SOURCE`, and
`SPEKTRALAB_GLSLANG`. Build with MinGW Makefiles, then run CTest.
The initial portable package kept the installed 1.3.1 frontend and replaced its
engine host/resources. The second revision also rebuilds the frontend:

- An image with identity geometry and neutral/disabled Layer 2 is exported by
  the host directly, avoiding a full-resolution RGBA16 webview round trip.
- Edited exports use the same `filePixels` arithmetic in a module worker.
  Input and output ArrayBuffers are transferred, rather than cloned; a failed
  worker returns a visible error instead of falling back to the UI thread.
- The canvas opts into WebGL context restoration, reconstructs its renderer
  and reuploads the retained frame. Texture-upload errors produce a message.

The 7168 x 10240 synthetic default-effects engine render and TIFF16 export
passed on the RTX 5070. A real Chromium worker processed the same pixel count
with rotation and grading in about 10 seconds while a 20 ms UI timer kept
ticking (largest measured gap about 21 ms). A separate browser test loses and
restores the WebGL context and checks that the picture returns. These are
synthetic checks; the reported private-photo black screen has not itself been
reproduced from a captured crash log. On the final native build the user's
7168 x 10240 photo was loaded, and the export page was observed reporting
`written 1 / 1` while the image and interface remained visible.

For the second revision, `setup-desktop-tools.ps1` prepares a local Rust GNU
toolchain and frontend dependencies (pnpm must be on PATH, or pass
`-PnpmExecutable`). Build the Vite production assets, then run
`cargo build --manifest-path desktop/src-tauri/Cargo.toml --release --locked
--features tauri/custom-protocol` with the script's CARGO_HOME/RUSTUP_HOME and
MinGW on PATH. Use a CARGO_TARGET_DIR without spaces: GNU windres otherwise
misquotes its preprocessor include path. The setup script provides the legacy
`libgcc_eh.a` name from GCC 16's combined static libgcc, which already exports
the SEH unwinder. Ship x64 `WebView2Loader.dll` from the locked webview2-com-sys
package beside the frontend executable. The complete package is checked with
the development server stopped; it embeds the production assets.

## Third revision: Sony ILCE-7RM6 active image area

The tested ARW exposes a 10240 x 7168 storage plane through LibRaw 0.22.2,
with no active-area margins. That LibRaw release does not list ILCE-7RM6 in
its model table, but does parse an explicit inset crop: left 12, top 8,
width 9984, height 6656. Without applying it, the oriented decoded frame
contains zero-valued padded rows/columns; the film transforms make them
visible as near-black top/right bands in the export.

`io/raw_active_area.hpp` selects that metadata crop only for Sony ILCE-7RM6
when LibRaw still exposes the complete, unmargined storage plane. It checks
the crop's dimensions, bounds and unset-origin sentinels. Existing camera
policies and already cropped frames are left alone. The RAW decoder sets
LibRaw's cropbox before interpolation/orientation in both decode modes, and
the host's probe uses the same policy so probe/open/export dimensions agree.
No brightness threshold, film profile adjustment or image downsampling is
used to choose the crop.

The user's ARW was inspected read-only. Validation exports used an isolated
copy under build/, with no sidecar writes to the original. Probe, open and
JPEG export all reported 6656 x 9984 after rotation, and the exported image
had no near-black full-width/full-height edge runs (before correction:
about 216 rows at the top and 488 columns at the right). All 18 CTests passed,
including a new policy test for model isolation, already cropped frames,
unset origins and out-of-bounds metadata. This is a compatibility crop fix,
not a claim of complete color/decode validation for every ARW 6.0 variant.

Sony's documented 3:2 full-frame image size is 9984 x 6656:
https://www.sony.com/electronics/support/e-mount-body-ilce-7-series/ilce-7rm6/specifications
