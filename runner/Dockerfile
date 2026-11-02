# The cloud runner, built from the whole repo because it runs the app's own agent and tool code. Build it from the repo
# root: Railway does that with railway.json there. No key is baked in: every one comes from the environment.
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# The runner never starts Electron, so its binary and the app's install scripts are skipped.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY src ./src
COPY runner ./runner
RUN pnpm run runner:build
ENV NODE_ENV=production
CMD ["node", "runner/dist/index.cjs"]
