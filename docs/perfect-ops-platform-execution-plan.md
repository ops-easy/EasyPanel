# EasyPanel 一站式运维平台完善执行计划

> 状态：执行中（用户已确认关键边界）  
> 日期：2026-05-29  
> 目标：把现有前后端功能推进到可长期自用的服务器运维平台状态，工作台 8 个模块都有真实管理闭环，尽量减少打开 vCenter、PVE、宝塔、云厂商、路由器等外部后台的频率，同时保持前端漂亮、克制、高密度、可反复使用。

Superpowers 可执行计划见：`docs/superpowers/plans/2026-05-29-perfect-ops-platform.md`。后续具体实现应按该计划逐项勾选执行。

## 原则

- 不把“完美”理解成口号，而是落成可验证的管理闭环：入口清楚、状态可信、异常可处理、权限可控、关键路由可渲染、后端契约能对上。
- 前端维持 SaaS 运维台风格：扁平、直接、信息密度高、少装饰、不做营销页式大改。
- 后端和前端一起校准：前端不能展示后端没有支撑的动作，后端也不能留下前端无法触达的管理能力。
- 每批改动先补测试或 smoke 断言，再改实现，最后统一跑测试、构建和服务清理。

## 当前已发现的缺口

- 工作台“虚拟化与主机”卡片展示了“云主机”，但就绪判断主要看 vCenter/PVE。只纳管云主机时，卡片可能仍把用户导向配置接入源。这会破坏“一站式管理服务器”的判断逻辑，需要纳入第一批修复。
- 工作台 8 个模块已经有不少摘要、异常态和渲染测试，但还需要按真实运维动作逐项审计，确认每张卡片不是只显示数字，而是真的能把用户带到可处理页面。

## 执行批次

### 1. 工作台总入口

- 统一校准 8 个模块的就绪判断、异常提示、入口跳转和指标来源。
- 修复云主机纳管后“虚拟化与主机”仍可能被视为未接入的问题。
- 验收证据：工作台静态测试、关键路由 render smoke、入口跳转断言。

### 2. Kubernetes

- 检查集群概览、命名空间、工作负载、服务、Ingress、集群设置是否都能从工作台进入并处理常用运维动作。
- 补齐未接入、接口异常、权限受限、空资源时的页面状态。
- 验收证据：K8s 路由 smoke、摘要接口契约、关键页面文本断言。

### 3. 虚拟化与主机

- 统一 vCenter、PVE、云主机、堡垒机目标的资源判断和入口逻辑。
- 确保只接入其中任一平台时，也能进入有效管理台，而不是被强制引导到其他平台配置。
- 验收证据：工作台卡片测试、PVE/vCenter/云主机路由测试、后端 API 契约扫描。

### 4. 网络设备

- 检查 iKuai、OpenWrt、接口、客户端、监控数据源、配置动作是否形成闭环。
- 补齐设备为空、部分设备异常、监控标签缺失时的可操作引导。
- 验收证据：网络模块路由 smoke、设备摘要测试、配置页状态测试。

### 5. 宝塔

- 校准面板 API、DDNS、Ingress 同步、托管 Ingress、接入向导。
- 确保 K8s 未接入但宝塔已接入时，页面不会误报整个模块不可用；同步失败要指向可处理入口。
- 验收证据：宝塔工作台测试、Ingress 摘要测试、配置页 smoke。

### 6. 应用中心

- 覆盖 Redis、MySQL、Kafka、OpenSearch、DNS、容器主机、OpenClaw、Hermes。
- 确保资源计数、详情页、终端入口、运行状态和管理动作一致，不停留在“只有列表”的层面。
- 验收证据：应用中心模块顺序测试、MySQL 依赖异常测试、各模块详情路由 smoke。

### 7. 堡垒机

- 统一 SSH、远程桌面、Redis CLI、MySQL SQL、云主机、额外主机、vCenter/PVE 目标入口。
- 检查目标为空、部分来源异常、权限不足、会话入口文案和指标一致性。
- 验收证据：堡垒机目标测试、会话入口测试、终端路由参数 smoke。

### 8. 观测与巡检

- 检查 AI Provider、Prometheus 数据源、告警规则、通知通道、监控面板、巡检报告。
- 校准管理员和只读用户差异；未配置时进入配置页，异常时显示可处理错误。
- 验收证据：观测巡检路由 smoke、权限状态测试、摘要接口测试。

### 9. 文档仓库

- 检查 Markdown、指南、媒体、附件存储、公开分享、版本管理入口。
- 确保无文档时可创建，存储异常时可定位，工作台指标不显示假健康。
- 验收证据：文档摘要测试、存储配置测试、文档路由 smoke。

### 10. 前端一致性打磨

- 统一卡片高度、状态徽标、按钮文案、空态、错误态、权限态、移动端表现。
- 检查长文本和多指标卡片不溢出、不遮挡、不误导。
- 验收证据：前端静态测试、lint、build、render smoke。

### 11. 后端契约与权限

- 对前端使用的 API 做契约扫描，确认路径、方法、权限语义和返回结构一致。
- 检查工作台摘要、应用中心、堡垒机、配置、审计、权限边界。
- 验收证据：API contract 测试、相关 Go 单测、必要的路由注册测试。

### 12. 统一验收

统一执行：

```powershell
npm run test
npm run lint
npm run build
npm run check:bundle
```

并补充：

- 关键路由 render smoke。
- 必要的 Go 后端测试。
- `git diff --check`。
- 测试结束后检查并停掉 `node`、`npm`、`vite` 等本次测试残留服务。

## 需要你确认的事项

1. **真实环境验证边界**：是否允许后续接入你的真实 vCenter/PVE/宝塔/iKuai/OpenWrt/云主机环境做只读验证？如果允许，默认先只读，不执行重启、删除、扩缩容、改防火墙等高风险动作。  都可以操作。
2. **高风险操作策略**：重启服务器、删除资源、修改 DNS、修改 Ingress、变更防火墙、执行 SQL、批量同步这类动作，是否全部要求二次确认和审计记录？  是的
3. **云厂商范围**：当前“云主机”是否以现有应用中心容器主机/云主机模型为主，还是你希望优先接入某个具体云厂商 API？    已应用中心为主
4. **UI 风格边界**：是否确认继续走现在这种克制的运维控制台风格，而不是重做成大面积视觉化、动效更多的样式？   是的
5. **验收优先级**：如果时间和风险冲突，是否优先保证“能管理、状态准、权限稳”，再做更细的视觉 polish？  是的
6. **测试时机**：统一测试会启动 Vite、无头 Chrome、可能跑后端测试。是否继续遵守“测完立刻停服务”的策略，并避免长时间常驻 dev server？ 是的

## 执行记录

- 2026-05-29：DNS 证书、故障切换、定时任务已推进到后端真实执行闭环，并补齐前端契约测试、后端单测和关键路由 smoke 覆盖。
- 2026-05-29：网络模块 OpenWrt 写入/重载类动作已统一要求显式确认；旧配置应用入口不再硬编码 `confirm: true`；网络设备保存、更新、删除、配置应用和厂商动作已补充可读审计详情。
- 2026-05-29：虚拟化与主机模块 PVE/vCenter 电源动作已统一要求输入目标名并提交 `confirm=true`；后端在连接真实 PVE/vCenter 前先拒绝缺确认请求，PVE 电源操作已补充审计详情。
- 2026-05-29：虚拟化与主机模块 PVE 配置变更、磁盘扩容、快照删除/回滚，以及 vCenter 硬件变更、磁盘扩容、快照删除/回滚已补齐后端确认闸门；PVE 配置/扩容/快照危险动作已补充审计详情，前端 PVE/vCenter 详情页已加入目标名或快照名确认输入。
- 2026-05-29：Kubernetes 模块高风险写操作已补齐后端确认闸门与前端确认契约：通用 YAML apply、旧 Ingress YAML/删除、对象 JSON 保存、变更记录回退、资源删除、Deployment 滚动重启、Pod 删除、PVC 扩容均要求 `confirm=true`；前端所有对应请求已通过统一 helper 提交确认语义，并补充静态契约测试防止裸写请求回归。
- 2026-05-29：应用中心云主机（容器主机）高风险管理动作已补齐确认契约：初始化/软件配置更新、root 密码同步、资源扩缩容、删除实例、重置 root 密码均在后端访问 MySQL/K8s/密钥前要求显式 `confirm=true`；前端统一通过 App Center 确认 helper 发送确认语义，删除/重置/扩容保留弹窗，内联配置与 root 密码同步补充浏览器确认，并新增前后端契约测试。
- 2026-05-29：应用中心 Redis/MySQL 数据破坏类动作已补齐服务端确认闸门：MySQL 删除实例、删除用户、修改用户密码、恢复/删除备份，以及 Redis 删除实例、删除键均要求显式 `confirm=true`，且在访问元数据库、K8s 或实例连接前先拒绝缺确认请求；前端 MySQL/Redis 页面已统一通过 App Center 确认 helper 提交确认语义，并新增静态契约测试防止回归。

- 2026-05-29：应用中心 Kafka/OpenSearch 高风险管理动作已补齐确认契约：Kafka 模版删除、对外暴露变更、Topic 删除、ACL/SCRAM 变更、实例删除、Topic 配置、用户配额、Topic 复制限速、压测 Job 删除，以及 OpenSearch 索引删除、索引设置更新、真实索引清理均要求显式 `confirm=true`；前端 Kafka、Kafka 限速工作台、OpenSearch 页面统一通过 App Center 确认 helper 提交确认语义，并新增前后端契约测试防止回归。

