const PAGE="<!doctype html>\n<html lang=\"ar\" dir=\"rtl\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n<meta name=\"theme-color\" content=\"#081321\">\n<title>KOSIF Jev</title>\n<style>\n:root{--bg:#07111d;--panel:#0d1b2a;--line:#203a55;--txt:#f6f9fc;--muted:#91a7bb;--blue:#4cb8ff;--cyan:#6ee7f9}\n*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:ui-sans-serif,system-ui,-apple-system,\"Segoe UI\",Tahoma,Arial;background:radial-gradient(circle at 80% -20%,#153b5d 0,transparent 42%),linear-gradient(180deg,#07111d,#091827 65%,#06101b);color:var(--txt)}\n.wrap{max-width:1040px;margin:auto;padding:24px 14px 48px}.top{display:flex;gap:14px;align-items:center;margin-bottom:20px}.mark{width:48px;height:48px;border-radius:15px;background:linear-gradient(135deg,var(--cyan),var(--blue));display:grid;place-items:center;color:#06101b;font-weight:950}.title h1{margin:0;font-size:clamp(27px,5vw,42px)}.title p{margin:5px 0 0;color:var(--muted);line-height:1.6}\n.grid{display:grid;grid-template-columns:1.04fr .96fr;gap:16px}.card{background:linear-gradient(180deg,#102237ed,#091725ef);border:1px solid #1d3a55;border-radius:22px;padding:18px;box-shadow:0 20px 60px #0004}\n.starter{background:#091827;border:1px solid #23445f;border-radius:17px;padding:14px;margin-bottom:15px}.starter-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}.starter-title{font-weight:950}.starter-sub{font-size:11px;color:#8097aa;margin-top:3px}.reset{border:1px solid #31536e;background:#102338;color:#d9edf9;border-radius:11px;padding:8px 12px;font-weight:800}\n.select-shell{position:relative}.preset-select{width:100%;appearance:none;-webkit-appearance:none;border:1px solid #2d5877;background:#0b1d2e;color:#fff;border-radius:13px;padding:14px 42px 14px 13px;font:inherit;font-weight:800;min-height:50px;outline:none}.select-arrow{position:absolute;left:14px;top:50%;transform:translateY(-55%);pointer-events:none;color:#72e2f7;font-size:21px}.apply{width:100%;margin-top:8px;border:0;border-radius:12px;padding:11px;background:#173b58;color:#eaf8ff;font-weight:900}\n.tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;background:#071421;border:1px solid #18334c;padding:5px;border-radius:15px}.tab{border:0;background:transparent;color:#9eb4c9;padding:11px 6px;border-radius:11px;font-weight:850}.tab.active{background:#173753;color:#fff}\nlabel{display:block;font-size:13px;color:#b7c8d8;margin:14px 2px 7px;font-weight:750}textarea,input{width:100%;border:1px solid #24435f;background:#071522;color:#fff;border-radius:13px;padding:12px 13px;outline:none;font:inherit}textarea{resize:vertical;min-height:92px}textarea:focus,input:focus,.preset-select:focus{border-color:#4cb8ff;box-shadow:0 0 0 3px #4cb8ff18}.hint{font-size:11px;color:#748da2;line-height:1.55;margin-top:6px}\n.upload{margin-top:10px;border:1px dashed #315a78;border-radius:14px;padding:11px;background:#081725}.upload-btn{border:1px solid #2f5d7d;background:#102b42;color:#cceeff;border-radius:11px;padding:9px 11px;font-weight:850}.upload-status{font-size:11px;color:#8299ad;margin-right:8px}.file-list{display:grid;gap:6px;margin-top:8px}.file-chip{border:1px solid #1f3d57;border-radius:10px;padding:7px 9px;background:#0a1b2b;font-size:11px;display:flex;justify-content:space-between}.file-chip b{color:#79e6bb}\n.options{display:grid;gap:7px}.option-row{display:flex;gap:7px}.option-row input{flex:1}.smallbtn{border:1px solid #2b4964;background:#102338;color:#dbeafa;border-radius:11px;padding:0 13px}.add{width:100%;margin-top:7px;border:1px dashed #325a7c;background:#0b1a2b;color:#aee4ff;border-radius:12px;padding:9px;font-weight:850}\ndetails{margin-top:13px;border-top:1px solid #18344d;padding-top:11px}summary{cursor:pointer;color:#91b9d3;font-size:13px;font-weight:800}.submit{width:100%;margin-top:17px;border:0;border-radius:14px;padding:13px;background:linear-gradient(135deg,#68e2f5,#4aa8ff);color:#06101b;font-weight:950;font-size:16px}.submit:disabled{opacity:.55}.error{display:none;margin-top:12px;background:#3a1420;border:1px solid #7a2d45;color:#ffd8e0;border-radius:12px;padding:10px}\n.result-head{display:flex;justify-content:space-between;align-items:center}.result-head h2{margin:0}.status{font-size:12px;color:#92a8ba}.empty{min-height:290px;display:grid;place-items:center;text-align:center;color:#7890a5;padding:25px}.big{font-size:50px;font-weight:950}.answer{margin-top:4px}.bars{display:grid;gap:11px;margin-top:17px}.barrow{display:grid;grid-template-columns:minmax(84px,1fr) 3fr 55px;gap:8px;align-items:center}.barlabel{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.track{height:11px;background:#091421;border:1px solid #1b344a;border-radius:999px;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,#4db5ff,#70f0e8)}.pct{text-align:left;font-weight:850}.meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:15px}.chip{font-size:11px;border:1px solid #24435e;padding:6px 8px;border-radius:999px;color:#9fc1d8}.note{margin-top:15px;border-top:1px solid #1b354e;padding-top:12px;color:#7891a5;font-size:11px;line-height:1.6}\n.contact{margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:8px}.contact a{text-decoration:none;color:#f4fbff;border:1px solid #23455e;background:#0d2031;border-radius:13px;padding:11px;text-align:center;font-weight:850}.contact a span{display:block;font-size:10px;color:#89a2b6;margin-top:3px;font-weight:500}footer{text-align:center;color:#61788d;font-size:11px;margin-top:18px}\n[hidden]{display:none!important}\n@media(max-width:780px){.grid{grid-template-columns:1fr}.wrap{padding:17px 10px 35px}.card{padding:14px;border-radius:18px}.contact{grid-template-columns:1fr}.barrow{grid-template-columns:minmax(75px,1fr) 2fr 48px}}\n.vision-provider{margin-top:9px;display:flex;align-items:center;gap:8px;color:#8fa7bb;font-size:11px}.vp-dot{width:8px;height:8px;border-radius:50%;background:#6b7c8c;box-shadow:0 0 0 3px #ffffff0a}.vision-provider.connected .vp-dot{background:#66e6a8}.vision-provider.fallback .vp-dot{background:#f2c96d}</style>\n</head>\n<body>\n<div class=\"wrap\">\n  <header class=\"top\"><div class=\"mark\">K</div><div class=\"title\"><h1>KOSIF Jev</h1><p>قرار منظم بالنِّسَب: نعم/لا، مقارنة بدائل، أو تقييم على سُلّم.</p></div></header>\n  <main class=\"grid\">\n    <section class=\"card\">\n      <div class=\"starter\">\n        <div class=\"starter-head\"><div><div class=\"starter-title\">أمثلة جاهزة</div><div class=\"starter-sub\">اختر مثالًا واحدًا؛ سيظهر السؤال والسياق والبدائل تلقائيًا.</div></div><button id=\"resetAll\" class=\"reset\" type=\"button\">مسح</button></div>\n        <div class=\"select-shell\"><select id=\"presetSelect\" class=\"preset-select\">\n<option value=\"\">اختر مثالًا جاهزًا…</option>\n<optgroup label=\"نعم / لا\">\n<option value=\"delivery\">توظيف مندوب داخلي — اقتصاديات 6 أشهر</option>\n<option value=\"price\">رفع السعر — الهامش مقابل حجم المبيعات</option>\n<option value=\"release\">إطلاق التطبيق للعامة — الأداء والمخاطر</option>\n<option value=\"credit\">منح حد ائتماني لعميل — السيولة والسداد</option>\n<option value=\"branch_close\">إغلاق فرع خاسر — تكلفة الخروج والنمو</option>\n<option value=\"inventory_buy\">زيادة شراء المخزون — السعر والسيولة والتلف</option>\n</optgroup>\n<optgroup label=\"اختيارات\">\n<option value=\"supplier\">اختيار مورد سنوي — السعر والجودة والتوريد</option>\n<option value=\"city\">اختيار مدينة لفرع — عائد 3 سنوات</option>\n<option value=\"roadmap\">أولوية خارطة الطريق — الأثر والوقت والمخاطرة</option>\n<option value=\"financing\">اختيار طريقة تمويل — تكلفة رأس المال والسيولة</option>\n<option value=\"marketing\">اختيار قناة تسويق — تكلفة الاكتساب وقيمة العميل</option>\n<option value=\"candidate\">اختيار مرشح للوظيفة — الخبرة والتكلفة والجاهزية</option>\n</optgroup>\n<optgroup label=\"تقييم\">\n<option value=\"readiness\">جاهزية إطلاق تجاري — التشغيل والنقد والفريق</option>\n<option value=\"risk\">مخاطر حساب الإيرادات — حالة مراجعة مالية</option>\n<option value=\"quality\">جودة خطة توسع — الاستراتيجية والتنفيذ</option>\n<option value=\"liquidity\">مخاطر السيولة — النقد والتحصيل والالتزامات</option>\n<option value=\"controls\">قوة الرقابة الداخلية — المشتريات والصلاحيات</option>\n<option value=\"incident\">شدة عطل تقني — التأثير والمدة والبدائل</option>\n</optgroup></select><span class=\"select-arrow\">⌄</span></div>\n        <button id=\"applyPresetBtn\" class=\"apply\" type=\"button\">استخدام المثال</button>\n      </div>\n\n      <div class=\"tabs\">\n        <button class=\"tab active\" data-type=\"noul\" type=\"button\">نعم / لا</button>\n        <button class=\"tab\" data-type=\"choice\" type=\"button\">اختيارات</button>\n        <button class=\"tab\" data-type=\"score\" type=\"button\">تقييم</button>\n      </div>\n\n      <label for=\"q\">السؤال</label>\n      <textarea id=\"q\" placeholder=\"مثال: هل هذا القرار مناسب بناءً على المعلومات التالية؟\"></textarea>\n      <label for=\"state\">السياق أو المعلومات</label>\n      <textarea id=\"state\" placeholder=\"اكتب الحقائق، القيود، الأرقام، أو أي معلومات يحتاج Jev للحكم عليها.\"></textarea>\n      <div class=\"hint\">السياق هو المعلومات التي سيعتمد عليها Jev في القرار.</div>\n\n      <div class=\"upload\">\n        <input id=\"fileInput\" type=\"file\" accept=\"application/pdf,image/jpeg,image/png,image/webp,image/gif,image/bmp\" multiple hidden>\n        <button id=\"filePick\" class=\"upload-btn\" type=\"button\">📎 إضافة PDF أو صورة</button><span id=\"fileStatus\" class=\"upload-status\">حتى 3 ملفات · 4MB لكل ملف</span>\n        <div id=\"fileList\" class=\"file-list\"></div>\n        <div class=\"hint\">يتم فهم الملف وتحويل محتواه إلى سياق قبل إرساله إلى Jev.</div>\n        <div id=\"visionProvider\" class=\"vision-provider\"><span class=\"vp-dot\"></span><span><b>فهم الصور:</b> <span id=\"visionProviderText\">جاري التحقق…</span></span></div>\n      </div>\n\n      <div id=\"choiceFields\" hidden>\n        <label>الاختيارات</label><div id=\"choiceList\" class=\"options\"></div><button id=\"addChoice\" class=\"add\" type=\"button\">+ إضافة اختيار</button>\n      </div>\n      <div id=\"scoreFields\" hidden>\n        <label>مستويات التقييم — من الأقل إلى الأعلى</label><div id=\"scoreList\" class=\"options\"></div><button id=\"addScore\" class=\"add\" type=\"button\">+ إضافة مستوى</button>\n      </div>\n\n      <details id=\"advanced\"><summary>إعدادات متقدمة</summary><div id=\"noulAdvanced\"><label for=\"trueC\">ما الذي يُحسب «نعم»؟</label><input id=\"trueC\" placeholder=\"اختياري\"><label for=\"falseC\">ما الذي يُحسب «لا»؟</label><input id=\"falseC\" placeholder=\"اختياري\"></div><div class=\"hint\">اختيارية، وغالبًا السؤال والسياق يكفيان.</div></details>\n\n      <button id=\"go\" class=\"submit\" type=\"button\">اسأل Jev</button>\n      <div id=\"err\" class=\"error\"></div>\n    </section>\n\n    <section class=\"card\">\n      <div class=\"result-head\"><h2>النتيجة</h2><div id=\"status\" class=\"status\">جاهز</div></div>\n      <div id=\"result\" class=\"empty\"><div><strong>اكتب سؤالك ثم اضغط «اسأل Jev»</strong><div class=\"hint\">ستظهر هنا النسب والثقة والاختيار أو الدرجة.</div></div></div>\n      <div class=\"note\">النِّسَب تقديرات Jev اعتمادًا على المدخلات التي قدمتها، وليست ضمانًا لنتيجة مستقبلية.</div>\n    </section>\n  </main>\n  <div class=\"contact\">\n    <a href=\"tel:+966504595765\">☎ اتصال مباشر<span>+966 50 459 5765</span></a>\n    <a href=\"https://wa.me/966504595765\" target=\"_blank\" rel=\"noopener noreferrer\">واتساب مباشر<span>فتح المحادثة</span></a>\n  </div>\n  <footer>KOSIF Jev · مفاتيح Jev لا تُعرض في المتصفح</footer>\n</div>\n<script src=\"/app.js?v=20260927-21\" defer></script>\n</body>\n</html>";
const APP_JS="(function(){\n'use strict';\ndocument.addEventListener('DOMContentLoaded',function(){\nconst $=s=>document.querySelector(s);\nconst all=s=>Array.from(document.querySelectorAll(s));\nconst PRESETS={\"delivery\":{\"mode\":\"noul\",\"q\":\"هل توظيف مندوب توصيل داخلي الآن أكثر جدوى من الاستمرار مع شركة التوصيل الخارجية خلال الأشهر الستة القادمة؟\",\"state\":\"المتجر ينفذ حاليًا 24 طلبًا يوميًا بمتوسط 720 طلبًا شهريًا. تكلفة شركة التوصيل الخارجية 14 ريالًا للطلب. متوسط مجمل الربح قبل التوصيل 58 ريالًا للطلب. المرشح سيكلف 3,600 ريال راتبًا شهريًا، ونحو 450 ريالًا شهريًا متوسط إقامة وتأمين ورسوم، و1,250 ريال وقود وصيانة واتصالات. سيارة التوصيل متاحة بالفعل. نتوقع أن وجود مندوب داخلي يقلل زمن التوصيل ويرفع الطلبات بين 10% و25%، لكن هناك خطر غياب الموظف وتذبذب الطلب.\"},\"price\":{\"mode\":\"noul\",\"q\":\"هل نرفع سعر المنتج من 49.95 إلى 54.95 ريال الآن دون الإضرار بالربحية الكلية؟\",\"state\":\"متوسط المبيعات 820 وحدة شهريًا. التكلفة المتغيرة للوحدة 31.20 ريال. السعر الحالي 49.95 ريال شامل الضريبة، والسعر المقترح 54.95 ريال. المنافسون يبيعون بين 52 و59 ريالًا. تجربة سابقة لزيادة 5% خفضت الكمية بنحو 4%، والمنتج يمثل 18% من مبيعات المتجر. المورد أعلن احتمال زيادة التكلفة 3% الشهر القادم.\"},\"release\":{\"mode\":\"noul\",\"q\":\"هل النسخة الحالية من التطبيق جاهزة لإطلاق عام للمستخدمين بدل بقائها نسخة تجريبية؟\",\"state\":\"جميع الوظائف الأساسية تعمل. معدل الجلسات الخالية من الأعطال 99.4% خلال آخر 7 أيام. يوجد خللان متوسطا الخطورة ولا توجد ثغرة أمنية حرجة معروفة. زمن الاستجابة P95 يساوي 1.8 ثانية. النسخ الاحتياطي والاسترجاع مختبران. لدينا 25 مستخدمًا تجريبيًا و3 شكاوى متكررة حول بعض الحقول.\"},\"credit\":{\"mode\":\"noul\",\"q\":\"هل نمنح هذا العميل حدًا ائتمانيًا قدره 250 ألف ريال لمدة 60 يومًا؟\",\"state\":\"العميل يتعامل معنا منذ 22 شهرًا ومتوسط مشترياته 95 ألف ريال شهريًا. السداد السابق 34 يومًا في المتوسط مع تأخر مرتين فوق 60 يومًا. رصيده الحالي 80 ألف ريال. هامش الربح 17%. السيولة الجارية 1.3 والمديونية مرتفعة نسبيًا. طلب رفع الحد بسبب عقد جديد بدون ضمانات إضافية.\"},\"branch_close\":{\"mode\":\"noul\",\"q\":\"هل من الأفضل إغلاق الفرع الحالي بدل الاستمرار في تشغيله 12 شهرًا إضافية؟\",\"state\":\"مبيعات الفرع 210 آلاف ريال شهريًا، مجمل الربح 27%، الإيجار 38 ألفًا، والرواتب والمصاريف المباشرة 31 ألفًا. الفرع خسر 18 ألف ريال شهريًا في المتوسط آخر 6 أشهر. يوجد عقد إيجار متبقٍ 14 شهرًا وغرامة خروج 120 ألف ريال. الإدارة تتوقع نمو المبيعات 15% بعد حملة لم تبدأ بعد.\"},\"inventory_buy\":{\"mode\":\"noul\",\"q\":\"هل نزيد شراء المخزون الآن قبل الزيادة المتوقعة في أسعار المورد؟\",\"state\":\"المخزون الحالي يغطي 42 يومًا. المورد أعلن زيادة سعر 7% بعد 3 أسابيع. تكلفة التخزين الإضافي 1.2% شهريًا من قيمة المخزون، والتلف التاريخي 2.5% كل 90 يومًا. الطلب قد يرتفع 18% خلال الشهرين القادمين. السيولة 680 ألف ريال ولدينا التزام ضريبي 190 ألفًا بعد 45 يومًا.\"},\"supplier\":{\"mode\":\"choice\",\"q\":\"أي مورد نختار لعقد توريد سنوي إذا كان الهدف خفض التكلفة الكلية دون زيادة مخاطر الانقطاع أو الجودة؟\",\"state\":\"نحتاج 12,000 وحدة سنويًا. المورد A: 42 ريالًا، دفع 30 يومًا، توريد 6 أيام، عيوب 2.8%. المورد B: 45 ريالًا، دفع 60 يومًا، توريد 3 أيام، عيوب 0.9%، ومخزون أمان لشهر. المورد C: 43.50 ريال، دفع 45 يومًا، توريد 5 أيام، عيوب 1.4%. توقف التوريد يكلف نحو 8,000 ريال يوميًا.\",\"criteria\":[\"المورد A — الأقل سعرًا\",\"المورد B — الأعلى موثوقية\",\"المورد C — حل وسط\"]},\"city\":{\"mode\":\"choice\",\"q\":\"أي مدينة أنسب لافتتاح الفرع القادم خلال 12 شهرًا؟\",\"state\":\"الميزانية 1.2 مليون ريال. جدة: طلب مرتفع، إيجار 220 ألفًا، منافسة قوية وقاعدة عملاء حالية. الرياض: الطلب الأعلى، إيجار 310 آلاف، التوظيف أعلى 12%، ونمو السوق أسرع. الدمام: إيجار 160 ألفًا، المنافسة أقل، الطلب أقل 25% من جدة، وسلسلة الإمداد أبطأ يومًا. الهدف تعظيم عائد 3 سنوات مع حماية السيولة.\",\"criteria\":[\"جدة\",\"الرياض\",\"الدمام\"]},\"roadmap\":{\"mode\":\"choice\",\"q\":\"أي تطوير ننفذ أولًا خلال دورة العمل القادمة إذا كان لدينا فريق صغير و6 أسابيع فقط؟\",\"state\":\"تحسين السرعة يخفض زمن التحميل 35% ويتطلب 3 أسابيع. تحليل PDF/صور يفتح حالة استخدام جديدة ويطلب 5 أسابيع مع تكلفة AI. لوحة قرارات متقدمة تحتاج 6 أسابيع واختبارات أوسع. شكاوى الأداء 22%، طلبات رفع الملفات 31%، وطلبات اللوحة 14%.\",\"criteria\":[\"تحسين السرعة والأداء\",\"تحليل PDF والصور\",\"لوحة قرارات متقدمة\"]},\"financing\":{\"mode\":\"choice\",\"q\":\"أي طريقة تمويل أنسب لتوسع بقيمة 1.5 مليون ريال؟\",\"state\":\"التدفق التشغيلي 180 ألف ريال شهريًا مع تذبذب موسمي. قرض 3 سنوات بتكلفة 7.5%. مستثمر يضخ كامل المبلغ مقابل 18% من الملكية. التمويل الذاتي يخفض الاحتياطي النقدي من 9 أشهر مصروفات إلى 3 أشهر. الهدف الحفاظ على المرونة وتقليل تكلفة رأس المال ومخاطر السيولة.\",\"criteria\":[\"قرض بنكي\",\"مستثمر مقابل حصة\",\"تمويل ذاتي\"]},\"marketing\":{\"mode\":\"choice\",\"q\":\"أي قناة تسويقية نخصص لها أغلب ميزانية الشهر القادم؟\",\"state\":\"الميزانية 120 ألف ريال. البحث: تكلفة اكتساب 82 ريالًا وتحويل 5.8%. التواصل: تكلفة اكتساب 64 ريالًا لكن إعادة الشراء أقل 20%. المؤثرون: تكلفة اكتساب 110 ريالات لكن قيمة الطلب أعلى 34%. الهدف رفع العملاء الجدد مع هامش مساهمة موجب وتحسين قيمة العميل خلال 90 يومًا.\",\"criteria\":[\"إعلانات البحث\",\"منصات التواصل\",\"التسويق عبر المؤثرين\"]},\"candidate\":{\"mode\":\"choice\",\"q\":\"أي مرشح أنسب لوظيفة محاسب أول في فريق صغير سريع النمو؟\",\"state\":\"الوظيفة تحتاج إقفال شهري وExcel متقدم وضريبة قيمة مضافة ومراجعة قيود. A خبرة 8 سنوات وفني قوي لكنه يطلب راتبًا أعلى 25%. B خبرة 5 سنوات وExcel ممتاز وخبرة ERP محدودة. C خبرة 7 سنوات وإدارة فريق سابقة لكن اختباره الفني أقل. نحتاج شخصًا يبدأ خلال أسبوعين ويقلل أخطاء الإقفال.\",\"criteria\":[\"المرشح A\",\"المرشح B\",\"المرشح C\"]},\"readiness\":{\"mode\":\"score\",\"q\":\"قيّم جاهزية المشروع للإطلاق التجاري على مقياس من غير جاهز إلى جاهز جدًا.\",\"state\":\"المنتج يعمل والعمليات الأساسية مختبرة. الدفع والاسترجاع والنسخ الاحتياطي مختبرة. السيولة تغطي 5 أشهر. الفريق مكتمل 80%. خطة الاستجابة للحوادث اختُبرت مرة واحدة. 40 مستخدمًا تجريبيًا و78% أكملوا المهمة الأساسية دون مساعدة. توجد 4 ملاحظات UX وخلل متوسط.\",\"criteria\":[\"غير جاهز\",\"جاهزية ضعيفة\",\"جاهز جزئيًا\",\"جاهز\",\"جاهز جدًا\"]},\"risk\":{\"mode\":\"score\",\"q\":\"قيّم مخاطر حساب المبيعات والإيرادات في هذه الحالة لأغراض المراجعة.\",\"state\":\"الإيرادات 18.4 مليون ريال بزيادة 34%، بينما نمو حجم المبيعات 19%. تم تسجيل 11% من إيرادات ديسمبر في آخر 3 أيام. توجد قيود يدوية 620 ألف ريال بعد ساعات العمل و4 قيود دائرية كبيرة. تغيرت سياسة الاعتراف بالإيراد، واختبار القطع لم يُنجز، وعميل واحد يمثل 22% من مبيعات ديسمبر. الأهمية النسبية 450 ألف ريال.\",\"criteria\":[\"منخفض جدًا\",\"منخفض\",\"متوسط\",\"مرتفع\",\"مرتفع جدًا\"]},\"quality\":{\"mode\":\"score\",\"q\":\"قيّم جودة خطة التوسع التالية من ضعيفة إلى ممتازة.\",\"state\":\"الخطة تستهدف فرعين خلال 18 شهرًا بميزانية 2.4 مليون ريال. المسؤوليات والجدول والموازنة محددة. توقعات المبيعات مبنية على نمو 20% دون تحليل حساسية. الموردون المحتملون محددون والعقود غير موقعة. توجد مؤشرات أداء للمبيعات والهامش ولا توجد مؤشرات واضحة للتدفق النقدي أو رضا العملاء.\",\"criteria\":[\"ضعيفة\",\"مقبولة\",\"جيدة\",\"قوية\",\"ممتازة\"]},\"liquidity\":{\"mode\":\"score\",\"q\":\"قيّم مستوى مخاطر السيولة خلال الأشهر الثلاثة القادمة.\",\"state\":\"النقد 740 ألف ريال، والمصروف الشهري 310 آلاف. التحصيل 52 يومًا مقابل 39 قبل 6 أشهر. يوجد قسط 280 ألفًا بعد 45 يومًا وضريبة 190 ألفًا بعد شهرين. تسهيل بنكي غير مستخدم 500 ألف ريال، و30% من المبيعات تأتي من عميلين.\",\"criteria\":[\"منخفض جدًا\",\"منخفض\",\"متوسط\",\"مرتفع\",\"حرج\"]},\"controls\":{\"mode\":\"score\",\"q\":\"قيّم قوة بيئة الرقابة الداخلية على دورة المشتريات والدفع.\",\"state\":\"طلبات الشراء تحتاج اعتماد مدير القسم، لكن نفس الموظف يستطيع إنشاء المورد وتسجيل الفاتورة في الطوارئ. المطابقة الثلاثية مطبقة على 83% من الفواتير. مراجعة الصلاحيات كل 6 أشهر. هناك 9 دفعات يدوية في الربع واثنتان بلا اعتماد مرفق. التسويات البنكية مستقلة وتُراجع شهريًا.\",\"criteria\":[\"ضعيفة جدًا\",\"ضعيفة\",\"متوسطة\",\"قوية\",\"قوية جدًا\"]},\"incident\":{\"mode\":\"score\",\"q\":\"قيّم شدة هذا العطل التقني وتأثيره على المستخدمين.\",\"state\":\"تعطل رفع الملفات لدى 18% من مستخدمي iPhone لمدة 42 دقيقة. لا يوجد فقد بيانات ولم تتأثر المدفوعات أو تسجيل الدخول. يوجد حل بديل عبر سطح المكتب. بدأ الخطأ بعد إصدار جديد وتم تحديد سبب محتمل. وردت 31 تذكرة خلال ساعة، وبين المتأثرين 4 عملاء مدفوعين كبار.\",\"criteria\":[\"طفيف\",\"منخفض\",\"متوسط\",\"مرتفع\",\"حرج\"]}};\nlet mode='noul',fileContext='';\nconst q=$('#q'),state=$('#state'),result=$('#result'),err=$('#err'),statusEl=$('#status'),go=$('#go');\nconst presetSelect=$('#presetSelect'),applyPresetBtn=$('#applyPresetBtn'),resetAll=$('#resetAll');\nconst choiceList=$('#choiceList'),scoreList=$('#scoreList'),choiceFields=$('#choiceFields'),scoreFields=$('#scoreFields');\nconst advanced=$('#advanced'),noulAdvanced=$('#noulAdvanced'),trueC=$('#trueC'),falseC=$('#falseC');\nconst addChoice=$('#addChoice'),addScore=$('#addScore'),fileInput=$('#fileInput'),filePick=$('#filePick'),fileList=$('#fileList'),fileStatus=$('#fileStatus');\nconst visionProvider=$('#visionProvider'),visionProviderText=$('#visionProviderText');\nlet chatgptWebConnected=false;\nconst required=[q,state,result,err,statusEl,go,presetSelect,applyPresetBtn,resetAll,choiceList,scoreList,choiceFields,scoreFields,advanced,noulAdvanced,trueC,falseC,addChoice,addScore,fileInput,filePick,fileList,fileStatus,visionProvider,visionProviderText];\nif(required.some(x=>!x)){document.body.dataset.jevError='missing-element';return;}\nasync function loadVisionProvider(){try{const r=await fetch('/api/chatgpt-web/status',{cache:'no-store'});const d=await r.json();chatgptWebConnected=!!(r.ok&&d.connected);visionProvider.classList.toggle('connected',chatgptWebConnected);visionProvider.classList.toggle('fallback',!chatgptWebConnected);visionProviderText.textContent=chatgptWebConnected?'ChatGPT Web عبر TinyFish متصل':'Cloudflare Vision مؤقتًا — TinyFish يحتاج ربط ChatGPT مرة واحدة';}catch(_){chatgptWebConnected=false;visionProvider.classList.add('fallback');visionProviderText.textContent='Cloudflare Vision مؤقتًا';}}\nloadVisionProvider();\nconst EMPTY_RESULT='<div><strong>اكتب سؤالك ثم اضغط «اسأل Jev»</strong><div class=\"hint\">ستظهر هنا النسب والثقة والاختيار أو الدرجة.</div></div>';\nfunction row(value=''){const d=document.createElement('div');d.className='option-row';const i=document.createElement('input');i.value=value;i.placeholder='اكتب النص';const b=document.createElement('button');b.type='button';b.className='smallbtn';b.textContent='×';b.addEventListener('click',()=>d.remove());d.append(i,b);return d;}\nfunction fillList(el,values){el.innerHTML='';(values||[]).forEach(v=>el.append(row(v)));}\nfunction setMode(m){mode=m;all('.tab').forEach(x=>x.classList.toggle('active',x.dataset.type===m));choiceFields.hidden=m!=='choice';scoreFields.hidden=m!=='score';noulAdvanced.hidden=m!=='noul';advanced.hidden=m!=='noul';}\nfunction applyPreset(key){const p=PRESETS[key];if(!p)return false;setMode(p.mode);q.value=p.q||'';state.value=p.state||'';if(p.mode==='choice')fillList(choiceList,p.criteria||[]);if(p.mode==='score')fillList(scoreList,p.criteria||[]);advanced.open=false;return true;}\nfunction esc(v){return String(v).replace(/[&<>\"']/g,c=>c==='&'?'&amp;':c==='<'?'&lt;':c==='>'?'&gt;':c==='\"'?'&quot;':'&#39;');}\nfunction pct(n){return Math.round(Number(n||0)*1000)/10;}\nfunction bars(items){return '<div class=\"bars\">'+items.map(([label,p])=>'<div class=\"barrow\"><div class=\"barlabel\">'+esc(label)+'</div><div class=\"track\"><div class=\"fill\" style=\"width:'+Math.max(0,Math.min(100,pct(p)))+'%\"></div></div><div class=\"pct\">'+pct(p)+'%</div></div>').join('')+'</div>';}\nfunction render(data){const d=data&&data.answers&&data.answers.decision?data.answers.decision:{};const model=data&&data.model?data.model:'Jev';if(d.type==='noul'){const y=Math.max(0,Math.min(1,Number(d.noul||0))),n=1-y;result.className='';result.innerHTML='<div class=\"big\">'+pct(Math.max(y,n))+'%</div><div class=\"answer\">يميل القرار إلى <b>'+(y>=.5?'نعم':'لا')+'</b></div>'+bars([['نعم',y],['لا',n]])+'<div class=\"meta\"><span class=\"chip\">'+esc(model)+'</span></div>';return;}if(d.type==='choice'){const labels=all('#choiceList input').map(x=>x.value.trim()).filter(Boolean);const items=Object.entries(d.probabilities||{}).map(([k,v])=>[labels[k.charCodeAt(0)-65]||k,v]).sort((a,b)=>b[1]-a[1]);const idx=String(d.choice||'A').charCodeAt(0)-65;result.className='';result.innerHTML='<div class=\"big\">'+pct(items[0]?items[0][1]:0)+'%</div><div class=\"answer\">الاختيار الأعلى: <b>'+esc(labels[idx]||d.choice||'—')+'</b></div>'+bars(items)+'<div class=\"meta\"><span class=\"chip\">الثقة '+pct(d.confidence||0)+'%</span><span class=\"chip\">'+esc(model)+'</span></div>';return;}if(d.type==='score'){const items=Object.entries(d.probabilities||{}).map(([k,v])=>[(d.legend||{})[k]||('المستوى '+k),v]).sort((a,b)=>b[1]-a[1]);result.className='';result.innerHTML='<div class=\"big\">'+Number(d.score||0).toFixed(2)+'</div><div class=\"answer\">الدرجة على السُلّم المحدد</div>'+bars(items)+'<div class=\"meta\"><span class=\"chip\">الثقة '+pct(d.confidence||0)+'%</span><span class=\"chip\">'+esc(model)+'</span></div>';return;}throw new Error('صيغة نتيجة غير معروفة.');}\nall('.tab').forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.type)));\npresetSelect.addEventListener('change',()=>{if(presetSelect.value)applyPreset(presetSelect.value);});\napplyPresetBtn.addEventListener('click',()=>{if(!presetSelect.value){err.textContent='اختر مثالًا أولًا.';err.style.display='block';return;}err.style.display='none';applyPreset(presetSelect.value);});\nresetAll.addEventListener('click',()=>{presetSelect.selectedIndex=0;setMode('noul');q.value='';state.value='';trueC.value='';falseC.value='';fillList(choiceList,['الخيار الأول','الخيار الثاني','الخيار الثالث']);fillList(scoreList,['ضعيف','مقبول','جيد','ممتاز']);fileContext='';fileInput.value='';fileList.innerHTML='';fileStatus.textContent='حتى 3 ملفات · 4MB لكل ملف';err.style.display='none';statusEl.textContent='جاهز';result.className='empty';result.innerHTML=EMPTY_RESULT;});\naddChoice.addEventListener('click',()=>choiceList.append(row('')));\naddScore.addEventListener('click',()=>scoreList.append(row('')));\nfilePick.addEventListener('click',()=>fileInput.click());\nfileInput.addEventListener('change',async()=>{const files=Array.from(fileInput.files||[]).slice(0,3);fileList.innerHTML='';fileContext='';if(!files.length){fileStatus.textContent='حتى 3 ملفات · 4MB لكل ملف';return;}if(files.some(f=>f.size>4*1024*1024)){fileStatus.textContent='ملف أكبر من 4MB';return;}fileStatus.textContent=(chatgptWebConnected&&files.some(f=>String(f.type||'').startsWith('image/')))?'جارٍ إرسال الصورة إلى ChatGPT Web عبر TinyFish…':'جارٍ فهم الملفات…';try{const fd=new FormData();files.forEach(f=>fd.append('files',f,f.name));const r=await fetch('/api/extract',{method:'POST',body:fd});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'تعذر فهم الملفات.');const docs=d.documents||[];fileContext=docs.map(x=>'ملف: '+x.name+'\\n'+x.data).join('\\n\\n').slice(0,12000);docs.forEach(x=>{const el=document.createElement('div');el.className='file-chip';const via=x.method==='chatgpt-web-via-tinyfish'?'ChatGPT Web ✓':'تم الفهم ✓';el.innerHTML='<span>'+esc(x.name)+'</span><b>'+via+'</b>';fileList.append(el);});fileStatus.textContent=docs.length+' ملف تم فهمه وإضافته للسياق';}catch(e){fileContext='';fileStatus.textContent='تعذر تحليل الملف';err.textContent=e.message||String(e);err.style.display='block';}});\ngo.addEventListener('click',async()=>{err.style.display='none';if(!q.value.trim()){err.textContent='اكتب السؤال أو اختر مثالًا جاهزًا.';err.style.display='block';return;}go.disabled=true;go.textContent='Jev يحلل…';statusEl.textContent='جارٍ التحليل';try{const combined=[state.value.trim(),fileContext].filter(Boolean).join('\\n\\n--- محتوى الملفات المرفقة ---\\n');const body={type:mode,instructions:q.value.trim(),state:combined.slice(0,14500)};if(mode==='noul'){body.true_criteria=trueC.value.trim();body.false_criteria=falseC.value.trim();}if(mode==='choice')body.criteria=all('#choiceList input').map(x=>x.value);if(mode==='score')body.criteria=all('#scoreList input').map(x=>x.value);const r=await fetch('/api/public-jev',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'تعذر تنفيذ القرار.');render(d.result);statusEl.textContent='تم';}catch(e){err.textContent=e.message||String(e);err.style.display='block';statusEl.textContent='حدث خطأ';}finally{go.disabled=false;go.textContent='اسأل Jev';}});\nfillList(choiceList,['الخيار الأول','الخيار الثاني','الخيار الثالث']);fillList(scoreList,['ضعيف','مقبول','جيد','ممتاز']);setMode('noul');document.body.dataset.jevReady='1';\n});\n})();";
const FILE_RATE=new Map();
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
function html(){return new Response(PAGE,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store, max-age=0','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; img-src data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",'referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-frame-options':'DENY'}});}
function allowFile(ip){const now=Date.now(),cur=FILE_RATE.get(ip);if(!cur||now-cur.t>60000){FILE_RATE.set(ip,{t:now,n:1});return true;}cur.n++;return cur.n<=8;}
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/app.js')return new Response(APP_JS,{status:200,headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store, max-age=0','x-content-type-options':'nosniff'}});
  if(request.method==='GET'&&(url.pathname==='/'||url.pathname==='/jev'||url.pathname==='/public'))return html();
  if(request.method==='GET'&&url.pathname==='/health')return json({ok:true,service:'KOSIF Jev',version:'2.0.0',ui:'clean-external-js',backend:'service-binding'});
  if(request.method==='GET'&&url.pathname==='/api/chatgpt-web/status'){
    const connected=!!(env.TINYFISH_API_KEY&&env.TINYFISH_PROFILE_ID&&env.TINYFISH_UPLOADS);
    return json({ok:true,connected,provider:connected?'chatgpt-web-via-tinyfish':'cloudflare-vision-fallback'});
  }
  if(request.method==='GET'&&url.pathname.startsWith('/api/tf-image/')){
    if(!env.TINYFISH_UPLOADS)return new Response('Not found',{status:404});
    const token=url.pathname.slice('/api/tf-image/'.length);
    if(!/^[a-f0-9-]{20,80}$/i.test(token))return new Response('Not found',{status:404});
    const got=await env.TINYFISH_UPLOADS.getWithMetadata('img:'+token,{type:'arrayBuffer'});
    if(!got||!got.value)return new Response('Expired',{status:410});
    return new Response(got.value,{status:200,headers:{
      'content-type':got.metadata&&got.metadata.type?got.metadata.type:'application/octet-stream',
      'cache-control':'private, no-store, max-age=0',
      'x-robots-tag':'noindex, nofollow, noarchive',
      'content-disposition':'inline'
    }});
  }
  if(request.method==='GET'&&url.pathname==='/api/file-support'){try{return json({ok:true,supported:await env.AI.toMarkdown().supported()});}catch(e){return json({ok:false,error:e&&e.message?e.message:String(e)},500);}}
  if(url.pathname==='/api/extract'){
    if(request.method!=='POST')return json({ok:false,error:'Method not allowed'},405);
    const ip=request.headers.get('cf-connecting-ip')||'unknown';
    if(!allowFile(ip))return json({ok:false,error:'تم تجاوز حد تحليل الملفات مؤقتًا. حاول بعد دقيقة.'},429);
    if(!env.AI)return json({ok:false,error:'تحليل الملفات غير مهيأ.'},503);

    function abToBase64(ab){
      const bytes=new Uint8Array(ab);
      let binary='';
      const size=0x8000;
      for(let i=0;i<bytes.length;i+=size){
        binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+size,bytes.length)));
      }
      return btoa(binary);
    }

    
    async function chatgptWebImage(file){
      if(!env.TINYFISH_API_KEY||!env.TINYFISH_PROFILE_ID||!env.TINYFISH_UPLOADS)return null;
      const token=crypto.randomUUID();
      const key='img:'+token;
      try{
        const ab=await file.arrayBuffer();
        await env.TINYFISH_UPLOADS.put(key,ab,{expirationTtl:600,metadata:{type:file.type||'image/jpeg',name:file.name||'image'}});
        const imageUrl=new URL('/api/tf-image/'+token,request.url).toString();

        const schema={
          type:'object',
          properties:{
            visual_summary:{type:'string'},
            visible_text:{type:'string'},
            numbers_and_tables:{type:'string'},
            important_facts:{type:'string'},
            uncertainty:{type:'string'}
          },
          required:['visual_summary','visible_text','numbers_and_tables','important_facts','uncertainty']
        };

        const goal=[
          "Use the already signed-in ChatGPT account in this browser profile.",
          "Open a NEW ChatGPT conversation.",
          "You must make ChatGPT itself analyze the image, not TinyFish.",
          "Image URL: "+imageUrl,
          "First obtain the image from that URL and attach or upload it to the ChatGPT composer. If direct attachment is unavailable, give ChatGPT the image URL and explicitly ask it to open and inspect the image. If ChatGPT cannot access the image, fail instead of inventing a description.",
          "Send ChatGPT this instruction: Analyze this image deeply for a downstream decision engine named Jev. Do not make the final decision. Return an Arabic structured description covering visual summary; all visible text; numbers, dates, currencies and percentages; tables and relationships; important factual observations; uncertainty or unreadable areas.",
          "Wait for ChatGPT to finish.",
          "Return the ChatGPT analysis faithfully in the requested structured fields. Do not substitute your own image analysis."
        ].join('\n');

        const resp=await fetch('https://agent.tinyfish.ai/v1/automation/run',{
          method:'POST',
          headers:{'content-type':'application/json','X-API-Key':env.TINYFISH_API_KEY},
          body:JSON.stringify({
            url:'https://chatgpt.com/',
            goal,
            output_schema:schema,
            browser_profile:'stealth',
            use_profile:true,
            profile_id:env.TINYFISH_PROFILE_ID,
            agent_config:{max_duration_seconds:180}
          })
        });

        const raw=await resp.text();
        if(!resp.ok)throw new Error('TinyFish HTTP '+resp.status+': '+raw.slice(0,500));
        let run={};
        try{run=JSON.parse(raw);}catch(_){throw new Error('TinyFish returned invalid JSON');}
        if(String(run.status||'').toUpperCase()!=='COMPLETED'||!run.result)throw new Error(run&&run.error&&run.error.message?run.error.message:'TinyFish did not complete');

        const x=run.result;
        const primaryFields=[
          x.visual_summary,
          x.visible_text,
          x.numbers_and_tables,
          x.important_facts
        ].map((value)=>String(value||'').trim());
        if(!primaryFields.some(Boolean))throw new Error('ChatGPT Web returned an empty analysis');

        const text=[
          '[تحليل ChatGPT Web للصورة عبر TinyFish]',
          'الملخص البصري: '+String(x.visual_summary||''),
          'النصوص الظاهرة: '+String(x.visible_text||''),
          'الأرقام والجداول: '+String(x.numbers_and_tables||''),
          'الحقائق المهمة: '+String(x.important_facts||''),
          'عدم اليقين: '+String(x.uncertainty||'')
        ].join('\n');
        return {data:text.slice(0,12000),method:'chatgpt-web-via-tinyfish',model:'ChatGPT Web via TinyFish'};
      }catch(e){
        return {error:e&&e.message?e.message:String(e)};
      }finally{
        try{await env.TINYFISH_UPLOADS.delete(key);}catch(_){}
      }
    }

    async function visionImage(file){
      const ab=await file.arrayBuffer();
      let visualText='';
      let visualModel='';

      try{
        const bytes=Array.from(new Uint8Array(ab));
        const out=await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf',{
          image:bytes,
          prompt:[
            'Analyze this image deeply for decision support.',
            'Write the final analysis in Arabic.',
            'Describe the image or document type and the important visual elements.',
            'Extract all visible text, numbers, dates, currencies, percentages and table values you can read.',
            'If this is a screenshot, report, invoice, dashboard or table, preserve the relationships and structure.',
            'Separate facts you can see from uncertain or unreadable details.',
            'Do not make the final decision. The analysis will be passed to another decision engine.',
            'Use these Arabic sections: نوع المحتوى، الوصف البصري، النصوص والأرقام، البيانات المنظمة، ملاحظات مهمة، عدم اليقين.'
          ].join(' '),
          max_tokens:1200
        });
        visualText=String(
          out&&out.description!=null?out.description:
          out&&out.response!=null?out.response:
          out&&out.result!=null?out.result:
          out&&out.text!=null?out.text:''
        ).trim();
        if(visualText)visualModel='@cf/llava-hf/llava-1.5-7b-hf';
      }catch(_){}

      let extractedText='';
      try{
        const converted=await env.AI.toMarkdown([{name:file.name||'image',blob:new Blob([ab],{type:file.type||'application/octet-stream'})}]);
        const arr=Array.isArray(converted)?converted:(converted&&converted.result?converted.result:[]);
        const x=arr[0]||{};
        extractedText=String(x&&x.data?x.data:(x&&x.text?x.text:'')).trim();
      }catch(_){}

      if(visualText){
        let combined='[فهم بصري بواسطة Vision AI]\n'+visualText;
        if(extractedText){
          combined+='\n\n[استخراج نصي مساعد من الصورة]\n'+extractedText;
        }
        return {
          data:combined.slice(0,12000),
          method:extractedText?'vision+text-extraction':'vision',
          model:visualModel+(extractedText?' + Workers AI toMarkdown':'')
        };
      }

      return {
        data:extractedText.slice(0,12000),
        method:'text-extraction-fallback',
        model:'Workers AI toMarkdown'
      };
    }
    try{
      const form=await request.formData();
      const files=form.getAll('files').filter(v=>v&&typeof v.arrayBuffer==='function').slice(0,3);
      if(!files.length)return json({ok:false,error:'اختر PDF أو صورة أولًا.'},400);

      const allowed=new Set(['application/pdf','image/jpeg','image/png','image/webp','image/gif','image/bmp']);
      for(const f of files){
        if(f.size>4*1024*1024)return json({ok:false,error:'الحد الأقصى 4MB لكل ملف.'},413);
        if(f.type&&!allowed.has(f.type))return json({ok:false,error:'نوع الملف غير مدعوم: '+f.type},415);
      }

      const documents=[];
      for(const f of files){
        if(String(f.type||'').startsWith('image/')){
          let v=await chatgptWebImage(f);
          if(!v||!v.data)v=await visionImage(f);
          if(v&&v.data){
            documents.push({
              name:f.name||'image',
              mimeType:f.type||'',
              data:v.data,
              method:v.method,
              model:v.model
            });
          }
        }else{
          const ab=await f.arrayBuffer();
          const converted=await env.AI.toMarkdown([{name:f.name||'document.pdf',blob:new Blob([ab],{type:f.type||'application/pdf'})}]);
          const arr=Array.isArray(converted)?converted:(converted&&converted.result?converted.result:[]);
          const x=arr[0]||{};
          const text=String(x&&x.data?x.data:(x&&x.text?x.text:'')).trim();
          if(text){
            documents.push({
              name:f.name||'document.pdf',
              mimeType:f.type||'application/pdf',
              data:text.slice(0,12000),
              method:'document-extraction',
              model:'Workers AI toMarkdown'
            });
          }
        }
      }

      if(!documents.length)return json({ok:false,error:'لم أستطع فهم أو استخراج محتوى الملف.'},422);
      return json({ok:true,documents,visionPipeline:true});
    }catch(e){
      return json({ok:false,error:e&&e.message?e.message:String(e)},500);
    }
  }
  if(url.pathname==='/api/public-jev'){
    if(request.method!=='POST')return json({ok:false,error:'Method not allowed'},405);
    try{
      const body=await request.text();
      const up=await env.JEV_API.fetch(new Request('https://jev.internal/api/public-jev',{method:'POST',headers:{'content-type':'application/json','origin':'https://aghnam-jev-api.kosif199022.workers.dev'},body}));
      const raw=await up.text();
      return new Response(raw,{status:up.status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
    }catch(e){return json({ok:false,error:e&&e.message?e.message:String(e)},500);}
  }
  return json({ok:false,error:'Not found'},404);
}};