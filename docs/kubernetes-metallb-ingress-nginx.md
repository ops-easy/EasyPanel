# MetalLB 与 ingress-nginx 说明

MetalLB 与 ingress-nginx 都不是 Kube-BT-Sync 镜像内置组件。它们属于 Kubernetes 集群入口能力，是否安装取决于你的网络环境。

适用场景：

- 裸金属或自建集群没有云厂商 LoadBalancer。
- 需要为 `Service type=LoadBalancer` 分配内网可达 IP。
- 需要使用 Ingress 暴露 Kube-BT-Sync 或业务应用。
- 需要让 Kube-BT-Sync 管理和同步集群中的 Ingress。

如果你的集群已经有云负载均衡、Traefik、APISIX、Nginx Ingress 或其他入口方案，可以按现有方案部署，不必安装本文组件。

## 与 Kube-BT-Sync 的关系

| 能力 | 是否依赖 MetalLB | 是否依赖 ingress-nginx |
| --- | --- | --- |
| 通过 NodePort 访问控制台 | 不依赖 | 不依赖 |
| 通过 Ingress 暴露控制台 | 不一定 | 需要某种 Ingress Controller |
| 为 LoadBalancer Service 分配内网 IP | 常见依赖 | 不依赖 |
| 查看 Ingress 列表 | 不依赖 | 不依赖 |
| 将 Ingress 同步到宝塔 | 不强依赖 | 集群内通常需要 Ingress Controller 承接流量 |

## 平台内一键安装

管理员登录后，可以在“集群设置”中使用 MetalLB 与 ingress-nginx 相关卡片进行检测和安装。平台会尝试：

- 检测已有命名空间、Pod、Service 和 CRD。
- 下载官方或镜像代理清单。
- 根据节点内网地址生成建议的 MetalLB 地址池。
- 应用 `IPAddressPool` 和 `L2Advertisement`。
- 为 ingress-nginx 选择 NodePort 或 hostNetwork 相关参数。

使用前请确认地址池不会与 DHCP、网关、已有主机或其他 VIP 冲突。

## 手动检测

```bash
# MetalLB
kubectl get pods -n metallb-system
kubectl get ipaddresspool -n metallb-system
kubectl get l2advertisement -n metallb-system

# ingress-nginx
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
kubectl get ingressclass
```

如果命名空间不存在或 Pod 未运行，说明对应组件可能尚未安装或安装异常。

## MetalLB 手动安装思路

请以官方文档和你选定版本为准。通用流程如下：

1. 安装 MetalLB 控制器和 CRD。
2. 等待 `metallb-system` 下 Pod 就绪。
3. 规划一个与节点二层可达、且不会冲突的 IP 地址段。
4. 创建 `IPAddressPool`。
5. 创建 `L2Advertisement`。
6. 创建或修改 `type: LoadBalancer` 的 Service 并观察分配到的 EXTERNAL-IP。

地址池示例：

```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: default-pool
  namespace: metallb-system
spec:
  addresses:
    - 192.168.1.240-192.168.1.250
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: default
  namespace: metallb-system
spec:
  ipAddressPools:
    - default-pool
```

验证：

```bash
kubectl get svc -A | grep LoadBalancer
```

## ingress-nginx 手动安装思路

请使用官方安装文档中与你环境匹配的方式，例如 Helm、Bare-metal 清单或云厂商清单。

安装后验证：

```bash
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
kubectl get ingressclass
```

常见暴露方式：

- `LoadBalancer`：集群有云 LB 或 MetalLB 时使用。
- `NodePort`：自建集群常见方式，注意 Kubernetes NodePort 默认范围是 `30000-32767`。
- `hostNetwork`：需要占用节点 80/443，适合明确控制入口节点的场景。

## 在 Kube-BT-Sync 中使用

1. 确保目标集群可被 Kube-BT-Sync 后端访问。
2. 在初始化向导或集群设置中配置 Kubernetes 连接。
3. 如需监控面板，配置 Prometheus 或安装 kube-prometheus-stack。
4. 如需 Ingress 同步宝塔，开启 `INGRESS_BAOTA_SYNC_ENABLED=true`。
5. 给目标 Ingress 添加同步注解。

示例：

```yaml
metadata:
  annotations:
    kube-bt-sync.io/baota-sync: "true"
    kube-bt-sync.io/baota-https: "true"
```

## 排障建议

- LoadBalancer 没有 EXTERNAL-IP：检查 MetalLB Pod、地址池、L2Advertisement、地址冲突和二层网络。
- Ingress 无法访问：检查 IngressClass、Controller Service、后端 Service、DNS 和 TLS Secret。
- 宝塔同步后无法转发：检查 Ingress host、注解、上游端口、宝塔 API Key、防火墙和公网入口。
- 国内网络下载清单失败：在平台中切换清单镜像策略，或使用内网镜像地址。

## 参考链接

- [MetalLB 官方文档](https://metallb.io/)
- [ingress-nginx 官方文档](https://kubernetes.github.io/ingress-nginx/)