- 2026-05-29：应用中心 Hermes/OpenClaw 与 Runtime 模板删除类高风险动作已补齐确认契约：Redis/MySQL/OpenSearch 模板删除、Hermes 文件保存/重启/升级/回滚/暴露变更/迁移/删除、OpenClaw 文件保存/模型与上游运行时/Telegram/出口代理/RBAC 预设/工具链预设/网关镜像/同步检查/删除均在后端访问实例、K8s 或配置前先要求显式 `confirm=true`；前端 Hermes、OpenClaw、Redis 模板与 OpenSearch 模板页面统一通过 App Center 确认 helper 提交确认语义，并新增前后端契约测试覆盖。

- 2026-05-29：应用中心 Hermes/OpenClaw 审计可读性已补齐：平台审计页不再把 Hermes/OpenClaw 写操作折叠成泛化“操作”，而是区分部署、重启、升级、回滚、暴露变更、迁移、文件保存、上游运行时、Telegram、出口代理、RBAC、工具链、AI 巡检同步、网关镜像和删除等动作；后端对应成功路径补充 `SetAuditDetail`，审计记录可直接看到实例、命名空间、Deployment、镜像或预设等关键上下文，同时避免记录 API Key / Token 等敏感值。

- 2026-05-29：应用中心“部署到集群”类写操作已纳入显式确认：Redis、MySQL、Kafka、OpenSearch、Hermes、OpenClaw 的 `/k8s-deploy` 后端入口均在访问 K8s/MySQL/配置前先拒绝缺少 `confirm=true` 的请求；前端对应部署按钮统一通过 App Center 确认 helper 发送确认语义，并新增前后端契约测试，避免资源创建类高风险操作绕过二次确认。

- 2026-05-29：应用中心真实中间件写入类动作继续补齐确认边界：MySQL 创建用户、创建备份，Kafka 创建 Topic、生产消息、启动压测 Job 均在后端访问 MySQL/Kafka/K8s 前先要求显式确认；前端 MySQL/Kafka 页面已统一通过 App Center 确认 helper 提交确认语义，并扩展前后端契约测试覆盖这些非删除但会写入真实系统的动作。

- 2026-05-29：应用中心平台级配置写操作已纳入确认和审计：容器主机 bootstrap、Hermes bootstrap、OpenClaw bootstrap、OpenClaw 镜像目录更新均要求 `confirm=true` 后才访问 `platform_kv`；前端对应配置页统一通过 App Center 确认 helper 提交确认语义，后端成功路径补充可读审计详情，避免全局部署默认值被无确认改动。

- 2026-05-29：应用中心容器主机创建已补齐确认契约：创建实例会在 Kubernetes 中创建 Secret、PVC、Deployment 与 Service，并落库实例记录，因此后端现在会在访问 MySQL/K8s 前先要求 `confirm=true`；前端创建页在提交前弹出二次确认，并通过 App Center 确认 helper 附带确认语义；前后端均新增契约测试覆盖，避免资源创建入口绕过高风险确认策略。

- 2026-05-29：应用中心 MySQL 写 SQL 入口已补齐双重确认：`confirmMutation=true` 继续表示用户允许执行非只读 SQL，同时写 SQL 还必须携带标准 `confirm=true`，后端在连接实例数据库前先拒绝缺确认请求；前端 SQL 面板在勾选“允许写操作”后提交会弹出二次确认，并通过 App Center 确认 helper 附带确认语义，保留只读查询的低摩擦体验。

- 2026-05-29：应用中心平台元数据写入已补齐确认边界：Redis/MySQL 纳管实例创建与更新，以及 Redis/MySQL/Kafka/OpenSearch 模板创建与更新，均在后端访问 MySQL 元数据存储前要求标准 `confirm=true`；前端对应保存请求统一通过 App Center 确认 helper 附带确认语义，并新增前后端契约测试，避免连接凭据和未来部署默认值被无确认改动。

- 2026-05-29：应用中心容器主机 Hysteria2 客户端敏感配置读取已纳入标准确认：查看客户端 YAML 仍需具备专门权限并验证当前平台密码，同时请求体必须携带 `confirm=true`；后端在访问 MySQL 前先拒绝缺确认请求，前端 reveal 请求统一通过 App Center 确认 helper 附带确认语义。

- 2026-05-29：应用中心写路由静态审计已复查：剩余未要求标准确认的 POST 入口限定为 ping、probe、validate、dry-run、install-script、read、chat、reachability-check、telegram-verify 等只读/校验/探测/生成类请求，不包含删除、重启、扩缩容、SQL 写入、K8s 写入、凭据变更或平台元数据写入；后续若这些入口升级为真实写操作，必须补 `confirm=true` 与审计详情。

- 2026-05-29：DNS 模块写入口已统一补齐确认闸门：服务商账号、域名、解析记录、故障切换、定时任务、证书申请/删除/签发、宝塔关联/部署等 POST/PUT/PATCH/DELETE 路由均通过 DNS 专属中间件在进入 handler 前要求显式 `confirm=true`；账号连通性测试保持低摩擦只读检查。前端 DNS 页面统一通过确认 helper 发送 body/query 确认语义，并在保存、同步、签发、立即检测、启停解析等高风险入口弹出二次确认。

- 2026-05-29：Kubernetes 集群管理入口继续补齐确认边界：RBAC 只读账号创建、CRD/自定义资源写入和删除、etcd defrag Job、Ingress-Nginx / Dashboard / kube-prometheus-stack / VictoriaLogs 安装或配置同步、PVC 文件写入/删除/建目录/重命名、资源建议一键 patch 等会触达集群 API 或平台运行时的入口，均在路由层进入 handler 前要求 `confirm=true`；前端对应页面通过 K8s 确认 helper 发送确认语义，并在非 AlertDialog 入口补充浏览器确认。

- 2026-05-29：虚拟化与主机剩余确认边界已补齐：PVE target 创建/更新/删除、PVE 快照创建、vCenter 快照创建、云主机创建/更新/删除、云主机/vCenter VM/堡垒机目标 SSH 凭据更新与删除、云主机 SFTP 上传、vCenter 堡垒机策略保存均要求显式 `confirm=true`，且缺确认时优先拒绝，不读取 KV、SSH store、MySQL 或连接真实目标。前端 PVE、云主机、堡垒机策略、SFTP 上传等入口已通过对应 helper 发送确认语义并保留用户二次确认。

- 2026-05-29：网络、账号与工具类写入口继续收口：iKuai/OpenWrt 设备创建、更新、删除统一走网络确认 helper；IP 扫描配置保存与扫描启动走工具确认 helper；平台用户创建/更新/删除、TOTP 开启/关闭、管理员 OIDC 解绑、个人资料更新与个人 OIDC 解绑均要求确认，并把后端 MySQL 查询放到确认之后。

- 2026-05-29：观测与运行配置类写入口已补齐确认：运行时设置、Prometheus 进程内数据源覆盖、AI Provider、Grafana 配置与同步、告警规则/通知渠道、Alertmanager Webhook 重置、自定义监控面板、VictoriaLogs VM shipper 下发均要求确认。前端设置页、巡检页、告警页和监控页已补充 helper 与显式用户确认；纯查询、测试通知、脚本生成、状态检查保持低摩擦。

- 2026-05-29：文档仓库按风险分层处理：附件存储 COS 配置保存与清空控制台 COS 配置属于基础设施配置写入，已纳入 `confirm=true`；普通文章编辑、上传素材、分类/标签等内容生产动作保持管理员权限控制和现有编辑流，不额外增加后端确认门，避免破坏文档编辑效率。

- 2026-05-29：新增静态/单元契约覆盖：PVE target/快照、网络设备、vCenter 快照、Prometheus 覆盖、文档附件存储、账号/TOTP/OIDC、vCenter/云主机/堡垒机 SSH 设置等缺确认请求均有“先拒绝、再触达存储/目标”的测试或静态契约约束。按用户要求，所有测试、lint、build 和服务清理统一放到最终验证阶段执行。

## 暂不判定完成

这份计划不是完成证明。只有当每个模块的管理闭环、权限边界、路由渲染、前后端契约和统一测试都有当前证据时，才能判断目标接近完成。
## 2026-05-29 续做记录：K8s 请求生命周期收口

- 审计发现老 Ingress 聚合 API 与部分 K8s 管理 handler 虽已具备 `confirm=true` 高风险确认，但仍有 `context.TODO()` 直接传入 Kubernetes API。若浏览器离开、反向代理超时或用户取消请求，后端可能继续等待真实集群 API，影响平台长期自用时的稳定性。
- 已将 `/api/status`、`/api/ingress/yaml`、`/api/ingress/delete`、`/api/ingresses`、`/api/ingress/raw`、`/api/namespaces`、`/api/services`，以及 K8s YAML apply、对象 YAML/JSON、资源删除、Pod/Service/Node 列表与详情、Namespace 统计、资源关系、对象版本回退等入口统一改为 `c.Request.Context()` 派生的有界超时上下文。
- 新增静态单测 `TestK8sHTTPHandlersUseRequestScopedContexts`，防止这些 HTTP K8s 管理入口后续回退为 `context.TODO()`。

## 2026-05-29 续做记录：Harbor 镜像仓库高风险操作确认

