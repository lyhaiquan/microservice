FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY services/common ./services/common
COPY services/order-service ./services/order-service
EXPOSE 5003
CMD ["node", "services/order-service/src/server.js"]
