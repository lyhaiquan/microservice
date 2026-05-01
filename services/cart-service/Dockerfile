FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY services/common ./services/common
COPY services/cart-service ./services/cart-service
EXPOSE 5002
CMD ["node", "services/cart-service/src/server.js"]
