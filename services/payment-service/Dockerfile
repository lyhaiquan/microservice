FROM node:22-alpine

WORKDIR /app

# Copy the shared package
COPY services/common ./services/common

# Copy the service specific files
COPY services/payment-service ./services/payment-service

# Navigate to common and install dependencies
WORKDIR /app/services/common
RUN npm install --omit=dev

# Navigate to service directory and install dependencies
WORKDIR /app/services/payment-service
RUN npm install --omit=dev

# Expose the service port
EXPOSE 5004

# Run the application
CMD ["npm", "start"]