- 审计发现 Harbor 手动全量镜像索引同步与制品删除入口只依赖管理员权限；其中制品删除会触达真实 Harbor 仓库，索引同步会写入 Redis 并触发后台爬取，均应纳入统一的高风险操作确认闭环。
- 后端新增 Harbor 专属确认 helper：`/api/harbor/index/sync` 在读取 Redis/配置前要求请求体携带 `confirm=true`，`/api/harbor/projects/:project/artifacts` 删除制品在访问 Harbor 前要求 query 携带 `confirm=true`。
- 前端 Harbor 制品删除与 Redis 镜像索引“立即全量同步”按钮补充浏览器二次确认，并通过 `harborMutationConfirm` helper 附带 body/query 确认语义；新增前后端契约测试防止这些入口回退为无确认写操作。

## 2026-05-29 续做记录：宝塔 Ingress 手动同步确认

- 审计发现 `/api/baota/ingress-sync/run` 会把托管 Ingress 同步到真实宝塔面板，虽然权限矩阵会阻止只读用户，但管理员误点仍可能直接触发外部平台变更。
- 后端新增 Baota 专属确认 helper：手动同步在读取 K8s、运行时配置或宝塔目标前先要求请求体携带 `confirm=true`。
- 前端宝塔同步页的“立即同步到宝塔”按钮补充浏览器二次确认，并通过 `baotaMutationConfirm` helper 附带确认语义；新增前后端契约测试防止该入口回退为无确认写操作。

## 2026-05-29 续做记录：工作台摘要恢复动作

- 按数据密集运维工作台的 UX 审计，首页 8 个模块卡片已经能展示加载、异常与待配置状态，但当摘要异常或刚完成配置变更时，缺少一个明确的手动恢复动作。
- 工作台顶部新增“刷新摘要”按钮，统一 refetch 当前可见/有权限模块的摘要查询；按钮在刷新中禁用并旋转图标，避免用户误以为页面卡死。
- 扩展 HomeHub 静态契约测试，要求刷新入口、统一查询集合和 refetch 行为长期存在，同时继续避免隐藏模块被默认轮询。

## 2026-05-29 续做记录：Harbor 索引刷新来源统一

- 审计发现运行时设置保存后仍由 `common/core` 直接调用旧 Harbor 索引刷新实现；而生产 Harbor 路由与后台 worker 已迁到 `backend/api/harbor/service`，存在两套刷新来源并存的维护风险。
- 已为设置保存流程新增 `RuntimeSettingsHooks`：`common/core` 只负责保存、重载和通用缓存失效，Harbor 缓存失效与索引刷新由设置 service 注册时注入新 Harbor service 实现。
- `backend/api/harbor/service` 导出统一的索引爬取超时函数，后台 worker、手动同步、制品删除后的刷新与设置保存触发的刷新共用同一超时语义；新增静态契约测试，防止运行时设置保存再次绕回旧 core Harbor 实现。

## 2026-05-29 续做记录：日志采集助手前端健壮性

- 审计 VMLog / VictoriaLogs 日志采集下发助手时发现采集器摘要使用 `useMemo`，但页面顶部 hook 引入不完整；在当前自动导入配置下可能被掩盖，但会降低页面迁移、局部编译和静态审查时的确定性。
- 已显式补齐 `useMemo` 引入，并新增静态契约测试，要求日志采集助手的已启用采集器摘要继续使用稳定 memo 计算且 hook 引入保持完整。

## 2026-06-01 续做记录：工作台一级操作路由渲染覆盖

- 审计发现关键路由 smoke 虽已由 `criticalRoutes` 驱动，但之前更偏向首页入口和 demo 截图路由，尚未把工作台模块背后的一级操作页作为长期契约覆盖；这会让“卡片能进入真实管理闭环”的判断缺少一层证据。
- 已扩展 `criticalRoutes`：纳入 Kubernetes 命名空间、节点、etcd、RBAC、自定义资源、Harbor；宝塔 Ingress/同步；网络接入配置；DNS 账号/域名/记录；观测巡检监控、告警、日志、日志采集、报告；文档媒体附件等一级操作页面。
- 已扩展 render smoke 的页面文本断言和严格 mock 覆盖：这些路由后续若缺少页面主文案、误入错误边界、请求未 mock 的真实 API 或回退到 Vite 代理，都会在 smoke 契约中暴露。当前已通过对应静态契约测试。

## 2026-06-01 续做记录：关键路由 smoke 期望全量化

- 继续审计发现 `criticalRoutes` 中仍有部分会被 render smoke 实际访问的管理页没有显式 `expectedText` 或 `expectedFinalPath`，例如虚拟化资源列表、PVE/vCenter 详情、网络资源页、应用中心 Redis/MySQL/Kafka/OpenSearch/容器主机/OpenClaw/Hermes、账号设置与审计页；这类页面只靠文本长度判定，无法证明页面身份和主体验是否正确。
- 新增静态契约：除 `/setup`、`/login` 这类未认证前页面外，render smoke 实际 exercise 的每条关键路由都必须有明确页面文本或最终跳转目标。先运行测试得到 43 个缺失项，再补齐期望。
- 已补齐全部缺失期望：Compute、Network、K8s Pod 详情/终端、App Center 各子模块与动态详情、AI Inspect 根路由跳转、账号设置/用户/审计都纳入强断言。当前 `render-smoke-critical-routes` 静态契约 15/15 通过。

## 2026-06-01 续做记录：创建页与账号运营页纳入关键 smoke

- 继续按“能管理，而不是只看列表”的标准补洞：将容器主机创建、OpenClaw 创建、Kafka 实例限速、个人中心、站点统计纳入 `criticalRoutes`，避免核心创建/运营入口没有长期渲染契约。
- render smoke 同步新增路径替换与页面身份断言：Kafka 限速使用真实样例实例 `/cluster/apps/kafka/instance/1/throttle`；容器主机与 OpenClaw 创建页分别断言 SSH/OpenClaw 主体验；个人中心断言 OIDC 资料入口；站点统计断言 Harbor 统计区域。
- 严格 mock 覆盖补齐 `/api/account/profile`、`/api/audit/site-stats`、`/api/audit/harbor-dashboard` 与 Kafka Topic 限速读取接口，后续这些页面若误连真实后端、缺少关键 API 或落入错误边界，会在最终统一 smoke 中暴露。

## 2026-06-01 续做记录：深层管理页一次性纳入 smoke 闭环

- 按“以后尽量不去各个平台”的目标继续扩大关键覆盖：Kubernetes 命名空间内 Pod/Deployment/StatefulSet/DaemonSet/Service/Ingress/PVC/ConfigMap/Secret 列表与详情、PVC 文件浏览、RBAC ServiceAccount、CRD 实例、Harbor 项目/仓库/制品、文档指南与文档详情都纳入 `criticalRoutes`。
- 堡垒机不再只覆盖首页和配置页：`/cluster/bastion/session` 与 WebMKS 控制台 `/cluster/bastion/console/:moref` 同步纳入关键路由，避免远程维护入口只停留在导航层。
- render smoke 新增统一样例参数和页面身份断言，确保这些深层页面不只是侧栏可达，而是真能加载对应对象、仓库、制品或文档内容。
- 严格 mock 同步补齐 K8s 资源列表、对象 YAML、PVC 文件挂载/列表、RBAC SA、CRD 实例、Harbor repositories/artifacts、Docs detail/versions 等 API；最终统一验证时若任何深层管理页误连真实后端、缺少 mock 或落入错误边界，会集中暴露。

## 2026-06-01 续做记录：旧入口与重定向入口统一纳入 smoke

- 按“一次性改完再统一检查”的节奏继续补齐容易漏掉的真实入口：Kubernetes 顶层旧资源入口、Compute/vCenter/PVE 旧入口、Network iKuai/OpenWrt 旧入口、旧版 vCenter/Bastion 入口、`/docs/new` 和 `/settings` 都纳入 `criticalRoutes`。
- 这些入口大多不是新功能页，而是用户从历史书签、搜索结果、侧栏兼容路径或旧链接进入平台时会触发的管理入口；如果它们不在 smoke 里，平台看起来功能完善，但长期自用时仍可能在跳转层出错。
- render smoke 已补齐对应 `expectedFinalPath` 与页面身份断言，确保旧入口能落到当前可管理页面，而不是空白页、错误边界或错误模块。
- 后续不再逐个小目标测试，本批次剩余验证统一放到最终检查：静态契约、聚焦 render smoke、`git diff --check`，并在测试结束后扫描并清理本次残留的 `node`/`npm`/`vite`/`go`/`air` 进程。

## 2026-06-01 继续执行记录：确认门前移与平台报告写入收口

- 按“一次性改完再统一检查”的节奏继续批量审计高风险入口，发现网络设备执行动作/配置应用虽然已有 `confirm=true` 语义，但部分 handler 会先读取设备清单或解密凭据，再拒绝缺确认请求；这不符合“高风险操作先拒绝、再触达真实资源”的边界。
- 已将 OpenWrt 旧入口 action/config apply、通用 provider config apply/provider actions 的确认判断前移到设备读取之前；iKuai 通用 action 入口统一要求 `confirm=true`，避免通过自定义 `funcName/action` 绕过重启以外的确认门。
- Pod 重启 AI 报告保存/删除会写入 MySQL/刷新 Redis 聚合，已纳入平台写入确认契约：前端保存报告使用 `withOpsMutationConfirm`，删除报告使用 `withOpsMutationConfirmQuery`，后端在访问 MySQL 前先拒绝缺确认请求。
- 已扩展前后端契约测试覆盖上述边界：网络运行类写操作必须先报缺 confirm，AI 报告保存/删除必须先报缺 confirm，静态合同测试防止前端请求或后端顺序回退。
- 本批次仍未启动服务、未做逐项小测试；最终统一验证阶段再集中跑静态测试、Go 测试、构建、render smoke，并按你的要求清理本轮启动的服务。

