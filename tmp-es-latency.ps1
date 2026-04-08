try {
  $ErrorActionPreference='Stop'
  $envFile='.env'
  $user=(Get-Content $envFile | Where-Object { $_ -match '^ELASTICSEARCH_USERNAME=' } | Select-Object -First 1).Split('=')[1].Trim()
  $pass=(Get-Content $envFile | Where-Object { $_ -match '^ELASTICSEARCH_PASSWORD=' } | Select-Object -First 1).Split('=')[1].Trim()
  $node='http://52.175.247.13:9200'
  $index='products_detail_v1'
  $pair=[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$user`:$pass"))
  $headers=@{ Authorization = "Basic $pair"; 'Content-Type'='application/json' }
  $seed=Invoke-RestMethod -Method Get -Uri "$node/$index/_search?size=1" -Headers $headers -TimeoutSec 30
  $handle=$seed.hits.hits[0]._source.handle_lower
  if(-not $handle){ throw 'No sample handle_lower found for search latency test' }

  function Measure-Latency([scriptblock]$action,[int]$runs){
    $times=@()
    for($i=0;$i -lt $runs;$i++){
      $sw=[System.Diagnostics.Stopwatch]::StartNew()
      & $action | Out-Null
      $sw.Stop()
      $times += [double]$sw.ElapsedMilliseconds
    }
    $avg=[math]::Round((($times|Measure-Object -Average).Average),2)
    $min=[math]::Round((($times|Measure-Object -Minimum).Minimum),2)
    $max=[math]::Round((($times|Measure-Object -Maximum).Maximum),2)
    $sorted=$times|Sort-Object
    $p95Index=[math]::Ceiling(0.95*$sorted.Count)-1
    if($p95Index -lt 0){$p95Index=0}
    $p95=[math]::Round($sorted[$p95Index],2)
    [PSCustomObject]@{AvgMs=$avg;MinMs=$min;P95Ms=$p95;MaxMs=$max;Under100ms=($avg -lt 100 -and $p95 -lt 100)}
  }

  $runs=10
  $exists=Measure-Latency { Invoke-WebRequest -Method Head -Uri "$node/$index" -Headers $headers -TimeoutSec 30 } $runs
  $count=Measure-Latency { Invoke-RestMethod -Method Get -Uri "$node/$index/_count" -Headers $headers -TimeoutSec 30 } $runs
  $searchBody = '{"size":1,"query":{"term":{"handle_lower":"'+$handle+'"}}}'
  $search=Measure-Latency { Invoke-RestMethod -Method Post -Uri "$node/$index/_search" -Headers $headers -Body $searchBody -TimeoutSec 30 } $runs

  Write-Output "Sample handle_lower=$handle"
  [PSCustomObject]@{Check='HEAD index exists'; AvgMs=$exists.AvgMs; MinMs=$exists.MinMs; P95Ms=$exists.P95Ms; MaxMs=$exists.MaxMs; Under100ms=$exists.Under100ms},
  [PSCustomObject]@{Check='GET _count'; AvgMs=$count.AvgMs; MinMs=$count.MinMs; P95Ms=$count.P95Ms; MaxMs=$count.MaxMs; Under100ms=$count.Under100ms},
  [PSCustomObject]@{Check='POST term _search'; AvgMs=$search.AvgMs; MinMs=$search.MinMs; P95Ms=$search.P95Ms; MaxMs=$search.MaxMs; Under100ms=$search.Under100ms} | Format-Table -AutoSize
}
catch {
  Write-Output ('ERR: ' + $_.Exception.Message)
  if($_.Exception.StackTrace){ Write-Output $_.Exception.StackTrace }
  exit 1
}