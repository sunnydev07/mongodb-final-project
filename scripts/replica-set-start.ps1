$ErrorActionPreference = "Stop"

$base = Join-Path $PSScriptRoot "..\tmp\rs"
$nodes = @(
  @{ port = 28017; dir = "rs0" },
  @{ port = 28018; dir = "rs1" },
  @{ port = 28019; dir = "rs2" }
)

foreach ($node in $nodes) {
  $dataDir = Join-Path $base $node.dir
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

foreach ($node in $nodes) {
  $dataDir = Join-Path $base $node.dir
  Write-Host "Starting node on port $($node.port)..."
  Start-Process -FilePath "mongod" -ArgumentList @(
    "--replSet", "rs0",
    "--port", $node.port,
    "--dbpath", $dataDir,
    "--bind_ip", "127.0.0.1",
    "--oplogSize", "64"
  ) -WindowStyle Hidden
}

Write-Host ""
Write-Host "Replica set nodes started on ports 28017, 28018, 28019."
Write-Host "Now initialize with: mongosh --port 28017 scripts/replica-set-init.js"