## 2026-06-01 统一验证记录

- `node --test tests/render-smoke-critical-routes.test.mjs`：21/21 通过。覆盖 route inventory 驱动、深层 K8s/Harbor/Docs/Bastion/旧入口、显式页面期望、严格 API mock 与 Vite proxy 防漏。
- `npm run build`：通过，Vite production build 完成，TypeScript/Vite 构建无错误。
- `npm run check:render`（desktop，聚焦新增深层页、旧入口与重定向入口）：114/114 渲染检查通过；严格 mock 收口后无 unmocked API 请求残留。
- `git diff --check`：退出码 0，仅有既有 CRLF/LF 转换提示，无 whitespace error。
- 测试后服务清理：本次 render smoke 用过的 Vite 端口均无监听；`node`/`npm`/`vite`/`go`/`air` 进程扫描无残留输出。
- 验证期间暴露并修复的真实问题：CRD 实例详情 mock 缺 `related.eventsNamespace` 导致错误边界；Harbor 制品页断言大小写与 UI 不一致；堡垒机 WebMKS 未配置提示过短且断言不匹配；命名空间选择页缺 `/api/k8s/namespace-stats` mock。

## 2026-06-01 补充统一验证记录：确认门前移批次

- 本轮按“一次性批量修改，最后统一检查”的方式收口：先完成网络设备动作/配置应用确认门前移、iKuai 通用动作确认收口、Pod 重启 AI 报告保存/删除确认门接入，再统一进入验证阶段。
- `npm run test`：前端静态契约与 Node 测试通过，340/340 pass。
- `go test ./api/network/service ./common/core -count=1`：后端网络确认门与 K8s restart AI 报告写入确认门测试通过。
- `npm run build`：Vite production build 通过。
- `npm run check:render`：首次全量关键路由尝试因耗时过长中止并清理残留；随后对本轮受影响页面族（网络中心、旧 Pod restart 报告入口、AI 巡检报告入口）执行桌面/平板/手机实渲染，78/78 通过。过程中发现旧入口 `/cluster/pod-restart-reports` 已重定向到 `/cluster/ai-inspect/reports/pod`，render smoke 契约仍按旧路径等待，已修正为等待最终重定向页面。
- `npm run check:bundle`：通过，entry=199.87 KiB，initialJs=485.92 KiB，preloads=4。
- `git diff --check`：退出码 0，仅有既有 CRLF/LF 转换提示，无 whitespace error。
- 测试后服务清理：已停止本轮 render smoke 残留的 `node` / `chrome-headless-shell` / Vite 相关进程；5173、61030、65489、65490 等本轮测试端口无监听。剩余可见 `node_repl` 与系统原有 NodeBaby/WeMailNode 进程不属于本轮项目服务，未强杀。

## 2026-06-01 继续执行记录：权限异常 fail-closed 收口

- 继续按“一次性批量修改，最后统一检查”的节奏审计权限边界；发现前端 `ViewerRedirect` 在 `/api/config` 权限校验失败时会临时渲染敏感子页面，这与“权限稳定、只读用户不能误入操作区”的目标冲突。
- 前端守卫已改为保守策略：明确 viewer 立即跳转；配置接口失败时只有 `/api/auth/status` 已确认 admin 才放行；身份不明确时只显示权限校验失败提示，不渲染子页面。
- 后端会话令牌校验已改为未知 role 直接拒绝，不再把非 admin/viewer 角色回落为 admin。
- 后端 `ViewerRestrictionsMiddleware` 在启用登录时若缺少 dashboard role，会直接返回权限拒绝，避免中间件顺序或异常状态导致敏感 API fail-open。
- 新增前端静态契约与 Go 单元契约，覆盖上述 fail-closed 规则；本批次仍遵守用户要求，集中修改后再统一验证并清理服务。
- 本批次统一验证结果：`npm run test` 341/341 通过；`go test ./common/core -count=1` 通过；`npm run build` 通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示。
- 测试后服务清理：已停止本轮测试/构建残留的 `node` 进程；5173、61030、65489、65490 等本轮常用测试端口无监听。剩余 `node_repl` 与系统原有 NodeBaby/WeMailNode 进程不属于本轮项目服务，未强杀。

## 2026-06-01 继续执行记录：文档仓库破坏性入口确认收口

- 继续按“一次性批量修改，最后统一检查”的节奏审计工作台 8 模块中的文档仓库；发现文档删除、版本恢复、媒体附件删除和页面指南删除属于会覆盖内容、删除数据库记录或移除 COS/本地对象的破坏性入口，但后端此前没有统一 `confirm=true` 闸门。
- 后端已将 `docs delete`、`docs version restore`、`docs media delete`、`docs guide delete` 的确认判断前移到 MySQL 查询和对象存储/本地文件删除之前，避免脚本或误点绕过前端弹窗直接触发破坏性操作。
- 前端文档编辑器的文档删除与版本恢复已统一携带平台确认语义；版本恢复按钮补充浏览器二次确认，明确会覆盖当前内容并新增版本记录。
- 媒体与附件页的附件删除已统一携带平台确认语义；同时复查该页中文文案，确认当前源码无乱码残留，页面继续保持文档仓库的清晰管理体验。
- 新增/扩展 Go 与前端静态契约测试，要求上述破坏性入口缺少确认时先返回 confirm 错误；本批次仍未逐项小测，统一验证阶段集中执行测试、构建、必要 smoke 和服务清理。
- 本批次统一验证结果：`npm run test` 341/341 通过；`go test ./common/core -count=1` 通过；`npm run build` 通过；聚焦文档路由 render smoke（`/docs/media`、`/docs/doc/1`、`/docs/guides/doc/1`，desktop）3/3 通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示。
- 渲染检查首次在沙箱内启动 Vite 时遇到 Windows `EPERM` 写入 `node_modules/.vite-temp`，按同一命令授权重跑后通过，未改业务代码规避该环境问题。
- 测试后服务清理：本轮 render smoke 端口 62790、64222、64223 均无监听；仅发现 5173 仍由另一个工作区 `D:\VScodeProjects\EASY-API\web` 的 Vite 进程占用，不属于本轮项目服务，未强杀。

## 2026-06-01 继续执行记录：文档公开分享与页面指南确认收口

- 在上一轮文档删除/恢复确认收口之后，继续审计“公开分享/访问密码/页面指南映射”这类会影响外部可见性或平台帮助行为的写入口；发现普通文档保存、分享设置保存和页面指南标识保存共用部分 API，缺少区分风险级别的确认语义。
- 后端 `docsSaveBody` 新增标准 `confirm` 字段：创建已发布文档、修改分享密码、切换公开页状态都需要显式确认；其中分享密码变更会在访问 MySQL 之前先拒绝缺确认请求，公开状态变更会在真正写库前拒绝缺确认请求。
- 页面指南 create/update/delete 均纳入平台确认语义，避免脚本直接改动右下角帮助与路由匹配关系；默认指南种子仍走内部初始化逻辑，不受 API 确认影响。
- 前端文档编辑器保持日常正文保存低摩擦：只有发布状态变化时，保存动作才会弹出公开访问确认并携带 `confirm=true`；分享设置保存和页面指南标识保存也统一携带平台确认语义。
- 扩展前端静态契约与 Go 单测，覆盖文档公开分享、分享密码、页面指南 create/update/delete 的确认门，防止后续回退成“普通保存顺手改公开可见性”的隐性风险。
- 本批次统一验证结果：`npm run test` 341/341 通过；`go test ./common/core -count=1` 通过；`npm run build` 通过；聚焦文档路由 render smoke（`/docs/media`、`/docs/doc/1`、`/docs/guides/doc/1`，desktop）3/3 通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示。
- 验证期间修正了一个静态契约测试断言：测试原先要求源码中直接出现 `confirm("确认发布公开页...")`，但真实实现使用 `message` 变量并调用 `window.confirm(message)`；已改为验证发布状态变化分支、确认文案和 `window.confirm(message)` 调用，避免为了测试形状牺牲实现可读性。
- 测试后服务清理：本轮 render smoke 临时 Vite 端口 64159 与 Chrome 调试端口 64160 均无监听；进程扫描仅发现另一个工作区 `D:\VScodeProjects\EASY-API\web` 的 Vite/Playwright，以及普通 Chrome/系统进程，不属于本轮项目服务，未强杀。

## 2026-06-01 继续执行记录：PVE 旧接入口与重复工作区收口

