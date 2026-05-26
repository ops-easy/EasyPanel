# ------------------------------------------------------------------------------
# 构建参数
# ------------------------------------------------------------------------------
ARG BASE_GOLANG=golang:1.25.6-alpine
ARG BASE_RUNTIME=gcr.io/distroless/static-debian12:nonroot
ARG BASE_ALPINE=alpine:3.20
ARG HELM_VERSION=v3.15.4

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
WORKDIR /build/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
ARG BUILD_VERSION=dev
RUN GOARCH=${TARGETARCH} GOOS=${TARGETOS} go build -trimpath \
    -ldflags="-s -w -X github.com/ops-easy/EasyPanel/backend/common/core.BuildVersion=${BUILD_VERSION}" \
    -o easypanel .

# ------------------------------------------------------------------------------
# 阶段 2：下载 Helm，供容器内 kube-prometheus-stack 渲染使用
# ------------------------------------------------------------------------------
FROM ${BASE_ALPINE} AS helm
ARG HELM_VERSION
ARG TARGETARCH=amd64
RUN apk add --no-cache ca-certificates tar wget && \
    case "${TARGETARCH}" in \
      amd64) helm_arch="amd64"; helm_sha256="11400fecfc07fd6f034863e4e0c4c4445594673fd2a129e701fe41f31170cfa9" ;; \
      arm64) helm_arch="arm64"; helm_sha256="fa419ecb139442e8a594c242343fafb7a46af3af34041c4eac1efcc49d74e626" ;; \
      arm) helm_arch="arm"; helm_sha256="aa3fb3014d147e5dcf8bfe4f6d5fe8677029ed720d4a4bcc64e54cb745a72206" ;; \
      *) echo "unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;; \
    esac && \
    wget -O /tmp/helm.tgz "https://get.helm.sh/helm-${HELM_VERSION}-linux-${helm_arch}.tar.gz" && \
    echo "${helm_sha256}  /tmp/helm.tgz" | sha256sum -c - && \
    tar -xzf /tmp/helm.tgz -C /tmp && \
    mv "/tmp/linux-${helm_arch}/helm" /helm && \
    chmod 0755 /helm

# ------------------------------------------------------------------------------
# 阶段 3：最小运行时镜像（无 shell、无包管理器，攻击面小）
# ------------------------------------------------------------------------------
FROM ${BASE_RUNTIME}
WORKDIR /app
ENV TZ=Asia/Shanghai HELM_BIN=/app/helm
# 供 Go time.LoadLocation 使用（日志/展示本地时区）
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /build/backend/easypanel /app/easypanel
COPY --from=helm /helm /app/helm
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/easypanel"]
