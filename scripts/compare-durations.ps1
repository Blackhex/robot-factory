param([string]$base, [string]$new)

function Flatten($suites, $parent='') {
  $out = @()
  foreach ($s in $suites) {
    $title = if ($parent) { "$parent > $($s.title)" } else { $s.title }
    if ($s.specs) {
      foreach ($spec in $s.specs) {
        foreach ($t in $spec.tests) {
          foreach ($r in $t.results) {
            $out += [PSCustomObject]@{ title="$title > $($spec.title)"; dur=$r.duration }
          }
        }
      }
    }
    if ($s.suites) { $out += Flatten $s.suites $title }
  }
  $out
}

$b = (Get-Content $base -Raw | ConvertFrom-Json).suites
$n = (Get-Content $new  -Raw | ConvertFrom-Json).suites
$bf = Flatten $b | Group-Object title | ForEach-Object { [PSCustomObject]@{ title=$_.Name; dur=($_.Group | Measure-Object dur -Sum).Sum } }
$nf = Flatten $n | Group-Object title | ForEach-Object { [PSCustomObject]@{ title=$_.Name; dur=($_.Group | Measure-Object dur -Sum).Sum } }
$bMap = @{}
$bf | ForEach-Object { $bMap[$_.title] = $_.dur }
$diffs = $nf | ForEach-Object {
  if ($bMap.ContainsKey($_.title)) {
    [PSCustomObject]@{ delta=[int]($_.dur - $bMap[$_.title]); base=[int]$bMap[$_.title]; new=[int]$_.dur; title=$_.title }
  }
}
$diffs | Sort-Object delta -Descending | Select-Object -First 30 | ForEach-Object {
  $t = ($_.title -replace '\s+',' ')
  if ($t.Length -gt 120) { $t = $t.Substring(0,120) }
  "{0,6}  base={1,5}  new={2,5}  {3}" -f $_.delta, $_.base, $_.new, $t
}
