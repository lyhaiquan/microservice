FROM node:20-alpine

WORKDIR /app

# 1. Cài đặt các thành phần dùng chung (common)
COPY services/common ./services/common
WORKDIR /app/services/common
RUN npm install --production

# 2. Cài đặt các thành phần của product-service
WORKDIR /app
COPY services/product-service ./services/product-service
WORKDIR /app/services/product-service

# Cài đặt dependency (với link local sang common đã copy ở bước trên)
RUN npm install --production

# 3. Khởi chạy
EXPOSE 5001
CMD ["npm", "start"]
