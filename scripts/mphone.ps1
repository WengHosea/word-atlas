param([string]$PhonePath = '内部存储')
$ErrorActionPreference = 'Continue'
$shell = New-Object -ComObject Shell.Application
$pc = $shell.Namespace(17)
$dev = $pc.Items() | Where-Object { $_.Name -eq '荣耀畅玩60A' }
if (-not $dev) { Write-Output 'phone not found'; exit 1 }
$cur = $dev.GetFolder
foreach ($seg in ($PhonePath -split '/')) {
  if (-not $seg) { continue }
  $m = @($cur.Items() | Where-Object { $_.Name -eq $seg })
  if ($m.Count -eq 0) { Write-Output "missing: $seg"; exit 1 }
  $cur = $m[0].GetFolder
}
foreach ($i in $cur.Items()) {
  $s = $i.ExtendedProperty('System.Size')
  $t = $i.ExtendedProperty('System.ItemType')
  Write-Output ("{0,-45} {1,14} [{2}]" -f $i.Name, $s, $t)
}
