FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/

EXPOSE 8080

CMD ["sh", "-c", "node src/index.js --port 8080 --domain ${RELAY_DOMAIN}"]
