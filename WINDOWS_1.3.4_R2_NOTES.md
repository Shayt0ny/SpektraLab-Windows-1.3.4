# Windows 1.3.4-win.2 — maintenance revision

This revision is packaged at the maintainer's request after local validation.
The reported blank Z8 import on a different Windows 11 computer remains
unresolved without that machine's GPU/driver information and error logs.
Lens correction remains unavailable and is deferred to a subsequent change.
The earlier 1.3.4 ZIPs do not include these new changes.

## Selected-photo import

The import button and Ctrl+O now open the existing native multiple-file
picker. Selecting one file no longer enumerates its parent directory;
selecting an existing subset replaces the library with exactly that subset.
No neighbouring photos or stored pairs are silently appended. Cancel leaves
the current library alone. Explicit whole-folder import remains a separate
File-menu command, Ctrl+Shift+O. Thumbnails retain their two-request queue.

## Nikon Z5 II

The supplied Z5_2 NEF opens in LibRaw 0.22.2, but its XYZ matrix is zero and
its RGB matrix is the uncalibrated identity. The old white-balance helper
therefore refused custom temperature/tint. A narrowly scoped compatibility
profile now supplies that exact camera's D65 matrix from RawSpeed, before
LibRaw snapshots its metadata for unpack. LibRaw computes the normalized
matrix and daylight coefficients itself. Existing file/library profiles,
other manufacturers, Z8 and different channel layouts take precedence or
are excluded. Black/white levels, cropping, film/paper profiles are unchanged.

Source and CC BY-SA 3.0 attribution are preserved in
`engine/resources/io/Nikon-Z5-II-profile-NOTICE.txt`.

`host_white_balance.py` tested the local Z5 II and Z8 NEFs read-only:
temperature and tint independently change pixels; restoring As Shot restores
the original pixels exactly. No Z6 III file has been tested in this run.
White-balance failures now stay visible next to the controls, even if a later
render clears the status bar. New photo selections clear stale error state.

## Excessive preview colour noise

The old WebGL sampler used only bilinear filtering for full-resolution
textures. At a small fit zoom that samples four pixels out of a large source
footprint, which aliases fine detail/grain into conspicuous coloured speckles.
A synthetic equal-average colour pattern reproduced this: channel spread
255 rather than the expected neutral result. Mipmapped reduction now passes
the same test (spread no more than 2), without changing simulation strength
or exported full-resolution pixels. The filmstrip can use the existing
canvas texture/filtering, avoiding a second full-size GPU upload. Unsupported
mip generation falls back to bilinear and reports a console diagnostic.

A neutral synthetic patch at a 36 mm / 8280 px physical sampling pitch was
also checked through the actual Portra 800 Vulkan pipeline. Grain off leaves
less than one code value of channel standard deviation; grain on gives
approximately 11–19 codes at full size, reducing to 2–4 after area averaging
to one eighth size, with no clipped channels. Local Vulkan analytic/RNG gates
pass. This isolates a demonstrated preview defect; it does not establish
whole-frame Metal parity or prove every real photograph's grain is correct.

## Missing preview diagnostics

An image larger than the display's maximum texture dimension now reports its
actual size and the supported limit instead of silently returning no image.
A failed open/render is displayed centrally when no frame is available.
Thumbnail decode/encoding failures are recorded in the local app log.
These improve diagnosis; they do not identify the remote Windows 11/Z8
report's root cause without that machine's logs and GPU information.

Use Help → Show Logs, or Settings → Diagnostics, to inspect the local
failure. Share only the relevant error text and GPU/driver details; personal
photo paths are not required. No private photographs or diagnostic logs are
included in source/release inputs.
