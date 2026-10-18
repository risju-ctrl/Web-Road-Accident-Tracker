# apply-fix.ps1
# Applies reports-buttons-fix.patch to this repo.
# Put this file and reports-buttons-fix.patch in the repo root, then run:
#   powershell -ExecutionPolicy Bypass -File .\apply-fix.ps1

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$patch = Join-Path $PSScriptRoot 'reports-buttons-fix.patch'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host 'Git is not installed or not on PATH. Install it from https://git-scm.com and try again.' -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $patch)) {
    Write-Host 'Could not find reports-buttons-fix.patch next to this script.' -ForegroundColor Red
    Write-Host "Expected it at: $patch"
    exit 1
}

if (-not (Test-Path (Join-Path $PSScriptRoot 'Web Road Accident Reporting System'))) {
    Write-Host 'Run this from the repo root (the folder that contains "Web Road Accident Reporting System").' -ForegroundColor Red
    exit 1
}

# Try a plain apply first, then retry ignoring line-ending differences (common on Windows).
$flags = @()
git apply --check $patch 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Plain check failed, retrying and ignoring whitespace/line endings...' -ForegroundColor Yellow
    $flags = @('--ignore-whitespace', '--whitespace=nowarn')
    git apply --check @flags $patch
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host 'The patch does not match your files (they may have been edited since).' -ForegroundColor Red
        Write-Host 'Use reports-buttons-fix-files.zip instead and replace the files.'
        exit 1
    }
}

git apply @flags $patch
if ($LASTEXITCODE -ne 0) {
    Write-Host 'git apply failed.' -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host 'Patch applied. Changed files:' -ForegroundColor Green
git status --short
Write-Host ''
Write-Host 'Next: restart the client (cd "Web Road Accident Reporting System\client"; npm run dev).'
Write-Host 'You can now delete reports-buttons-fix.patch and this script.'
