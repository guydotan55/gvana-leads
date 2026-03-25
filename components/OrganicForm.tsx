"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

interface OrganicFormProps {
  type: "student" | "instructor";
}

export default function OrganicForm({ type }: OrganicFormProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const searchParams = useSearchParams();
  const utmSource = searchParams.get("utm_source") || "";
  const utmMedium = searchParams.get("utm_medium") || "";
  const utmCampaign = searchParams.get("utm_campaign") || "";
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const title = type === "instructor" ? "הרשמה למדריכים" : "הרשמה לחניכים";
  const subtitle = type === "instructor"
    ? "מכינת גוונא — טופס הרשמה למדריכים"
    : "מכינת גוונא — טופס הרשמה לחניכים";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/organic-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone, type, utmSource, utmMedium, utmCampaign }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "שגיאה");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחה");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center space-y-4">
          <div className="text-4xl">✓</div>
          <h2 className="text-xl font-bold text-green-600">נשלח בהצלחה!</h2>
          <p className="text-gray-500 text-sm">הפרטים שלך התקבלו, ניצור איתך קשר בהקדם.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold" style={{ color: "#1d2752" }}>{title}</h1>
          <p className="text-gray-500 text-sm mt-1">{subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
              שם מלא
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-transparent outline-none text-base"
              placeholder="הכנס שם מלא"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              טלפון
            </label>
            <input
              id="phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-transparent outline-none text-base"
              placeholder="050-0000000"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity text-base"
            style={{ backgroundColor: "#1d2752" }}
          >
            {submitting ? "שולח..." : "שלח"}
          </button>
        </form>
      </div>
    </div>
  );
}
