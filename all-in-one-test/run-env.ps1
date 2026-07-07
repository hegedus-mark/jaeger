# PowerShell script to set up and run the Jaeger V2 + Elasticsearch + HotROD environment.
# Run this script from the workspace root or the all-in-one-test folder.

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if ($null -eq $ScriptDir) { $ScriptDir = Get-Location }
$ProjectRoot = (Get-Item $ScriptDir).Parent.FullName

# Change to project root directory
Push-Location $ProjectRoot

Write-Host "=============================================" -ForegroundColor Green
Write-Host "Jaeger V2 All-in-One Test Environment Setup" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

# 1. Check Docker status
Write-Host "`nChecking Docker status..." -ForegroundColor Cyan
docker info >$null 2>&1
if ($LastExitCode -ne 0) {
    Write-Error "Docker is not running. Please start Docker Desktop and try again."
    Pop-Location
    Exit 1
}
Write-Host "Docker is running!" -ForegroundColor Green

# 2. Build Jaeger UI
Write-Host "`nStep 1: Building UI assets..." -ForegroundColor Cyan
if (Test-Path "jaeger-ui") {
    Push-Location jaeger-ui
    Write-Host "Running 'npm ci'..." -ForegroundColor Gray
    npm ci
    if ($LastExitCode -ne 0) {
        Write-Error "npm ci failed in jaeger-ui. Please verify node version (default v26)."
        Pop-Location; Pop-Location; Exit 1
    }
    
    cd packages/jaeger-ui
    Write-Host "Running 'vite build' directly..." -ForegroundColor Gray
    $env:NODE_ENV = "production"
    $Version = node ../../scripts/get-tracking-version.js
    $env:REACT_APP_VSN_STATE = $Version.Trim()
    
    npx vite build
    $ViteExitCode = $LastExitCode
    
    Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue
    Remove-Item Env:\REACT_APP_VSN_STATE -ErrorAction SilentlyContinue
    
    if ($ViteExitCode -ne 0) {
        Write-Error "vite build failed inside jaeger-ui."
        Pop-Location; Pop-Location; Exit 1
    }
    Pop-Location
    
    # Copy build files to Go embedding actual folder
    Write-Host "Copying built UI assets into Go embedding directory..." -ForegroundColor Gray
    $ActualUIDir = "cmd/jaeger/internal/extension/jaegerquery/internal/ui/actual"
    Remove-Item -Recurse -Force "$ActualUIDir/*" -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $ActualUIDir -Force | Out-Null
    Copy-Item -Path "jaeger-ui/packages/jaeger-ui/build/*" -Destination $ActualUIDir -Recurse -Force
    Write-Host "UI built and embedded successfully!" -ForegroundColor Green
} else {
    Write-Warning "jaeger-ui directory not found! Query UI will fallback to placeholder index.html."
}

# 3. Cross-Compile Go binaries for Linux (Docker Container compatibility)
Write-Host "`nStep 2: Cross-compiling Go binaries for Linux container..." -ForegroundColor Cyan

# Jaeger Backend
Write-Host "Compiling jaeger-linux..." -ForegroundColor Gray
$env:GOOS="linux"
$env:CGO_ENABLED="0"
go build -o all-in-one-test/jaeger-linux ./cmd/jaeger
if ($LastExitCode -ne 0) {
    Write-Error "Failed to compile Jaeger for Linux."
    $env:GOOS=""
    $env:CGO_ENABLED=""
    Pop-Location; Exit 1
}

# HotROD Microservice
Write-Host "Compiling hotrod-linux..." -ForegroundColor Gray
go build -o all-in-one-test/hotrod-linux ./examples/hotrod/main.go
if ($LastExitCode -ne 0) {
    Write-Error "Failed to compile HotROD for Linux."
    $env:GOOS=""
    $env:CGO_ENABLED=""
    Pop-Location; Exit 1
}

# Reset env variables
Remove-Item Env:\GOOS
Remove-Item Env:\CGO_ENABLED
Write-Host "Linux Binaries compiled successfully!" -ForegroundColor Green

# 4. Run Docker Compose
Write-Host "`nStep 3: Starting Docker Compose services (Elasticsearch, Jaeger backend, HotROD)..." -ForegroundColor Cyan
cd all-in-one-test
docker compose down -v --remove-orphans >$null 2>&1
docker compose up -d

if ($LastExitCode -ne 0) {
    Write-Error "Docker Compose failed to start the services."
    Pop-Location; Exit 1
}

Write-Host "`nSetup Complete!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host "Access Links:" -ForegroundColor Cyan
Write-Host "---------------------------------------------" -ForegroundColor Gray
Write-Host "* Jaeger UI (Traces and Query): http://localhost:16686" -ForegroundColor Yellow
Write-Host "* HotROD App (Generate Spans):  http://localhost:8080" -ForegroundColor Yellow
Write-Host "* Elasticsearch API:            http://localhost:9200" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Green
Write-Host "`nInfo: Open HotROD (http://localhost:8080) and click around to generate traces."
Write-Host "Then open Jaeger UI (http://localhost:16686) to find and inspect them!"
Write-Host "To stop the environment, run: docker compose down -v`n"

Pop-Location
