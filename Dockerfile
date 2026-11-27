# GameWeld application image: API plus built web client, served by the API.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
RUN npm ci
COPY . .
RUN npm run build -w apps/web && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Where attachments go unless the environment says otherwise: a place `node` may write to.
ENV ATTACHMENTS_DIR=/data/attachments
# su-exec is how the entrypoint gives up root. The application's files stay root's, so the
# application, running as `node`, can read its own code and not change it.
RUN apk add --no-cache su-exec
COPY --from=build /app /app
RUN mkdir -p /data/attachments && chown node:node /data/attachments
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --retries=20 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# Hands a volume's files to `node` if they are not its own, then runs the command as `node`.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "run", "start", "-w", "apps/api"]
