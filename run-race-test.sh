#!/bin/bash
echo "Starting microservices..."
(cd services/auth-service && node src/server.js > ../../auth.log 2>&1) &
PID1=$!
(cd services/product-service && node src/server.js > ../../product.log 2>&1) &
PID2=$!
(cd services/cart-service && node src/server.js > ../../cart.log 2>&1) &
PID3=$!
(cd services/order-service && node src/server.js > ../../order.log 2>&1) &
PID4=$!
(cd services/payment-service && node src/server.js > ../../payment.log 2>&1) &
PID5=$!

echo "Waiting for services to initialize (15s)..."
sleep 15

echo "Running race condition test..."
node scripts/race-condition-test.js

echo "Cleaning up..."
kill $PID1 $PID2 $PID3 $PID4 $PID5 2>/dev/null
echo "Done!"
