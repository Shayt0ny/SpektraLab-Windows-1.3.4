# Build the Windows 1.3.4 release

This is the Windows maintenance release by **shayt0ny**, derived from
[JamesQiu2005/SpektraLab](https://github.com/JamesQiu2005/SpektraLab) through
[NANATATA's Windows port](https://github.com/YZH2006517/SpektraLab-Windows-NANATATA).
See `RELEASE_NOTES_1.3.4_zh-CN.md` and the original licence files.

Use Windows x64, PowerShell 7, Node/npm or pnpm, and Git. The helper scripts
download pinned native build dependencies into `build/deps`; the frontend
uses `desktop/package-lock.json`, and Rust uses `desktop/src-tauri/Cargo.lock`.
Downloads require network access. No private camera file is needed to build.

## Native host

From the source root, run `./build-tools.ps1`. The source archive also carries
the original, checksum-verified LibRaw 0.22.2 source ZIP under
`third_party_sources/LibRaw-0.22.2.zip`; copying it to `build/deps/` first avoids
downloading it again. Its SHA256 is
`02275a04cf0d1477ab9fd7ee231ddea59e7b14497458da6e3ba957517d6655c7`.

```powershell
$root = (Get-Location).Path
$env:PATH = (Join-Path $root 'build/deps/w64devkit/bin') + ';' + $env:PATH
$cmake = Join-Path $root 'build/deps/cmake-4.4.5-windows-x86_64/bin/cmake.exe'
& $cmake -S . -B build/fix -G 'MinGW Makefiles' `
  -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=ON `
  -DSPEKTRALAB_BUILD_NATIVE_RAW=ON -DSPEKTRALAB_BUILD_HOST=ON `
  -DSPEKTRALAB_BUILD_DESKTOP=OFF -DSPEKTRALAB_STATIC_RUNTIME=ON `
  "-DSPEKTRALAB_VULKAN_HEADERS=$root/build/deps/Vulkan-Headers/include" `
  "-DSPEKTRALAB_LIBRAW_SOURCE=$root/build/deps/LibRaw-0.22.2" `
  "-DSPEKTRALAB_GLSLANG=$root/build/deps/glslang/bin/glslang.exe"
& $cmake --build build/fix -j6
& (Join-Path $root 'build/deps/cmake-4.4.5-windows-x86_64/bin/ctest.exe') `
  --test-dir build/fix --output-on-failure
```

The host is `build/fix/engine/host/spektralab-host.exe`; its resources are
`build/fix/engine/resources`. Keep the resource files from the same build.

## Desktop

Run `./setup-desktop-tools.ps1` (pnpm on PATH, or specify `-PnpmExecutable`).
It prepares portable GNU Rust and the GCC compatibility library used by the
release. Its generated pnpm files are local; npm's lockfile remains canonical.

From `desktop/`, with the native MinGW directory still on PATH:

```powershell
node scripts/copy-assets.mjs
./node_modules/.bin/tsc.CMD -p tsconfig.node.json
./node_modules/.bin/tsc.CMD -p tsconfig.web.json
./node_modules/.bin/vite.CMD build
$root = (Resolve-Path ..).Path
$env:CARGO_HOME = Join-Path $root 'build/deps/cargo'
$env:RUSTUP_HOME = Join-Path $root 'build/deps/rustup'
$env:PATH = (Join-Path $env:CARGO_HOME 'bin') + ';' + `
  (Join-Path $root 'build/deps/w64devkit/bin') + ';' + $env:PATH
# GNU windres needs a target directory whose complete path has no spaces.
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'spektralab-1.3.4-build'
& (Join-Path $env:CARGO_HOME 'bin/cargo.exe') build `
  --manifest-path src-tauri/Cargo.toml --release --locked `
  --features tauri/custom-protocol
```

Verify the complete target path has no spaces; choose another writable path
if the user profile name contains spaces. `tauri/custom-protocol` is required
for an independent production program rather than a development-server build.

## Portable layout

```text
SpektraLab-1.3.4-shayt0ny-Windows-x64/
  spektralab.exe
  spektralab-host.exe
  WebView2Loader.dll
  host/engine/...
  host/licenses/...
  使用说明.txt
  RELEASE_NOTES_1.3.4_zh-CN.md
  SOURCE.txt
  FILES.sha256
```

Copy `spektralab.exe` from the Rust release target. Ship the x64
`WebView2Loader.dll` from locked `webview2-com-sys` 0.39.1 beside it. Bundle
the licences from the existing host staging process, including the loader
notice and the profile/font notices. The host's stb/volk sources are vendored
under `engine/third_party`. Static native dependencies are linked into the host.

Stop the development server before checking this layout. Validate the staged
host with `engine/tests/host_colour.py` and `host_no_film.py` (Python with
Pillow), and `host_memory.py` (standard library). The corresponding source
archive and binary archive each carry per-file SHA256 manifests; the external
checksum file identifies the two final ZIPs. Build products, dependency
caches, private photographs, user settings and local logs are not source
release inputs. Additional memory/RAW rationale is in `engine/WINDOWS_MEMORY.md`.
