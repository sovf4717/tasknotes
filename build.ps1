# build.ps1
# Builds TaskNotes and copies the build artifacts into the Obsidian vault.
#
# Usage:  .\build.ps1 [-CopyOnly] [-SkipInstall]

param([switch]$CopyOnly, [switch]$SkipInstall)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$VaultPluginsDir = "C:\Users\sovf\Documents\Obsidian Vault\.obsidian\plugins"
$PluginName = "tasknotes"
$PluginDir = Join-Path $VaultPluginsDir $PluginName
$Artifacts = @("main.js", "styles.css", "manifest.json")

Set-Location $ProjectRoot

function Write-Step($Message) {
    Write-Host ""; Write-Host ">> $Message" -ForegroundColor Cyan
}

if (-not $CopyOnly) {
    # --- 1. Install dependencies (only when node_modules is missing) ---
    if ((-not $SkipInstall) -and -not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
        Write-Step "Installing npm dependencies..."
        npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE" }
    }

    # --- 2. Build (build-css + release-notes import + typecheck + esbuild) ---
    Write-Step "Running production build (npm run build)..."
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed with exit code $LASTEXITCODE" }
}

# --- 3. Verify build artifacts exist in the project root ---
foreach ($f in $Artifacts) {
    $p = Join-Path $ProjectRoot $f
    if (-not (Test-Path $p)) {
        throw "Required artifact '$f' not found in $ProjectRoot — did the build run successfully?"
    }
}

# --- 4. Copy artifacts into the Obsidian vault plugins folder ---
Write-Step "Copying artifacts to $PluginDir ..."
New-Item -ItemType Directory -Force -Path $PluginDir | Out-Null
foreach ($f in $Artifacts) {
    Copy-Item -Force (Join-Path $ProjectRoot $f) (Join-Path $PluginDir $f)
    Write-Host "  copied $f"
}

Write-Host ""
Write-Host "Done. Restart (or reload) Obsidian to pick up the plugin in '$VaultPluginsDir'." -ForegroundColor Green
pwsh