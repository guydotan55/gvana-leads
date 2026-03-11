import { clientConfig } from "@/client.config";

const colorClasses: Record<string, string> = {
  orange: "bg-orange-100 text-orange-700",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
  red: "bg-red-100 text-red-700",
  gray: "bg-gray-100 text-gray-700",
};

interface StatusBadgeProps {
  statusKey: string;
}

export default function StatusBadge({ statusKey }: StatusBadgeProps) {
  const status = clientConfig.statuses.find((s) => s.key === statusKey);
  if (!status) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
        {statusKey}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        colorClasses[status.color] || colorClasses.gray
      }`}
    >
      {status.label}
    </span>
  );
}
