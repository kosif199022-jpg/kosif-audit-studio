import React,{useState} from "react";
import {FileUp,Mic2,Route,ShieldCheck,ChevronLeft,CheckCircle2,ClipboardList} from "lucide-react";
const general=["رفع أي مستند","صياغة سؤال المراجع","تحليل أولي","رأي مجلس المراجعين","طلبات إضافية","رأي نهائي وتقرير"];
const specialized=["تحديد الهدف","بناء خطة المتطلبات","رفع المستندات المطلوبة","اختبارات ومعايير مرتبطة","جولات المراجعة","مخرج متخصص"];
export function ReviewFlowBlueprint(){
 const [mode,setMode]=useState("general"); const [step,setStep]=useState(0);
 const items=mode==="general"?general:specialized;
 return <section className="flow-blueprint" dir="rtl">
  <div className="flow-hero"><div><span className="flow-kicker">KOSIF AUDIT STUDIO</span><h1>ابدأ من سؤالك، نصل بك إلى رأي موثّق</h1><p>ارفع مستندًا أو اكتب هدفك. يبني KOSIF مسار المراجعة المناسب، يطلب ما ينقصه، ثم يعرض رأي المراجعين بوضوح.</p></div><div className="flow-orb"><Route size={38}/><small>مسار مراجعة<br/>قابل للتتبع</small></div></div>
  <div className="flow-modes"><button className={mode==="general"?"active":""} onClick={()=>{setMode("general");setStep(0)}}><FileUp size={20}/><span><b>مراجعة عامة</b><small>أي مستند أو استفسار</small></span></button><button className={mode==="specialized"?"active":""} onClick={()=>{setMode("specialized");setStep(0)}}><ClipboardList size={20}/><span><b>مراجعة متخصصة</b><small>هدف ومخرج محدد</small></span></button><button className="voice-entry"><Mic2 size={20}/><span><b>تحدث مع المراجع</b><small>ابدأ صوتيًا أو كتابيًا</small></span></button></div>
  <div className="flow-workspace"><div className="flow-input"><label>{mode==="general"?"ما المستند الذي تريد مراجعته؟":"ما النتيجة التي تريد الوصول إليها؟"}</label><textarea placeholder={mode==="general"?"ارفع مستندًا أو اكتب: ما رأي المراجعين في هذا العقد؟":"اكتب مثلًا: أريد إعداد قوائم مالية أو مراجعة مشروع"} /><div className="flow-actions"><button className="upload-btn"><FileUp size={16}/> رفع المستندات</button><button className="start-btn" onClick={()=>setStep(Math.min(step+1,items.length-1))}>بناء خطة المراجعة <ChevronLeft size={16}/></button></div></div>
  <div className="flow-plan"><div className="plan-head"><span>مسار المراجعة</span><em>{mode==="general"?"عام":"متخصص"}</em></div>{items.map((x,i)=><button key={x} onClick={()=>setStep(i)} className={i===step?"current":i<step?"done":""}><span>{i<step?<CheckCircle2 size={16}/>:i+1}</span><b>{x}</b>{i===step&&<small>الخطوة الحالية</small>}</button>)}</div></div>
  <div className="flow-proof"><div><ShieldCheck size={18}/><span><b>كل نتيجة لها سبب</b><small>المستند ← الإجراء ← المعيار ← الرأي</small></span></div><strong>جولة {Math.max(1,step+1)} / {items.length}</strong></div>
 </section>
}
