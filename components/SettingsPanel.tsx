"use client";

import { useState, useEffect } from "react";
import { t } from "@/lib/i18n";
import { clientConfig } from "@/client.config";
import TriggerEditor from "./TriggerEditor";
import { isFeatureEnabled } from "@/lib/config";

interface IntegrationStatus {
  name: string;
  connected: boolean;
  details?: string;
}

export default function SettingsPanel() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);

  useEffect(() => {
    checkIntegrations();
  }, []);

  async function checkIntegrations() {
    const checks: IntegrationStatus[] = [];

    try {
      const res = await fetch("/api/leads");
      checks.push({
        name: "Google Sheets",
        connected: res.ok,
        details: res.ok ? "Connected" : "Error",
      });
    } catch {
      checks.push({ name: "Google Sheets", connected: false, details: "Unreachable" });
    }

    if (clientConfig.integrations.infobip.enabled) {
      try {
        const res = await fetch("/api/templates/sync");
        checks.push({
          name: "Infobip WhatsApp",
          connected: res.ok,
          details: res.ok ? "Connected" : "Error",
        });
      } catch {
        checks.push({ name: "Infobip WhatsApp", connected: false, details: "Unreachable" });
      }
    }

    if (clientConfig.integrations.capi.enabled) {
      checks.push({
        name: "Facebook CAPI",
        connected: true,
        details: "Config-based check",
      });
    }

    setIntegrations(checks);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-brand-navy">{t("settings.title")}</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-brand-navy">
          {t("settings.integrations")}
        </h2>
        <div className="grid gap-3">
          {integrations.map((integration) => (
            <div
              key={integration.name}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between"
            >
              <span className="font-medium text-gray-900">
                {integration.name}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {integration.details}
                </span>
                <span
                  className={`h-3 w-3 rounded-full ${
                    integration.connected ? "bg-green-500" : "bg-red-500"
                  }`}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-brand-navy">Client Config</h2>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Name</dt>
              <dd className="font-medium">{clientConfig.name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Locale</dt>
              <dd className="font-medium">{clientConfig.locale} ({clientConfig.dir})</dd>
            </div>
            <div>
              <dt className="text-gray-500">Statuses</dt>
              <dd className="font-medium">
                {clientConfig.statuses.map((s) => s.label).join(", ")}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Features</dt>
              <dd className="font-medium">
                {Object.entries(clientConfig.features)
                  .filter(([, v]) => v)
                  .map(([k]) => k)
                  .join(", ")}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {isFeatureEnabled("triggers") && (
        <section>
          <TriggerEditor />
        </section>
      )}
    </div>
  );
}
