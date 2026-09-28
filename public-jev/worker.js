const MAX_BODY = 24_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY"
    }
  });
}

function normalize(body) {
  if (!body || typeof body !== "object") throw new Error("طلب غير صالح.");
  const type = ["noul", "choice", "score"].includes(body.type) ? body.type : null;
  if (!type) throw new Error("اختر نوع القرار.");
  const instructions = String(body.instructions || "").trim();
  const state = String(body.state || "").trim();
  if (!instructions) throw new Error("اكتب السؤال أولاً.");
  if (instructions.length > 2000) throw new Error("السؤال أطول من الحد المسموح.");
  if (state.length > 15000) throw new Error("السياق أطول من الحد المسموح.");

  const args = { state: state || instructions, instructions };
  if (type === "noul") {
    if (body.true_criteria) args.true_criteria = String(body.true_criteria).slice(0, 1200);
    if (body.false_criteria) args.false_criteria = String(body.false_criteria).slice(0, 1200);
  } else if (type === "choice") {
    const values = Array.isArray(body.criteria) ? body.criteria : [];
    const clean = values.map(v => String(v || "").trim()).filter(Boolean).slice(0, 12);
    if (clean.length < 2) throw new Error("أضف خيارين على الأقل.");
    args.criteria = Object.fromEntries(clean.map((v, i) => [String.fromCharCode(65 + i), v]));
  } else {
    const values = Array.isArray(body.criteria) ? body.criteria : [];
    const clean = values.map(v => String(v || "").trim()).filter(Boolean).slice(0, 10);
    if (clean.length < 2) throw new Error("أضف مستويين على الأقل للتقييم.");
    args.criteria = clean;
  }
  return { tool: "jev_" + type, args };
}

/* Error text returned to callers never carries the bridge credential: the bridge URL embeds the token, so any
   message that could echo it is scrubbed before it leaves the worker. */
export function safeError(env, e) {
  let m = String(e?.message || e || "تعذر تنفيذ القرار.");
  const t = env && env.JEV_BRIDGE_TOKEN;
  if (t) m = m.split(t).join("[redacted]");
  return m.replace(/\/mcp\/[^\s"'<>]+/g, "/mcp/[redacted]").slice(0, 300);
}

async function callJev(env, body) {
  if (!env.JEV_BRIDGE || !env.JEV_BRIDGE_TOKEN) throw new Error("Jev غير مهيأ حالياً.");
  const { tool, args } = normalize(body);
  const rpc = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "tools/call",
    params: { name: tool, arguments: args }
  };
  const req = new Request("https://jev.internal/mcp/" + env.JEV_BRIDGE_TOKEN, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json",
      "mcp-protocol-version": "2025-06-18"
    },
    body: JSON.stringify(rpc)
  });
  const resp = await env.JEV_BRIDGE.fetch(req);
  const raw = await resp.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error("استجابة غير صالحة من Jev."); }
  if (!resp.ok || data?.error) throw new Error(data?.error?.message || "تعذر الاتصال بـ Jev.");
  const result = data?.result || {};
  if (result.isError) throw new Error(result?.content?.[0]?.text || "Jev أعاد خطأ.");
  let structured = result.structuredContent;
  if (!structured && result?.content?.[0]?.text) {
    try { structured = JSON.parse(result.content[0].text); } catch {}
  }
  if (!structured) throw new Error("لم تصل نتيجة منظمة من Jev.");
  return structured;
}

