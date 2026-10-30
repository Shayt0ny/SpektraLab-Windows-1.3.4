# SpektraLab Windows 1.3.4 — development notes

Original project: [JamesQiu2005/SpektraLab](https://github.com/JamesQiu2005/SpektraLab).
Windows port: NANATATA (historical port).
Windows maintenance and this update: **shayt0ny**.
Original GPL and profile/font licences and attribution are retained.

## Upstream comparison

Reference: upstream tag `1.3.4`, fetched as
`upstream-spektralab-v1.3.4`. The Windows base already includes the 1.3.4
engine, CineStill profile, black-and-white profiles and baked data. It still
labels the web/native desktop 1.3.1 and omits several Swift-side changes.
The Windows Vulkan backend, fonts, file I/O and earlier fixes are preserved.

Ported into the Windows interface:

- Don't Apply Film Simulation: saved per frame, undoable, reset on selecting
  or pasting a film, unavailable for half-frame pairs. Original decode feeds
  canvas, thumbnails and regular exports; geometry/Post-Dev still apply.
  DI exports continue to use the simulated negative.
- CineStill 800T highlight headroom (0–8 EV, default 4), and a fixed-off
  anti-halation layer switch for this stock.
- Upstream measured grain calibration for four black-and-white stocks.
- Local scene-placement fit and feasible slider windows, with refusal
  messages and no invalid fitted curve committed.
- Chinese export labels and a wider left rail. The date-only first-crop
  coordinate case is covered by a regression test; the reactive Windows
  crop implementation already retains the decode coordinates while editing.
- Web, native application and lockfile versions now agree at 1.3.4.

## Colour corrections

The actual Windows preview did not choose P3 from `color-gamut`. It always
requested sRGB. Its host output conversion nevertheless used the engine's
default lightness compression, whereas Mac `ColourManagement.swift` requests
`lightness_compression_active: false` after the film pipeline has already
compressed lightness once. A synthetic neutral white of 255 became roughly
228. The regression fails before the correction and reproduces every input
gray exactly after it. Destination chroma compression is retained for files.

The previous Windows canvas also graded an already converted sRGB image,
and edited exports graded in the recipe's space. Both now grade in encoded
ProPhoto with the upstream mid-grey pivot. The canvas converts to an
explicit sRGB buffer last; files convert to the recipe's space after edits,
with a matching ICC profile. A typed half-float preview avoids expanding a
73 MP image into a float32 JavaScript array.

The Mac main canvas's matrix/TRC display path and its export chroma knee are
different by design. Neutral ramps/highlights agree to rounding; saturated
patches may differ slightly between the main canvas and a file. This is not
a claim of pixel equality with every macOS RAW decoder or monitor profile.

## Validation

- 18 engine CTests pass, including Vulkan memory recovery and Sony RAW bounds.
- All 84 frontend/state tests pass with the real Vulkan host, including every
  catalogued stock, date/edge states and crop/turn/grade export of the local
  Sony RAW test copy. No tests were skipped in the final run.
- `engine/tests/host_no_film.py`: original decode, parameter isolation,
  preview/file agreement, and switching simulation back on.
- `engine/tests/host_colour.py`: neutral ramp, destination whites, tagged
  sRGB/P3/ProPhoto files and preview/file agreement.
- `desktop/tests/e2e/colour-native.spec.ts`: real half-float WebGL canvas,
  transferable worker and native writer; exposure, highlights, saturation,
  with P3 capability reporting forced both on and off.
- 7168×10240 full render/TIFF export and subsequent render pass. The real
  73 MP worker stays responsive; context-loss recovery remains covered.

The Windows x64 portable release and corresponding source archive are
prepared after these checks. Version metadata of the rebuilt native program
is 1.3.4; the production program was also observed displaying a full-resolution
photo in its actual WebView2 window, with the development server stopped.
Both colour and bypass regressions pass against the staged release host and
its bundled resources. Private photographs, application settings and local
logs are excluded. GitHub publication is a separate step. Build instructions
are in `BUILD_WINDOWS.md`; earlier memory/RAW fixes are described in
`engine/WINDOWS_MEMORY.md`.
