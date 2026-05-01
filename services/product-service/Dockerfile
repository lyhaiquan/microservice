FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY services/common ./services/common
COPY services/product-service ./services/product-service
EXPOSE 5001
CMD ["node", "services/product-service/src/server.js"]
