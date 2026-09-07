import { useEffect, useRef, useState } from 'react';
import { Box, Layers3, Pause, Play, RotateCcw, Settings2, Sparkles } from 'lucide-react';
import { readSpatial, SPATIAL_KEY, splineUrl } from './settings.js';
import './spatial.css';

export function useSpatialPreferences() {
 const [settings,setSettings]=useState(()=>{try{return readSpatial(window.localStorage);}catch{return readSpatial(null);}});
 useEffect(()=>{try{localStorage.setItem(SPATIAL_KEY,JSON.stringify(settings));}catch{}},[settings]);
 return [settings,setSettings];
}
export function SpatialWorkspace({settings,setSettings,metrics,engagement,reportState,onView,activeView}) {
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(settings.url),[error,setError]=useState(''),[external,setExternal]=useState(false);
 const scene=useRef(null),workspace=useRef(null),scrollFrame=useRef(null);
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [focus,setFocus]=useState('data');
 useEffect(()=>{const m=window.matchMedia('(prefers-reduced-motion: reduce)');const fn=()=>setReduced(m.matches);m.addEventListener('change',fn);return()=>m.removeEventListener('change',fn);},[]);
 const motion=settings.enabled && settings.motion && !reduced;
 const cinematic=settings.enabled && settings.cinematic && !reduced;
 useEffect(()=>{if(!motion && scene.current){scene.current.style.removeProperty('--rx');scene.current.style.removeProperty('--ry');}if(!motion)setExternal(false);},[motion]);
 useEffect(()=>{
  if(!cinematic || typeof window==='undefined') return undefined;
  const update=()=>{if(scrollFrame.current) return;scrollFrame.current=window.requestAnimationFrame(()=>{scrollFrame.current=null;const rect=workspace.current?.getBoundingClientRect();if(!rect) return;const progress=Math.max(0,Math.min(1,(window.innerHeight-rect.top)/(window.innerHeight+rect.height)));workspace.current.style.setProperty('--scroll-progress',progress.toFixed(3));});};
  update();window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);
  return()=>{window.removeEventListener('scroll',update);window.removeEventListener('resize',update);if(scrollFrame.current) window.cancelAnimationFrame(scrollFrame.current);};
 },[cinematic]);
 const overview=activeView==='overview';
 function move(e){if(!motion || e.pointerType==='touch')return;const r=e.currentTarget.getBoundingClientRect();scene.current?.style.setProperty('--ry',`${(e.clientX-r.left)/r.width*24-12}deg`);scene.current?.style.setProperty('--rx',`${12-(e.clientY-r.top)/r.height*24}deg`);}
 function reset(){scene.current?.style.removeProperty('--rx');scene.current?.style.removeProperty('--ry');}
 const completed=engagement.rounds.filter(r=>r.status==='complete').length;
 const faces=[['KOSIF','استوديو التدقيق'],[metrics.accountCount,'حساب في الارتباط'],[engagement.rounds.length,'جولة مراجعة'],[reportState.passedGates,'بوابة مكتملة'],['AI','مجلس المراجعين'],['✓','الأدلة والنتائج']];
 const chapters=[
  {id:'data',label:'الحسابات',value:metrics.accountCount.toLocaleString('ar'),detail:'ميزان متوازن مع ربط معياري قابل للمراجعة.',view:'trial-balance',pose:'-8deg'},
  {id:'evidence',label:'الأدلة',value:engagement.evidence.length.toLocaleString('ar'),detail:'سجلات دليل مرتبطة بالجولات والنتائج.',view:'evidence',pose:'22deg'},
  {id:'report',label:'التقرير',value:`${reportState.passedGates}/${reportState.gates.length}`,detail:'بوابات الإصدار قبل الاعتماد البشري.',view:'reports',pose:'58deg'},
 ];
 const activeChapter=chapters.find(item=>item.id===focus)||chapters[0];
 return <section ref={workspace} className={`spatial-workspace ${overview&&settings.enabled?'spatial-expanded':'spatial-compact'}`} data-motion={motion?'on':'off'} data-cinematic={cinematic?'on':'off'} data-focus={focus}>
  <div className="spatial-toolbar"><span><Box size={18} aria-hidden="true"/> مساحة KOSIF ثلاثية الأبعاد</span><div><button type="button" aria-pressed={settings.enabled} onClick={()=>setSettings(s=>({...s,enabled:!s.enabled}))}>{settings.enabled?'عرض مسطح':'تفعيل 3D'}</button><button type="button" aria-pressed={settings.cinematic} onClick={()=>setSettings(s=>({...s,cinematic:!s.cinematic}))}><Sparkles size={16} aria-hidden="true"/> {settings.cinematic?'سينمائي':'هادئ'}</button><button type="button" aria-expanded={open} aria-controls="spatial-settings" onClick={()=>setOpen(v=>!v)}><Settings2 size={16} aria-hidden="true"/> إعدادات المشهد</button></div></div>
  {open&&<form id="spatial-settings" className="spatial-settings" onSubmit={e=>{e.preventDefault();const url=splineUrl(draft);if(draft.trim()&&!url){setError('استخدم رابط Public URL من my.spline.design فقط، وليس كود HTML.');return;}setSettings(s=>({...s,url}));setExternal(false);setError('');}}><p>من Spline اختر Export ثم Public URL، وألصق رابط المشهد المنشور. يُحفظ الاختيار على هذا الجهاز.</p><label>رابط مشهد Spline<input dir="ltr" type="url" value={draft} placeholder="https://my.spline.design/your-scene/" onChange={e=>setDraft(e.target.value)}/></label><div className="button-row"><button type="submit" className="button button-dark">حفظ المشهد</button><button type="button" className="button button-outline" onClick={()=>{setDraft('');setSettings(s=>({...s,url:''}));setExternal(false);setError('');}}>المشهد الأصلي</button><button type="button" className="button button-outline" aria-pressed={settings.motion} onClick={()=>setSettings(s=>({...s,motion:!s.motion}))}>{settings.motion?<Pause size={16}/>:<Play size={16}/>} {settings.motion?'إيقاف الحركة':'تشغيل الحركة'}</button></div>{reduced&&<p>تفضيل تقليل الحركة في جهازك مفعّل؛ يبقى المشهد ثابتًا.</p>}{error&&<p role="alert">{error}</p>}</form>}
  {overview&&settings.enabled&&<div className="spatial-hero"><div className="spatial-copy"><span className="spatial-eyebrow">KOSIF / SPATIAL AUDIT STUDIO</span><h2>كل أبعاد المراجعة.<br/><em>في مساحة واحدة.</em></h2><p>حرّك المشهد بين الحسابات والأدلة والتقرير، ثم انتقل إلى مساحة العمل المرتبطة بها. التأثيرات بصرية ولا تغيّر النتائج المالية.</p><div className="spatial-metrics"><span><strong>{metrics.accountCount.toLocaleString('ar')}</strong> حساب</span><span><strong>{completed}/{engagement.rounds.length}</strong> جولات مكتملة</span><span><strong>{reportState.passedGates}/{reportState.gates.length}</strong> بوابات الإصدار</span></div><div className="spatial-focus-switcher" role="tablist" aria-label="محاور المشهد السينمائي">{chapters.map(chapter=><button key={chapter.id} type="button" role="tab" aria-selected={focus===chapter.id} className={focus===chapter.id?'is-active':''} onClick={()=>setFocus(chapter.id)}><b>{chapter.label}</b><span>{chapter.value}</span></button>)}</div><div className="spatial-focus-readout" aria-live="polite"><strong>{activeChapter.label}</strong><span>{activeChapter.detail}</span><button type="button" onClick={()=>onView(activeChapter.view)}>فتح المسار</button></div><div className="button-row"><button className="button button-dark" onClick={()=>onView('rounds')}>استكشف الجولات</button><button className="button button-outline" onClick={()=>onView('demo500')}>تجربة 500 حساب</button></div></div>
  <div className="spatial-visual" onPointerMove={move} onPointerLeave={reset}>
   {external&&settings.url&&motion?<div className="spatial-embed"><iframe src={settings.url} title="مشهد Spline ثلاثي الأبعاد" sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" loading="lazy"/><button onClick={()=>setExternal(false)}>إغلاق المشهد الخارجي</button></div>:<><div className="spatial-grid" aria-hidden="true"/><div className="spatial-cinematic-pulse" aria-hidden="true"/><div ref={scene} className="spatial-orbit" style={{'--focus-y':activeChapter.pose}} aria-hidden="true"><div className="spatial-ring ring-one"/><div className="spatial-ring ring-two"/><div className="spatial-cube">{faces.map(([value,label],i)=><div className={`spatial-face face-${i}`} key={i}><Layers3 size={22}/><b>{value}</b><span>{label}</span></div>)}</div><span className="spatial-satellite satellite-a">IFRS</span><span className="spatial-satellite satellite-b">ISA</span><span className="spatial-satellite satellite-c">EVIDENCE</span><span className="spatial-satellite satellite-focus">{activeChapter.label}</span></div><div className="spatial-caption">{motion?(cinematic?'تتبع سينمائي · حرّك المؤشر أو اختر محورًا':'حرّك المؤشر لاستكشاف العمق'):'مشهد ثابت · حركة مخففة'}<button onClick={reset} aria-label="إعادة زاوية المشهد"><RotateCcw size={16}/></button></div>{settings.url&&motion&&<button className="spatial-launch" onClick={()=>setExternal(true)}>تحميل مشهد Spline الخارجي</button>}</>}
  </div></div>}
 </section>;
}
