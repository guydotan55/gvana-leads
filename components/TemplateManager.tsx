"use client";

import { useState, useEffect } from "react";
import { t } from "@/lib/i18n";
import { clientConfig } from "@/client.config";
import MessagePreview from "./MessagePreview";
import type { WhatsAppTemplate } from "@/lib/infobip";
import columnsConfig from "@/config/columns.json";

interface TemplateMappings {
  mappings: Record<
    string,
    { language: string; placeholders: Record<string, string> }
  >;
}

export default function TemplateManager() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [mappings, setMappings] = useState<TemplateMappings>({ mappings: {} });
  const [syncing, setSyncing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const columnKeys = Object.keys(columnsConfig.columns);

  useEffect(() => {
    fetchMappings();
  }, []);

  async function fetchMappings() {
    const res = await fetch("/api/templates/mappings");
    if (res.ok) {
      setMappings(await res.json());
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/templates/sync");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates);
      }
    } finally {
      setSyncing(false);
    }
  }

  async function saveMappings(updated: TemplateMappings) {
    setMappings(updated);
    await fetch("/api/templates/mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
  }

  function handlePlaceholderChange(
    templateName: string,
    language: string,
    placeholderIndex: string,
    columnKey: string
  ) {
    const updated = { ...mappings };
    if (!updated.mappings[templateName]) {
      updated.mappings[templateName] = { language, placeholders: {} };
    }
    updated.mappings[templateName].placeholders[placeholderIndex] = columnKey;
    saveMappings(updated);
  }

  function getPlaceholders(template: WhatsAppTemplate): string[] {
    const matches = template.structure.body.text.match(/\{\{(\d+)\}\}/g) || [];
    return [...new Set(matches.map((m) => m.replace(/[{}]/g, "")))];
  }

  function getPreviewText(template: WhatsAppTemplate): string {
    let text = template.structure.body.text;
    const mapping = mappings.mappings[template.name];
    if (mapping) {
      const placeholders = getPlaceholders(template);
      placeholders.forEach((p) => {
        const columnKey = mapping.placeholders[p];
        const header =
          columnsConfig.columns[columnKey as keyof typeof columnsConfig.columns]
            ?.header || `{{${p}}}`;
        text = text.replace(`{{${p}}}`, `[${header}]`);
      });
    }
    return text;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-brand-navy">
          {t("templates.title")}
        </h2>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 bg-brand-sky text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {syncing ? t("common.loading") : t("templates.sync")}
        </button>
      </div>

      {templates.length === 0 && (
        <p className="text-gray-400 text-center py-8">
          {t("templates.noTemplates")}
        </p>
      )}

      <div className="grid gap-4">
        {templates.map((template) => {
          const placeholders = getPlaceholders(template);
          const isSelected = selectedTemplate === template.name;

          return (
            <div
              key={template.name}
              className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <button
                onClick={() =>
                  setSelectedTemplate(isSelected ? null : template.name)
                }
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">
                    {template.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {template.language}
                  </span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
                  {template.status}
                </span>
              </button>

              {isSelected && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-4">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-gray-700">
                        {t("templates.mapping")}
                      </h3>
                      {placeholders.length === 0 && (
                        <p className="text-sm text-gray-400">
                          No placeholders in this template.
                        </p>
                      )}
                      {placeholders.map((p) => (
                        <div key={p} className="flex items-center gap-3">
                          <span className="text-sm font-mono text-gray-500 w-12">
                            {`{{${p}}}`}
                          </span>
                          <select
                            value={
                              mappings.mappings[template.name]?.placeholders[
                                p
                              ] || ""
                            }
                            onChange={(e) =>
                              handlePlaceholderChange(
                                template.name,
                                template.language,
                                p,
                                e.target.value
                              )
                            }
                            className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-sky focus:border-transparent outline-none"
                          >
                            <option value="">— Select column —</option>
                            {columnKeys.map((key) => (
                              <option key={key} value={key}>
                                {
                                  columnsConfig.columns[
                                    key as keyof typeof columnsConfig.columns
                                  ].header
                                }
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-gray-700">
                        {t("templates.preview")}
                      </h3>
                      <MessagePreview
                        text={getPreviewText(template)}
                        direction={clientConfig.dir}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
