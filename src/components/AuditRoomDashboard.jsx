import React from "react";

export function AuditRoomDashboard({ room = {}, risks = [], evidence = [] }) {
  const stages = [
    "Planning",
    "Risk Assessment",
    "Testing",
    "Evidence",
    "Reporting",
  ];

  return (
    <section className="audit-room-dashboard" dir="rtl">
      <header>
        <h2>غرفة المراجعة الذكية Audit Room</h2>
        <p>مركز متابعة الارتباط والمخاطر والأدلة والنتائج.</p>
      </header>

      <div className="audit-room-stages">
        {stages.map((stage) => (
          <article key={stage}>
            <strong>{stage}</strong>
            <span>{room.currentStage === stage ? "نشطة" : "جاهزة"}</span>
          </article>
        ))}
      </div>

      <div className="audit-room-grid">
        <article>
          <h3>المخاطر</h3>
          <strong>{risks.length}</strong>
          <ul>
            {risks.slice(0, 5).map((risk, index) => (
              <li key={index}>{risk.title || risk.reason || "مؤشر خطر"}</li>
            ))}
          </ul>
        </article>

        <article>
          <h3>الأدلة</h3>
          <strong>{evidence.length}</strong>
          <p>الأدلة المرتبطة بنتائج المراجعة.</p>
        </article>
      </div>
    </section>
  );
}
