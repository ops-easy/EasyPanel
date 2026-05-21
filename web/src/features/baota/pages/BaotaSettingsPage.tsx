import React from "react";
import SettingsRuntimeSection from "@/features/settings/components/SettingsRuntimeSection";

const BaotaSettingsPage: React.FC = () => {
  return (
    <div className="mx-auto w-full space-y-8 pb-12">
      <div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">宝塔与 Ingress</h1>
        <p className="text-sm text-gray-500">
          面板地址、API Key、DDNS、同步间隔，以及宝塔 HTTPS 证书来源（证书名或 PEM/KEY 路径）；保存后写入 MySQL 动态配置并热重载。MySQL 静态连接、Redis 与登录请在「账户与平台」中查看或配置。
        </p>
      </div>
      <SettingsRuntimeSection variant="baota" />
    </div>
  );
};

export default BaotaSettingsPage;
