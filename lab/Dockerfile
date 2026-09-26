FROM node:22-trixie-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY . .
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
