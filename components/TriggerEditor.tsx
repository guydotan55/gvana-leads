"use client";

import { useState, useEffect } from "react";
import { t } from "@/lib/i18n";
import type { Trigger } from "@/lib/triggers";

export default function TriggerEditor() {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/triggers")
      .then((r) => r.json())
      .then((data) => {
        setTriggers(data.triggers || []);
        setLoading(false);
      });
  }, []);

  async function toggleTrigger(id: string) {
    const updated = triggers.map((trig) =>
      trig.id === id ? { ...trig, enabled: !trig.enabled } : trig
    );
    setTriggers(updated);
    await fetch("/api/triggers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ triggers: updated }),
    });
  }

  if (loading) return <p className="text-gray-400">{t("common.loading")}</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-brand-navy">
        Smart Triggers
      </h2>

      {triggers.length === 0 && (
        <p className="text-gray-400">No triggers configured.</p>
      )}

      {triggers.map((trigger) => (
        <div
          key={trigger.id}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium text-gray-900">{trigger.name}</span>
              <p className="text-sm text-gray-500 mt-0.5">
                When: {trigger.when} | Delay: {trigger.delay_minutes}min |
                Template: {trigger.template || "Not set"}
              </p>
            </div>
            <button
              onClick={() => toggleTrigger(trigger.id)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                trigger.enabled ? "bg-green-500" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  trigger.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
