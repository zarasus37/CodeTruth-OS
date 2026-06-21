FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY packages ./packages
RUN npm ci
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
RUN npm run build -w @codetruth/core && \
    npm run build -w @codetruth/billing -w @codetruth/governance -w @codetruth/compliance -w @codetruth/parsing -w @codetruth/ingestion -w @codetruth/reconstruction -w @codetruth/spatial -w @codetruth/evaluation -w @codetruth/llm -w @codetruth/truth-council -w @codetruth/planning -w @codetruth/reports -w @codetruth/marketplace -w @codetruth/sovereign -w @codetruth/storage -w @codetruth/pipeline -w @codetruth/github && \
    npm run build -w @codetruth/cognition && \
    npm run build -w @codetruth/queue && \
    npm run build -w @codetruth/api

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages ./packages
RUN npm ci --omit=dev
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/web/public ./apps/web/public
EXPOSE 4310
CMD ["node", "apps/api/dist/index.js"]