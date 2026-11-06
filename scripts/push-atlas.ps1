<#
  Push the atlas media pack (as one zip) to a phone over MTP.

  Pushing 37k small files over MTP takes hours; pushing one zip takes
  minutes. The app unpacks it on first launch.

  Requires Windows PowerShell (the MTP COM interface is Windows-only).
#>
param(
  # Path to the zip to push. Defaults to a zip built next to the repo.
  [string]$Zip = "",
  # Folder inside the phone's internal storage that receives the file.
  [string]$PhoneDir = "Android/data/com.haoxin.wordatlas/files",
  # Stop once the phone reports at least this many bytes.
  [long]$ExpectedBytes = 0,
  # Give up after this many seconds.
  [int]$TimeoutSec = 3600
)

$ErrorActionPreference = 'Stop'

function Find-MtpFolder {
  param([string]$Path)
  $shell = New-Object -ComObject Shell.Application
  $pc = $shell.Namespace(17)
  $segs = @($Path -split '/')
  foreach ($dev in $pc.Items()) {
    try { $kids = $dev.GetFolder.Items() } catch { continue }
    foreach ($k in $kids) {
      try { $sub = $k.GetFolder.Items() } catch { continue }
      foreach ($s in $sub) {
        if ($s.Name -ne $segs[0]) { continue }
        $cur = $s.GetFolder
        $ok = $true
        for ($i = 1; $i -lt $segs.Count; $i++) {
          $m = $cur.Items() | Where-Object { $_.Name -eq $segs[$i] }
          if (-not $m) { $ok = $false; break }
          $cur = $m.GetFolder
        }
        if ($ok) { return $cur }
      }
    }
  }
  return $null
}

if (-not $Zip) {
  $guess = Join-Path (Split-Path $PSScriptRoot -Parent) '..\atlas.zip'
  if (Test-Path $guess) { $Zip = (Resolve-Path $guess).Path }
}
if (-not $Zip -or -not (Test-Path $Zip)) {
  Write-Error "zip not found. Build it first: node scripts/pack-atlas-zip.mjs D:\Downloads\atlas.zip"
  exit 1
}
$Zip = (Resolve-Path $Zip).Path
$size = (Get-Item $Zip).Length

$folder = Find-MtpFolder -Path $PhoneDir
if (-not $folder) {
  Write-Error "MTP path not found: $PhoneDir (is the phone connected in MTP mode?)"
  exit 1
}

$name = Split-Path $Zip -Leaf
$sw = [Diagnostics.Stopwatch]::StartNew()
Write-Host "pushing $name ($([math]::Round($size / 1MB, 1)) MB) to $PhoneDir ..."
$folder.CopyHere($Zip, 0x10)

$target = if ($ExpectedBytes -gt 0) { $ExpectedBytes } else { $size }
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 15
  $item = $folder.Items() | Where-Object { $_.Name -eq $name }
  if ($item) {
    $got = [int64]$item.ExtendedProperty('System.Size')
    Write-Host ("{0,6:N0}s  {1,10:N0} / {2:N0} bytes" -f $sw.Elapsed.TotalSeconds, $got, $target)
    if ($got -ge $target) {
      Write-Host "done in $([math]::Round($sw.Elapsed.TotalSeconds, 1))s"
      exit 0
    }
  }
}
Write-Error "timed out after $TimeoutSec s"
exit 1
