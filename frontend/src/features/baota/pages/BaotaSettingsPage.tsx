import React from "react";
import SettingsRuntimeSection from "@/features/settings/components/SettingsRuntimeSection";

const BaotaSettingsPage: React.FC = () => {
  return (
    <div className="mx-auto w-full space-y-8 pb-12">
      <div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">宝塔接入向导</h1>
        <p className="text-sm text-gray-500">
          按面板接入、同步策略、HTTPS 证书与高级配置分段维护宝塔运行时参数；保存后写入 MySQL 动态配置并热重载。入口控制器安装与镜像策略请在「集群设置」中维护。
        </p>
      </div>
      <SettingsRuntimeSection variant="baota" />
    </div>
  );
};

export default BaotaSettingsPage;
