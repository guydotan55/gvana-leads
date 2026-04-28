"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { useFormView } from "@/lib/use-form-view";

const STEPS = [
  { id: 1, title: "פרטים אישיים" },
  { id: 2, title: "רקע וניסיון" },
  { id: 3, title: "על התפקיד" },
  { id: 4, title: "פרטים נוספים" },
];

const JOB_DESCRIPTION = `המשרה היא משרה מלאה, כוללת מגורים בקרבת המכינה בדירה שממומנת ע״י המדריכים. המכינה תהיה באזור הרי ירושלים. ההעסקה מתחילה ב-1.8 ומסתיימת 28.2, סה״כ 7 חודשים (תתכן אפשרות להארכה במידת ההתאמה והצורך).

תפקיד המדריך במכינה הינו תפקיד דורשני מאוד, ויחד עם זאת יש את ההגנה וההשפעה הגדולה שיש למדריכים על החניכים במכינה.`;

const JOB_QUESTION = `האם את/ה מרגיש/ה שזה התפקיד שאת/ה מחפש/ת? האם יש שאלות כלשהן בנושא? מה יהיה חשוב לך לבדוק?`;

export default function InstructorForm() {
  useFormView("instructor", "hardcoded");
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [experience, setExperience] = useState("");
  const [positionSeeking, setPositionSeeking] = useState("");
  const [commitment, setCommitment] = useState("");
  const [mechinaGrad, setMechinaGrad] = useState("");
  const [armyRole, setArmyRole] = useState("");
  const [dischargeDate, setDischargeDate] = useState("");
  const [comments, setComments] = useState("");

  const searchParams = useSearchParams();
  const utmSource = searchParams.get("utm_source") || "";
  const utmMedium = searchParams.get("utm_medium") || "";
  const utmCampaign = searchParams.get("utm_campaign") || "";

  function canAdvance(): boolean {
    switch (step) {
      case 1: return fullName.trim() !== "" && phone.trim() !== "" && city.trim() !== "";
      case 2: return experience.trim() !== "" && positionSeeking.trim() !== "";
      case 3: return commitment.trim() !== "";
      case 4: return true;
    }
    return true;
  }

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
          type: "instructor",
          utmSource,
          utmMedium,
          utmCampaign,
          extras: {
            "עיר מגורים": city,
            "ניסיון בהדרכה/פיקוד/חינוך": experience,
            "אופי המשרה המבוקשת": positionSeeking,
            "התאמה לתפקיד": commitment,
            "בוגר/ת מכינה/שנת שירות": mechinaGrad,
            "תפקיד בצבא": armyRole,
            "תאריך שחרור": dischargeDate,
            "שאלות והערות": comments,
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
            <h2>השאלון נשלח בהצלחה!</h2>
            <p>תודה שמילאת את השאלון. ניצור איתך קשר בהקדם.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="form-page">
      {/* Decorative background */}
      <div className="bg-decoration">
        <div className="bg-blob bg-blob-1" />
        <div className="bg-blob bg-blob-2" />
        <div className="bg-blob bg-blob-3" />
      </div>

      <div className="form-container">
        {/* Header */}
        <header className="form-header">
          <Image src="/logo-color.png" alt="מכינת גוונא" width={80} height={80} className="form-logo" />
          <h1>שאלון למועמד/ת לתפקיד מדריך/ה</h1>
          <p className="subtitle">מכינת גוונא — קד״צ ליוצאי החברה החרדית</p>
        </header>

        {/* Progress */}
        <div className="progress-bar">
          {STEPS.map((s) => (
            <div key={s.id} className={`progress-step ${step >= s.id ? "active" : ""} ${step === s.id ? "current" : ""}`}>
              <div className="step-dot">
                {step > s.id ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                ) : (
                  <span>{s.id}</span>
                )}
              </div>
              <span className="step-label">{s.title}</span>
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div className="form-card">
          {step === 1 && (
            <div className="step-content">
              <h2 className="step-title">פרטים אישיים</h2>
              <div className="field">
                <label htmlFor="fullName">שם פרטי + משפחה *</label>
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
            </div>
          )}

          {step === 2 && (
            <div className="step-content">
              <h2 className="step-title">רקע וניסיון</h2>
              <div className="field">
                <label htmlFor="experience">
                  ספר/י בקצרה על ניסיון שיש לכם בעולמות ההדרכה/פיקוד/חינוך *
                </label>
                <textarea
                  id="experience"
                  required
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  rows={4}
                  placeholder="פרט/י על ניסיון קודם..."
                />
              </div>
              <div className="field">
                <label htmlFor="positionSeeking">
                  ספר/י בקצרה מה אופי המשרה והתפקיד שאת/ה מחפש/ת כרגע? *
                </label>
                <textarea
                  id="positionSeeking"
                  required
                  value={positionSeeking}
                  onChange={(e) => setPositionSeeking(e.target.value)}
                  rows={4}
                  placeholder="מה מושך אותך בתפקיד..."
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="step-content">
              <h2 className="step-title">על התפקיד</h2>
              <div className="info-box">
                <p>{JOB_DESCRIPTION}</p>
              </div>
              <div className="field">
                <label htmlFor="commitment">{JOB_QUESTION} *</label>
                <textarea
                  id="commitment"
                  required
                  value={commitment}
                  onChange={(e) => setCommitment(e.target.value)}
                  rows={5}
                  placeholder="שתף/י את המחשבות שלך..."
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="step-content">
              <h2 className="step-title">פרטים נוספים</h2>
              <div className="field">
                <label htmlFor="mechinaGrad">האם את/ה בוגר/ת מכינה/שנת שירות? אם כן, איפה?</label>
                <input
                  id="mechinaGrad"
                  type="text"
                  value={mechinaGrad}
                  onChange={(e) => setMechinaGrad(e.target.value)}
                  placeholder="שם המכינה / שנת שירות"
                />
              </div>
              <div className="field">
                <label htmlFor="armyRole">מה היה תפקידך בצבא?</label>
                <input
                  id="armyRole"
                  type="text"
                  value={armyRole}
                  onChange={(e) => setArmyRole(e.target.value)}
                  placeholder="תפקיד ויחידה"
                />
              </div>
              <div className="field">
                <label htmlFor="dischargeDate">תאריך שחרור משירות צבאי</label>
                <input
                  id="dischargeDate"
                  type="text"
                  value={dischargeDate}
                  onChange={(e) => setDischargeDate(e.target.value)}
                  dir="ltr"
                  placeholder="MM/YYYY"
                />
              </div>
              <div className="field">
                <label htmlFor="comments">שאלות או הערות נוספות</label>
                <textarea
                  id="comments"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                  placeholder="זה המקום לכל שאלה או הערה..."
                />
              </div>
            </div>
          )}

          {error && <p className="error-msg">{error}</p>}

          {/* Navigation */}
          <div className="form-nav">
            {step > 1 && (
              <button type="button" className="btn-back" onClick={() => setStep(step - 1)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                חזרה
              </button>
            )}
            <div className="nav-spacer" />
            {step < 4 ? (
              <button
                type="button"
                className="btn-next"
                disabled={!canAdvance()}
                onClick={() => setStep(step + 1)}
              >
                המשך
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            ) : (
              <button
                type="button"
                className="btn-submit"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? "שולח..." : "שלח שאלון"}
              </button>
            )}
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

        /* Progress */
        .progress-bar {
          display: flex;
          justify-content: center;
          gap: 8px;
          padding: 0 8px;
        }

        .progress-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          flex: 1;
          position: relative;
        }

        .progress-step::after {
          content: "";
          position: absolute;
          top: 14px;
          right: calc(50% + 18px);
          width: calc(100% - 36px);
          height: 2px;
          background: #e5e7eb;
          transition: background 0.3s;
        }

        .progress-step:first-child::after {
          display: none;
        }

        .progress-step.active::after {
          background: #0EA5E9;
        }

        .step-dot {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          color: #9ca3af;
          background: #f3f4f6;
          border: 2px solid #e5e7eb;
          transition: all 0.3s;
          position: relative;
          z-index: 1;
        }

        .progress-step.active .step-dot {
          background: #0EA5E9;
          border-color: #0EA5E9;
          color: white;
        }

        .progress-step.active .step-dot svg {
          width: 14px;
          height: 14px;
        }

        .progress-step.current .step-dot {
          background: #1d2752;
          border-color: #1d2752;
          color: white;
          box-shadow: 0 0 0 4px rgba(29, 39, 82, 0.15);
        }

        .step-label {
          font-size: 11px;
          color: #9ca3af;
          text-align: center;
          transition: color 0.3s;
        }

        .progress-step.active .step-label {
          color: #1d2752;
          font-weight: 500;
        }

        /* Form Card */
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

        .success-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 20px;
          color: #16a34a;
        }

        .success-icon svg {
          width: 100%;
          height: 100%;
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

        /* Steps */
        .step-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .step-title {
          font-size: 18px;
          font-weight: 700;
          color: #1d2752;
          margin: 0 0 4px;
          padding-bottom: 12px;
          border-bottom: 2px solid #f3f4f6;
        }

        .info-box {
          background: linear-gradient(135deg, #f0f7ff 0%, #fef3e6 100%);
          border-radius: 12px;
          padding: 16px;
          border-right: 4px solid #0EA5E9;
          font-size: 14px;
          line-height: 1.7;
          color: #374151;
        }

        .info-box p {
          margin: 0;
          white-space: pre-line;
        }

        /* Fields */
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

        .field input,
        .field textarea {
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

        .field input:focus,
        .field textarea:focus {
          border-color: #0EA5E9;
          background: white;
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.12);
        }

        .field textarea {
          resize: vertical;
          min-height: 80px;
        }

        .field input::placeholder,
        .field textarea::placeholder {
          color: #b0b8c4;
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

        /* Navigation */
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

        .btn-back {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 10px 16px;
          border: 1.5px solid #e5e7eb;
          border-radius: 12px;
          background: white;
          color: #6b7280;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          min-height: 44px;
        }

        .btn-back:hover {
          border-color: #d1d5db;
          background: #f9fafb;
        }

        .btn-back svg {
          width: 18px;
          height: 18px;
        }

        .btn-next {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 10px 24px;
          border: none;
          border-radius: 12px;
          background: #1d2752;
          color: white;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          min-height: 44px;
        }

        .btn-next:hover:not(:disabled) {
          background: #2a3668;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(29, 39, 82, 0.25);
        }

        .btn-next:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .btn-next svg {
          width: 18px;
          height: 18px;
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
          opacity: 0.6;
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

          .progress-bar {
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}
