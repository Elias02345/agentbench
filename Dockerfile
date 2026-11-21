FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 AGENTBENCH_DATA_DIR=/data

RUN install -d -o node -g node -m 0700 /data
COPY package.json ./
COPY src/ ./src/
COPY public/ ./public/
COPY docker/bootstrap.mjs ./docker/bootstrap.mjs
RUN chmod -R a+rX /app

USER node
EXPOSE 4173
CMD ["node", "src/server.mjs"]