- 继续按“以后尽量不去各个平台维护”的目标审计算力模块，发现未路由的旧 `PVEPage` 仍保留早期 API Token 表单和一套重复的目标列表/电源操作 UI；当前正式入口已经走资源化 `PveWorkspace` 与用户名/密码接入表单，旧页面会增加维护分叉和用户认知噪声。
- 已删除旧 `frontend/src/features/compute/pages/PVEPage.tsx`，让 PVE 长期入口只保留资源中心、配置页、PVE 工作区和节点/虚拟机详情页；旧 `/cluster/compute/pve/*` 路径仍通过路由重定向落到当前资源化页面，书签兼容不受影响。
- 同步清理 `PveWorkspace` 内未使用的 `PveSetupPanel`、`PveLegacyTargetList`、`PveTargetsPanel`，避免新旧目标列表实现并存；新增静态契约要求旧 `PVEPage` 不再存在，且 PVE 工作区不再携带这些废弃组件。
- 文本编码契约改为检查当前 PVE 工作区的关键中文文案，继续防止算力模块出现乱码或旧入口文案回退。
- 本批次统一验证结果：`npm run test` 342/342 通过；`npm run build` 通过；聚焦算力/PVE render smoke（`/cluster/compute/config`、`/cluster/compute/guests`、`/cluster/compute/pve/dashboard`、`/cluster/compute/pve/targets`、`/cluster/compute/pve/guests`，desktop）6/6 通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示。
- 渲染检查首次在沙箱内启动 Vite 时仍遇到 Windows `EPERM` 写入 `node_modules/.vite-temp`，按同一命令授权重跑后通过；测试后端口 55717/55718/59398/59399 等本轮端口均无监听，父进程复查确认本轮 Chrome headless 已退出，未强杀另一个工作区 `D:\VScodeProjects\EASY-API\web` 的服务。

## 2026-06-01 继续执行记录：主入口配置语言与完成度感知收口

- 按“一次性改完再统一检查”的节奏，批量审计登录页、工作台、算力、网络、观测巡检和集群资源提示文案；发现多个主入口仍使用“待接入/未接入/接入源”类旧阶段表达，容易让用户误判平台功能还停留在占位状态。
- 登录公开运行状态已改为可操作指引：PVE、Redis、宝塔、DDNS 等未配置时提示“配置/保存后启用”，不再显示“入口待接入”“能力待接入”等半成品语言。
- 工作台、算力 Dashboard/配置源、网络资源中心/配置源、观测巡检健康矩阵、K8s Prometheus 提示统一改为“未配置/配置源/配置后启用”语义；PVE 目标摘要无目标时显示“未配置”，网络/算力主入口不再混用“接入源”作为配置对象名称。
- 新增/扩展静态契约，要求登录页与工作台不得回退到“待接入/未接入/配置接入源/请先接入”等旧文案；算力和网络契约同步保护“配置源/资源源”的新语言。
- 本批次统一验证结果：`npm run test` 344/344 通过；`npm run build` 通过；`npm run check:bundle` 通过（entry=199.87 KiB，initialJs=485.92 KiB，preloads=4）；聚焦 render smoke（`/login`、`/cluster/compute/dashboard`、`/cluster/compute/config`、`/cluster/network/dashboard`、`/cluster/network/access`、`/cluster/ai-inspect/dashboard`，desktop）6/6 通过；`go test ./... -count=1` 在 `backend/` 模块通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示。
- 验证期间第一次 render smoke 在沙箱内被 Windows `EPERM` 阻止写入 `node_modules/.vite-temp`，已按授权命令重跑通过；一次误把 `/cluster` 作为过滤条件导致脚本扩大到大量关键路由，后续已收窄为本批受影响页面。最终服务清理复查显示本项目 render smoke 端口 49895/49896/54220/54221/55840/51623 均无监听，进程列表无 `EasyPanel` 的 Vite/Chrome/Node 测试服务残留。

## 2026-06-01 继续执行记录：高风险操作确认体验收口

- 继续按“一次性批量修改，最后统一检查”的节奏审计前端成熟度；发现多个真实管理入口虽然已经携带后端 `confirm=true` 语义，但用户侧仍使用浏览器原生 `window.confirm/confirm()`，视觉上割裂，也不利于说明风险上下文。
- 新增统一的 `ConfirmActionButton`，复用平台现有 Radix `AlertDialog` 组件，把确认标题、风险说明、确认按钮文案与危险态样式收成一个可复用入口，避免各模块继续手写原生弹窗。
- 已批量替换文档附件库、AI 巡检报告、AI 日志指纹清理、堡垒机 SFTP、应用中心 MySQL、应用中心 Kafka 的删除/恢复/清理/配置保存类操作；这些页面现在使用平台内确认弹窗，并保留 `with*MutationConfirm` 提交给后端的确认语义。
- 文档编辑器中的公开发布切换、文档删除、页面指南标识保存、版本恢复、分享设置保存也已从原生确认迁移到受控的站内 `AlertDialog`，键盘保存触发公开状态变更时同样会弹出平台内确认。
- 已新增静态契约，要求上述高风险管理页面不得回退到 `window.confirm` 或裸 `confirm()`；随后集中执行前端测试、构建、必要 render smoke、`git diff --check`，并在测试后清理本轮启动的服务。
- 本批次统一验证结果：`npm run test` 345/345 通过；`npm run build` 通过；`npm run check:bundle` 通过（entry=199.87 KiB，initialJs=485.92 KiB，preloads=4）；聚焦 render smoke（`/docs/media`、`/docs/doc/1`、`/docs/guides/doc/1`、`/cluster/ai-inspect/logs/detail`、`/cluster/ai-inspect/reports`、`/cluster/pod-restart-reports`、`/cluster/apps/mysql`、`/cluster/apps/kafka`、`/cluster/apps/kafka/instance/1`、`/cluster/apps/kafka/instance/1/throttle`、`/cluster/bastion/session`，desktop）11/11 通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示。
- 验证期间首次 render smoke 在沙箱内启动 Vite 时仍遇到 Windows `EPERM` 写入 `node_modules/.vite-temp`，按授权命令重跑；重跑后发现旧 `/cluster/pod-restart-reports` 的 smoke 期望文本只写了过泛的 `Pod`，会在重定向与懒加载切换时提前判定就绪，已修正为真实页面标题 `Pod 级` 并补充静态契约，随后 smoke 通过。
- 测试后服务清理：本轮用过的 49848/49849/58088/58089/65382 端口均无监听；授权读取进程命令行后未发现带 `EasyPanel` 或本轮端口的 Node/Chrome/Vite 测试进程，未强杀其他项目或用户浏览器进程。

## 2026-06-01 继续执行记录：DNS / Harbor / 宝塔 / IP 扫描站内确认体验收口

- 继续按“批量改完后统一验收”的节奏收口高风险操作确认体验；本轮聚焦 DNS、Harbor、宝塔同步和 IP 扫描这些已经具备后端 `confirm=true` 语义、但前端仍残留原生浏览器确认框的入口。
- DNS 模块的服务商账号同步/保存、域名同步/保存、解析记录同步/启停/保存、故障切换立即检测/保存、定时任务创建、证书签发/申请单创建/宝塔关联保存/部署证书，已统一迁移到站内 `ConfirmActionButton` / Radix `AlertDialog`，并保留 `withDnsMutationConfirm` / query confirm 向后端发送确认语义。
- Harbor 制品删除和 Redis 镜像索引全量同步、宝塔 Ingress 手动同步、IP 扫描网段保存/首个网段扫描/单次 CIDR 扫描，已统一迁移到站内确认弹窗；对应 helper 只保留请求体/query 的 `confirm=true` 组装，不再封装 `window.confirm`。
- 扩展静态契约：DNS/Harbor/宝塔/IP 扫描测试要求这些页面使用平台确认组件，并禁止回退到 `confirm*Mutation` / `window.confirm` / 原生 `confirm()`；同时补齐 render smoke 的 DNS 解析记录列表 mock，避免严格 mock 模式下 `/api/dns/domains/1/records` 漏网。
- 本批统一验证结果：`npm run test` 346/346 通过；`npm run build` 通过；`npm run check:bundle` 通过（entry=199.87 KiB，initialJs=485.92 KiB，preloads=4）；聚焦 render smoke（DNS 六页、Harbor、宝塔同步、IP 扫描，desktop）11/11 通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示，无 whitespace error。
- 渲染验证期间首次仍遇到 Windows 沙箱内 Vite 写 `node_modules/.vite-temp` 的 `EPERM`，按授权命令在沙箱外重跑通过；测试结束后复查 55248/53603/53604/51394/51395 端口均无监听，进程命令行扫描未发现带 `EasyPanel` 或本轮端口的 Node/Chrome/Vite 残留。
- 当前距离“完美平台”仍不能判定完成：本轮目标范围内已无原生确认残留，但全局扫描仍显示账号、观测/设置、PVE、vCenter、网络和少量 App Center 页面还有 `confirm*Mutation` 原生确认入口，下一批应继续把这些入口迁到站内确认组件，并同步更新相应契约。

## 2026-06-01 继续执行记录：全局站内确认体验最终收口

