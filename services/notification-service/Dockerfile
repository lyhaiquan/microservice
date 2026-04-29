FROM node:22-alpine

WORKDIR /app

# Copy the shared package
COPY services/common ./services/common

# Copy the service specific files
COPY services/notification-service ./services/notification-service

# Navigate to common and install dependencies
WORKDIR /app/services/common
RUN npm install --omit=dev

# Navigate to service directory and install dependencies
WORKDIR /app/services/notification-service
RUN npm install --omit=dev

# No EXPOSE needed as it's a worker service

# Run the application
CMD ["npm", "start"]
