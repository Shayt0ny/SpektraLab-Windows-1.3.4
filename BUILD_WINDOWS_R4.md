# Building the maintained official Windows beta integration

Version: 1.3.4-win.4. Official reference:
`JamesQiu2005/SpektraLab`, tag `spektralab-windows-v1.3.4-beta.1`,
commit `fa6096fd74c6f5328dfe78519d82cf5caaa6797c`.
This supersedes the native-host instructions in BUILD_WINDOWS.md for win.4.

win.7 addition: run `python engine/setup-raw-candidate.py --deps build/deps`
before CMake. It verifies the fixed candidate archive and existing source tree;
the source package supplies the same archive in `third_party_sources/` for
offline use. `SPEKTRALAB_RAW_CANDIDATE_SOURCE` selects its extracted path.
Build/stage the matching `spektralab-raw-candidate.dll` beside the host and keep
`Nikon-HE-NOTICE.txt` plus the LibRaw LGPL text. This is a separate module, not
a replacement of the stable LibRaw archive. `SPEKTRALAB_RAW_CANDIDATE=OFF` is
available for builds that intentionally omit the optional backend.

Use PowerShell 7, Python 3.12+, Git, CMake, a MinGW C/C++ toolchain, Ninja,
Meson 1.9.2, glslang, Vulkan headers and GNU Rust. Tools remain build-only;
there is no Python runtime dependency in the desktop program.

1. Run build-tools.ps1 to prepare the original compiler/LibRaw/Vulkan tools.
   The corresponding source ZIP includes `third_party_sources/`, with the
   original archives, Git snapshots and hashes. Preserve the pinned source
   files; do not change measured film/paper data or bypass calibration checks.
2. `engine/setup-codecs.ps1` prepares JPEG/PNG/zlib and NASM.
   The pinned PNG archive is also available from the SourceForge direct mirror
   `https://netix.dl.sourceforge.net/project/libpng/libpng16/1.6.59/libpng-1.6.59.tar.xz`;
   keep the same SHA256 required by the script.
3. Use `engine/setup-input-codecs.py --help` to build the pinned extra input
   libraries. This build used sources `build/deps/beta-input-sources`, build
   `build/beta-input-build`, install `build/deps/beta-input-install`, MinGW
   Makefiles and six jobs. All input archives were verified by the script.
4. Use `engine/setup-lens-codecs.py --help` for the pinned Lensfun/GLib build:
   sources `build/deps/beta-lens-sources`, build `build/beta-lens-build`, install
   `build/deps/beta-lens-install`. Meson and Ninja must be on the tool paths.
   Git subprojects must use the exact commits in `lens-codecs-pins.json`.
   The source bundle provides snapshots as well as their hashes; offline
   builders can build those snapshots directly, or recreate the pinned Git
   checkout before running the strict setup script.
   On w64devkit, BusyBox patch does not implement `--version`. Meson 1.9.2's
   discovery loop should catch its MesonException, exclude that tool path,
   and continue looking, rather than aborting. Do not report a fake GNU patch
   version. This is a build-tool compatibility change, not a library-source
   or application-pixel change; the build uses verified wrap patches.
5. Configure CMake from the source root, enabling
   `SPEKTRALAB_BUILD_NATIVE_RAW`, `SPEKTRALAB_BUILD_HOST`,
   `SPEKTRALAB_STATIC_RUNTIME`, `SPEKTRALAB_BUILD_TEST_DLL`, `BUILD_TESTING`;
   disable `SPEKTRALAB_BUILD_DESKTOP` (the separate minimal native viewer).
   Set `SPEKTRALAB_VULKAN_HEADERS`, `SPEKTRALAB_GLSLANG`,
   `SPEKTRALAB_LIBRAW_SOURCE`, `SPEKTRALAB_CODECS_DIR`,
   `SPEKTRALAB_INPUT_CODEC_PREFIX`, `SPEKTRALAB_LENS_PREFIX`,
   `SPEKTRALAB_NASM` and `Python3_EXECUTABLE` to those prepared paths.
   Build Release, then run CTest with output on failure. Native libraries are
   statically linked; the source explicitly links the verified static OpenMP
   runtime for MinGW configurations whose FindOpenMP omits it.
6. Install desktop dependencies from package-lock.json (esbuild is now an
   explicit dev dependency, so pnpm's strict resolution also works). Run
   assets copy, all three TypeScript configurations, ESLint, Vitest, browser
   regressions and Vite build. See desktop/package.json. Use an installed
   Edge/Chromium executable for Playwright; no camera file is needed to build.
7. Build the Rust shell with `--release --locked --features tauri/custom-protocol`.
   As in BUILD_WINDOWS.md, GNU windres needs a target directory without spaces.
   The release uses the GNU Rust toolchain and libgcc_eh compatibility described
   in setup-desktop-tools.ps1.
8. Stage spektralab.exe, spektralab-host.exe, x64 WebView2Loader.dll,
   `host/engine` resources, and all licence notices from the engine resource
   directory and `engine/third-party` / `engine/host/third-party` build outputs.
   Build CLI with `node scripts/build-agent.mjs APP_DIRECTORY --runtime` from
   desktop, setting SPEKTRALAB_NODE_RUNTIME to verified Node v24.19.0 win-x64.
   The script verifies runtime version and the full Node licence hash.
   Source/runtime pins and unmodified sources must accompany redistribution.

The source archive includes the local modifications; the official commit alone
does not reproduce this maintenance release. Never include private RAW files,
edited-photo sidecars, caches or logs in a public release.
