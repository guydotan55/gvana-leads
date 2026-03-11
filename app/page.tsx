import { t } from "@/lib/i18n";

export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <h1 className="text-3xl font-bold text-brand-navy">
        {t("app.title")}
      </h1>
    </div>
  );
}
