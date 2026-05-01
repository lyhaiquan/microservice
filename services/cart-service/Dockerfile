FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY services/common ./services/common
RUN npm install --omit=dev
COPY services/cart-service ./services/cart-service
EXPOSE 5002
CMD ["node", "services/cart-service/src/server.js"]
