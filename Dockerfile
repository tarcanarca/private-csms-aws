# One Dockerfile for every deployable: docker build --build-arg APP=charging-control .
# APP is one of: ocpp-gateway | charging-control   (workers join in later phases)
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps apps
COPY packages packages
RUN npm ci --ignore-scripts
RUN npx tsc -b
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-alpine
ARG APP
ENV NODE_ENV=production APP=${APP}
WORKDIR /repo
COPY --from=build --chown=node:node /repo /repo
USER node
# exec so Node is PID 1's child-less process and receives SIGTERM (graceful drain on ECS stop)
CMD ["sh", "-c", "exec node apps/${APP}/dist/main.js"]
