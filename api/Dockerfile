# ------------------------------------------------------------------------------
# 构建参数
# ------------------------------------------------------------------------------
ARG BASE_GOLANG=golang:1.25.6-alpine
ARG BASE_RUNTIME=gcr.io/distroless/static-debian12:nonroot

# ------------------------------------------------------------------------------
# 阶段 1：编译 Go 静态二进制
# ------------------------------------------------------------------------------
FROM ${BASE_GOLANG} AS builder
ENV CGO_ENABLED=0 GOOS=linux GOTOOLCHAIN=local
ARG TARGETARCH=amd64
ARG TARGETOS=linux
# 国内构建时可覆盖：--build-arg GOPROXY=https://goproxy.cn,direct
ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GOPROXY}
# 仅用于把时区数据拷入最终镜像（Asia/Shanghai 等）
RUN apk add --no-cache tzdata
WORKDIR /build/api
COPY api/go.mod api/go.sum ./
RUN go mod download
COPY api/ ./
ARG BUILD_VERSION=dev
RUN GOARCH=${TARGETARCH} GOOS=${TARGETOS} go build -trimpath \
    -ldflags="-s -w -X kube-bt-sync/common/core.BuildVersion=${BUILD_VERSION}" \
    -o kube-bt-sync .

# ------------------------------------------------------------------------------
# 阶段 2：最小运行时镜像（无 shell、无包管理器，攻击面小）
# ------------------------------------------------------------------------------
FROM ${BASE_RUNTIME}
WORKDIR /app
ENV TZ=Asia/Shanghai
# 供 Go time.LoadLocation 使用（日志/展示本地时区）
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /build/api/kube-bt-sync /app/kube-bt-sync
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/kube-bt-sync"]
