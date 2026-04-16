FROM node:20-alpine

WORKDIR /app

# 1. Cài đặt các thành phần dùng chung (common)
COPY services/common ./services/common
WORKDIR /app/services/common
RUN npm install --production

# 2. Cài đặt các thành phần của order-service
WORKDIR /app
COPY services/order-service ./services/order-service
WORKDIR /app/services/order-service

# Cài đặt dependency (với link local sang common đã copy ở bước trên)
RUN npm install --production

# 3. Khởi chạy
EXPOSE 5003
CMD ["npm", "start"]
