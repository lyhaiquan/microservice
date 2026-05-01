FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY services/common ./services/common
RUN npm install --omit=dev
COPY services/auth-service ./services/auth-service
EXPOSE 5050
CMD ["node", "services/auth-service/src/server.js"]
