# Integration Testing Runner - PowerShell
# Starts all services, runs integration tests, and displays results

$ErrorActionPreference = "Stop"

# Colors
function Write-Info { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Err { param($msg) Write-Host $msg -ForegroundColor Red }
function Write-Warn { param($msg) Write-Host $msg -ForegroundColor Yellow }

Write-Host ""
Write-Info "╔════════════════════════════════════════════════════════════╗"
Write-Info "║         Integration Testing Suite - Setup                 ║"
Write-Info "╚════════════════════════════════════════════════════════════╝"
Write-Host ""

Write-Info "📋 Step 1: Checking prerequisites..."

# Check Docker
try {
    docker --version | Out-Null
    Write-Success "  ✅ Docker is installed"
} catch {
    Write-Err "  ❌ Docker is not installed or not in PATH"
    exit 1
}

# Check Docker Compose
try {
    docker-compose --version | Out-Null
    Write-Success "  ✅ Docker Compose is installed"
} catch {
    Write-Err "  ❌ Docker Compose is not installed"
    exit 1
}

# Check Node.js
try {
    node --version | Out-Null
    Write-Success "  ✅ Node.js is installed"
} catch {
    Write-Err "  ❌ Node.js is not installed"
    exit 1
}

# Check pg module
try {
    npm list pg --depth=0 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "  ⚠️  Installing pg module..."
        npm install pg
    }
    Write-Success "  ✅ PostgreSQL client (pg) is available"
} catch {
    Write-Warn "  ⚠️  Installing pg module..."
    npm install pg
}

Write-Host ""

Write-Info "🧹 Step 2: Cleaning up existing containers..."
docker-compose -f docker-compose.integration.yml down -v 2>&1 | Out-Null
Write-Success "  ✅ Cleaned up existing containers"
Write-Host ""

Write-Info "🚀 Step 3: Building and starting services..."
Write-Info "  This may take a few minutes on first run..."
Write-Host ""

docker-compose -f docker-compose.integration.yml up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Err "❌ Failed to start services"
    exit 1
}

Write-Success "  ✅ Services started"
Write-Host ""

Write-Info "⏳ Step 4: Waiting for services to be healthy..."
Write-Info "  This may take 30-60 seconds..."
Write-Host ""

$maxWait = 120
$elapsed = 0
$allHealthy = $false

while ($elapsed -lt $maxWait) {
    Start-Sleep -Seconds 5
    $elapsed += 5
    
    # Check container status
    $containers = docker-compose -f docker-compose.integration.yml ps --format json | ConvertFrom-Json
    $unhealthy = $containers | Where-Object { $_.State -ne "running" -and $_.State -ne "healthy" }
    
    if ($unhealthy.Count -eq 0) {
        $allHealthy = $true
        break
    }
    
    Write-Host "  ⏳ Waiting... ($elapsed seconds)" -ForegroundColor Gray
}

if (-not $allHealthy) {
    Write-Err "❌ Services failed to become healthy within $maxWait seconds"
    Write-Info "Checking service logs..."
    docker-compose -f docker-compose.integration.yml logs --tail=50
    exit 1
}

Write-Success "  ✅ All services are healthy"
Write-Host ""

Write-Info "📊 Step 5: Service Status"
Write-Host ""
docker-compose -f docker-compose.integration.yml ps
Write-Host ""

Write-Info "🧪 Step 6: Running integration tests..."
Write-Host ""

node integration-test.mjs
$testExitCode = $LASTEXITCODE

Write-Host ""

if ($testExitCode -ne 0) {
    Write-Err "❌ Integration tests failed!"
    Write-Host ""
    Write-Info "📋 Recent logs from services:"
    Write-Host ""
    
    Write-Info "--- Inbound Receiver Logs ---"
    docker-compose -f docker-compose.integration.yml logs --tail=30 inbound-receiver
    
    Write-Info "--- Payment Processor Logs ---"
    docker-compose -f docker-compose.integration.yml logs --tail=30 payment-processor
    
    Write-Info "--- LocalStack Logs ---"
    docker-compose -f docker-compose.integration.yml logs --tail=20 localstack
}

Write-Host ""
Write-Info "🧹 Cleanup Options:"
Write-Host "  To keep services running:  (press Enter)" -ForegroundColor Gray
Write-Host "  To stop and remove:        docker-compose -f docker-compose.integration.yml down -v" -ForegroundColor Gray
Write-Host ""

if ($testExitCode -eq 0) {
    Write-Success "╔════════════════════════════════════════════════════════════╗"
    Write-Success "║            Integration Tests Completed Successfully        ║"
    Write-Success "╚════════════════════════════════════════════════════════════╝"
    Write-Host ""
    Write-Success "✅ All tests passed!"
    Write-Host ""
    Write-Info "Services are still running. Access them at:"
    Write-Host "  • Inbound Receiver:    http://localhost:3000" -ForegroundColor Cyan
    Write-Host "  • PostgreSQL:          localhost:5433" -ForegroundColor Cyan
    Write-Host "  • LocalStack:          http://localhost:4566" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Err "╔════════════════════════════════════════════════════════════╗"
    Write-Err "║              Integration Tests Failed                      ║"
    Write-Err "╚════════════════════════════════════════════════════════════╝"
    Write-Host ""
    Write-Err "❌ Some tests failed. Check logs above for details."
    Write-Host ""
}

exit $testExitCode
