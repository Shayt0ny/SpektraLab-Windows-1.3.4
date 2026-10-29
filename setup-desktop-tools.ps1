[CmdletBinding()]
param([string]$PnpmExecutable = 'pnpm')
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$deps = Join-Path $projectRoot 'build/deps'
$env:CARGO_HOME = Join-Path $deps 'cargo'
$env:RUSTUP_HOME = Join-Path $deps 'rustup'
$env:PATH = (Join-Path $deps 'w64devkit/bin') + ';' + (Join-Path $env:CARGO_HOME 'bin') + ';' + $env:PATH
$rustup = Join-Path $deps 'rustup-init.exe'
if (-not (Test-Path $rustup)) {
    Invoke-WebRequest 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe' -OutFile $rustup
}
$checksumContent = (Invoke-WebRequest 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe.sha256').Content
if ($checksumContent -is [byte[]]) { $checksumContent = [Text.Encoding]::UTF8.GetString($checksumContent) }
$digest = $checksumContent.Split(' ')[0].Trim()
if ((Get-FileHash $rustup -Algorithm SHA256).Hash.ToLowerInvariant() -ne $digest) { throw 'Rustup checksum mismatch' }
if (-not (Test-Path (Join-Path $env:CARGO_HOME 'bin/cargo.exe'))) {
    & $rustup -y --no-modify-path --profile minimal --default-host x86_64-pc-windows-gnu --default-toolchain stable
    if ($LASTEXITCODE) { throw 'Portable Rust setup failed' }
}
# GCC 16's static runtime includes the SEH unwinder in libgcc.a. Rust's GNU
# target still asks the linker for the older split library name as well.
$gccLibrary = (& (Join-Path $deps 'w64devkit/bin/gcc.exe') -print-libgcc-file-name).Trim()
$exceptionLibrary = Join-Path (Split-Path $gccLibrary -Parent) 'libgcc_eh.a'
if (-not (Test-Path $exceptionLibrary)) { Copy-Item -LiteralPath $gccLibrary -Destination $exceptionLibrary }
Push-Location (Join-Path $projectRoot 'desktop')
try {
    & $PnpmExecutable import
    if ($LASTEXITCODE) { throw 'Lockfile import failed' }
    if (-not (Test-Path 'pnpm-workspace.yaml')) {
        "allowBuilds:`n  esbuild: true" | Set-Content -LiteralPath 'pnpm-workspace.yaml' -Encoding UTF8
    }
    & $PnpmExecutable install --frozen-lockfile --store-dir (Join-Path $deps 'pnpm-store')
    if ($LASTEXITCODE) { throw 'Frontend dependency setup failed' }
} finally { Pop-Location }
