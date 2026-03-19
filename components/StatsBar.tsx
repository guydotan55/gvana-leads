import { t } from "@/lib/i18n";

interface StatsBarProps {
  newToday: number;
  relevant: number;
  notRelevant: number;
  unavailable: number;
}

export default function StatsBar({ newToday, relevant, notRelevant, unavailable }: StatsBarProps) {
  const stats = [
    { label: t("stats.newToday"), value: newToday, color: "text-brand-orange" },
    { label: t("stats.relevant"), value: relevant, color: "text-green-600" },
    { label: t("stats.notRelevant"), value: notRelevant, color: "text-red-500" },
    { label: t("stats.unavailable"), value: unavailable, color: "text-gray-500" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
        >
          <p className="text-sm text-gray-500">{stat.label}</p>
          <p className={`text-3xl font-bold mt-1 ${stat.color}`}>
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}
