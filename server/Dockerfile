# VMOA 백엔드 (Fly.io 배포용)
FROM node:24-alpine

WORKDIR /app

# 의존성 먼저 설치 (레이어 캐시). tsx는 dependencies에 있어 프로덕션에서도 실행됨.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 소스 복사
COPY . .

ENV NODE_ENV=production
# fly.toml 의 internal_port 와 맞춤
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
