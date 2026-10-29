$ErrorActionPreference = 'Stop'
$deps = Join-Path $PSScriptRoot 'build/deps'
New-Item -ItemType Directory -Path $deps -Force | Out-Null
function Fetch-Verified($url, $name, $sha) {
    $path = Join-Path $deps $name
    if (-not (Test-Path -LiteralPath $path)) { Invoke-WebRequest -Uri $url -OutFile $path }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha) { throw "Checksum mismatch: $name" }
    return $path
}
$compilerArchive = Fetch-Verified 'https://github.com/skeeto/w64devkit/releases/download/v2.11.0/w64devkit-x64-2.11.0.7z.exe' 'w64devkit.7z.exe' '54c2bb9962e8a30c8270e34c5efc3d5fee579f53087fa7d435b95fbba2af7b2b'
if (-not (Test-Path (Join-Path $deps 'w64devkit/bin/g++.exe'))) { & $compilerArchive -y "-o$deps" | Out-Null; if ($LASTEXITCODE) { throw 'Compiler extraction failed' } }
$cmakeArchive = Fetch-Verified 'https://github.com/Kitware/CMake/releases/download/v4.4.5/cmake-4.4.5-windows-x86_64.zip' 'cmake.zip' '326c826486d46a23cf9d5a1c9ee3a567d427bdd02c4a34071937a2a675cff004'
if (-not (Test-Path (Join-Path $deps 'cmake-4.4.5-windows-x86_64'))) { Expand-Archive -LiteralPath $cmakeArchive -DestinationPath $deps }
$shaderArchive = Fetch-Verified 'https://github.com/KhronosGroup/glslang/releases/download/16.6.0/glslang-16.6.0-windows-x86_64-release.zip' 'glslang.zip' '82bf434e69b9bb4829de7e2b4bc2c5e7a7861e53d66cf75e5cc70f5f694a8d9b'
if (-not (Test-Path (Join-Path $deps 'glslang'))) { Expand-Archive -LiteralPath $shaderArchive -DestinationPath (Join-Path $deps 'glslang') }
$headers = Join-Path $deps 'Vulkan-Headers'
if (-not (Test-Path $headers)) { git clone --depth 1 --branch vulkan-sdk-1.4.341.0 https://github.com/KhronosGroup/Vulkan-Headers.git $headers; if ($LASTEXITCODE) { throw 'Headers download failed' } }
if ((git -C $headers rev-parse HEAD) -ne 'b5c8f996196ba4aa6d8f97e52b5d3b6e70f7e4e2') { throw 'Vulkan headers pin mismatch' }
& (Join-Path $PSScriptRoot 'engine/setup-libraw.ps1') -DependencyDirectory $deps
Write-Output 'Portable build tools ready inside build/deps.'
