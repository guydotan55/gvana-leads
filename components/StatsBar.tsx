import { t } from "@/lib/i18n";

interface StatsBarProps {
  newToday: number;
  messagesSent: number;
  readReceipts: number;
  qualified: number;
}

export default function StatsBar({ newToday, messagesSent, readReceipts, qualified }: StatsBarProps) {
  const stats = [
    { label: t("stats.newToday"), value: newToday, color: "text-brand-orange" },
    { label: t("stats.messagesSent"), value: messagesSent, color: "text-brand-sky" },
    { label: t("stats.readReceipts"), value: readReceipts, color: "text-green-600" },
    { label: t("stats.qualified"), value: qualified, color: "text-brand-orange" },
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
