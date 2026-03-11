"use client";

import { useState, useEffect } from "react";
import { t } from "@/lib/i18n";
import { clientConfig } from "@/client.config";
import MessagePreview from "./MessagePreview";
import type { Lead } from "@/lib/sheets";
import type { WhatsAppTemplate } from "@/lib/infobip";

interface SendMessageDialogProps {
  lead: Lead;
  onClose: () => void;
  onSent: () => void;
}

interface TemplateMappings {
  mappings: Record<
    string,
    { language: string; placeholders: Record<string, string> }
  >;
}

export default function SendMessageDialog({
  lead,
  onClose,
  onSent,
}: SendMessageDialogProps) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [mappings, setMappings] = useState<TemplateMappings>({ mappings: {} });
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/templates/sync").then((r) => r.json()),
      fetch("/api/templates/mappings").then((r) => r.json()),
    ]).then(([templatesData, mappingsData]) => {
      setTemplates(templatesData.templates || []);
      setMappings(mappingsData);
    });
  }, []);

  function getPreviewText(): string {
    const template = templates.find((tmpl) => tmpl.name === selectedTemplate);
    if (!template) return "";

    let text = template.structure.body.text;
    const mapping = mappings.mappings[template.name];
    if (mapping) {
      const matches = text.match(/\{\{(\d+)\}\}/g) || [];
      matches.forEach((match) => {
        const index = match.replace(/[{}]/g, "");
        const columnKey = mapping.placeholders[index];
        if (columnKey) {
          const value = lead[columnKey as keyof Lead] || "";
          text = text.replace(match, String(value));
        }
      });
    }
    return text;
  }

  async function handleSend() {
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadRow: lead.row,
          templateName: selectedTemplate,
        }),
      });
      if (res.ok) {
        onSent();
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || t("common.error"));
      }
    } catch {
      setError(t("common.error"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-navy">
            {t("actions.send")} — {lead.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ×
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Template
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-sky focus:border-transparent outline-none"
          >
            <option value="">— Select template —</option>
            {templates.map((tmpl) => (
              <option key={tmpl.name} value={tmpl.name}>
                {tmpl.name} ({tmpl.language})
              </option>
            ))}
          </select>
        </div>

        {selectedTemplate && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("templates.preview")}
            </label>
            <MessagePreview
              text={getPreviewText()}
              direction={clientConfig.dir}
            />
          </div>
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSend}
            disabled={!selectedTemplate || sending}
            className="px-4 py-2 bg-brand-sky text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {sending ? t("common.loading") : t("actions.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
