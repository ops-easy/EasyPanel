# 前端路由迁移护栏

`route-inventory.ts` 中的路径是模块化迁移期间必须保持稳定的关键入口。

当前项目没有测试框架，迁移阶段使用以下命令作为基础验证：

```powershell
npm run lint
npm run build
```

每次拆分路由后，需要人工打开以下入口做冒烟检查：

- `/`
- `/cluster`
- `/cluster/apps/dashboard`
- `/cluster/apps/redis`
- `/cluster/apps/mysql`
- `/cluster/apps/kafka`
- `/cluster/apps/opensearch`
- `/cluster/apps/dns`
- `/cluster/apps/cloud-vm`
- `/cluster/apps/openclaw`
- `/cluster/apps/hermes`
- `/cluster/vcenter/dashboard`
- `/cluster/ai-inspect`
- `/docs`
