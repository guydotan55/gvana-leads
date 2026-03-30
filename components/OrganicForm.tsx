"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

interface OrganicFormProps {
  type: "student" | "instructor";
}

const PROGRAM_OPTIONS = [
  { value: "קצרה", label: "תוכנית קצרה" },
  { value: "ארוכה", label: "תוכנית ארוכה" },
  { value: "טכנולוגית", label: "תוכנית טכנולוגית" },
];

export default function OrganicForm({ type }: OrganicFormProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [city, setCity] = useState("");
  const [programs, setPrograms] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const searchParams = useSearchParams();
  const utmSource = searchParams.get("utm_source") || "";
  const utmMedium = searchParams.get("utm_medium") || "";
  const utmCampaign = searchParams.get("utm_campaign") || "";

  function toggleProgram(value: string) {
    setPrograms((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]
    );
  }

  const canSubmit =
    fullName.trim() !== "" &&
    phone.trim() !== "" &&
    age.trim() !== "" &&
    city.trim() !== "" &&
    programs.length > 0;

  async function handleSubmit() {
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/organic-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone,
          type,
          utmSource,
          utmMedium,
          utmCampaign,
          extras: {
            "גיל": age.trim(),
            "עיר מגורים": city.trim(),
            "תוכנית מעניינת": programs.join(", "),
          },
        }),
      });

      if (!res.ok) throw new Error("שגיאה בשליחה");
      setSubmitted(true);
    } catch {
      setError("שגיאה בשליחה, נסה שוב");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="form-page">
        <div className="bg-decoration">
          <div className="bg-blob bg-blob-1" />
          <div className="bg-blob bg-blob-2" />
        </div>
        <div className="form-container">
          <div className="form-card success-card">
            <div style={{ width: 64, height: 64, margin: "0 auto 20px", color: "#16a34a" }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2>הטופס נשלח בהצלחה!</h2>
            <p>תודה שמילאת את הטופס. ניצור איתך קשר בהקדם.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="form-page">
      <div className="bg-decoration">
        <div className="bg-blob bg-blob-1" />
        <div className="bg-blob bg-blob-2" />
        <div className="bg-blob bg-blob-3" />
      </div>

      <div className="form-container">
        <header className="form-header">
          <Image src="/logo-color.png" alt="מכינת גוונא" width={80} height={80} className="form-logo" />
          <h1>הרשמה למכינת גוונא</h1>
          <p className="subtitle">מכינת גוונא — קד״צ ליוצאי החברה החרדית</p>
        </header>

        <div className="form-card">
          <div className="step-content">
            <div className="field">
              <label htmlFor="fullName">שם מלא *</label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="השם המלא שלך"
              />
            </div>

            <div className="field">
              <label htmlFor="phone">מספר טלפון *</label>
              <input
                id="phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                placeholder="050-0000000"
              />
            </div>

            <div className="field">
              <label htmlFor="age">גיל *</label>
              <input
                id="age"
                type="number"
                required
                value={age}
                onChange={(e) => setAge(e.target.value)}
                dir="ltr"
                placeholder="לדוגמה: 20"
                min="14"
                max="99"
              />
            </div>

            <div className="field">
              <label htmlFor="city">עיר מגורים *</label>
              <input
                id="city"
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="עיר מגורים נוכחית"
              />
            </div>

            <div className="field">
              <label>איזה תוכנית מעניינת אותך? *</label>
              <span className="field-hint">ניתן לבחור יותר מאפשרות אחת</span>
              <div className="checkbox-group">
                {PROGRAM_OPTIONS.map((opt) => (
                  <label key={opt.value} className={`checkbox-option ${programs.includes(opt.value) ? "selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={programs.includes(opt.value)}
                      onChange={() => toggleProgram(opt.value)}
                    />
                    <span className="checkbox-box">
                      {programs.includes(opt.value) && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </span>
                    <span className="checkbox-label">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {error && <p className="error-msg">{error}</p>}

          <div className="form-nav">
            <div className="nav-spacer" />
            <button
              type="button"
              className="btn-submit"
              disabled={!canSubmit || submitting}
              onClick={handleSubmit}
            >
              {submitting ? "שולח..." : "שלח טופס"}
            </button>
          </div>
        </div>

        <p className="footer-note">מכינת גוונא — קד״צ ליוצאי החברה החרדית</p>
      </div>

      <style jsx>{`
        .form-page {
          min-height: 100dvh;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 24px 16px 48px;
          position: relative;
          overflow: hidden;
          background: linear-gradient(160deg, #f0f4f8 0%, #e8edf5 40%, #fdf5ee 100%);
          font-family: system-ui, -apple-system, sans-serif;
        }

        .bg-decoration {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
        }

        .bg-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.15;
        }

        .bg-blob-1 {
          width: 400px;
          height: 400px;
          background: #0EA5E9;
          top: -100px;
          right: -100px;
        }

        .bg-blob-2 {
          width: 300px;
          height: 300px;
          background: #d9642c;
          bottom: -50px;
          left: -80px;
        }

        .bg-blob-3 {
          width: 250px;
          height: 250px;
          background: #ec9e3f;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        .form-container {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 520px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-header {
          text-align: center;
          padding: 8px 0;
        }

        .form-header h1 {
          font-size: 22px;
          font-weight: 700;
          color: #1d2752;
          margin: 12px 0 4px;
          line-height: 1.4;
        }

        .subtitle {
          font-size: 14px;
          color: #6b7280;
          margin: 0;
        }

        .form-card {
          background: white;
          border-radius: 20px;
          padding: 28px 24px;
          box-shadow:
            0 1px 3px rgba(0, 0, 0, 0.04),
            0 6px 24px rgba(0, 0, 0, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.8);
        }

        .success-card {
          text-align: center;
          padding: 48px 24px;
          margin-top: 40px;
        }

        .success-card h2 {
          font-size: 22px;
          font-weight: 700;
          color: #1d2752;
          margin: 0 0 8px;
        }

        .success-card p {
          font-size: 15px;
          color: #6b7280;
          margin: 0;
        }

        .step-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .field label {
          font-size: 14px;
          font-weight: 600;
          color: #374151;
          line-height: 1.5;
        }

        .field-hint {
          font-size: 13px;
          color: #9ca3af;
          margin-top: -2px;
        }

        .field input[type="text"],
        .field input[type="tel"],
        .field input[type="number"] {
          width: 100%;
          padding: 12px 14px;
          border: 1.5px solid #e5e7eb;
          border-radius: 12px;
          font-size: 16px;
          color: #1f2937;
          background: #fafbfc;
          outline: none;
          transition: all 0.2s;
          font-family: inherit;
          box-sizing: border-box;
        }

        .field input[type="text"]:focus,
        .field input[type="tel"]:focus,
        .field input[type="number"]:focus {
          border-color: #0EA5E9;
          background: white;
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.12);
        }

        .field input::placeholder {
          color: #b0b8c4;
        }

        /* Checkbox group */
        .checkbox-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 4px;
        }

        .checkbox-option {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border: 1.5px solid #e5e7eb;
          border-radius: 12px;
          background: #fafbfc;
          cursor: pointer;
          transition: all 0.2s;
          user-select: none;
        }

        .checkbox-option:hover {
          border-color: #d1d5db;
          background: #f3f4f6;
        }

        .checkbox-option.selected {
          border-color: #0EA5E9;
          background: #f0f9ff;
        }

        .checkbox-option input[type="checkbox"] {
          position: absolute;
          opacity: 0;
          width: 0;
          height: 0;
        }

        .checkbox-box {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          border: 2px solid #d1d5db;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.2s;
        }

        .checkbox-option.selected .checkbox-box {
          background: #0EA5E9;
          border-color: #0EA5E9;
        }

        .checkbox-box svg {
          width: 14px;
          height: 14px;
          color: white;
        }

        .checkbox-label {
          font-size: 15px;
          color: #374151;
          font-weight: 500;
        }

        .error-msg {
          color: #dc2626;
          font-size: 14px;
          text-align: center;
          margin: 8px 0 0;
          padding: 8px 12px;
          background: #fef2f2;
          border-radius: 8px;
        }

        .form-nav {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid #f3f4f6;
        }

        .nav-spacer {
          flex: 1;
        }

        .btn-submit {
          padding: 12px 28px;
          border: none;
          border-radius: 12px;
          background: linear-gradient(135deg, #d9642c 0%, #ec9e3f 100%);
          color: white;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          min-height: 48px;
          box-shadow: 0 2px 8px rgba(217, 100, 44, 0.3);
        }

        .btn-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(217, 100, 44, 0.35);
        }

        .btn-submit:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .footer-note {
          text-align: center;
          font-size: 12px;
          color: #9ca3af;
          margin: 0;
        }

        @media (min-width: 640px) {
          .form-page {
            padding: 40px 24px 60px;
            align-items: center;
          }

          .form-header h1 {
            font-size: 26px;
          }

          .form-card {
            padding: 36px 32px;
          }
        }
      `}</style>
    </div>
  );
}
