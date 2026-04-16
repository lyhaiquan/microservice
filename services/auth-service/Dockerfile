FROM node:20-alpine

WORKDIR /app

# 1. Cài đặt các thành phần dùng chung (common)
COPY services/common ./services/common
WORKDIR /app/services/common
RUN npm install --production

# 2. Cài đặt các thành phần của auth-service
WORKDIR /app
COPY services/auth-service ./services/auth-service
WORKDIR /app/services/auth-service

# Cài đặt dependency (với link local sang common đã copy ở bước trên)
RUN npm install --production

# 3. Khởi chạy
EXPOSE 5050
CMD ["npm", "start"]
