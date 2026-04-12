#!/bin/bash

# Fix MongoDB port to 27011 (single node RS)
echo "Fixing MongoDB port configuration..."
node update-mongo-port.js

# Kill any lingering Node processes
echo "Cleaning up old processes..."
taskkill //F //IM node.exe 2>/dev/null || true
sleep 2

echo "Starting microservices..."

cd ../services/auth-service && node src/server.js &
PID1=$!

cd ../services/product-service && node src/server.js &
PID2=$!

cd ../services/cart-service && node src/server.js &
PID3=$!

cd ../services/order-service && node src/server.js &
PID4=$!

cd ../services/payment-service && node src/server.js &
PID5=$!

# Wait for services + Kafka consumer groups to be ready
# Kafka consumers typically take 25-30s to join their groups
echo "Waiting 40 seconds for all services and Kafka consumers to initialize..."
sleep 40

# Run the E2E test
echo "Starting E2E test..."
node final-check.js

# Cleanup
echo "Killing background microservices..."
kill $PID1 $PID2 $PID3 $PID4 $PID5 2>/dev/null
