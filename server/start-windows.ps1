#requires -Version 5.1
<#
.SYNOPSIS
  Start the server-side audio conversion backend on Windows.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\server\start-windows.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\server\start-windows.ps1 `
    -FfmpegBin D:\ffmpeg-fdk\bin\ffmpeg.exe `
    -QaacBin "C:\Program Files\foobar2000\encoders\qaac64.exe" -Port 8787
#>
[CmdletBinding()]
param(
    [string]$FfmpegBin = '',
    [string]$FfprobeBin = '',
    [string]$QaacBin = '',
    [int]$Port = 8787,
    [string]$BindAddress = '127.0.0.1'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot

if (-not $FfmpegBin) {
    $ffmpegCandidates = @(
        (Join-Path $RepoRoot 'ffmpeg-fdk\bin\ffmpeg.exe'),
        'D:\ffmpeg-fdk\bin\ffmpeg.exe'
    )
    foreach ($candidate in $ffmpegCandidates) {
        if (Test-Path $candidate) { $FfmpegBin = $candidate; break }
    }
}

if (-not $FfmpegBin -or -not (Test-Path $FfmpegBin)) {
    throw @"
ffmpeg.exe not found.

Looked for:
  $RepoRoot\ffmpeg-fdk\bin\ffmpeg.exe
  D:\ffmpeg-fdk\bin\ffmpeg.exe

Build it first:
  powershell -ExecutionPolicy Bypass -File "$RepoRoot\scripts\build-ffmpeg-fdk-windows.ps1"

Or pass -FfmpegBin with the full path to ffmpeg.exe.
"@
}

if (-not $QaacBin) {
    $qaacCandidates = @(
        'C:\Program Files\foobar2000\encoders\qaac64.exe',
        'C:\Program Files (x86)\foobar2000\encoders\qaac.exe',
        (Join-Path $RepoRoot 'vendor\qaac\qaac64.exe')
    )
    foreach ($candidate in $qaacCandidates) {
        if (Test-Path $candidate) { $QaacBin = $candidate; break }
    }
}

if (-not $QaacBin -or -not (Test-Path $QaacBin)) {
    throw @"
Apple AAC wrapper (qaac64.exe) not found.

Looked for:
  C:\Program Files\foobar2000\encoders\qaac64.exe
  C:\Program Files (x86)\foobar2000\encoders\qaac.exe
  $RepoRoot\vendor\qaac\qaac64.exe

Install foobar2000's encoder pack, or iTunes / Apple Application Support,
then pass -QaacBin with the qaac64.exe path.
"@
}

$QaacDir = Split-Path -Parent $QaacBin
$CoreAudioDll = Join-Path $QaacDir 'CoreAudioToolbox.dll'
if (-not (Test-Path $CoreAudioDll)) {
    throw @"
Apple CoreAudioToolbox.dll was not found next to qaac64.exe:
  $CoreAudioDll

The foobar2000 encoder pack includes it. Without this Apple DLL, qaac cannot
produce Apple AAC.
"@
}

if (-not $FfprobeBin) {
    $FfprobeBin = Join-Path (Split-Path -Parent $FfmpegBin) 'ffprobe.exe'
}
if (-not (Test-Path $FfprobeBin)) {
    throw "ffprobe.exe not found at: $FfprobeBin"
}

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($existing) {
    throw "Port $Port is already in use by PID $($existing.OwningProcess). Stop that process and retry."
}

$env:AAC_ENCODER = 'apple'
$env:QAAC_BIN = (Resolve-Path $QaacBin).Path
$env:FFMPEG_BIN = (Resolve-Path $FfmpegBin).Path
$env:FFPROBE_BIN = (Resolve-Path $FfprobeBin).Path
$env:PORT = [string]$Port
$env:HOST = $BindAddress

Set-Location $RepoRoot
Write-Host "Starting audio conversion backend" -ForegroundColor Cyan
Write-Host "  qaac:    $env:QAAC_BIN"
Write-Host "  Apple:   $CoreAudioDll"
Write-Host "  FFmpeg:  $env:FFMPEG_BIN"
Write-Host "  ffprobe: $env:FFPROBE_BIN"
Write-Host "  Target:  320 kbps CBR (Apple AAC-LC)"
Write-Host "  URL:     http://${BindAddress}:$Port/"
Write-Host ""

& node server/index.js
exit $LASTEXITCODE
