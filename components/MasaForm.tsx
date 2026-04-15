"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import Image from "next/image";

const FB_PIXEL_ID = "775454794700271";

declare global {
  interface Window {
    fbq: (...args: unknown[]) => void;
  }
}

const ROLE_OPTIONS = [
  "קרבי",
  "מודיעין ותקשוב",
  "טכנולוגי / סייבר",
  "לוגיסטיקה ואפסנאות",
  "מטה ומנהלה",
  "אחר",
];

const SOURCE_OPTIONS = [
  "אינסטגרם",
  "טיקטוק",
  "פייסבוק",
  "חבר/ה",
  "מפקד/ת",
  "חיפוש בגוגל",
  "אחר",
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 3, CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];
const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

export default function MasaForm() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [dischargeMonth, setDischargeMonth] = useState("");
  const [dischargeYear, setDischargeYear] = useState("");
  const [source, setSource] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const searchParams = useSearchParams();
  const utmSource = searchParams.get("utm_source") || "";
  const utmMedium = searchParams.get("utm_medium") || "";
  const utmCampaign = searchParams.get("utm_campaign") || "";

  const canSubmit =
    fullName.trim() !== "" &&
    phone.trim() !== "" &&
    role !== "" &&
    dischargeMonth !== "" &&
    dischargeYear !== "" &&
    source !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);

    const dischargeDate = `${dischargeMonth} ${dischargeYear}`;

    try {
      const res = await fetch("/api/organic-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone,
          type: "masa",
          utmSource,
          utmMedium,
          utmCampaign,
          extras: {
            "תפקיד בצבא": role,
            "תאריך שחרור": dischargeDate,
            "איך שמע על התכנית": source,
          },
        }),
      });

      if (!res.ok) throw new Error("שגיאה בשליחה");
      if (typeof window !== "undefined" && window.fbq) {
        window.fbq("track", "Lead", { content_name: "masa_form" });
      }
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
          <div className="horizon-line" />
          <div className="sun-glow" />
        </div>
        <div className="form-container">
          <div className="form-card success-card">
            <div className="success-mark">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2>תודה שפנית</h2>
            <p>קיבלנו את הפרטים. ניצור איתך קשר בימים הקרובים כדי לספר על המסע.</p>
          </div>
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  return (
    <div className="form-page">
      <Script
        id="fb-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${FB_PIXEL_ID}');
            fbq('track', 'PageView');
          `,
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${FB_PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>

      <div className="bg-decoration">
        <div className="sun-glow" />
        <div className="horizon-line" />
        <div className="grain" />
      </div>

      <div className="form-container">
        <header className="form-header">
          <Image src="/logo-color.png" alt="מכינת גוונא" width={48} height={48} className="form-logo" />
          <span className="eyebrow">מכינת גוונא</span>
          <h1>מסע משתחררים</h1>
          <p className="subtitle">
            מסע אחרי הצבא — חבורה, מפגשים, ושיחות שמסדרות את מה שהלאה.
            השאר/י פרטים ונחזור אליך עם כל הפרטים.
          </p>
        </header>

        <form className="form-card" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="fullName">שם מלא</label>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="השם המלא שלך"
              autoComplete="name"
            />
          </div>

          <div className="field">
            <label htmlFor="phone">טלפון</label>
            <input
              id="phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              inputMode="tel"
              placeholder="050-0000000"
              autoComplete="tel"
            />
          </div>

          <div className="field">
            <label htmlFor="role">תפקיד בצבא</label>
            <select
              id="role"
              required
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={role ? "" : "placeholder"}
            >
              <option value="" disabled>בחר/י תפקיד</option>
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>תאריך שחרור</label>
            <div className="date-row">
              <select
                required
                value={dischargeMonth}
                onChange={(e) => setDischargeMonth(e.target.value)}
                className={dischargeMonth ? "" : "placeholder"}
                aria-label="חודש שחרור"
              >
                <option value="" disabled>חודש</option>
                {MONTHS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select
                required
                value={dischargeYear}
                onChange={(e) => setDischargeYear(e.target.value)}
                className={dischargeYear ? "" : "placeholder"}
                aria-label="שנת שחרור"
              >
                <option value="" disabled>שנה</option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>איך שמעת על התכנית?</label>
            <div className="radio-group">
              {SOURCE_OPTIONS.map((opt) => (
                <label key={opt} className={`radio-pill ${source === opt ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="source"
                    value={opt}
                    checked={source === opt}
                    onChange={() => setSource(opt)}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button
            type="submit"
            className="btn-submit"
            disabled={!canSubmit || submitting}
          >
            {submitting ? "שולח..." : "אני רוצה לשמוע פרטים"}
          </button>

          <p className="trust-line">לא נשתף את הפרטים שלך עם אף גורם חיצוני.</p>
        </form>
      </div>

      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700;900&family=Heebo:wght@400;500;600;700&display=swap');

  .form-page {
    min-height: 100dvh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 20px 16px 32px;
    position: relative;
    overflow: hidden;
    background:
      radial-gradient(ellipse at 50% 0%, #fde9d4 0%, transparent 55%),
      linear-gradient(180deg, #f6dcc0 0%, #e8a880 35%, #b85e4f 70%, #2a2545 100%);
    font-family: 'Heebo', system-ui, -apple-system, sans-serif;
  }

  .bg-decoration {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }

  .sun-glow {
    position: absolute;
    top: -120px;
    left: 50%;
    transform: translateX(-50%);
    width: 520px;
    height: 520px;
    border-radius: 50%;
    background: radial-gradient(circle, #ffd9a8 0%, #f4a06b 35%, transparent 70%);
    filter: blur(40px);
    opacity: 0.85;
  }

  .horizon-line {
    position: absolute;
    top: 38%;
    left: -10%;
    right: -10%;
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.5) 50%, transparent 100%);
  }

  .grain {
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
    opacity: 0.06;
    mix-blend-mode: overlay;
  }

  .form-container {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .form-header {
    text-align: center;
    padding: 12px 8px 4px;
    color: #2a2545;
  }

  .form-logo {
    margin: 0 auto 12px;
    display: block;
  }

  .eyebrow {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.18em;
    color: #6b3d2e;
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  .form-header h1 {
    font-family: 'Frank Ruhl Libre', Georgia, serif;
    font-size: 38px;
    font-weight: 900;
    color: #2a2545;
    margin: 0 0 10px;
    line-height: 1.05;
    letter-spacing: -0.01em;
  }

  .subtitle {
    font-size: 14px;
    color: #4a3a4a;
    margin: 0 auto;
    max-width: 380px;
    line-height: 1.6;
  }

  .form-card {
    background: rgba(255, 251, 246, 0.96);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 20px;
    padding: 24px 22px 22px;
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.8) inset,
      0 20px 60px -20px rgba(42, 37, 69, 0.45),
      0 4px 12px rgba(42, 37, 69, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.6);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .success-card {
    text-align: center;
    padding: 48px 28px;
    margin-top: 60px;
    align-items: center;
  }

  .success-mark {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: linear-gradient(135deg, #b85e4f 0%, #d97757 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 18px;
  }

  .success-card h2 {
    font-family: 'Frank Ruhl Libre', Georgia, serif;
    font-size: 28px;
    font-weight: 700;
    color: #2a2545;
    margin: 0 0 10px;
  }

  .success-card p {
    font-size: 15px;
    color: #4a3a4a;
    margin: 0;
    line-height: 1.6;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field label {
    font-size: 13px;
    font-weight: 600;
    color: #2a2545;
    letter-spacing: -0.005em;
  }

  .field input[type="text"],
  .field input[type="tel"],
  .field select {
    width: 100%;
    padding: 12px 14px;
    border: 1.5px solid #e8d5c4;
    border-radius: 12px;
    font-size: 16px;
    color: #2a2545;
    background: #fff;
    outline: none;
    transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
    font-family: inherit;
    box-sizing: border-box;
    -webkit-appearance: none;
    appearance: none;
  }

  .field select {
    background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%236b3d2e' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: left 14px center;
    padding-left: 36px;
  }

  .field select.placeholder {
    color: #b0a395;
  }

  .field input:focus,
  .field select:focus {
    border-color: #b85e4f;
    box-shadow: 0 0 0 3px rgba(184, 94, 79, 0.15);
  }

  .field input::placeholder {
    color: #c4b6a8;
  }

  .date-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .radio-group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 2px;
  }

  .radio-pill {
    position: relative;
    padding: 9px 16px;
    border: 1.5px solid #e8d5c4;
    border-radius: 999px;
    background: #fff;
    font-size: 14px;
    font-weight: 500;
    color: #4a3a4a;
    cursor: pointer;
    user-select: none;
    transition: all 0.18s;
  }

  .radio-pill:hover {
    border-color: #b85e4f;
    color: #2a2545;
  }

  .radio-pill.selected {
    background: #2a2545;
    border-color: #2a2545;
    color: #f6dcc0;
  }

  .radio-pill input[type="radio"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .btn-submit {
    margin-top: 4px;
    padding: 14px 24px;
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, #b85e4f 0%, #d97757 100%);
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.18s, box-shadow 0.18s, opacity 0.18s;
    font-family: inherit;
    min-height: 52px;
    box-shadow: 0 8px 24px -8px rgba(184, 94, 79, 0.55);
    letter-spacing: -0.005em;
  }

  .btn-submit:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 12px 28px -8px rgba(184, 94, 79, 0.65);
  }

  .btn-submit:active:not(:disabled) {
    transform: translateY(0);
  }

  .btn-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }

  .trust-line {
    text-align: center;
    font-size: 12px;
    color: #6b3d2e;
    margin: 4px 0 0;
    opacity: 0.75;
  }

  .error-msg {
    color: #b91c1c;
    font-size: 14px;
    text-align: center;
    margin: 0;
    padding: 10px 12px;
    background: #fef2f2;
    border-radius: 10px;
  }

  @media (min-width: 640px) {
    .form-page {
      padding: 48px 24px 64px;
      align-items: center;
    }

    .form-header h1 {
      font-size: 46px;
    }

    .form-card {
      padding: 32px 32px 28px;
    }
  }
`;
