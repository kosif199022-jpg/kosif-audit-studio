const asNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const pick = (row, keys) => keys.map((key) => row?.[key]).find((value) => value !== undefined && value !== null && value !== "");

export function buildSalesIntelligence(rows = [], accountProxy = []) {
  const sourceRows = Array.isArray(rows) && rows.length ? rows : accountProxy.map((item) => ({ amount: Math.abs(asNumber(item.exposure)), channel: item.label || "غير مصنف", status: item.high ? "مراجعة" : "مسجل" }));
  const normalized = sourceRows.map((row, index) => ({ id: String(row.id ?? index + 1), amount: Math.max(0, asNumber(pick(row, ["amount", "revenue", "total", "sales", "value"]))), cost: Math.max(0, asNumber(pick(row, ["cost", "cogs", "costOfSales"]))), channel: String(pick(row, ["channel", "source", "salesChannel"]) ?? "غير مصنف"), city: String(pick(row, ["city", "region"]) ?? "غير محدد"), date: String(pick(row, ["date", "createdAt", "period"]) ?? ""), status: String(pick(row, ["status", "received", "deliveryStatus"]) ?? "غير محدد") }));
  const totalSales = normalized.reduce((sum, row) => sum + row.amount, 0);
  const totalCost = normalized.reduce((sum, row) => sum + row.cost, 0);
  const grossProfit = totalSales - totalCost;
  const group = (key) => Object.values(normalized.reduce((acc, row) => { const value = row[key] || "غير محدد"; acc[value] ||= { label: value, sales: 0, count: 0 }; acc[value].sales += row.amount; acc[value].count += 1; return acc; }, {})).sort((a, b) => b.sales - a.sales);
  const byChannel = group("channel");
  const byCity = group("city");
  const missingAmount = normalized.filter((row) => row.amount <= 0).length;
  const missingDate = normalized.filter((row) => !row.date).length;
  const followup = normalized.filter((row) => /متابعة|لم|pending|غير محدد|scheduled/i.test(row.status)).length;
  const concentration = totalSales ? (byChannel[0]?.sales || 0) / totalSales * 100 : 0;
  const forecast30 = totalSales * (1 + Math.max(-0.2, Math.min(0.3, (grossProfit / Math.max(1, totalSales)) * 0.15)));
  const quality = Math.max(0, Math.round(100 - ((missingAmount + missingDate) / Math.max(1, normalized.length)) * 100));
  const insights = [concentration > 70 ? { tone: "high", title: "تركيز قناة مرتفع", detail: `القناة الأولى تمثل ${concentration.toFixed(1)}% من المبيعات؛ اختبر اكتمال القطع والتسويات عليها.` } : { tone: "low", title: "توزيع القنوات متوازن", detail: "لا تظهر قناة واحدة مهيمنة بما يكفي لتكوين خطر تركّز تشغيلي." }, followup ? { tone: "medium", title: "طلبات تحتاج متابعة", detail: `${followup} سجلًا يحمل حالة متابعة أو حالة غير مكتملة؛ اربطها بطلبات المستندات والجولة الحالية.` } : { tone: "low", title: "حالات الاستلام مكتملة", detail: "لم تُرصد حالات متابعة مفتوحة في السجلات المتاحة." }, quality < 90 ? { tone: "medium", title: "جودة البيانات تحتاج معالجة", detail: `نسبة اكتمال الحقول الأساسية ${quality}%. عالج التاريخ والقيمة قبل اعتماد الاتجاهات.` } : { tone: "low", title: "جودة بيانات قابلة للتحليل", detail: "الحقول الأساسية مكتملة بما يسمح بتحليل مؤشرات أولي." }];
  return { rowCount: normalized.length, totalSales, totalCost, grossProfit, grossMarginPct: totalSales ? grossProfit / totalSales * 100 : 0, forecast30, byChannel, byCity, followup, concentration, quality, insights, proxy: !rows.length };
}
