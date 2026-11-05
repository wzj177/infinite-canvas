# 构建 Vite 前端产物。
FROM oven/bun:1.3.13 AS web-build

# 可选的 bun install 附加参数，例如国内服务器走镜像源：
# docker build --build-arg BUN_INSTALL_ARGS="--registry https://registry.npmmirror.com" .
ARG BUN_INSTALL_ARGS=""
WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --cache-dir=/root/.bun/install/cache $BUN_INSTALL_ARGS
COPY VERSION /app/VERSION
COPY CHANGELOG.md /app/CHANGELOG.md
COPY web ./
RUN bun run build

# 运行镜像：只启动静态前端，AI 请求由浏览器前台直连用户自己的接口。
FROM nginx:1.27-alpine

COPY --from=web-build /app/web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY web/docker-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

EXPOSE 3000
