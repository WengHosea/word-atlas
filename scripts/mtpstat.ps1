param([string]$PhoneDir = 'Download', [string]$Name = '')

$ErrorActionPreference = 'Stop'

function Find-Folder {
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
        if ($ok) { return @{ Shell = $shell; Folder = $cur } }
      }
    }
  }
  return $null
}

$p = Find-Folder -Path $PhoneDir
if (-not $p) { throw "not found: $PhoneDir" }
$items = $p.Folder.Items()
if ($Name) { $items = $items | Where-Object { $_.Name -eq $Name } }
foreach ($i in $items) {
  $sz = $i.ExtendedProperty('System.Size')
  $md = $i.ExtendedProperty('System.DateModified')
  Write-Output ("{0,-30} {1,15} {2}" -f $i.Name, $sz, $md)
}
