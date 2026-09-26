FROM node:22-trixie-slim
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p models && node -e "fetch('https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf').then(async r=>{if(!r.ok)throw new Error(r.status);const b=Buffer.from(await r.arrayBuffer());require('fs').writeFileSync('models/qwen2.5-1.5b-instruct-q4_k_m.gguf',b);console.log(b.length)})"
ENV NODE_ENV=production
USER node
CMD ["node", "server.mjs"]
