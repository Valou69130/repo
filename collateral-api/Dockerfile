FROM node:22-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Persist the SQLite database outside the container
VOLUME ["/app/data"]
ENV COLLATERAL_DB_PATH=/app/data/collateral.db

EXPOSE 3001

CMD ["node", "src/index.js"]
