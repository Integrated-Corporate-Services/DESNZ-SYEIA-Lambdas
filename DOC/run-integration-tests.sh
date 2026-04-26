#!/bin/bash
# ===================================================================
# Integration Testing Runner - Bash
# ===================================================================
# Starts all services, runs integration tests, and displays results
# 
# Usage:
#   chmod +x run-integration-tests.sh
#   ./run-integration-tests.sh
# ===================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║         Integration Testing Suite - Setup                 ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ===================================================================
# Step 1: Check Prerequisites
# ===================================================================
echo -e "${CYAN}📋 Step 1: Checking prerequisites...${NC}"

# Check Docker
if command -v docker &> /dev/null; then
    echo -e "${GREEN}  ✅ Docker is installed${NC}"
else
    echo -e "${RED}  ❌ Docker is not installed${NC}"
    exit 1
fi

# Check Docker Compose
if command -v docker-compose &> /dev/null; then
    echo -e "${GREEN}  ✅ Docker Compose is installed${NC}"
else
    echo -e "${RED}  ❌ Docker Compose is not installed${NC}"
    exit 1
fi

# Check Node.js
if command -v node &> /dev/null; then
    echo -e "${GREEN}  ✅ Node.js is installed${NC}"
else
    echo -e "${RED}  ❌ Node.js is not installed${NC}"
    exit 1
fi

# Check pg module
if npm list pg --depth=0 &> /dev/null; then
    echo -e "${GREEN}  ✅ PostgreSQL client (pg) is available${NC}"
else
    echo -e "${YELLOW}  ⚠️  Installing pg module...${NC}"
    npm install pg
fi

echo ""

# ===================================================================
# Step 2: Clean up existing containers
# ===================================================================
echo -e "${CYAN}🧹 Step 2: Cleaning up existing containers...${NC}"

docker-compose -f docker-compose.integration.yml down -v &> /dev/null || true
echo -e "${GREEN}  ✅ Cleaned up existing containers${NC}"

echo ""

# ===================================================================
# Step 3: Build and start services
# ===================================================================
echo -e "${CYAN}🚀 Step 3: Building and starting services...${NC}"
echo -e "${CYAN}  This may take a few minutes on first run...${NC}"
echo ""

docker-compose -f docker-compose.integration.yml up -d --build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}  ✅ Services started${NC}"
else
    echo -e "${RED}❌ Failed to start services${NC}"
    exit 1
fi

echo ""

# ===================================================================
# Step 4: Wait for services to be healthy
# ===================================================================
echo -e "${CYAN}⏳ Step 4: Waiting for services to be healthy...${NC}"
echo -e "${CYAN}  This may take 30-60 seconds...${NC}"
echo ""

MAX_WAIT=120
ELAPSED=0
ALL_HEALTHY=false

while [ $ELAPSED -lt $MAX_WAIT ]; do
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    
    # Check if all services are running
    UNHEALTHY=$(docker-compose -f docker-compose.integration.yml ps | grep -v "Up" | grep -v "Name" | grep -v "---" | wc -l)
    
    if [ $UNHEALTHY -eq 0 ]; then
        ALL_HEALTHY=true
        break
    fi
    
    echo -e "  ⏳ Waiting... ($ELAPSED seconds)"
done

if [ "$ALL_HEALTHY" = false ]; then
    echo -e "${RED}❌ Services failed to become healthy within $MAX_WAIT seconds${NC}"
    echo -e "${CYAN}Checking service logs...${NC}"
    docker-compose -f docker-compose.integration.yml logs --tail=50
    exit 1
fi

echo -e "${GREEN}  ✅ All services are healthy${NC}"
echo ""

# ===================================================================
# Step 5: Display service status
# ===================================================================
echo -e "${CYAN}📊 Step 5: Service Status${NC}"
echo ""

docker-compose -f docker-compose.integration.yml ps

echo ""

# ===================================================================
# Step 6: Run integration tests
# ===================================================================
echo -e "${CYAN}🧪 Step 6: Running integration tests...${NC}"
echo ""

node integration-test.mjs
TEST_EXIT_CODE=$?

echo ""

# ===================================================================
# Step 7: Display logs if tests failed
# ===================================================================
if [ $TEST_EXIT_CODE -ne 0 ]; then
    echo -e "${RED}❌ Integration tests failed!${NC}"
    echo ""
    echo -e "${CYAN}📋 Recent logs from services:${NC}"
    echo ""
    
    echo -e "${CYAN}--- Inbound Receiver Logs ---${NC}"
    docker-compose -f docker-compose.integration.yml logs --tail=30 inbound-receiver
    
    echo -e "${CYAN}--- Payment Processor Logs ---${NC}"
    docker-compose -f docker-compose.integration.yml logs --tail=30 payment-processor
    
    echo -e "${CYAN}--- LocalStack Logs ---${NC}"
    docker-compose -f docker-compose.integration.yml logs --tail=20 localstack
fi

echo ""

# ===================================================================
# Step 8: Cleanup info
# ===================================================================
echo -e "${CYAN}🧹 Cleanup Options:${NC}"
echo "  To keep services running:  (press Enter)"
echo "  To stop and remove:        docker-compose -f docker-compose.integration.yml down -v"
echo ""

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║            Integration Tests Completed Successfully        ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo -e "${CYAN}Services are still running. Access them at:${NC}"
    echo -e "${CYAN}  • Inbound Receiver:    http://localhost:3000${NC}"
    echo -e "${CYAN}  • PostgreSQL:          localhost:5433${NC}"
    echo -e "${CYAN}  • LocalStack:          http://localhost:4566${NC}"
    echo ""
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║              Integration Tests Failed                      ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${RED}❌ Some tests failed. Check logs above for details.${NC}"
    echo ""
fi

exit $TEST_EXIT_CODE
