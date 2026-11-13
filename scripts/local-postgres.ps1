# Manage a native (non-Docker) PostgreSQL server for local development on
# Windows without administrator rights.
#
#   powershell -File scripts/local-postgres.ps1 install   # download binaries + initdb
#   powershell -File scripts/local-postgres.ps1 start
#   powershell -File scripts/local-postgres.ps1 stop
#   powershell -File scripts/local-postgres.ps1 status
#
# Binaries come from the zonky "embedded-postgres-binaries" builds on Maven
# Central (official PostgreSQL builds packaged as a jar). The superuser is
# postgres/postgres and listens on localhost only - development use only.
# After `install` + `start`, run: pnpm --filter @byteringscms/api db:setup-local

param(
  [Parameter(Mandatory = $true)][ValidateSet('install', 'start', 'stop', 'status')][string]$Command,
  [string]$Version = '17.11.0',
  [int]$Port = 5432
)

$ErrorActionPreference = 'Stop'
$base = if ($env:BYTERINGS_PG_HOME) { $env:BYTERINGS_PG_HOME } else { Join-Path $env:LOCALAPPDATA 'byterings' }
$bin = Join-Path $base 'pgsql\bin'
$data = Join-Path $base 'pgdata'
$log = Join-Path $base 'pg.log'

switch ($Command) {
  'install' {
    if (Test-Path (Join-Path $bin 'postgres.exe')) { Write-Host "PostgreSQL already installed in $base"; break }
    New-Item -ItemType Directory -Force (Join-Path $base 'pgsql') | Out-Null
    $tmp = Join-Path $env:TEMP "byterings-pg-$Version"
    New-Item -ItemType Directory -Force $tmp | Out-Null
    $url = "https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/$Version/embedded-postgres-binaries-windows-amd64-$Version.jar"
    Write-Host "Downloading PostgreSQL $Version ..."
    Invoke-WebRequest $url -OutFile (Join-Path $tmp 'pg.zip')
    Expand-Archive (Join-Path $tmp 'pg.zip') -DestinationPath (Join-Path $tmp 'jar') -Force
    $txz = Get-ChildItem (Join-Path $tmp 'jar') -Recurse -Filter *.txz | Select-Object -First 1
    tar -xf $txz.FullName -C (Join-Path $base 'pgsql')
    $pw = Join-Path $tmp 'pw.txt'
    Set-Content -Path $pw -Value 'postgres' -NoNewline
    & (Join-Path $bin 'initdb.exe') -D $data -U postgres --pwfile=$pw -A scram-sha-256 -E UTF8 --locale=C | Out-Null
    Remove-Item -Recurse -Force $tmp
    Write-Host "Installed to $base. Run: scripts/local-postgres.ps1 start"
  }
  'start' {
    & (Join-Path $bin 'pg_ctl.exe') -D $data -l $log -o "-p $Port -c listen_addresses=localhost" -w start
  }
  'stop' {
    & (Join-Path $bin 'pg_ctl.exe') -D $data -m fast stop
  }
  'status' {
    & (Join-Path $bin 'pg_ctl.exe') -D $data status
  }
}
