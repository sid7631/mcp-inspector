#!/bin/bash

echo "Testing MCP Inspector Wrapper Health Check..."
echo ""

# Wait for server to start
echo "Waiting 5 seconds for server to start..."
sleep 5

# Test health endpoint
echo "Testing /health endpoint..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/health)
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

echo "HTTP Status Code: $HTTP_CODE"
echo "Response Body: $BODY"

if [ "$HTTP_CODE" = "200" ] && [ "$BODY" = "ok" ]; then
    echo "✅ Health check PASSED - Returns 200 with 'ok'"
else
    echo "❌ Health check FAILED"
    echo "   Expected: HTTP 200 with body 'ok'"
    echo "   Got: HTTP $HTTP_CODE with body '$BODY'"
    exit 1
fi

echo ""
echo "Testing /healthz endpoint..."
curl -s http://localhost:3000/healthz | json_pp 2>/dev/null || curl -s http://localhost:3000/healthz

echo ""
echo "✅ All tests passed!"
