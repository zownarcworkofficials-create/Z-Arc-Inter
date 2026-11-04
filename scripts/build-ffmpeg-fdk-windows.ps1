#requires -Version 5.1
<#
.SYNOPSIS
  Build FFmpeg with Fraunhofer FDK AAC on Windows using MSYS2/MinGW.

.DESCRIPTION
  This is the Windows counterpart to scripts/build-ffmpeg-fdk.sh. It:
    1. Installs a portable MSYS2 base if it is missing.
    2. Installs the MinGW compiler, make, nasm, pkg-config and autotools.
    3. Downloads the FDK AAC and FFmpeg source archives with Windows curl.
    4. Builds both from source with --enable-libfdk-aac --enable-nonfree.
    5. Verifies that ffmpeg -codecs lists libfdk_aac.

  The resulting binary is NONFREE and must stay server-side. See
  LICENSING-FDK.md.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\build-ffmpeg-fdk-windows.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\build-ffmpeg-fdk-windows.ps1 `
    -MsysRoot D:\msys64 -Prefix D:\ffmpeg-fdk
#>
[CmdletBinding()]
param(
    [string]$MsysRoot = 'D:\msys64',
    [string]$Prefix = 'D:\ffmpeg-fdk',
    [string]$Work = 'D:\ffmpeg-fdk-build',
    [string]$SourceDir = 'D:\ffmpeg-fdk-src',
    [string]$FfmpegVersion = '7.1.1',
    [string]$FdkVersion = '2.0.3',
    [int]$Jobs = [Environment]::ProcessorCount,
    [switch]$SkipPackages
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Bash = Join-Path $MsysRoot 'usr\bin\bash.exe'
$Cygpath = Join-Path $MsysRoot 'usr\bin\cygpath.exe'

function Write-Step([string]$Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked([string]$File, [string[]]$Arguments) {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed ($LASTEXITCODE): $File $($Arguments -join ' ')"
    }
}

if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
    throw 'curl.exe is required. It is included with Windows 10 and later.'
}
if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
    throw 'tar.exe is required. It is included with Windows 10 and later.'
}

if (-not (Test-Path $Bash)) {
    Write-Step "MSYS2 not found at $MsysRoot; downloading the portable base"
    New-Item -ItemType Directory -Force -Path $SourceDir | Out-Null

    $release = Invoke-RestMethod `
        -Uri 'https://api.github.com/repos/msys2/msys2-installer/releases/latest' `
        -Headers @{ 'User-Agent' = 'opencode-audio-build' }
    $asset = $release.assets | Where-Object { $_.name -eq 'msys2-base-x86_64-latest.tar.xz' } |
        Select-Object -First 1
    if (-not $asset) {
        throw 'Could not find msys2-base-x86_64-latest.tar.xz in the latest MSYS2 release.'
    }

    $archive = Join-Path $SourceDir 'msys2-base-x86_64-latest.tar.xz'
    if (-not (Test-Path $archive)) {
        Invoke-Checked 'curl.exe' @('-L', '--fail', '--retry', '3', '-o', $archive, $asset.browser_download_url)
    }

    $temp = Join-Path $env:TEMP ('msys2-extract-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $temp | Out-Null
    Invoke-Checked 'tar.exe' @('-xf', $archive, '-C', $temp)
    $extracted = Get-ChildItem -Path $temp -Directory | Select-Object -First 1
    if (-not $extracted) {
        throw 'MSYS2 archive did not contain an extraction directory.'
    }

    $parent = Split-Path -Parent $MsysRoot
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    if (Test-Path $MsysRoot) {
        Remove-Item -Path $MsysRoot -Recurse -Force
    }
    Move-Item -Path $extracted.FullName -Destination $MsysRoot
    Remove-Item -Path $temp -Recurse -Force
}

if (-not (Test-Path $Cygpath)) {
    throw "MSYS2 is incomplete: missing $Cygpath"
}

Write-Step 'Initializing MSYS2'
& $Bash -lc 'true'
if ($LASTEXITCODE -ne 0) {
    throw 'MSYS2 initialization failed.'
}

if (-not $SkipPackages) {
    Write-Step 'Installing MSYS2/MinGW build packages'
    $packages = @(
        'make', 'autoconf', 'automake', 'libtool', 'git', 'diffutils', 'perl', 'm4',
        'mingw-w64-x86_64-gcc',
        'mingw-w64-x86_64-make',
        'mingw-w64-x86_64-nasm',
        'mingw-w64-x86_64-pkgconf'
    ) -join ' '
    $installed = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        & $Bash -lc "pacman -Sy --noconfirm && pacman -S --needed --noconfirm $packages"
        if ($LASTEXITCODE -eq 0) {
            $installed = $true
            break
        }
        Write-Warning "pacman attempt $attempt failed; retrying in 3 seconds..."
        Start-Sleep -Seconds 3
    }
    if (-not $installed) {
        throw 'MSYS2 package installation failed after 3 attempts. Check the pacman output above.'
    }
}

Write-Step 'Downloading FDK AAC and FFmpeg source archives'
New-Item -ItemType Directory -Force -Path $SourceDir, $Work | Out-Null
$fdkArchive = Join-Path $SourceDir "fdk-aac-$FdkVersion.tar.gz"
$ffmpegArchive = Join-Path $SourceDir "ffmpeg-$FfmpegVersion.tar.xz"

if (-not (Test-Path $fdkArchive)) {
    Invoke-Checked 'curl.exe' @(
        '-L', '--fail', '--retry', '3', '-o', $fdkArchive,
        "https://github.com/mstorsjo/fdk-aac/archive/refs/tags/v$FdkVersion.tar.gz"
    )
}
if (-not (Test-Path $ffmpegArchive)) {
    Invoke-Checked 'curl.exe' @(
        '-L', '--fail', '--retry', '3', '-o', $ffmpegArchive,
        "https://ffmpeg.org/releases/ffmpeg-$FfmpegVersion.tar.xz"
    )
}

Write-Step 'Extracting sources'
Remove-Item -Path $Work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $Work | Out-Null
Invoke-Checked 'tar.exe' @('-xzf', $fdkArchive, '-C', $Work)
Invoke-Checked 'tar.exe' @('-xJf', $ffmpegArchive, '-C', $Work)

$fdkSrc = Join-Path $Work "fdk-aac-$FdkVersion"
$ffmpegSrc = Join-Path $Work "ffmpeg-$FfmpegVersion"
if (-not (Test-Path $fdkSrc) -or -not (Test-Path $ffmpegSrc)) {
    throw "Source extraction failed. Expected $fdkSrc and $ffmpegSrc."
}

$unixPrefix = (& $Cygpath -u $Prefix).Trim()
$unixFdk = (& $Cygpath -u $fdkSrc).Trim()
$unixFfmpeg = (& $Cygpath -u $ffmpegSrc).Trim()
$buildScript = Join-Path $RepoRoot 'scripts\build-ffmpeg-fdk-msys2.sh'
$unixBuildScript = (& $Cygpath -u $buildScript).Trim()

$env:MSYSTEM = 'MINGW64'
$env:PREFIX = $unixPrefix
$env:FDK_SRC = $unixFdk
$env:FFMPEG_SRC = $unixFfmpeg
$env:JOBS = [string]$Jobs

Write-Step "Building FDK AAC and FFmpeg with $Jobs jobs"
& $Bash $unixBuildScript
if ($LASTEXITCODE -ne 0) {
    throw 'The FFmpeg/FDK build failed. See the build output above.'
}

$ffmpegExe = Join-Path $Prefix 'bin\ffmpeg.exe'
$ffprobeExe = Join-Path $Prefix 'bin\ffprobe.exe'
if (-not (Test-Path $ffmpegExe)) {
    throw "Build completed but ffmpeg.exe was not installed at $ffmpegExe"
}

Write-Step 'Verifying the installed Windows binary'
$codecs = & $ffmpegExe -hide_banner -codecs 2>&1 | Out-String
if ($codecs -notmatch 'libfdk_aac') {
    throw 'ffmpeg -codecs does not list libfdk_aac.'
}
$version = & $ffmpegExe -hide_banner -version 2>&1 | Out-String
if ($version -notmatch '--enable-libfdk-aac') {
    throw 'ffmpeg -version does not report --enable-libfdk-aac.'
}
if ($version -notmatch '--enable-nonfree') {
    throw 'ffmpeg -version does not report --enable-nonfree.'
}

Write-Host ''
Write-Host 'OK: libfdk_aac is registered.' -ForegroundColor Green
Write-Host "FFmpeg:  $ffmpegExe"
Write-Host "ffprobe: $ffprobeExe"
Write-Host ''
Write-Host 'Start the backend with:' -ForegroundColor Green
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$RepoRoot\server\start-windows.ps1`""
Write-Host 'Then open: http://127.0.0.1:8787/'
