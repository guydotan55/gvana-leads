import { t } from "@/lib/i18n";
import DashboardClient from "@/components/DashboardClient";

export default function DashboardPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">
          {t("nav.dashboard")}
        </h1>
      </div>
      <DashboardClient />
    </div>
  );
}
