# build.ps1
# Builds TaskNotes, injects the sovf-extension, and copies artifacts into the Obsidian vault.
#
# Usage:  .\build.ps1 [-CopyOnly] [-SkipInstall] [-NoInject]

param([switch]$CopyOnly, [switch]$SkipInstall, [switch]$NoInject)

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

    # --- 3. Compile sovf-extension.ts and inline it into main.js ---
    if (-not $NoInject) {
        Write-Step "Compiling sovf-extension and injecting into main.js ..."
        $extSource = Join-Path $ProjectRoot "src\sovf-extension.ts"
        if (Test-Path $extSource) {
            node -e @'
const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

async function main() {
    // Compile the extension as a plain script (no module wrapper).
    // The extension has zero imports, so esbuild produces a self-contained
    // IIFE that only references the global `SovfExt` export.
    const result = await esbuild.buildSync({
        entryPoints: ["src/sovf-extension.ts"],
        bundle: true,
        format: "iife",
        platform: "browser",
        target: "es2018",
        external: [],
        write: false,
        minify: true,
        globalName: "SovfExt",
    });
    const extCode = result.outputFiles[0].text;

    // Activation hook: patch the plugin class onload to call SovfExt.activateSovfExtension.
    // The esbuild CJS bundle sets module.exports early in the file (around byte 4.69M).
    // The hook is appended at the end of main.js so module.exports is already populated.
    //
    // CRITICAL: This hook must NOT use require() for Node builtins (fs, os, path)
    // because Obsidian's renderer does not expose Node's require to plugins.
    // All diagnostics use console only.
    // The entire hook body is wrapped in try/catch so it can NEVER crash plugin load.
    const hookCode = `\n// --- Sovf Extension: auto-activate after plugin load (injected by build.ps1) ---\n;(function(){try{var M=module.exports;if(!M)return;var P=M;var _hint=M.default;if(typeof _hint===\'function\'&&_hint.length===0){P=_hint();}else if(_hint){P=_hint;}if(typeof P!==\'function\'||!P.prototype||!P.prototype.onload){console.warn(\'[sovf-ext] skipped: no onload found, P type=\'+typeof P+\', has default=\'+(M.default!==undefined));return;}var _origOnload=P.prototype.onload;P.prototype.onload=function(){var self=this;var r=_origOnload.apply(self,arguments);function h(){try{if(typeof SovfExt!==\'undefined\'&&SovfExt.activateSovfExtension){SovfExt.activateSovfExtension(self);console.log(\'[sovf-ext] ACTIVATED, plugin.id=\'+self.id);}else{console.warn(\'[sovf-ext] SovfExt global not found, activation skipped\');}}catch(e){console.warn(\'[sovf-ext] activation failed:\',e&&e.message||e);}}if(r&&typeof r.then===\'function\'){r.then(h,h);}else{h();}return r;};console.log(\'[sovf-ext] hook installed on '\+(P.name||\'TaskNotesPlugin\')+\'\');}catch(_e){console.warn(\'[sovf-ext] hook install failed:\',_e&&_e.message||_e);}})();\n`;

    const mainJsPath = path.join(".", "main.js");
    let mainContent = fs.readFileSync(mainJsPath, "utf8");

    // Strip old injection to avoid duplicates
    if (mainContent.includes("SovfExt.activateSovfExtension")) {
        const idx = mainContent.indexOf("// --- Sovf Extension");
        if (idx > 0) mainContent = mainContent.substring(0, idx);
    }

    mainContent += "\n// --- Sovf Extension (injected by build.ps1) ---\n" + extCode + hookCode;
    fs.writeFileSync(mainJsPath, mainContent);
    console.log("Injected sovf-extension into main.js (+" + (extCode.length + hookCode.length) + " bytes)");
}

main().catch(function(e) { console.error(e); process.exit(1); });
'@
        if ($LASTEXITCODE -ne 0) { throw "Failed to compile/inject sovf-extension" }
    } else {
        Write-Host "  src/sovf-extension.ts not found, skipping" -ForegroundColor Yellow
    }
    } else {
        Write-Step "Skipping sovf-extension injection (-NoInject)"
    }
}

# --- 4. Verify build artifacts exist in the project root ---
foreach ($f in $Artifacts) {
    $p = Join-Path $ProjectRoot $f
    if (-not (Test-Path $p)) {
        throw "Required artifact '$f' not found in $ProjectRoot. Did the build run successfully?"
    }
}

# --- 5. Copy artifacts into the Obsidian vault plugins folder ---
Write-Step "Copying artifacts to $PluginDir ..."
New-Item -ItemType Directory -Force -Path $PluginDir | Out-Null
foreach ($f in $Artifacts) {
    Copy-Item -Force (Join-Path $ProjectRoot $f) (Join-Path $PluginDir $f)
    Write-Host "  copied $f"
}

Write-Host ""
Write-Host "Done. Restart (or reload) Obsidian to pick up the plugin in '$($VaultPluginsDir)'." -ForegroundColor Green