FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY services/common ./services/common
RUN npm install --omit=dev
COPY services/notification-service ./services/notification-service
CMD ["node", "services/notification-service/src/server.js"]