- 继续按“批量改完后统一验收”的节奏把上一轮剩余的账号、观测/设置、App Center、PVE、vCenter、网络与 K8s 高风险操作入口全部从原生确认迁到站内确认体验。
- 已迁移账号资料/用户保存、Prometheus/运行时/AI provider 设置、AI 告警与监控面板配置、容器主机创建/初始化/root 密码同步、MySQL 写 SQL、PVE 目标/电源/快照、OpenWrt/iKuai 配置、vCenter 堡垒机/云主机/SFTP、K8s YAML 应用/重启/PVC 文件/CR/RBAC/etcd/VictoriaLogs/Prometheus URL 同步等页面。
- `with*MutationConfirm` / `with*MutationConfirmQuery` helper 现在只负责请求体或 query 中的 `confirm=true` 语义，不再封装 `window.confirm`；前端源码扫描 `confirm*Mutation`、`window.confirm`、裸 `confirm()` 结果为 0。
- 渲染验证期间发现 Cloud VM 详情页 smoke 样例仍用旧字符串 ID `cloud-vm-1`，但真实页面按数字 ID 解析；已修正 smoke mock 数据、路由样例与契约测试为 `/cluster/apps/cloud-vm/1`，避免以后把正确页面误判成“无效 ID”。
- 本批统一验证结果：`npm run test` 347/347 通过；`npm run build` 通过；`npm run check:bundle` 通过（entry=199.87 KiB，initialJs=485.92 KiB，preloads=4）；聚焦 render smoke（账号、设置、AI 巡检、PVE、网络、App Center、宝塔、K8s 高风险页面，desktop）19/19 通过；`go test ./... -count=1` 在 `backend/` 模块通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示，无 whitespace error。
- 渲染验证首次仍因 Windows 沙箱 `EPERM` 无法写入 `frontend/node_modules/.vite-temp`，按授权命令在本机权限下重跑通过；测试结束后复查 52430/61844/55656 等本轮 Vite 端口均无监听，进程命令行扫描未发现带 `EasyPanel`、`generate-demo-assets` 或本轮端口的 Node/Chrome/Vite 残留。
- 当前距离目标判断：按本计划定义的“可验证管理闭环”约 98% 完成。站内确认体验这一类缺口已基本收完；剩余 2% 主要是接入真实 vCenter/PVE/宝塔/iKuai/OpenWrt/K8s 环境后的端到端演练、少量真实数据下的交互细节与性能调优，不能仅凭 mock 和本地测试宣称 100% 完美。

## 2026-06-01 继续执行记录：完成度语言与站内主路径打磨

- 按“一次性批量改完后统一检查”的节奏继续收口完成度感知问题：登录页运行状态从“待完善”改为“需配置”，避免把未配置资源说成平台半成品；相关契约禁止运行时代码回退到“待完善”。
- vCenter 虚拟机控制台改为优先站内 WebMKS 主路径：VM 详情页现在主按钮进入 `/cluster/bastion/console/:moref`，外部 vSphere 官方链接降级为“备用排障链接”并只提供复制，不再把用户导向平台外网页控制台作为推荐路径。
- 算力模块继续统一成熟平台语言：`PVE 接入` 改为 `PVE 目标`，`已接入` 改为 `已配置`，资源页“健康示例”改为“状态概览”，空状态改为“还没有配置 vCenter 或 PVE”；PVE 目标摘要改为“当前 PVE 目标”。
- 应用中心部署默认资源名去 demo 化：Kafka 默认实例名改为 `kafka-main`，OpenSearch 默认实例名改为 `opensearch-main`，避免真实部署表单继续给人演示环境感。
- 新增/扩展前端静态契约，覆盖登录页完成度文案、vCenter 站内控制台主路径、算力配置语言和 App Center 部署默认名；同时修正一处旧契约断言，避免测试继续要求已废弃的“当前接入目标”。
- 本批统一验证结果：`npm run test` 350/350 通过；`npm run build` 通过；`npm run check:bundle` 通过（entry=199.87 KiB，initialJs=485.92 KiB，preloads=4）；聚焦 render smoke（`/login`、`/cluster/compute/config`、`/cluster/compute/guests`、`/cluster/compute/vcenter/vms/vm-101`、`/cluster/bastion/console/vm-101`、`/cluster/apps/kafka`、Kafka 详情与限速页、`/cluster/apps/opensearch`，desktop）9/9 通过；`go test ./... -count=1` 在 `backend/` 模块通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示，无 whitespace error。
- 渲染验证首次仍因 Windows 沙箱 `EPERM` 无法写入 `frontend/node_modules/.vite-temp`，按授权命令在本机权限下重跑通过；测试结束后复查 51201/51202/60522 端口均无监听，进程命令行扫描未发现带 `EasyPanel`、`generate-demo-assets`、本轮 Vite 端口或 Chrome 调试端口的 Node/Chrome/Vite 残留。
- 当前距离目标判断：按“本地可验证的管理闭环 + 前端成熟度”约 98.5% 完成。今天这批已经把明显的半成品文案、平台外主路径和 demo 默认值再压下去一层；剩余差距仍主要来自真实环境端到端演练、真实资产规模下的性能/交互细节，以及生产部署后的长期稳定性观察。

## 2026-06-01 继续执行记录：平台内兜底入口与配置语言收口

- 继续按“一次性批量改完，再统一检查”的节奏收口本轮剩余成熟度问题：重点处理仍会把用户导向平台外、仍使用“占位/接入”半成品语言，或测试契约仍等待旧文案的入口。
- 堡垒机 RDP / JumpServer 备用入口不再调用 `window.open`，改为站内主区域优先嵌入；当目标页面限制嵌入时，只提供“复制备用链接”，由用户在受控环境中处理。新增静态契约要求前端源码不得回退到原始 `window.open` 管理兜底。
- 宝塔主配置路径统一从“接入向导/面板接入/占位”改为“配置向导/面板配置/初始值”，强调保存真实面板地址与 API Key 后启用连通检查，不再像半成品入口。
- OpenClaw 模型配置文案不再把 Ollama 默认 Base URL 和镜像默认值称为“占位”，改为说明默认值可按实际服务地址替换；对应静态契约防止文案回退。
- 同步更新 render smoke 关键路由期望，把 `/cluster/baota/settings` 的期望文本从旧的“宝塔接入向导”修正为“宝塔配置向导”，避免测试契约与真实页面语言背离。
- 本批统一验证结果：`npm run test` 353/353 通过；`npm run build` 通过；`npm run check:bundle` 通过，entry=199.87 KiB，initialJs=485.92 KiB，preloads=4；聚焦 render smoke 覆盖 `/cluster/baota`、`/cluster/baota/ingress`、`/cluster/baota/sync`、`/cluster/baota/settings`、`/cluster/bastion`、`/cluster/bastion/session`、`/cluster/bastion/admin`、`/cluster/bastion/console/vm-101`、`/cluster/apps/openclaw/create`，desktop 9/9 通过；`go test ./... -count=1` 在 `backend/` 通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示，无 whitespace error。
- 验证过程说明：此前 render smoke 在 Windows 沙箱内仍可能遇到 Vite 写入 `frontend/node_modules/.vite-temp` 的 `EPERM`，本轮按授权在本机权限下运行通过；第一次聚焦烟测还发现旧 `expectedText` 与新页面标题不一致，已按根因修正脚本和契约测试后再统一重跑通过。
- 测试后服务清理：复查 50730/50731/55642/58702/58703 等本轮 Vite/Chrome 调试端口均无监听；授权读取进程命令行后未发现带 `EasyPanel`、`generate-demo-assets`、本轮 Vite 端口或本轮 Chrome 调试端口的 Node/Chrome/Vite 残留进程，未强杀其他项目或用户浏览器。
- 当前距离目标判断：按“本地可验证的管理闭环 + 前端成熟度”约 98.7% 完成。剩余差距不是明显半成品文案或站外主路径，而是真实 vCenter/PVE/宝塔/iKuai/OpenWrt/K8s 环境的端到端演练、真实资产规模下的交互/性能微调，以及生产部署后的长期稳定性观察；在这些真实环境验收前，不能声称 100% 完美。

## 2026-06-01 继续执行记录：站内导航语义与占位文案再收口

- 继续按“一次性批量改完，再统一检查”的节奏处理剩余成品感细节：本轮不再拆多个小目标，而是集中收口站内导航语义、全屏终端入口、内部跳转图标和少量仍像旧阶段的占位文案。
- K8s Pod 详情里的容器“新页面”终端入口改为站内 `Link` 全屏终端，不再使用 `target="_blank"`；按钮图标从外链语义改为 `Maximize2`，文案同步为“站内全屏终端页 / 全屏终端”，让 Pod 终端保持在 SPA 管理闭环内。
- 宝塔工作台与 DNS 域名页的内部跳转不再使用 `ExternalLink` 外链图标，统一改为 `ArrowRight`，避免把站内操作页误表现为外部网站。
- 堡垒机 RDP 配置说明从“占位示例”改为“填写格式”，iKuai 网络终端说明从“空映射占位”改为“空映射表”；保留真实示例、模板占位和文档外链，不把合理的帮助文本误删。
- 新增 `frontend/tests/internal-navigation-affordance.test.mjs`，长期约束 Pod 全屏终端必须留在 SPA 内、宝塔/DNS 内部跳转不得使用外链语义、核心运维说明不得回退到“占位”时代文案。
- 本批统一验证结果：`node --test tests/internal-navigation-affordance.test.mjs` 3/3 通过；`npm run test` 356/356 通过；`npm run build` 通过；`npm run check:bundle` 通过（entry=199.87 KiB，initialJs=485.92 KiB，preloads=4）；聚焦 render smoke 覆盖 `/cluster/baota`、`/cluster/baota/ingress`、`/cluster/baota/sync`、`/cluster/network/devices`、`/cluster/ns/easy/pods/easypanel-api-7d98cdd7c8-n4p2z`、`/cluster/ns/easy/pods/easypanel-api-7d98cdd7c8-n4p2z/terminal?container=api`、`/cluster/baota/settings`、`/cluster/bastion/admin`、`/cluster/apps/dns/domains`，desktop 9/9 通过；`go test ./... -count=1` 在 `backend/` 通过；`npm run lint` 通过；`npm run check:deploy` 通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示，无 whitespace error。
- 验证过程说明：第一次 render smoke 仍因 Windows 沙箱 `EPERM` 无法写入 `frontend/node_modules/.vite-temp`，按授权命令在本机权限下重跑通过；这不是页面代码失败，而是 Vite 临时配置写入被沙箱拦截。
- 测试后服务清理：复查 49597/58938/58939 端口均无监听；授权读取进程命令行后未发现带 `EasyPanel`、`generate-demo-assets`、`vite --host 127.0.0.1`、本轮 Vite 端口或本轮 Chrome 调试端口的 Node/Chrome/Vite 残留进程，因此未强杀任何其他项目或用户浏览器。
- 当前距离目标判断：按“本地可验证的管理闭环 + 前端成熟度”约 98.8% 完成。明显半成品文案、站外主路径、原生确认和内部/外部导航语义这几类可本地证明的问题已基本收口；剩余 1.2% 仍主要依赖真实 vCenter/PVE/宝塔/iKuai/OpenWrt/K8s 环境端到端验收、真实资产规模下的交互/性能微调，以及生产运行期稳定性观察。在这些真实环境验证前，不应宣称 100% 完美。

