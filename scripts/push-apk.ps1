<#
  Push an APK to the phone's Download folder over MTP (no adb needed).

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts/push-apk.ps1 -Apk D:\Downloads\app-debug.apk
#>
param(
  [Parameter(Mandatory = $true)][string]$Apk,
  # Folder inside the phone's internal storage that receives the file.
  [string]$PhoneDir = "Download",
  [int]$TimeoutSec = 900
)

$ErrorActionPreference = 'Stop'

function Get-PhoneFolder {
  param([string]$Path)
  $shell = New-Object -ComObject Shell.Application
  $pc = $shell.Namespace(17)
  foreach ($dev in $pc.Items()) {
    try {
      $storage = $dev.GetFolder.Items() | Where-Object { $_.Name -eq '内部存储' }
    } catch { continue }
    if (-not $storage) { continue }
    $folder = $storage.GetFolder
    $ok = $true
    foreach ($seg in ($Path -split '/')) {
      if (-not $seg) { continue }
      $item = $folder.Items() | Where-Object { $_.Name -eq $seg }
      if (-not $item) { $ok = $false; break }
      $folder = $item.GetFolder
    }
    if ($ok) { return $folder }
  }
  throw "phone path not found: $PhoneDir"
}

if (-not (Test-Path $Apk)) { Write-Error "APK not found: $Apk"; exit 1 }
$Apk = (Resolve-Path $Apk).Path
$size = (Get-Item $Apk).Length
$folder = Get-PhoneFolder -Path $PhoneDir

$name = Split-Path $Apk -Leaf
$sw = [Diagnostics.Stopwatch]::StartNew()
Write-Host "pushing $name ($([math]::Round($size / 1MB, 1)) MB) to 内部存储/$PhoneDir ..."
$folder.CopyHere($Apk, 0x10)

$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 10
  $item = $folder.Items() | Where-Object { $_.Name -eq $name }
  if ($item) {
    $got = [int64]$item.ExtendedProperty('System.Size')
    Write-Host ("{0,6:N0}s  {1,10:N0} / {2:N0} bytes" -f $sw.Elapsed.TotalSeconds, $got, $size)
    if ($got -ge $size) {
      Write-Host "done in $([math]::Round($sw.Elapsed.TotalSeconds, 1))s"
      exit 0
    }
  }
}
Write-Error "timed out after $TimeoutSec s"
exit 1
