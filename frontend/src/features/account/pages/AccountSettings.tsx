import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-context";
import SettingsRuntimeSection from "@/features/settings/components/SettingsRuntimeSection";

const AccountSettings: React.FC = () => {
  const { status, refetch } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const oidcBind = searchParams.get("oidc_bind");
  const oidcReason = searchParams.get("reason") ?? "";
  const oidcMessage = searchParams.get("message") ?? "";

  useEffect(() => {
    if (!oidcBind) return;
    if (oidcBind === "ok") {
      toast.success("Authentik / OIDC 已绑定，可使用登录页的 OIDC 登录。");
      void refetch();
    } else if (oidcBind === "conflict") {
      toast.error("该 Authentik 账号已绑定到其他平台用户，无法重复绑定。");
    } else if (oidcBind === "duplicate") {
      toast.error("绑定冲突：数据库唯一约束（请联系管理员）。");
    } else if (oidcBind === "err") {
      const hints: Record<string, string> = {
        exchange: "授权码换取令牌失败，请重试或检查 IdP 与 Redirect URI。",
        verify: "ID Token 校验失败，请检查签名算法与 issuer 等配置。",
        discovery: "无法连接 OIDC 发现地址。",
        state: "安全校验失败（state），请重新发起绑定。",
        nonce: "缺少或无效的 nonce，请重新发起绑定。",
        nonce_mismatch: "nonce 不匹配，请重新发起绑定。",
        nosub: "IdP 返回的 token 缺少 sub。",
        nodb: "未连接 MySQL。",
        lookup: "查询绑定信息失败。",
        save: "保存绑定失败。",
        missing_code: "缺少授权参数，请重新发起绑定。",
        no_id_token: "IdP 未返回 id_token。",
        idp: oidcMessage ? `IdP 错误：${decodeURIComponent(oidcMessage)}` : "IdP 返回错误。",
      };
      toast.error(hints[oidcReason] ?? "绑定失败，请重试。");
    }
    setSearchParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete("oidc_bind");
        n.delete("reason");
        n.delete("message");
        return n;
      },
      { replace: true }
    );
  }, [oidcBind, oidcReason, oidcMessage, setSearchParams, refetch]);
  return (
    <div className="mx-auto max-w-4xl pb-12">
      <div className="mb-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">账户与平台</h1>
        <p className="text-sm text-gray-500">
          仅平台层配置（Redis、登录与 OIDC），与 Kubernetes / vCenter 集群菜单独立。MySQL 连接来自静态配置；宝塔与 Ingress 请在「宝塔」工作区中配置。保存后写入{" "}
          <code className="text-xs">MySQL 动态配置</code> 并热重载。
        </p>
        {status?.loggedIn && !status.mysqlReachable ? (
          <div className="mt-6 rounded-lg border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-amber-950/90">
            当前未连接 MySQL 或用户表不可用，个人中心内资料将无法加载。请配置并连通 MySQL 后刷新。
          </div>
        ) : null}
      </div>
      <SettingsRuntimeSection variant="account" />
    </div>
  );
};

export default AccountSettings;