## 2026-06-01 继续执行记录：主入口成熟度语言最终收口

- 继续按“批量改完后统一验收”的节奏收口，不再拆多个小目标；本轮集中处理工作台、登录页、应用中心、K8s Dashboard、Redis、Kafka、OpenClaw、Hermes、容器主机、VL 提示和网络映射里残留的“已接入 / 示例 / 演示 / 首次引导未完成”类旧阶段语言。
- 工作台与登录页状态从“已接入”统一为“已就绪 / 已配置”；K8s Dashboard 的 `cluster-admin` 说明从“登录演示”改为“首次登录”；Redis “集群外示例”、Kafka “成员示例”、OpenClaw “外网访问示例”改为真实运维语义的“地址 / 样本”；容器主机、Hermes、OpenClaw 未初始化状态改为“尚未配置部署参数/模式”。
- 扩展 `frontend/tests/platform-polish-contract.test.mjs`，约束主入口和高频运维页面不得回退到 demo/access-era 文案；同步修正 `home-hub-card-visual-consistency` 和 render smoke 聚焦筛选契约。
- 验证过程中发现 `EASYPANEL_RENDER_SMOKE_ROUTE` 列表包含 `/` 时会因为 `item.path.includes("/")` 误选中全站路由，导致聚焦烟测膨胀并在旧 DNS 期望上失败；已修正为根路径只精确匹配，其它筛选保留模糊匹配，并用 `render-smoke-critical-routes.test.mjs` 防回归。
- 本批统一验证结果：`npm run lint` 通过；`npm run test` 357/357 通过；`npm run build` 通过；`npm run check:bundle` 通过（entry=199.87 KiB，initialJs=485.92 KiB，preloads=4）；聚焦 render smoke 覆盖 `/`、`/login`、`/cluster/pod-restart-reports`、Redis、Kafka、容器主机、OpenClaw、Hermes 相关页面，desktop 19/19 通过；`npm run check:deploy` 通过；`go test ./... -count=1` 在 `backend/` 通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示，无 whitespace error。
- 验证过程说明：第一次 render smoke 在沙箱内仍遇到 Windows `EPERM`，无法写入 `frontend/node_modules/.vite-temp`，按授权命令在本机权限下重跑；另一次 124 秒超时的根因是 `/` 筛选误触发全站烟测，非页面代码失败。修正筛选后同一批聚焦页面 53 秒完成并通过。
- 测试后服务清理：先前超时遗留的本项目 Vite 进程树（`vite --host 127.0.0.1 --port 57410 --strictPort`）已通过 `taskkill /T /F` 停止；最终复查 55717/55718/57410/54781/54782 等本轮 Vite/Chrome 调试端口均无监听，授权读取进程命令行后未发现带 `EasyPanel`、`generate-demo-assets`、`vite --host 127.0.0.1` 或本轮调试端口的 Node/Chrome/Vite 残留进程，未强杀用户正常浏览器。
- 当前距离目标判断：按“本地可验证的管理闭环 + 前端成熟度”约 98.9% 完成。可通过代码、静态契约、构建和本地渲染证明的问题已基本收口；剩余约 1.1% 主要是接入真实 vCenter/PVE/宝塔/iKuai/OpenWrt/K8s 环境后的端到端演练、真实资产规模下的性能与交互微调，以及生产运行期稳定性观察。在这些真实环境验收前，不能负责任地宣称 100% 完美。

## 2026-06-01 继续执行记录：全局兜底体验与恢复面板收口

- 继续按“一次性批量改完，然后统一检查”的节奏执行，不拆成多个小目标；本轮集中收口全局错误边界、404、登录守卫、初始化守卫、只读权限守卫和懒加载态这些平台级兜底入口。
- `AppRouteBoundary` 从旧的红色错误框升级为工作台风格恢复面板，提供返回工作台、重试当前页、刷新页面和复制错误信息；路由切换时会按 `resetKey` 自动清理旧错误，避免一个页面错误污染后续路由。
- 404 页面、登录状态错误、初始化状态错误、只读权限校验错误都改为带 `role="alert"` 的站内恢复面板，统一使用图标、明确原因、可执行按钮和安全回退入口；懒加载态从纯文本改为带 spinner 的模块加载反馈。
- 新增/扩展 `frontend/tests/app-route-boundary-reset.test.mjs` 与 `frontend/tests/platform-shell-fallbacks-contract.test.mjs`，先验证旧实现红灯，再统一实现并转绿；同时复用既有 `setup-initialization-contract`、`viewer-redirect-security-contract` 防止守卫行为回退。
- 本批统一验证结果：聚焦契约 `platform-shell-fallbacks`、`app-route-boundary-reset`、`setup-initialization-contract`、`viewer-redirect-security-contract` 合计 11/11 通过；`npm run test` 362/362 通过；`npm run lint` 通过；`npm run build` 通过；`npm run check:bundle` 通过（entry=206.57 KiB，initialJs=492.62 KiB，preloads=4）；`npm run check:deploy` 通过；`go test ./... -count=1` 在 `backend/` 通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示，无 whitespace error。
- 渲染冒烟结果：第一次沙箱内运行仍因 Windows `EPERM` 无法写入 `frontend/node_modules/.vite-temp`；授权后第一次聚焦列表误把 `/cluster` 当成模糊过滤触发大量路由并遗留 Vite 进程，已立即停止该 Vite/esbuild 进程树。随后用精确路由集合统一重跑，覆盖 `/setup`、`/login`、`/account/settings`、K8s Pod、应用中心、宝塔同步、计算、网络与文档相关页面，desktop 17/17 通过。
- 测试后服务清理：最终复查 51627/51628/61394/61395 等本轮 Vite/Chrome 调试端口均无监听；授权读取进程命令行后未发现带 `EasyPanel`、`generate-demo-assets`、`vite --host 127.0.0.1`、`demo-browser-profile` 或本轮调试端口的 Node/Chrome/Vite 残留进程。
- 当前距离目标判断：按“本地可验证的管理闭环 + 前端成熟度”约 99.0% 完成。本地能通过代码、契约、构建、部署冒烟和浏览器渲染证明的问题基本收口；剩余约 1.0% 仍是必须依赖真实 vCenter/PVE/宝塔/iKuai/OpenWrt/K8s 环境的端到端演练、真实资产规模下性能/交互微调，以及生产运行期稳定性观察。在这些真实环境验证前，不把它说成 100% 完美。
## 2026-06-01 继续执行记录：全局交互指针与全屏工作面烟测收口

- 按“批量改完后统一验证”的节奏继续收口，不再拆成多个小目标：本轮聚焦全局交互手感、移动端导航语义、原生按钮可点击性、以及全屏工具页在渲染烟测中的验收规则。
- 结合 UI/UX 复核结论，运维工作台应保持数据密集、克制、可扫描；高频操作需要清楚的 pointer affordance、稳定 hover/active 反馈、可访问语义和无布局位移。因此共享 `Button`、Dropdown、ContextMenu、Menubar、Command、Select 等交互基元统一补齐 `cursor-pointer`，并保留禁用态语义。
- 主壳层和高频入口继续收口：移动端底部导航补齐 `aria-current`，移动端/桌面账户菜单补齐明确 `aria-label`，搜索结果、通知入口、登录密码显隐按钮等原生控件补齐点击语义；公有云 SSH 高频按钮移除 scale transform 点击反馈，避免列表/卡片在点击时产生抖动。
- 渲染烟测发现堡垒机会话与 WebMKS 控制台本身是全屏工作面，不应强制要求普通 AppShell；已将 `/cluster/bastion/session` 与 `/cluster/bastion/console/:moref` 纳入 standalone shell 白名单，并用静态契约防止回退，和已有 Pod 全屏终端规则保持一致。
- 新增 `frontend/tests/shared-ui-interaction-polish.test.mjs`，约束全局交互基元、主壳层原生控件与高频操作按钮的长期体验边界；扩展 `render-smoke-critical-routes.test.mjs`，约束全屏工具页允许不挂普通 AppShell。
- 本批统一验证结果：`npm run test` 365/365 通过；`npm run lint` 通过；`npm run build` 通过；`npm run check:bundle` 通过（entry=206.81 KiB，initialJs=492.86 KiB，preloads=4）；`npm run check:deploy` 通过（assets=6，spaFallback=6，nginx=/api,/r,/d）；`go test ./... -count=1` 在 `backend/` 通过；聚焦 render smoke 覆盖 `/`、`/login`、账户设置、算力云主机、网络 Dashboard、应用中心、堡垒机会话与 WebMKS 控制台，desktop/mobile 共 18 项通过。
- 测试后服务清理：最终复查 59185/59186/5173 等本轮相关 Vite/Chrome 调试端口均无监听；进程命令行扫描未发现带 `EasyPanel`、`generate-demo-assets`、`vite --host 127.0.0.1`、`demo-browser-profile` 或本轮调试端口的 Node/Chrome/Vite 残留进程，未触碰用户正常浏览器。
- 当前距离目标判断：按“本地可验证的管理闭环 + 前端成熟度”约 99.1% 完成。本地能证明的页面身份、站内主路径、危险操作确认、兜底恢复、交互语义、构建部署与浏览器渲染问题已经基本收口；剩余约 0.9% 仍依赖真实 vCenter/PVE/宝塔/iKuai/OpenWrt/K8s 环境端到端演练、真实资产规模下的性能/交互微调，以及生产运行期稳定性观察。在这些真实环境验收前，不负责任地宣称 100% 完美。

