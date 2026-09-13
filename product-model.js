(() => {
  'use strict';
  const mount = () => {
    if (!document.body || document.getElementById('kosif-operating-model')) return;
    const host = document.querySelector('main.shell');
    if (!host) return;
    const section = document.createElement('section');
    section.id = 'kosif-operating-model';
    section.className = 'panel operating-model';
    section.innerHTML = `
      <div class="section-head">
        <div>
          <p class="eyebrow">KOSIF OPERATING MODEL</p>
          <h2>مسار واحد من المستند إلى التقرير</h2>
        </div>
        <span class="badge">مراجعة بشرية نهائية</span>
      </div>
      <p class="operating-lead">يجمع KOSIF البيانات المحاسبية والمستندات والأدلة في ملف واحد. كل مرحلة تنتج مخرجات قابلة للفحص، ولا تنتقل المرحلة التالية قبل استيفاء بوابتها.</p>
      <div class="operating-steps" role="list">
        <div role="listitem"><b>01</b><strong>استلام</strong><small>PDF، Excel، CSV، صور وكشوف بنكية</small></div>
        <div role="listitem"><b>02</b><strong>تحويل محاسبي</strong><small>حسابات، قيود، دفتر أستاذ وميزان مراجعة</small></div>
        <div role="listitem"><b>03</b><strong>تحليل</strong><small>اتزان، أهمية نسبية، مخاطر ونسب مالية</small></div>
        <div role="listitem"><b>04</b><strong>مراجعة</strong><small>أدلة، عينات، تحريفات ومجلس مراجعين</small></div>
        <div role="listitem"><b>05</b><strong>إصدار</strong><small>قوائم، إيضاحات، رأي وتقرير تتبعي</small></div>
      </div>
      <div class="operating-rules">
        <span>✓ لا رقم بلا مصدر</span><span>✓ لا قيد غير متزن</span><span>✓ لا رأي بلا اعتماد بشري</span><span>✓ لا تعديل فوق سجل مقفل</span>
      </div>`;
    const first = host.querySelector('.now-panel');
    host.insertBefore(section, first || host.firstChild);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
