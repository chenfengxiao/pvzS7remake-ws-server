FROM node:22-alpine

WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/server.js ./

ENV HOST=0.0.0.0
EXPOSE 3000

CMD ["npm", "start"]
