# KOSIF — Global Audit Intelligence Roadmap

## الهدف
تحويل `global_financial_and_audit_research_bundle_extended_verified.pdf` (12,505 صفحة) إلى **منهج تشغيل للمراجعة**، لا إلى أرشيف ملفات. لا تُنسخ نصوص التقارير إلى المنتج؛ الذي يُحفظ هو البنية المهنية، نمط الاختبار، مصدر المثال، الفترة، والموقع المرجعي.

## ما تم استخلاصه من الحزمة

1. **KAM / CAM**: النمط العملي المتكرر هو: المسألة ولماذا كانت مهمة → كيفية تعامل المراجع معها → الإحالة للإفصاح. أمثلة مرجعية: Mercedes-Benz 2025 وAmazon 2023.
2. **التقديرات المحاسبية**: التقدير لا يُراجع كرقم نهائي فقط؛ يلزم نموذج وافتراضات وبيانات وحساسية وBack-testing. أمثلة: مخزون وضرائب Amazon، قيم متبقية Mercedes-Benz، مخصصات Allianz.
3. **ICFR**: فصل تقييم الإدارة عن اعتماد المراجع، وربط الرقابة بإطار واضح واختبارات تصميم وتشغيل. مثال: Toyota FY2026.
4. **Non-GAAP / APM**: المقاييس البديلة تحتاج مصالحة قابلة لإعادة الأداء، تعريف ثابت، وتوضيح القيود. أمثلة: PepsiCo 2025 وAmazon FCF.
5. **استقلال المراجع والرسوم**: تصنيف الرسوم، الموافقة المسبقة، وتقييم طبيعة الخدمات أهم من النسبة وحدها. أمثلة: MUFG وToyota.
6. **لجنة المراجعة**: التقارير المالية، الضوابط، المخاطر، الأمن السيبراني، المراجعة الداخلية والخارجية، الاستمرارية وضمان الاستدامة تظهر كمسؤوليات تشغيلية قابلة للتتبع. مثال: AstraZeneca 2025.
7. **مخاطر السوق والعملات**: السيناريوهات يجب أن تبدأ من تعرض موثق، مع افتراضات قابلة لإعادة الأداء ومصدر لأسعار السوق. مثال: Amazon Item 7A.
8. **الاستمرارية والجدوى**: ربط التدفقات بالتعهدات والتمويل والأحداث اللاحقة ومناقشات الحوكمة.
9. **الأمن السيبراني**: المخاطر التقنية تصبح موضوع مراجعة مالية فقط عندما تؤثر على الأنظمة والبيانات والضوابط والإفصاح. أمثلة: Amazon وAstraZeneca.
10. **ضمان الاستدامة**: يجب فصل نطاق الضمان غير المالي عن المراجعة المالية مع تتبع نقاط التقاطع.

## المنفذ في الإصدار الحالي

- محرك `global-audit-patterns.js` بعشرة أنماط مهنية، مصادر أمثلة، تأكيدات، معايير مرجعية، إشارات خطر، إجراءات وأدلة.
- إنشاء خطة مراجعة حتمية `Risk → Procedure → Evidence` مع حد سلطة واضح: `advisory-only-human-review-required`.
- بحث عربي مطبع في الأنماط.
- محرك حساسية بوحدات الهللة الصحيحة وBasis Points.
- محلل رسوم المراجع والخدمات كإشارة حوكمة، من دون إصدار حكم استقلال آلي.
- مصفوفة حوكمة لجنة المراجعة.
- واجهة Global Audit Intelligence محمولة داخل KOSIF ومحملة Lazy عند الطلب، مع Safe Area للجوال.
- تصدير حزمة JSON للأنماط والخطط دون إرسال البيانات إلى مزود خارجي.

## الخطة التالية

### P2 — Report Intake Normalizer
- اكتشاف هيكل PDF/XLSX: الشركة، الفترة، القوائم، الإيضاحات، تقرير المراجع، KAM/CAM، الحوكمة.
- فهرسة الصفحة المطبوعة والصفحة الفعلية والمصدر الرسمي.
- الاحتفاظ بالمقتطفات محليًا؛ المخرجات الدائمة تعتمد على metadata/locator وليس نسخ النص.

### P3 — Disclosure Completeness Graph
- `figure → account → disclosure → standard → source locator → audit procedure → evidence → conclusion`.
- كشف رقم بلا مصدر، إفصاح بلا حساب، أو حكم بلا دليل.

### P4 — Estimate & Model Assurance
- مكتبة تقديرات: ECL، NRV، impairment، provisions/warranties، taxes، leases/residual values، fair value.
- back-testing، sensitivity، management-bias indicators، specialist handoff.

### P5 — ICFR & Controls Studio
- Process inventory، Walkthrough، RCM، design effectiveness، operating effectiveness، deficiency grading.
- ربط أي deficiency بالحساب/التأكيد/النتيجة/التواصل مع الحوكمة.

### P6 — Audit Quality & Inspection Lens
- استخراج أنماط متكررة من PCAOB/FRC/IFIAR وتقارير شفافية Big Four.
- pre-issuance quality checklist مرتبط بالملف الفعلي، لا قائمة عامة.

### P7 — Cross-company Benchmarking
- مقارنة الشركات والقطاعات والفترات مع فصل GAAP/IFRS/APM.
- كل مقياس يحمل تعريفه ومصدره وقيوده قبل المقارنة.

### P8 — Governed AI Orchestrator
- مقاعد تخصصية للمجلس (تقديرات، ضرائب، IT/controls، تقارير، استمرارية، استقلال).
- AI يقترح فقط؛ أي تغيير حالة أو اعتماد يحتاج actor بشري وسبب وtimestamp وrevision.

## Invariants
- لا Float في المال أو حدود الأهمية.
- لا رأي مراجعة يولده AI.
- لا تغيير artifact معتمد in-place؛ الإصدار الجديد supersedes السابق مع lineage.
- كل mutation مهم ينتج audit event وcorrelation/reference.
- أي benchmark هو **مرجع منهجي** وليس دليلًا على ملف العميل.
- لا تُرفع حزمة التقارير الأصلية أو أدلة العميل إلى مزود خارجي تلقائيًا.
