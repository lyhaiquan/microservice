FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY services/common ./services/common
RUN npm install --omit=dev
COPY services/order-service ./services/order-service
EXPOSE 5003
CMD ["node", "services/order-service/src/server.js"]