const PAGE = String.raw`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#081321">
<title>Jev Decision Lab</title>
<style>
:root{--bg:#07111d;--panel:#0d1b2a;--panel2:#11253a;--line:#203a55;--txt:#f6f9fc;--muted:#9db0c5;--blue:#4cb8ff;--cyan:#6ee7f9;--good:#6ee7b7;--warn:#f9d56e;--bad:#ff8a9b}
*{box-sizing:border-box}body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Tahoma,Arial;background:radial-gradient(circle at 80% -20%,#153b5d 0,transparent 42%),linear-gradient(180deg,#07111d,#091827 65%,#06101b);color:var(--txt);min-height:100vh}
.wrap{max-width:1040px;margin:auto;padding:32px 18px 56px}.top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:24px}.brand{display:flex;gap:14px;align-items:center}.mark{width:48px;height:48px;border-radius:16px;background:linear-gradient(135deg,var(--cyan),var(--blue));display:grid;place-items:center;color:#06101b;font-weight:900;box-shadow:0 12px 32px #0ea5e933}.title h1{margin:0;font-size:clamp(26px,4vw,42px);letter-spacing:-.03em}.title p{margin:7px 0 0;color:var(--muted);line-height:1.7}.badge{border:1px solid #2a4560;background:#0b1b2caa;padding:8px 11px;border-radius:999px;color:#bfe9ff;font-size:12px;white-space:nowrap}
.grid{display:grid;grid-template-columns:1.05fr .95fr;gap:18px}.card{background:linear-gradient(180deg,#102237e6,#0a1726e8);border:1px solid #1c3954;border-radius:24px;padding:20px;box-shadow:0 22px 70px #0005;backdrop-filter:blur(14px)}
.tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;background:#071421;border:1px solid #18334c;padding:6px;border-radius:16px;margin-bottom:18px}.tab{border:0;background:transparent;color:#9eb4c9;padding:12px 8px;border-radius:12px;font-weight:800;cursor:pointer}.tab.active{background:#173753;color:#fff;box-shadow:inset 0 0 0 1px #285476}
label{display:block;font-size:13px;color:#b7c8d8;margin:15px 2px 7px;font-weight:700}.hint{font-size:12px;color:#71889e;margin-top:6px;line-height:1.6}
textarea,input{width:100%;border:1px solid #24435f;background:#071522;color:#fff;border-radius:14px;padding:13px 14px;outline:none;font:inherit;transition:.2s}textarea{resize:vertical;min-height:88px}textarea:focus,input:focus{border-color:#4cb8ff;box-shadow:0 0 0 3px #4cb8ff18}
.options{display:grid;gap:8px}.option-row{display:flex;gap:8px}.option-row input{flex:1}.smallbtn{border:1px solid #2b4964;background:#102338;color:#cde0f0;border-radius:12px;padding:0 13px;cursor:pointer}.add{margin-top:8px;border:1px dashed #325a7c;background:#0b1a2b;color:#aee4ff;border-radius:13px;padding:10px 12px;width:100%;cursor:pointer;font-weight:800}
details{margin-top:14px;border-top:1px solid #18344d;padding-top:12px}summary{cursor:pointer;color:#91b9d3;font-size:13px;font-weight:800}
.submit{width:100%;margin-top:18px;border:0;border-radius:15px;padding:14px 16px;background:linear-gradient(135deg,#68e2f5,#4aa8ff);color:#06101b;font-weight:950;font-size:16px;cursor:pointer;box-shadow:0 12px 28px #2196f33a}.submit:disabled{opacity:.55;cursor:wait}
.result-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:18px}.result-head h2{margin:0;font-size:20px}.status{font-size:12px;color:#92a8ba}.empty{min-height:360px;display:grid;place-items:center;text-align:center;color:#7890a5;padding:36px}.orb{width:116px;height:116px;border-radius:50%;margin:0 auto 18px;background:radial-gradient(circle at 35% 30%,#d8fbff,#61d8f5 18%,#2a82d4 45%,#10233a 72%);box-shadow:0 0 90px #36b7ff44}.big{font-size:54px;font-weight:950;letter-spacing:-.04em}.answer{font-size:16px;color:#d8e7f2;margin-top:4px}.bars{display:grid;gap:12px;margin-top:18px}.barrow{display:grid;grid-template-columns:minmax(90px,1fr) 3fr 58px;gap:10px;align-items:center}.barlabel{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#d8e7f2;font-size:13px}.track{height:12px;background:#091421;border:1px solid #1b344a;border-radius:999px;overflow:hidden}.fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#4db5ff,#70f0e8)}.pct{font-variant-numeric:tabular-nums;text-align:left;font-weight:850;color:#c9efff}
.meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.chip{font-size:12px;border:1px solid #24435e;padding:7px 9px;border-radius:999px;color:#9fc1d8;background:#0a1928}.note{margin-top:16px;border-top:1px solid #1b354e;padding-top:14px;color:#7891a5;font-size:11px;line-height:1.7}.error{background:#3a1420;border:1px solid #7a2d45;color:#ffd8e0;border-radius:13px;padding:12px;margin-top:14px;display:none}
.examples{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.ex{border:1px solid #23445f;background:#0b1b2c;color:#9fdcff;border-radius:999px;padding:7px 10px;font-size:11px;cursor:pointer}
footer{text-align:center;color:#61788d;font-size:12px;margin-top:22px;line-height:1.8}
@media(max-width:780px){.wrap{padding:20px 12px 40px}.top{align-items:center}.badge{display:none}.grid{grid-template-columns:1fr}.card{border-radius:20px;padding:16px}.tabs{position:sticky;top:8px;z-index:5}.barrow{grid-template-columns:minmax(76px,1fr) 2fr 50px}.empty{min-height:250px}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="brand">
      <div class="mark">J</div>
      <div class="title">
        <h1>Jev Decision Lab</h1>
        <p>اسأل سؤالاً، قارن بدائل، أو قيّم حالة — واحصل على قرار منظم مع النِّسَب.</p>
      </div>
    </div>
    <div class="badge">Powered by Jev · jev-latest</div>
  </div>
  <div class="grid">
    <section class="card">
      <div class="tabs">
        <button class="tab active" data-type="noul">نعم / لا</button>
        <button class="tab" data-type="choice">اختيارات</button>
        <button class="tab" data-type="score">تقييم</button>
      </div>
      <label for="q">السؤال</label>
      <textarea id="q" placeholder="مثال: هل هذا القرار مناسب بناءً على المعلومات التالية؟"></textarea>
      <div class="examples">
        <button class="ex" data-q="هل إطلاق هذه الفكرة الآن قرار مناسب؟">إطلاق فكرة</button>
        <button class="ex" data-q="هل هذه الخطة قابلة للتنفيذ بالمعلومات الحالية؟">قابلية التنفيذ</button>
        <button class="ex" data-q="أي بديل يحقق أفضل توازن بين التكلفة والسرعة والجودة؟" data-mode="choice">مقارنة بدائل</button>
      </div>

      <label for="state">السياق أو المعلومات</label>
      <textarea id="state" placeholder="اكتب الحقائق، القيود، الأرقام، أو أي معلومات يحتاج Jev للحكم عليها."></textarea>
      <div class="hint">كلما كان السياق أوضح كانت النتيجة أكثر ارتباطاً بما قدمته.</div>

      <div id="choiceFields" hidden>
        <label>الاختيارات</label>
        <div class="options" id="choiceList"></div>
        <button class="add" id="addChoice" type="button">+ إضافة اختيار</button>
      </div>

      <div id="scoreFields" hidden>
        <label>مستويات التقييم — من الأقل إلى الأعلى</label>
        <div class="options" id="scoreList"></div>
        <button class="add" id="addScore" type="button">+ إضافة مستوى</button>
      </div>

      <details id="advanced">
        <summary>إعدادات متقدمة</summary>
        <div id="noulAdvanced">
          <label for="trueC">ما الذي يُحسب «نعم»؟</label>
          <input id="trueC" placeholder="اختياري">
          <label for="falseC">ما الذي يُحسب «لا»؟</label>
          <input id="falseC" placeholder="اختياري">
        </div>
        <p class="hint">هذه الحقول اختيارية. غالباً السؤال والسياق يكفيان.</p>
      </details>

      <button class="submit" id="go">اسأل Jev</button>
      <div class="error" id="err"></div>
    </section>

    <section class="card">
      <div class="result-head">
        <h2>النتيجة</h2>
        <div class="status" id="status">جاهز</div>
      </div>
      <div id="result" class="empty">
        <div>
          <div class="orb"></div>
          <strong>اكتب سؤالك ثم اضغط «اسأل Jev»</strong>
          <div class="hint">ستظهر هنا النسب والثقة والاختيار أو الدرجة.</div>
        </div>
      </div>
      <div class="note">النِّسَب هي تقديرات نموذج Jev بناءً على المدخلات التي كتبتها، وليست حقائق موضوعية أو ضماناً لنتيجة مستقبلية.</div>
    </section>
  </div>
  <footer>واجهة عامة خفيفة · لا يتم عرض مفاتيح Jev أو أسرار الاتصال في المتصفح.</footer>
</div>
<script>
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let mode="noul";
const q=$("#q"), state=$("#state"), result=$("#result"), err=$("#err"), status=$("#status"), go=$("#go");

function row(value=""){
  const d=document.createElement("div"); d.className="option-row";
  const i=document.createElement("input"); i.value=value; i.placeholder="اكتب النص";
  const b=document.createElement("button"); b.type="button"; b.className="smallbtn"; b.textContent="×";
  b.onclick=()=>d.remove(); d.append(i,b); return d;
}
function fillList(id, values){ const el=$(id); el.innerHTML=""; values.forEach(v=>el.append(row(v))); }
fillList("#choiceList",["الخيار الأول","الخيار الثاني","الخيار الثالث"]);
fillList("#scoreList",["ضعيف","مقبول","جيد","ممتاز"]);

function setMode(m){
  mode=m;
  $$(".tab").forEach(x=>x.classList.toggle("active",x.dataset.type===m));
  $("#choiceFields").hidden=m!=="choice";
  $("#scoreFields").hidden=m!=="score";
  $("#noulAdvanced").hidden=m!=="noul";
  $("#advanced").hidden=m!=="noul";
}
$$(".tab").forEach(x=>x.onclick=()=>setMode(x.dataset.type));
$("#addChoice").onclick=()=>$("#choiceList").append(row(""));
$("#addScore").onclick=()=>$("#scoreList").append(row(""));
$$(".ex").forEach(x=>x.onclick=()=>{ q.value=x.dataset.q; if(x.dataset.mode)setMode(x.dataset.mode); q.focus(); });

function esc(s){return String(s).replace(/[&<>"']/g,c=>c==="&"?"&amp;":c==="<"?"&lt;":c===">"?"&gt;":c==='"'?"&quot;":"&#39;");}
function pct(n){return Math.round(Number(n||0)*1000)/10}
function bars(items){
  return '<div class="bars">'+items.map(([label,p])=>'<div class="barrow"><div class="barlabel" title="'+esc(label)+'">'+esc(label)+'</div><div class="track"><div class="fill" style="width:'+Math.max(0,Math.min(100,pct(p)))+'%"></div></div><div class="pct">'+pct(p)+'%</div></div>').join("")+'</div>';
}
function render(data){
  const d=data?.answers?.decision||{};
  const model=data?.model||"Jev";
  if(d.type==="noul"){
    const y=Math.max(0,Math.min(1,Number(d.noul||0))), n=1-y;
    const word=y>=.5?"نعم":"لا";
    result.className="";
    result.innerHTML='<div class="big">'+pct(Math.max(y,n))+'%</div><div class="answer">يميل القرار إلى <b>'+word+'</b></div>'+bars([["نعم",y],["لا",n]])+'<div class="meta"><span class="chip">'+esc(model)+'</span></div>';
  } else if(d.type==="choice"){
    const probs=d.probabilities||{}, labels=[...$("#choiceList input")].map(x=>x.value.trim()).filter(Boolean);
    const items=Object.entries(probs).map(([k,v])=>{const idx=k.charCodeAt(0)-65;return [labels[idx]||k,v]}).sort((a,b)=>b[1]-a[1]);
    const idx=String(d.choice||"A").charCodeAt(0)-65, picked=labels[idx]||d.choice||"—";
    result.className="";
    result.innerHTML='<div class="big">'+pct(items[0]?.[1]||0)+'%</div><div class="answer">الاختيار الأعلى: <b>'+esc(picked)+'</b></div>'+bars(items)+'<div class="meta"><span class="chip">الثقة '+pct(d.confidence||0)+'%</span><span class="chip">'+esc(model)+'</span></div>';
  } else if(d.type==="score"){
    const legend=d.legend||{}, probs=d.probabilities||{};
    const items=Object.entries(probs).map(([k,v])=>[legend[k]||("المستوى "+k),v]).sort((a,b)=>b[1]-a[1]);
    result.className="";
    result.innerHTML='<div class="big">'+Number(d.score??0).toFixed(2)+'</div><div class="answer">الدرجة على السُلّم المحدد</div>'+bars(items)+'<div class="meta"><span class="chip">الثقة '+pct(d.confidence||0)+'%</span><span class="chip">'+esc(model)+'</span></div>';
  } else throw new Error("صيغة نتيجة غير معروفة.");
}
go.onclick=async()=>{
  err.style.display="none"; go.disabled=true; go.textContent="Jev يحلل…"; status.textContent="جارٍ التحليل";
  try{
    const body={type:mode,instructions:q.value.trim(),state:state.value.trim()};
    if(mode==="noul"){body.true_criteria=$("#trueC").value.trim();body.false_criteria=$("#falseC").value.trim();}
    if(mode==="choice")body.criteria=[...$("#choiceList input")].map(x=>x.value);
    if(mode==="score")body.criteria=[...$("#scoreList input")].map(x=>x.value);
    const r=await fetch("/api/decide",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json();
    if(!r.ok||!d.ok)throw new Error(d.error||"تعذر تنفيذ القرار.");
    render(d.result); status.textContent="تم";
  }catch(e){err.textContent=e.message||String(e);err.style.display="block";status.textContent="حدث خطأ";}
  finally{go.disabled=false;go.textContent="اسأل Jev";}
};
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) return html(PAGE);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "Jev Public", bridge: "service-binding", version: "1.0.0" });
    if (url.pathname !== "/api/decide") return json({ ok: false, error: "Not found" }, 404);
    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_BODY) return json({ ok: false, error: "الطلب أكبر من الحد المسموح." }, 413);

    try {
      if (env.RATE_LIMITER) {
        const key = request.headers.get("cf-connecting-ip") || "unknown";
        const limited = await env.RATE_LIMITER.limit({ key });
        if (!limited.success) return json({ ok: false, error: "تم تجاوز حد الاستخدام المؤقت. حاول بعد قليل." }, 429);
      }
      const body = await request.json();
      const result = await callJev(env, body);
      return json({ ok: true, result });
    } catch (e) {
      return json({ ok: false, error: safeError(env, e) }, 400);
    }
  }
};
