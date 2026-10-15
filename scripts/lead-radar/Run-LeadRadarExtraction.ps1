<#
.SYNOPSIS
  One command for the founder's Windows machine: prepares an isolated Python environment (first run only), runs the Lead Radar
  Overture extractor against a plan downloaded from GarageOS, and tells you exactly which two files to upload.

.DESCRIPTION
  Nationwide or provincial — the plan decides. It is restartable (re-run the same command after an interruption; finished shards are
  skipped) and deterministic (same plan + release = same files). It contacts only the public Overture bucket, holds no credentials
  and writes nothing to GarageOS: you upload manifest.json + records.ndjson on the run page.

.PARAMETER Plan
  Path to plan.json (Lead Radar -> Automation / Runs -> "Download plan").
.PARAMETER Out
  Output folder (default: .\lead-radar-out\<planHash first 12>).
.PARAMETER DryRun
  Only read Parquet footers and print the estimated workload.

.EXAMPLE
  .\scripts\lead-radar\Run-LeadRadarExtraction.ps1 -Plan $HOME\Downloads\plan.json
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Plan,
  [string]$Out,
  [switch]$DryRun
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path -LiteralPath $Plan)) { throw "Plan file not found: $Plan" }
$planObj = Get-Content -LiteralPath $Plan -Raw | ConvertFrom-Json
if ($planObj.planVersion -ne 1 -or -not $planObj.planHash) { throw "This does not look like a Lead Radar plan.json (planVersion 1 expected)." }
if (-not $Out) { $Out = Join-Path (Get-Location) ("lead-radar-out\" + $planObj.planHash.Substring(0, 12)) }

# Python 3.11+ (py launcher on Windows, python3/python elsewhere).
$py = $null
foreach ($c in @("py", "python3", "python")) { if (Get-Command $c -ErrorAction SilentlyContinue) { $py = $c; break } }
if (-not $py) { throw "Python 3.11+ is required (https://www.python.org/downloads/). Re-open PowerShell after installing." }
$pyArgs = @(); if ($py -eq "py") { $pyArgs = @("-3") }

# Isolated virtual environment next to the repo, created once.
$venv = Join-Path $here ".venv"
$venvPy = if ($IsWindows -or $env:OS -eq "Windows_NT") { Join-Path $venv "Scripts\python.exe" } else { Join-Path $venv "bin/python" }
if (-not (Test-Path -LiteralPath $venvPy)) {
  Write-Host "Creating the Python environment (first run only)..."
  & $py @pyArgs -m venv $venv
  & $venvPy -m pip install --quiet --disable-pip-version-check -r (Join-Path $here "requirements.txt")
}

New-Item -ItemType Directory -Force -Path $Out | Out-Null
$extractor = Join-Path $here "overture_extract.py"
$argsList = @($extractor, "--plan", $Plan, "--out", $Out)
if ($DryRun) { $argsList += "--dry-run" }
Write-Host ("Plan {0} · provinces: {1} · release: {2}" -f $planObj.planHash.Substring(0, 12), ($planObj.provinces -join ", "), $planObj.release)
& $venvPy @argsList
if ($LASTEXITCODE -ne 0) { throw "The extractor stopped (exit code $LASTEXITCODE). Run the same command again to resume." }

if (-not $DryRun) {
  $m = Join-Path $Out "manifest.json"; $r = Join-Path $Out "records.ndjson"
  if (-not (Test-Path -LiteralPath $m) -or -not (Test-Path -LiteralPath $r)) { throw "Expected manifest.json and records.ndjson in $Out" }
  $mj = Get-Content -LiteralPath $m -Raw | ConvertFrom-Json
  Write-Host ""
  Write-Host ("Done: {0:N0} records, release {1}." -f $mj.recordCount, $mj.release) -ForegroundColor Green
  Write-Host "Upload these two files on the run page in GarageOS (Lead Radar -> Runs -> your run -> Upload extraction):"
  Write-Host "  $m"; Write-Host "  $r"
  Write-Host "After the upload completes, the automation (if on) qualifies, imports and assigns by the active policy; you only review the exceptions."
}
