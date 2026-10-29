$ErrorActionPreference = "Continue"

$ports = @(28017, 28018, 28019)

foreach ($port in $ports) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) {
    Write-Host "Stopping mongod on port $port (pid $($conn.OwningProcess))..."
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
  } else {
    Write-Host "No process listening on port $port."
  }
}

Write-Host "Replica set nodes stopped."
