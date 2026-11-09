<#
  Pull a single file from the phone over MTP into the current directory.

  MTP has no "copy from phone" API that works reliably through the shell
  namespace, so the trick is to copy the file onto the PC's own MTP
  namespace first and then read it back with a regular file copy.
#>
param(
  # Path inside the phone, e.g. "Android/data/com.haoxin.wordatlas/files"
  [string]$PhoneDir = 'Android/data/com.haoxin.wordatlas/files',
  # File name inside that folder
  [string]$Name = 'diag.log',
  # Where to save it locally
  [string]$Out = ".\$Name"
)

$ErrorActionPreference = 'Stop'

function Find-PhoneFolder {
  param([string]$Path)
  $shell = New-Object -ComObject Shell.Application
  $pc = $shell.Namespace(17)
  foreach ($dev in $pc.Items()) {
    try { $storage = $dev.GetFolder.Items() | Where-Object { $_.Name -eq '内部存储' } } catch { continue }
    if (-not $storage) { continue }
    $cur = $storage.GetFolder
    $ok = $true
    foreach ($seg in @($Path -split '/')) {
      if (-not $seg) { continue }
      $m = @($cur.Items() | Where-Object { $_.Name -eq $seg })
      if ($m.Count -eq 0) { $ok = $false; break }
      $cur = $m[0].GetFolder
    }
    if ($ok) { return $cur }
  }
  return $null
}

$folder = Find-PhoneFolder -Path $PhoneDir
if (-not $folder) { throw "phone folder not found: $PhoneDir" }

$item = @($folder.Items() | Where-Object { $_.Name -eq $Name })
if ($item.Count -eq 0) { throw "file not found: $Name in $PhoneDir" }

# Copying *from* an MTP device is done by asking the phone's folder to
# copy into a local shell folder. 0x10 = no progress UI, 0x400 = no error UI.
$dest = [IO.Path]::GetFullPath((Join-Path (Get-Location) $Out))
$shell = New-Object -ComObject Shell.Application
$local = $shell.Namespace((Split-Path $dest -Parent))
$localFolder = $local.ParseName((Split-Path $dest -Leaf))

if (-not (Test-Path -LiteralPath $dest)) {
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  $local = $shell.Namespace((Split-Path $dest -Parent))
  $localFolder = $local.ParseName((Split-Path $dest -Leaf))
}

$localFolder.CopyHere($item[0], 0x10)

$deadline = (Get-Date).AddSeconds(60)
$target = Join-Path $dest $Name
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 500
  if (Test-Path -LiteralPath $target) { break }
}

if (-not (Test-Path -LiteralPath $target)) {
  throw "copy did not produce $target"
}
Write-Output "pulled $Name -> $target ($((Get-Item $target).Length) bytes)"