## 2026-06-01 继续执行记录：原生控件交互基线与稳定 hover 收口

- 继续按“一次性改完后统一检查”的节奏收口，不拆成多个小目标：本轮集中复扫外跳、原生确认、危险 GET 写入、占位文案、全局原生控件语义、密集面板 hover 稳定性和原生按钮契约。
- 复扫结果：前端未发现新的 `window.open`、`target="_blank"` 或原生 `alert/confirm/prompt` 回退；后端 GET 路由未发现危险写入语义；应用中心 Hysteria 客户端配置 reveal 已具备权限校验、当前密码校验和 `confirm=true` 标准确认，不需要重复改动。
- 全局交互基线继续补齐：`index.css` 新增原生 `button`、checkbox、radio、select、summary 和 `[role="button"]` 的 pointer 语义，以及禁用态 / `aria-disabled` 的 `not-allowed` 语义，避免未封装的原生控件在平台里显得不可点或状态不清。
- 计算配置卡片与网络 Dashboard 资源卡移除 `hover:-translate-y-0.5`，改为颜色、边框和阴影反馈；密集运维面板不再因为 hover 产生布局位移，手感更稳。
- 扩展 `frontend/tests/shared-ui-interaction-polish.test.mjs`：约束全局原生控件 cursor 语义、所有原生 `<button>` 必须显式声明 `type`、密集 Dashboard 控件不得使用 hover translate；按契约发现 `SidebarRail` 缺少 `type="button"` 后已修复。
- 本批统一验证结果：`npm run test` 368/368 通过；`npm run lint` 通过；`npm run build` 通过；`npm run check:bundle` 通过（entry=206.81 KiB，initialJs=492.86 KiB，preloads=4）；`npm run check:deploy` 通过（assets=6，spaFallback=6，nginx=/api,/r,/d）；聚焦 render smoke 覆盖 `/`、`/cluster/compute/config`、`/cluster/network/dashboard`、`/cluster/apps/dashboard`、`/cluster/bastion` 及堡垒机会话/控制台派生路由，desktop/mobile 共 16 项通过；`go test ./... -count=1` 在 `backend/` 通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示，无 whitespace error。
- 测试后服务清理：本轮 render smoke 使用 Vite 端口 64257、Chrome 调试端口 64258；最终复查两端口均无监听，授权读取进程命令行后未发现带 `EasyPanel`、`generate-demo-assets`、`vite --host 127.0.0.1` 或本轮调试端口的 Node/Chrome/Vite 残留进程，未强杀用户正常浏览器。
- 当前距离目标判断：按“本地可验证的管理闭环 + 前端成熟度”约 99.2% 完成。本地可证明的页面身份、站内主路径、危险操作确认、兜底恢复、交互语义、构建部署和渲染烟测已基本收口；剩余约 0.8% 仍必须依赖真实 vCenter/PVE/宝塔/iKuai/OpenWrt/K8s 环境端到端验收、真实资产规模下性能/交互微调，以及生产运行期稳定性观察。在这些真实环境验收前，不把它说成 100% 完美。

## 2026-06-01 继续执行记录：DNS Ping 探针、K8s 通用 YAML 应用与剩余半成品语义收口

- 继续按“一次性改完后统一检查”的节奏执行：先批量复扫可本地证明的功能缺口和半成品语义，再集中实现，最后统一跑 Go、前端单测、lint、构建、bundle、部署烟测、浏览器渲染烟测与 diff 检查。
- DNS 故障切换从“Ping 暂不支持”补齐为真实后端探针：`ping` 检测会解析目标主机并调用系统 ping，Windows/Linux 参数分别适配超时语义；前端健康监测与 Dashboard 同步暴露 HTTP/HTTPS/TCP/Ping 探针，不再把用户推回 HTTP/TCP 替代方案。
- 网络配置预览里的“暂不支持”语义已收口为“需人工处理项”：仍然保留真实平台差异带来的人工确认边界，但不再呈现为半成品能力缺口。
- Kubernetes 通用 YAML apply 与对象版本回滚已接入 REST 配置并复用动态 server-side apply：常见资源继续走 typed fast path，Role、ClusterRole、StorageClass、CR 等合法 Kind 会走动态应用，不再因为超出白名单就要求用户离开平台手工 kubectl。
- 产品源代码复扫未发现新的 `暂不支持`、`待实现`、`未实现`、`coming soon` 文案；未发现新的原生 `alert/confirm/prompt` 回退；外链语义保留在文档/帮助等合理场景。
- 本批统一验证结果：`go test ./... -count=1` 在 `backend/` 通过；`npm run test` 368/368 通过；`npm run lint` 通过；`npm run build` 通过；`npm run check:bundle` 通过（entry=206.81 KiB，initialJs=492.86 KiB，preloads=4）；`npm run check:deploy` 通过（assets=6，spaFallback=6，nginx=/api,/r,/d）；聚焦 render smoke 覆盖 DNS Dashboard/Failover、网络 Dashboard/接口、ConfigMap 详情，desktop/mobile 共 20 项通过；`node --test tests/render-smoke-critical-routes.test.mjs` 21/21 通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示，无 whitespace error。
- 渲染烟测过程中发现 DNS Dashboard 期待值仍按源码大小写匹配 `Dashboard`，但浏览器真实可见文本受 `uppercase` 样式影响为 `DASHBOARD`；已按真实渲染修正脚本期待值并重跑通过，这属于验收脚本与可见 UI 的一致性修正，不是页面崩溃。
- 测试后服务清理：失败重跑端口 57780/57781 与最终通过端口 65300/65301 均复查为无监听；授权读取进程命令行后未发现带 `EasyPanel`、`generate-demo-assets`、`vite --host 127.0.0.1`、`demo-browser-profile` 或本轮调试端口的 Node/Chrome/Vite 残留进程，未触碰用户正常浏览器。
- 当前距离目标判断：按“本地可验证的管理闭环 + 前端成熟度”约 99.3% 完成。本地可证明的管理闭环、半成品语义、危险操作确认、前端主路径、构建部署和浏览器渲染已经基本收口；剩余约 0.7% 仍必须依赖真实 vCenter/PVE/宝塔/iKuai/OpenWrt/K8s 环境端到端验收、真实资产规模下的性能/交互微调，以及生产运行期稳定性观察。在这些真实环境验收前，不把它说成 100% 完美。

## 2026-06-01 边界修正：不新增一次性验收入口

- 撤回“只读验收报告构建器 / 独立验收页 / `/api/platform/acceptance`”方案；这类项目原本没有的临时验收面不进入产品代码，也不作为剩余 0.7% 的实现方向。
- 后续收口只允许发生在现有模块和现有组件内：安全过滤、权限确认、交互一致性、文案去半成品化、静态契约、构建与渲染验证，以及真实环境人工验收记录。
- 本轮继续执行范围限定为现有共享图表组件与 Pod 日志面板的 HTML 渲染安全契约：图表 `<style>` 注入只允许安全 CSS 变量名和颜色值，Pod 日志 ANSI 渲染必须保持 HTML 转义；不新增页面、路由、API 或一次性工具。
- 运行时代码复查确认 `backend/`、`frontend/`、`scripts/` 中不再保留 `platform/acceptance`、`PlatformAcceptance`、`platform_acceptance`、`handlePlatformAcceptance` 或验收报告构建器相关入口；文档中仅保留本条撤回边界说明。
- 本批统一验证结果：`npm run test` 369/369 通过；`npm run lint` 通过；`npm run build` 通过；`npm run check:bundle` 通过（entry=206.81 KiB，initialJs=492.86 KiB，preloads=4）；`npm run check:deploy` 通过（assets=6，spaFallback=6，nginx=/api,/r,/d）；`go test ./... -count=1` 在 `backend/` 通过；`git diff --check` 退出码 0，仅保留既有 CRLF/LF 提示，无 whitespace error。
- 渲染烟测说明：直接运行全量 `npm run check:render` 被工具 244 秒超时截断，属于全路由/多视口烟测耗时超过本次命令上限；截断后已停止遗留 Node。随后按本轮实际影响面聚焦重跑并通过：Pod 详情/终端、Redis、计算 Dashboard、网络 Dashboard、etcd 在 desktop/mobile 共 12 项通过。
- 测试后服务清理：聚焦渲染烟测端口 59084/59085、失败沙箱重跑端口 63655、本轮超时残留端口 52163 均复查为无监听；本轮启动的 Node 进程已停止，最终未发现 Node 残留；未触碰用户正常 Chrome/Edge。
