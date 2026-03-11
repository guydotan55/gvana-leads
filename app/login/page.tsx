import { clientConfig } from "@/client.config";
import { t } from "@/lib/i18n";
import LoginForm from "@/components/LoginForm";
import Image from "next/image";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          {clientConfig.logo && (
            <Image
              src={clientConfig.logo}
              alt={clientConfig.name}
              width={80}
              height={80}
              className="rounded-lg"
            />
          )}
          <h1 className="text-xl font-bold text-brand-navy">
            {t("login.title")}
          </h1>
          <p className="text-gray-500 text-sm">{clientConfig.name}</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
