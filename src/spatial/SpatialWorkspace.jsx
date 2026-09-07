import { useEffect, useRef, useState } from "react";
import { Box, Layers3, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import { readSpatial, SPATIAL_KEY } from "./settings.js";
import "./spatial.css";

export function useSpatialPreferences() {
  const [settings, setSettings] = useState(() => {
    try {
      return readSpatial(window.localStorage);
    } catch {
      return readSpatial(null);
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SPATIAL_KEY, JSON.stringify(settings));
    } catch {
      // Motion preference is optional and must never block the workspace.
    }
  }, [settings]);
  return [settings, setSettings];
}

export function SpatialWorkspace({ settings, setSettings, metrics, engagement, reportState, onView, activeView }) {
  const scene = useRef(null);
  const workspace = useRef(null);
  const scrollFrame = useRef(null);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [focus, setFocus] = useState("data");

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // The spatial scene is the single product surface. Legacy `enabled`,
  // `cinematic`, and Spline values remain readable for old sessions, but there
  // is no 2D/3D mode switch in the product UI. Only motion can be reduced.
  const motion = settings.motion && !reduced;
  const cinematic = !reduced;

  useEffect(() => {
    if (!motion && scene.current) {
      scene.current.style.removeProperty("--rx");
      scene.current.style.removeProperty("--ry");
    }
  }, [motion]);

  useEffect(() => {
    if (!cinematic || typeof window === "undefined") return undefined;
    const update = () => {
      if (scrollFrame.current) return;
      scrollFrame.current = window.requestAnimationFrame(() => {
        scrollFrame.current = null;
        const rect = workspace.current?.getBoundingClientRect();
        if (!rect) return;
        const progress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (window.innerHeight + rect.height)));
        workspace.current.style.setProperty("--scroll-progress", progress.toFixed(3));
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      if (scrollFrame.current) window.cancelAnimationFrame(scrollFrame.current);
    };
  }, [cinematic]);

  const overview = activeView === "overview";
  function move(event) {
    if (!motion || event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    scene.current?.style.setProperty("--ry", `${(event.clientX - rect.left) / rect.width * 24 - 12}deg`);
    scene.current?.style.setProperty("--rx", `${12 - (event.clientY - rect.top) / rect.height * 24}deg`);
  }
  function reset() {
    scene.current?.style.removeProperty("--rx");
    scene.current?.style.removeProperty("--ry");
  }

  const completed = engagement.rounds.filter((round) => round.status === "complete").length;
  const faces = [
    ["KOSIF", "استوديو التدقيق"],
    [metrics.accountCount, "حساب في الارتباط"],
    [engagement.rounds.length, "جولة مراجعة"],
    [reportState.passedGates, "بوابة مكتملة"],
    ["AI", "مجلس المراجعين"],
    ["✓", "الأدلة والنتائج"],
  ];
  const chapters = [
    { id: "data", label: "الحسابات", value: metrics.accountCount.toLocaleString("ar"), detail: "ميزان متوازن مع ربط معياري قابل للمراجعة.", view: "trial-balance", pose: "-8deg" },
    { id: "evidence", label: "الأدلة", value: engagement.evidence.length.toLocaleString("ar"), detail: "سجلات دليل مرتبطة بالجولات والنتائج.", view: "evidence", pose: "22deg" },
    { id: "report", label: "التقرير", value: `${reportState.passedGates}/${reportState.gates.length}`, detail: "بوابات الإصدار قبل الاعتماد البشري.", view: "reports", pose: "58deg" },
  ];
  const activeChapter = chapters.find((item) => item.id === focus) || chapters[0];

  return <section ref={workspace} className={`spatial-workspace ${overview ? "spatial-expanded" : "spatial-compact"}`} data-motion={motion ? "on" : "off"} data-cinematic={cinematic ? "on" : "off"} data-focus={focus}>
    <div className="spatial-toolbar">
      <span><Box size={18} aria-hidden="true" /> مساحة KOSIF ثلاثية الأبعاد</span>
      <div>
        <span className="spatial-fixed-mode"><Sparkles size={16} aria-hidden="true" /> مشهد 3D سينمائي ثابت</span>
        <button type="button" className="spatial-motion-button" aria-pressed={settings.motion} onClick={() => setSettings((current) => ({ ...current, motion: !current.motion }))}>
          {settings.motion ? <Pause size={16} /> : <Play size={16} />} {settings.motion ? "إيقاف الحركة" : "تشغيل الحركة"}
        </button>
      </div>
    </div>
    {overview && <div className="spatial-hero">
      <div className="spatial-copy">
        <span className="spatial-eyebrow">KOSIF / SPATIAL AUDIT STUDIO</span>
        <h2>كل أبعاد المراجعة.<br /><em>في مساحة واحدة.</em></h2>
        <p>حرّك المشهد بين الحسابات والأدلة والتقرير، ثم انتقل إلى مساحة العمل المرتبطة بها. التأثيرات بصرية ولا تغيّر النتائج المالية.</p>
        <div className="spatial-metrics"><span><strong>{metrics.accountCount.toLocaleString("ar")}</strong> حساب</span><span><strong>{completed}/{engagement.rounds.length}</strong> جولات مكتملة</span><span><strong>{reportState.passedGates}/{reportState.gates.length}</strong> بوابات الإصدار</span></div>
        <div className="spatial-focus-switcher" role="tablist" aria-label="محاور المشهد السينمائي">{chapters.map((chapter) => <button key={chapter.id} type="button" role="tab" aria-selected={focus === chapter.id} className={focus === chapter.id ? "is-active" : ""} onClick={() => setFocus(chapter.id)}><b>{chapter.label}</b><span>{chapter.value}</span></button>)}</div>
        <div className="spatial-focus-readout" aria-live="polite"><strong>{activeChapter.label}</strong><span>{activeChapter.detail}</span><button type="button" onClick={() => onView(activeChapter.view)}>فتح المسار</button></div>
        <div className="button-row"><button className="button button-dark" onClick={() => onView("rounds")}>استكشف الجولات</button><button className="button button-outline" onClick={() => onView("demo500")}>تجربة 500 حساب</button></div>
      </div>
      <div className="spatial-visual" onPointerMove={move} onPointerLeave={reset}>
        <div className="spatial-grid" aria-hidden="true" />
        <div className="spatial-cinematic-pulse" aria-hidden="true" />
        <div ref={scene} className="spatial-orbit" style={{ "--focus-y": activeChapter.pose }} aria-hidden="true">
          <div className="spatial-ring ring-one" /><div className="spatial-ring ring-two" />
          <div className="spatial-cube">{faces.map(([value, label], index) => <div className={`spatial-face face-${index}`} key={index}><Layers3 size={22} /><b>{value}</b><span>{label}</span></div>)}</div>
          <span className="spatial-satellite satellite-a">IFRS</span><span className="spatial-satellite satellite-b">ISA</span><span className="spatial-satellite satellite-c">EVIDENCE</span><span className="spatial-satellite satellite-focus">{activeChapter.label}</span>
        </div>
        <div className="spatial-caption">{motion ? (cinematic ? "تتبع سينمائي · حرّك المؤشر أو اختر محورًا" : "حرّك المؤشر لاستكشاف العمق") : "مشهد ثابت · حركة مخففة"}<button type="button" onClick={reset} aria-label="إعادة زاوية المشهد"><RotateCcw size={16} /></button></div>
        {reduced ? <small className="spatial-motion-note">تفضيل تقليل الحركة في جهازك مفعّل؛ المشهد يعرض بصورة ثابتة.</small> : null}
      </div>
    </div>}
  </section>;
}
