FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY services/common ./services/common
COPY services/payment-service ./services/payment-service
EXPOSE 5004
CMD ["node", "services/payment-service/src/server.js"]
