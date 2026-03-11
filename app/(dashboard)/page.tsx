import { t } from "@/lib/i18n";

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-navy mb-6">
        {t("nav.dashboard")}
      </h1>
      <p className="text-gray-500">{t("common.loading")}</p>
    </div>
  );
}
