FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY services/common ./services/common
COPY services/notification-service ./services/notification-service
CMD ["node", "services/notification-service/src/server.js"]
