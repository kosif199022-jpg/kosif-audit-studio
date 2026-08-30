import json
import math
import os
import re
import sys
import unicodedata

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
except ImportError:
    arabic_reshaper = None
    get_display = None
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


if len(sys.argv) != 3:
    raise SystemExit("Usage: python3 scripts/generate-demo-report.py <source.json> <output.pdf>")

source_path, output_path = sys.argv[1:]
with open(source_path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

os.makedirs(os.path.dirname(output_path), exist_ok=True)

REGULAR_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
pdfmetrics.registerFont(TTFont("KOSIF", REGULAR_FONT))
pdfmetrics.registerFont(TTFont("KOSIF-Bold", BOLD_FONT))

PURPLE = HexColor("#28134A")
PURPLE_2 = HexColor("#45266E")
VIOLET = HexColor("#7254D8")
LAVENDER = HexColor("#EEE8FF")
GOLD = HexColor("#D8AE4C")
GOLD_SOFT = HexColor("#FFF1C9")
GREEN = HexColor("#2D7A55")
GREEN_SOFT = HexColor("#E2F2E8")
RED = HexColor("#AC4B42")
MUTED = HexColor("#6D6680")
LINE = HexColor("#DED5F0")
PAPER = HexColor("#F8F6FC")
INK = HexColor("#28134A")

PAGE_W, PAGE_H = A4
MARGIN = 42

ARABIC_FORMS = {
    "\u0621": ("\ufe80", None, None, None),
    "\u0622": ("\ufe81", "\ufe82", None, None),
    "\u0623": ("\ufe83", "\ufe84", None, None),
    "\u0624": ("\ufe85", "\ufe86", None, None),
    "\u0625": ("\ufe87", "\ufe88", None, None),
    "\u0626": ("\ufe89", "\ufe8a", "\ufe8b", "\ufe8c"),
    "\u0627": ("\ufe8d", "\ufe8e", None, None),
    "\u0628": ("\ufe8f", "\ufe90", "\ufe91", "\ufe92"),
    "\u0629": ("\ufe93", "\ufe94", None, None),
    "\u062a": ("\ufe95", "\ufe96", "\ufe97", "\ufe98"),
    "\u062b": ("\ufe99", "\ufe9a", "\ufe9b", "\ufe9c"),
    "\u062c": ("\ufe9d", "\ufe9e", "\ufe9f", "\ufea0"),
    "\u062d": ("\ufea1", "\ufea2", "\ufea3", "\ufea4"),
    "\u062e": ("\ufea5", "\ufea6", "\ufea7", "\ufea8"),
    "\u062f": ("\ufea9", "\ufeaa", None, None),
    "\u0630": ("\ufeab", "\ufeac", None, None),
    "\u0631": ("\ufead", "\ufeae", None, None),
    "\u0632": ("\ufeaf", "\ufeb0", None, None),
    "\u0633": ("\ufeb1", "\ufeb2", "\ufeb3", "\ufeb4"),
    "\u0634": ("\ufeb5", "\ufeb6", "\ufeb7", "\ufeb8"),
    "\u0635": ("\ufeb9", "\ufeba", "\ufebb", "\ufebc"),
    "\u0636": ("\ufebd", "\ufebe", "\ufebf", "\ufec0"),
    "\u0637": ("\ufec1", "\ufec2", "\ufec3", "\ufec4"),
    "\u0638": ("\ufec5", "\ufec6", "\ufec7", "\ufec8"),
    "\u0639": ("\ufec9", "\ufeca", "\ufecb", "\ufecc"),
    "\u063a": ("\ufecd", "\ufece", "\ufecf", "\ufed0"),
    "\u0641": ("\ufed1", "\ufed2", "\ufed3", "\ufed4"),
    "\u0642": ("\ufed5", "\ufed6", "\ufed7", "\ufed8"),
    "\u0643": ("\ufed9", "\ufeda", "\ufedb", "\ufedc"),
    "\u0644": ("\ufedd", "\ufede", "\ufedf", "\ufee0"),
    "\u0645": ("\ufee1", "\ufee2", "\ufee3", "\ufee4"),
    "\u0646": ("\ufee5", "\ufee6", "\ufee7", "\ufee8"),
    "\u0647": ("\ufee9", "\ufeea", "\ufeeb", "\ufeec"),
    "\u0648": ("\ufeed", "\ufeee", None, None),
    "\u0649": ("\ufeef", "\ufef0", None, None),
    "\u064a": ("\ufef1", "\ufef2", "\ufef3", "\ufef4"),
    "\u067e": ("\ufb56", "\ufb57", "\ufb58", "\ufb59"),
    "\u06a9": ("\ufb8e", "\ufb8f", "\ufb90", "\ufb91"),
    "\u06af": ("\ufb92", "\ufb93", "\ufb94", "\ufb95"),
    "\u06cc": ("\ufbfc", "\ufbfd", "\ufbfe", "\ufbff"),
}


def fallback_reshape(value):
    text = "".join(char for char in value if not unicodedata.combining(char))
    result = []
    for index, char in enumerate(text):
        forms = ARABIC_FORMS.get(char)
        if not forms:
            result.append(char)
            continue
        previous = text[index - 1] if index else ""
        following = text[index + 1] if index + 1 < len(text) else ""
        previous_forms = ARABIC_FORMS.get(previous)
        following_forms = ARABIC_FORMS.get(following)
        joins_previous = bool(forms[1] and previous_forms and previous_forms[2])
        joins_following = bool(forms[2] and following_forms and following_forms[1])
        if joins_previous and joins_following and forms[3]:
            result.append(forms[3])
        elif joins_previous and forms[1]:
            result.append(forms[1])
        elif joins_following and forms[2]:
            result.append(forms[2])
        else:
            result.append(forms[0])
    return "".join(result)


def fallback_display(value):
    mirrored = value[::-1].translate(str.maketrans("()[]{}<>", ")(][}{><"))
    ltr_phrase = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:/@#%+\-×]*(?: +[A-Za-z0-9][A-Za-z0-9_.:/@#%+\-×]*)*")
    return ltr_phrase.sub(lambda match: match.group(0)[::-1], mirrored)


def clean(value):
    return str(value if value is not None else "").replace("—", "-").replace("–", "-").replace("‑", "-")


def visual(value):
    text = clean(value)
    if any("\u0600" <= char <= "\u06ff" for char in text):
        if arabic_reshaper and get_display:
            return get_display(arabic_reshaper.reshape(text))
        return fallback_display(fallback_reshape(text))
    return text


def money(value):
    return f"{float(value):,.2f} SAR"


def wrap_lines(text, width, font="KOSIF", size=9):
    words = clean(text).split()
    if not words:
        return [""]
    lines = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if pdfmetrics.stringWidth(visual(candidate), font, size) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def fit_text(text, width, font="KOSIF", size=7):
    """Keep a one-line table cell inside its actual column width."""
    value = clean(text)
    if pdfmetrics.stringWidth(visual(value), font, size) <= width:
        return value
    ellipsis = "…"
    low, high = 0, len(value)
    while low < high:
        midpoint = (low + high + 1) // 2
        candidate = value[:midpoint].rstrip() + ellipsis
        if pdfmetrics.stringWidth(visual(candidate), font, size) <= width:
            low = midpoint
        else:
            high = midpoint - 1
    return value[:low].rstrip() + ellipsis


def draw_rtl(pdf, text, x, y, font="KOSIF", size=9, color=INK):
    pdf.setFont(font, size)
    pdf.setFillColor(color)
    pdf.drawRightString(x, y, visual(text))


def draw_ltr(pdf, text, x, y, font="KOSIF", size=9, color=INK):
    pdf.setFont(font, size)
    pdf.setFillColor(color)
    pdf.drawString(x, y, clean(text))


def draw_wrapped_rtl(pdf, text, x, y, width, font="KOSIF", size=9, color=INK, leading=14, max_lines=None):
    lines = wrap_lines(text, width, font, size)
    if max_lines:
        lines = lines[:max_lines]
    for index, line in enumerate(lines):
        draw_rtl(pdf, line, x, y - index * leading, font, size, color)
    return y - len(lines) * leading


def footer(pdf, page_number):
    pdf.setStrokeColor(LINE)
    pdf.line(MARGIN, 30, PAGE_W - MARGIN, 30)
    draw_ltr(pdf, f"{data['artifactVersion']} | {page_number}", MARGIN, 16, "KOSIF", 7, MUTED)
    draw_rtl(pdf, "تقرير تجريبي - بيانات اصطناعية وليست تقرير مراجع مستقل", PAGE_W - MARGIN, 16, "KOSIF", 7, MUTED)


def page_header(pdf, section, title, page_number):
    pdf.setFillColor(PAPER)
    pdf.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    pdf.setFillColor(PURPLE)
    pdf.rect(0, PAGE_H - 70, PAGE_W, 70, fill=1, stroke=0)
    draw_ltr(pdf, section.upper(), MARGIN, PAGE_H - 29, "KOSIF-Bold", 8, GOLD)
    draw_rtl(pdf, title, PAGE_W - MARGIN, PAGE_H - 46, "KOSIF-Bold", 18, white)
    footer(pdf, page_number)


def rounded_card(pdf, x, y, width, height, title, value, helper="", tone=VIOLET):
    pdf.setFillColor(white)
    pdf.setStrokeColor(LINE)
    pdf.roundRect(x, y, width, height, 10, fill=1, stroke=1)
    pdf.setFillColor(tone)
    pdf.roundRect(x + width - 8, y, 8, height, 4, fill=1, stroke=0)
    draw_rtl(pdf, title, x + width - 18, y + height - 22, "KOSIF", 8, MUTED)
    draw_rtl(pdf, value, x + width - 18, y + height - 48, "KOSIF-Bold", 15, INK)
    if helper:
        draw_rtl(pdf, helper, x + width - 18, y + 13, "KOSIF", 7, MUTED)


def draw_section_label(pdf, text, y):
    pdf.setFillColor(PURPLE)
    pdf.roundRect(MARGIN, y - 24, PAGE_W - MARGIN * 2, 28, 7, fill=1, stroke=0)
    draw_rtl(pdf, text, PAGE_W - MARGIN - 12, y - 14, "KOSIF-Bold", 10, white)


def draw_simple_table(pdf, headers, rows, widths, top_y, row_height=24, font_size=7, rtl_columns=None, start_x=None):
    rtl_columns = set(range(len(headers))) if rtl_columns is None else set(rtl_columns)
    x = MARGIN if start_x is None else start_x
    total_width = sum(widths)
    pdf.setFillColor(PURPLE_2)
    pdf.rect(x, top_y - row_height, total_width, row_height, fill=1, stroke=0)
    cursor_x = x
    for index, header in enumerate(headers):
        if any("\u0600" <= char <= "\u06ff" for char in clean(header)):
            draw_rtl(pdf, header, cursor_x + widths[index] - 6, top_y - 16, "KOSIF-Bold", font_size, white)
        else:
            draw_ltr(pdf, header, cursor_x + 6, top_y - 16, "KOSIF-Bold", font_size, white)
        cursor_x += widths[index]
    y = top_y - row_height
    for row_index, row in enumerate(rows):
        y -= row_height
        pdf.setFillColor(white if row_index % 2 == 0 else HexColor("#F2EEFA"))
        pdf.setStrokeColor(LINE)
        pdf.rect(x, y, total_width, row_height, fill=1, stroke=1)
        cursor_x = x
        for index, value in enumerate(row):
            text = fit_text(value, max(8, widths[index] - 10), "KOSIF", font_size)
            if index in rtl_columns:
                draw_rtl(pdf, text, cursor_x + widths[index] - 5, y + 8, "KOSIF", font_size, INK)
            else:
                draw_ltr(pdf, text, cursor_x + 5, y + 8, "KOSIF", font_size, INK)
            cursor_x += widths[index]
    return y


pdf = canvas.Canvas(output_path, pagesize=A4, pageCompression=1)
pdf.setTitle(f"KOSIF Audit Studio - 5,000 Account Demonstration Report {data['artifactVersion']}")
pdf.setAuthor("KOSIF Audit Studio")
pdf.setSubject("Synthetic governed audit demonstration report - 20 rounds")

# Cover
pdf.setFillColor(PURPLE)
pdf.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
pdf.setStrokeColor(HexColor("#8E6BC7"))
pdf.setLineWidth(1)
for cx, cy, radius in [(80, 660, 95), (260, 690, 120), (420, 650, 105), (170, 520, 130), (380, 500, 135), (550, 560, 105)]:
    pdf.circle(cx, cy, radius, fill=0, stroke=1)
pdf.setFillColor(GOLD)
pdf.roundRect(MARGIN, PAGE_H - 120, 135, 26, 13, fill=1, stroke=0)
draw_ltr(pdf, "GOVERNED DEMO V7", MARGIN + 15, PAGE_H - 103, "KOSIF-Bold", 8, PURPLE)
draw_rtl(pdf, "استوديو التدقيق", PAGE_W - MARGIN, 560, "KOSIF-Bold", 31, white)
draw_rtl(pdf, "تقرير ارتباط تجريبي شامل", PAGE_W - MARGIN, 515, "KOSIF-Bold", 23, GOLD_SOFT)
draw_rtl(pdf, "لبيانات ميزان مراجعة اصطناعي من 5,000 حساب", PAGE_W - MARGIN, 482, "KOSIF", 12, white)
pdf.setFillColor(HexColor("#3C2855"))
pdf.roundRect(MARGIN, 205, PAGE_W - MARGIN * 2, 150, 16, fill=1, stroke=0)
draw_rtl(pdf, "المنشأة", PAGE_W - MARGIN - 20, 322, "KOSIF-Bold", 8, GOLD_SOFT)
draw_rtl(pdf, data["entity"]["name"], PAGE_W - MARGIN - 20, 302, "KOSIF", 10, white)
draw_rtl(pdf, "الفترة", PAGE_W - MARGIN - 20, 278, "KOSIF-Bold", 8, GOLD_SOFT)
draw_rtl(pdf, data["entity"]["period"], PAGE_W - MARGIN - 20, 258, "KOSIF", 10, white)
draw_rtl(pdf, "إصدار البيانات", PAGE_W - MARGIN - 20, 234, "KOSIF-Bold", 8, GOLD_SOFT)
draw_ltr(pdf, data["artifactVersion"], MARGIN + 20, 215, "KOSIF", 9, white)
draw_ltr(pdf, data["demo"]["commitment"]["datasetId"], MARGIN + 20, 195, "KOSIF", 7.5, GOLD_SOFT)
draw_rtl(pdf, "إفصاح مهم", PAGE_W - MARGIN, 165, "KOSIF-Bold", 10, GOLD_SOFT)
draw_wrapped_rtl(pdf, data["disclosure"], PAGE_W - MARGIN, 142, PAGE_W - MARGIN * 2, "KOSIF", 9, white, 16, 3)
draw_ltr(pdf, "KOSIF Audit Studio", MARGIN, 58, "KOSIF-Bold", 9, GOLD_SOFT)
footer(pdf, 1)
pdf.showPage()

# Summary
page_header(pdf, "OVERVIEW / 01", "الملخص التنفيذي ونتائج السيناريو", 2)
metrics = data["metrics"]
demo = data["demo"]
applied = data["appliedAccounting"]
card_w = (PAGE_W - MARGIN * 2 - 16) / 3
rounded_card(pdf, MARGIN, 662, card_w, 78, "الحسابات", f"{metrics['accountCount']:,}", "مجتمع اصطناعي فريد")
rounded_card(pdf, MARGIN + card_w + 8, 662, card_w, 78, "الجولات", f"{demo['roundCount']}", "كلها مرتبطة بنتيجة ودليل", GOLD)
rounded_card(pdf, MARGIN + (card_w + 8) * 2, 662, card_w, 78, "بوابات الإصدار", f"{data['reportState']['passedGates']}/{len(data['reportState']['gates'])}", "اعتماد بشري بعد آخر إجراء", GREEN)
rounded_card(pdf, MARGIN, 570, card_w, 78, "النماذج التطبيقية", f"{len(applied['models'])}", "حسابات محلية لا تنشئ قيودًا")
rounded_card(pdf, MARGIN + card_w + 8, 570, card_w, 78, "دورة المحاسبة", f"{applied['summary']['cycleComplete']}/{applied['summary']['cycleTotal']}", "من التسجيل إلى الإصدار", GOLD)
rounded_card(pdf, MARGIN + (card_w + 8) * 2, 570, card_w, 78, "جاهزية IFRS 18", f"{applied['summary']['ifrs18Passed']}/{applied['summary']['ifrs18Total']}", "فحص انتقال لا اعتماد آلي", GREEN)
draw_section_label(pdf, "النتائج المالية الأساسية", 535)
finance_rows = [
    ["إجمالي المدين", money(metrics["totalDebit"]), "إجمالي الدائن", money(metrics["totalCredit"])],
    ["فرق الميزان", money(metrics["balanceDifference"]), "الإيراد", money(metrics["revenue"])],
    ["الأهمية النسبية", money(metrics["materiality"]), "أهمية التنفيذ", money(metrics["performanceMateriality"])],
]
draw_simple_table(pdf, ["المؤشر", "القيمة", "المؤشر", "القيمة"], finance_rows, [110, 125, 110, 166], 496, 30, 8, {0, 2})
draw_section_label(pdf, "الحوكمة", 365)
bullets = [
    f"كل نتيجة في هذا الإصدار مشتقة من مجموعة {data['artifactVersion']} نفسها، والمؤشرات المالية محسوبة بعد القيود المرحلة.",
    "لا يختار النظام نوع الرأي تلقائيًا؛ الاختيار والاعتماد مسجلان بشريًا داخل سيناريو العرض.",
    f"حُصرت {applied['knowledgeCoverage']['uniqueVideos']} مادة فريدة ضمن {applied['knowledgeCoverage']['listedAppearances']} ظهورًا من {len(applied['knowledgeCoverage']['sources'])} مصدرًا تعليميًا؛ لا تعد نصوصًا معيارية أو أدلة مراجعة.",
    "ملف XLSX المصاحب يحتوي النماذج السبعة، وخطوات الإقفال الاثنتي عشرة، وتفاصيل IFRS 18، إلى جانب الحسابات والجولات والأدلة والفحوص.",
]
y = 325
for item in bullets:
    pdf.setFillColor(VIOLET)
    pdf.circle(PAGE_W - MARGIN - 5, y + 2, 3, fill=1, stroke=0)
    y = draw_wrapped_rtl(pdf, item, PAGE_W - MARGIN - 16, y + 5, PAGE_W - MARGIN * 2 - 20, "KOSIF", 9, INK, 16, 2) - 8
pdf.showPage()

# Analytics
page_header(pdf, "DATA & ANALYTICS / 02", "سلامة الميزان والتحليلات", 3)
ratios = data["analytics"]["ratios"]
ratio_cards = [
    ("نسبة التداول", f"{ratios['currentRatio']:.2f}x"),
    ("السيولة السريعة", f"{ratios['quickRatio']:.2f}x"),
    ("الدين إلى الملكية", f"{ratios['debtToEquity']:.2f}x"),
    ("هامش الربح الإجمالي", f"{ratios['grossMarginPct']:.2f}%"),
    ("الهامش التشغيلي", f"{ratios['operatingMarginPct']:.2f}%"),
    ("الهامش قبل الضريبة", f"{ratios['netMarginBeforeTaxPct']:.2f}%"),
]
for index, (title, value) in enumerate(ratio_cards):
    col = index % 3
    row = index // 3
    rounded_card(pdf, MARGIN + col * (card_w + 8), 662 - row * 92, card_w, 78, title, value, "مؤشر توجيهي", GOLD if index >= 3 else VIOLET)
draw_section_label(pdf, "أعلى مجالات التعرض", 535)
area_rows = []
for area in sorted(data["analytics"]["areas"], key=lambda item: item["exposure"], reverse=True)[:10]:
    area_rows.append([area["label"], area["accountCount"], money(area["exposure"]), area["high"], " / ".join(area["standards"][:3])])
draw_simple_table(pdf, ["المجال", "الحسابات", "التعرض", "مرتفع", "المعايير"], area_rows, [130, 60, 105, 55, 161], 500, 27, 6.7, {0, 4})
draw_section_label(pdf, "قراءة مهنية", 185)
draw_wrapped_rtl(pdf, f"ظهرت {sum(1 for item in data['analytics']['benford'] if item['flagged'])} إشارات رقم أول ضمن تحليل بنفورد. هذه مؤشرات فرز لتوجيه الفحص وليست دليلًا مستقلًا على الغش أو التحريف.", PAGE_W - MARGIN, 145, PAGE_W - MARGIN * 2, "KOSIF", 9, INK, 16, 3)
pdf.showPage()

# Gates
page_header(pdf, "GOVERNANCE / 03", "بوابات الإصدار الاثنتا عشرة", 4)
gate_rows = []
for index, gate in enumerate(data["reportState"]["gates"], start=1):
    gate_rows.append([index, gate["label"], "PASS" if gate["pass"] else "BLOCKED", gate["detail"]])
draw_simple_table(pdf, ["#", "البوابة", "الحالة", "الدليل"], gate_rows, [35, 225, 75, 176], 730, 38, 8, {1, 3})
draw_wrapped_rtl(pdf, "الحالة PASS تعني اكتمال شروط سيناريو العرض فقط. لا تحوّل هذه الوثيقة إلى تقرير مراجع مستقل أو توقيع قانوني.", PAGE_W - MARGIN, 215, PAGE_W - MARGIN * 2, "KOSIF", 9, RED, 16, 3)
pdf.showPage()

# Rounds pages
for page_offset, start in enumerate((0, 10), start=5):
    end = start + 10
    page_header(pdf, f"ROUNDS / {page_offset - 4:02d}", f"جولات المراجعة {start + 1} إلى {end}", page_offset)
    rows = []
    for round_item in data["rounds"][start:end]:
        rows.append([
            round_item["id"],
            round_item["title"],
            round_item["status"],
            round_item["risk"],
            " / ".join(round_item.get("standards", [])[:4]),
            " / ".join(round_item.get("evidenceIds", [])),
            " / ".join(round_item.get("findingIds", [])),
        ])
    draw_simple_table(pdf, ["الجولة", "الموضوع", "الحالة", "الخطر", "المعايير", "الدليل", "النتيجة"], rows, [48, 142, 48, 42, 115, 58, 58], 730, 54, 6.2, {1, 2, 3, 4})
    draw_wrapped_rtl(pdf, "كل جولة مكتملة بنسبة 100% وتحتوي معرفات صريحة للنتيجة والدليل ومعايير الإجراء ووقت الإقفال والاستنتاج.", PAGE_W - MARGIN, 102, PAGE_W - MARGIN * 2, "KOSIF", 8, MUTED, 14, 2)
    pdf.showPage()

# Evidence and findings pages
for page_offset, start in enumerate((0, 10), start=7):
    end = start + 10
    page_header(pdf, f"EVIDENCE / {page_offset - 6:02d}", f"الأدلة والنتائج {start + 1} إلى {end}", page_offset)
    draw_section_label(pdf, "طلبات الأدلة", 740)
    evidence_rows = []
    for item in data["evidence"][start:end]:
        evidence_rows.append([item["id"], item["roundId"], item["status"], item["fileName"], item["hash"][:14] + "...", item["reviewedBy"]])
    draw_simple_table(pdf, ["الطلب", "الجولة", "الحالة", "الملف", "SHA-256", "المراجع"], evidence_rows, [58, 58, 58, 160, 105, 72], 706, 26, 6.5, {2, 3, 5})
    draw_section_label(pdf, "النتائج والمعالجة", 400)
    finding_rows = []
    for item in data["findings"][start:end]:
        finding_rows.append([item["id"], item["roundId"], item["severity"], item["status"], item["title"], item["closedBy"]])
    draw_simple_table(pdf, ["النتيجة", "الجولة", "الشدة", "الحالة", "العنوان", "أغلقها"], finding_rows, [58, 58, 48, 58, 205, 84], 366, 26, 6.5, {2, 3, 4, 5})
    pdf.showPage()

# Standards by exposure
page_header(pdf, "STANDARDS / 04", "المعايير الأعلى تعرضًا وأساس الربط", 9)
draw_section_label(pdf, "أعلى المعايير المستخدمة حسب التعرض المالي", 740)
coverage_by_id = {item["id"]: item for item in data["standardsCoverage"]}
top_standards = sorted(
    data["standards"],
    key=lambda item: coverage_by_id.get(item["id"], {}).get("totalExposure", 0),
    reverse=True,
)[:11]
top_rows = []
for item in top_standards:
    coverage = coverage_by_id.get(item["id"], {})
    refs = item.get("references") or []
    ref_text = (
        f"{refs[0].get('id', '')} · {refs[0].get('location', '')}"
        if refs
        else "IAASB / SOCPA"
    )
    effective = item.get("effective", "")
    if item["id"] in {"IFRS 18", "IFRS 19"}:
        effective = "2027 · تطبيق مبكر"
    elif item["id"].startswith("ISA "):
        effective = "حسب الارتباط المحلي"
    elif item["id"] == "IAS 1":
        effective = "ساري · انتقال IFRS 18"
    elif item["id"] == "SOCPA ZAKAT":
        effective = "راجع المصدر الرسمي"
    top_rows.append([
        item["id"], item["title"], coverage.get("accountCount", 0),
        money(coverage.get("totalExposure", 0)), effective, ref_text,
    ])
draw_simple_table(pdf, ["المعيار", "العنوان", "الحسابات", "التعرض", "السريان", "المرجع"], top_rows, [56, 112, 50, 96, 94, 103], 705, 38, 5.8, {1, 4, 5})
draw_wrapped_rtl(pdf, "التعرض يساعد في ترتيب العرض فقط؛ لا يثبت انطباق المعيار وحده. سبب الربط والنطاق والاعتراف والقياس والعرض تظهر في مركز المعايير داخل التطبيق.", PAGE_W - MARGIN, 240, PAGE_W - MARGIN * 2, "KOSIF", 8, MUTED, 14, 3)
pdf.showPage()

# Standards appendix and reference groups
page_header(pdf, "STANDARDS / 05", "ملحق الكتالوج والمجموعات المرجعية", 10)
draw_section_label(pdf, f"فهرس الكتالوج - {len(data['standards'])} معيارًا", 740)
standard_rows = [[item["id"], "محاسبي" if item["type"] == "accounting" else "مراجعة", item["title"]] for item in data["standards"]]
columns = [standard_rows[index::3] for index in range(3)]
y = 690
for row_index in range(math.ceil(len(standard_rows) / 3)):
    for column_index in range(3):
        if row_index >= len(columns[column_index]):
            continue
        item = columns[column_index][row_index]
        x = MARGIN + column_index * 171
        pdf.setFillColor(white if row_index % 2 == 0 else LAVENDER)
        pdf.setStrokeColor(LINE)
        pdf.rect(x, y - 20, 163, 20, fill=1, stroke=1)
        draw_ltr(pdf, item[0], x + 5, y - 14, "KOSIF-Bold", 5.8, VIOLET)
        title = item[2] if len(item[2]) <= 25 else item[2][:24] + "…"
        draw_rtl(pdf, title, x + 158, y - 14, "KOSIF", 5.5, INK)
    y -= 22
draw_section_label(pdf, "فصل المجموعات المرجعية", 205)
reference_rows = []
for item in data["referenceComparison"]:
    reference_total = f"{float(item['totalDebit']):,.2f} {item.get('currency', '')}" if item.get("totalDebit") is not None else "-"
    reference_rows.append([item["label"], item.get("currency", "-"), item.get("accounts", "-"), item.get("rounds", "-"), item.get("findings", "-"), reference_total])
draw_simple_table(pdf, ["المصدر", "العملة", "الحسابات", "الجولات", "النتائج", "إجمالي المدين"], reference_rows, [155, 52, 60, 55, 55, 134], 170, 20, 5.4, {0})
pdf.showPage()

# Adjustment bridge and basis of opinion
page_header(pdf, "REPORTING / 06", "جسر التسويات وأساس الرأي", 11)
bridge = data["adjustmentBridge"]
draw_section_label(pdf, "قبل التسويات - القيود - بعد التسويات", 740)
bridge_rows = [
    ["ميزان المصدر", money(bridge["beforeDebit"]), money(bridge["beforeCredit"]), "ملف المصدر الملتزم"],
    ["قيود المراجعة المرحلة", money(bridge["postedDebit"]), money(bridge["postedCredit"]), f"{bridge['postedCount']} قيود مزدوجة"],
    ["إجمالي رقابة الترحيل", money(bridge["journalizedDebit"]), money(bridge["journalizedCredit"]), "المصدر + أطراف القيود"],
    ["الميزان المعدل الصافي", money(bridge["adjustedDebit"]), money(bridge["adjustedCredit"]), "بعد إعادة صافي كل حساب"],
]
draw_simple_table(pdf, ["المرحلة", "مدين", "دائن", "الأساس"], bridge_rows, [135, 120, 120, 136], 705, 38, 7, {0, 3})
draw_section_label(pdf, "مكونات أساس الرأي", 510)
opinion_items = [
    f"اختيار الرأي في سيناريو العرض: {data['reportState']['reportOpinion']}؛ الاختيار والاعتماد مسجلان بشريًا ولا يستنتجهما المحرك.",
    f"عولجت {len(data['adjustments'])} تسويات وربطت بجداول يومية متوازنة، وأعيد احتساب المؤشرات من الميزان المعدل.",
    "بصمات الأدلة الاصطناعية هي بصمات fixture موثقة وليست بصمات محتوى ملفات حقيقية؛ الملف الحقيقي يعاد تجزئته من البايتات محليًا.",
    "أي استخدام خارجي يحتاج تقييمًا مستقلًا لكفاية الأدلة، والاستمرارية، والأحداث اللاحقة، والالتزام النظامي، والتوقيع المهني.",
]
y = 465
for item in opinion_items:
    pdf.setFillColor(VIOLET)
    pdf.circle(PAGE_W - MARGIN - 5, y + 2, 3, fill=1, stroke=0)
    y = draw_wrapped_rtl(pdf, item, PAGE_W - MARGIN - 16, y + 5, PAGE_W - MARGIN * 2 - 20, "KOSIF", 8.5, INK, 15, 3) - 10
pdf.showPage()

# Going concern and source ledger
page_header(pdf, "REPORTING / 07", "الاستمرارية ومصدر الأرقام", 12)
ratios = data["analytics"]["ratios"]
scenario_rows = [
    ["المسجل بعد التسويات", f"{ratios['currentRatio']:.2f}x", f"{ratios['quickRatio']:.2f}x", f"{ratios['operatingMarginPct']:.1f}%", "قيود الجلسة المرحلة فقط"],
    ["ضغط تحليلي", f"{ratios['currentRatio'] * .9 / 1.05:.2f}x", f"{ratios['quickRatio'] * .9 / 1.05:.2f}x", f"{ratios['operatingMarginPct'] - 5:.1f}%", "أصول متداولة -10% / التزامات +5%"],
    ["تعافٍ تحليلي", f"{ratios['currentRatio'] * 1.08 / .98:.2f}x", f"{ratios['quickRatio'] * 1.08 / .98:.2f}x", f"{ratios['operatingMarginPct'] + 5:.1f}%", "أصول متداولة +8% / التزامات -2%"],
]
draw_section_label(pdf, "سيناريوهات تحليلية - ليست أدلة مراجعة", 740)
draw_simple_table(pdf, ["السيناريو", "التداول", "السريعة", "هامش التشغيل", "الافتراض"], scenario_rows, [125, 65, 65, 90, 166], 705, 42, 7, {0, 4})
draw_wrapped_rtl(pdf, "المؤشرات السلبية أو الحدية لا تحسم ملاءمة أساس الاستمرارية. يلزم تقييم إدارة موثق لتوقعات التدفق النقدي والتعهدات وخطط التمويل والأحداث اللاحقة وحساسية الافتراضات.", PAGE_W - MARGIN, 510, PAGE_W - MARGIN * 2, "KOSIF", 9, RED, 16, 3)
draw_section_label(pdf, "سجل المصدر والقطع", 420)
source_rows = [
    ["معرف المجموعة", data["metrics"]["datasetId"]],
    ["بصمة المجموعة", data["metrics"]["datasetDigest"]],
    ["الفترة", data["metrics"]["datasetPeriod"]],
    ["العملة", data["metrics"]["datasetCurrency"]],
    ["وقت الالتزام", data["metrics"]["datasetCommittedAt"]],
    ["وقت إنشاء الحزمة", data["generatedAt"]],
    ["جرد مواد التعلّم", f"{applied['knowledgeCoverage']['uniqueVideos']} فريد | {applied['knowledgeCoverage']['listedAppearances']} ظهور | {len(applied['knowledgeCoverage']['sources'])} مصدر"],
]
draw_simple_table(pdf, ["الحقل", "القيمة"], source_rows, [140, 371], 385, 38, 7, {0, 1})
pdf.showPage()

# Completion, council, adjustments, and locks
page_header(pdf, "COMPLETION / 08", "المجلس والتسويات وأقفال الفترات", 13)
commitment = data["demo"]["commitment"]
draw_section_label(pdf, "التزام مجموعة البيانات", 740)
draw_ltr(pdf, commitment["datasetId"], MARGIN, 690, "KOSIF-Bold", 9, VIOLET)
draw_ltr(pdf, commitment["sha256"], MARGIN, 670, "KOSIF", 6.3, INK)
draw_rtl(pdf, f"{commitment['rowCount']:,} حساب | {commitment['currency']} | {commitment['period']}", PAGE_W - MARGIN, 645, "KOSIF", 8, MUTED)
draw_section_label(pdf, "جولات المجلس والقرار البشري", 620)
council_rows = []
for item in data["council"]["rounds"]:
    council_rows.append([item["id"], item["consensus"]["status"], len(item["advisorResults"]), item["population"], item["sampleSize"], item["generatedAt"][:16].replace("T", " ")])
draw_simple_table(pdf, ["الجولة", "الحالة", "المقاعد", "المجتمع", "العينة", "الوقت"], council_rows, [75, 105, 65, 70, 60, 136], 580, 30, 6.5, {1})
decision = data["council"]["humanDecision"]
draw_wrapped_rtl(pdf, f"القرار البشري: {decision['status']} - {decision['reviewer']} - {decision['rationale']}", PAGE_W - MARGIN, 475, PAGE_W - MARGIN * 2, "KOSIF", 7.5, INK, 13, 3)
draw_section_label(pdf, "قيود التسوية المرحلة", 420)
adjustment_rows = []
for item in data["adjustments"]:
    adjustment_rows.append([item["id"], item["journalReference"], item["title"], money(item["amount"]), item["reviewedBy"], item["postedAt"][:16].replace("T", " ")])
draw_simple_table(pdf, ["التسوية", "مرجع اليومية", "البيان", "القيمة", "المراجع", "وقت الترحيل"], adjustment_rows, [62, 80, 135, 85, 75, 74], 385, 30, 5.9, {2, 4})
draw_section_label(pdf, "أقفال الفترات", 250)
lock_rows = []
for item in data["periodLocks"]:
    lock_rows.append([item["id"], item["status"], item.get("preparedBy") or "-", item.get("approvedBy") or "-", (item.get("lockedAt") or "-")[:16].replace("T", " "), item["reason"]])
draw_simple_table(pdf, ["الفترة", "الحالة", "أعدها", "اعتمدها", "وقت القفل", "السبب"], lock_rows, [60, 65, 80, 80, 85, 141], 215, 34, 5.8, {1, 2, 3, 5})
pdf.showPage()

# Audit trail and applied models
page_header(pdf, "AUDIT TRAIL / 09", "سجل الرقابة والنماذج التطبيقية", 14)
trail_rows = []
for item in data["auditTrail"]:
    trail_rows.append([item["id"], item["action"], item["actor"], item["at"][:16].replace("T", " ")])
draw_simple_table(pdf, ["الحدث", "الإجراء", "الفاعل", "الوقت"], trail_rows, [65, 225, 105, 116], 730, 24, 6.2, {1, 2})
draw_section_label(pdf, "النماذج السبعة ومصفوفة YouTube التدريبية غير الحصرية", 385)
model_rows = [[item["standardId"], item["title"]] for item in applied["models"]]
draw_simple_table(pdf, ["المعيار", "النموذج التطبيقي"], model_rows, [50, 180], 350, 22, 5.8, {1})
topic_rows = [[item["topic"], item["uniqueVideoCount"]] for item in applied["knowledgeCoverage"]["topics"]]
draw_simple_table(pdf, ["المحور غير الحصري", "فيديو"], topic_rows, [218, 55], 350, 18, 5.3, {0}, MARGIN + 238)
draw_wrapped_rtl(
    pdf,
    "النماذج لا تنشئ قيدًا ولا تعتمد معالجة، والمصفوفة خريطة تدريبية قد يتكرر فيها الفيديو؛ يلزم الرجوع للنص الرسمي والحكم المهني.",
    PAGE_W - MARGIN,
    67,
    PAGE_W - MARGIN * 2,
    "KOSIF",
    6.3,
    RED,
    10,
    2,
)
draw_ltr(pdf, data["siteUrl"], MARGIN, 40, "KOSIF", 6.5, VIOLET)
pdf.showPage()

# Limitations and learning-source methodology
page_header(pdf, "LIMITATIONS / 10", "حدود الاستخدام ومنهج مصادر التعلّم", 15)
draw_section_label(pdf, "حدود التقرير", 740)
limitations = [
    data["disclosure"],
    "المرفقات الأصلية ليست مضمنة في هذا PDF؛ تظهر أسماؤها وبصماتها ونتائج مراجعتها في بيانات العرض.",
    "المحركات الخارجية غير مهيأة، ولا تُرسل بيانات الارتباط أو الأسرار إلى مزود AI من هذا التقرير.",
    "أي استخدام مهني يتطلب تحققًا من المصادر الرسمية، وهوية وصلاحيات خادمية، وسياسة احتفاظ وتوقيعًا معتمدًا.",
]
y = 695
for item in limitations:
    pdf.setFillColor(RED)
    pdf.circle(PAGE_W - MARGIN - 5, y + 2, 3, fill=1, stroke=0)
    y = draw_wrapped_rtl(pdf, item, PAGE_W - MARGIN - 16, y + 5, PAGE_W - MARGIN * 2 - 20, "KOSIF", 8.5, INK, 15, 3) - 10

draw_section_label(pdf, "منهج جرد مصادر التعلّم", 430)
methodology = [
    f"شمل الجرد {applied['knowledgeCoverage']['listedAppearances']} ظهورًا تمثل {applied['knowledgeCoverage']['uniqueVideos']} فيديو فريدًا من {len(applied['knowledgeCoverage']['sources'])} مصدرًا قدمها المستخدم.",
    "استُخدمت العناوين والأوصاف والفصول والنصوص المتاحة كخريطة موضوعات؛ لا يقال إن كل دقيقة من كل فيديو نُسخت أو حُفظت.",
    "أعداد مصفوفة الموضوعات غير حصرية، وقد يظهر الفيديو في أكثر من محور؛ المصفوفة أداة تدريب وتصميم لا قياسًا معياريًا.",
    "لم تُنقل الفيديوهات أو نصوص المعايير إلى التطبيق، ولا تحل المواد التعليمية محل IFRS Foundation أو SOCPA أو الحكم البشري.",
]
y = 385
for item in methodology:
    pdf.setFillColor(VIOLET)
    pdf.circle(PAGE_W - MARGIN - 5, y + 2, 3, fill=1, stroke=0)
    y = draw_wrapped_rtl(pdf, item, PAGE_W - MARGIN - 16, y + 5, PAGE_W - MARGIN * 2 - 20, "KOSIF", 8.3, INK, 15, 3) - 10
draw_rtl(pdf, "نهاية تقرير العرض", PAGE_W - MARGIN, 80, "KOSIF-Bold", 14, PURPLE)
draw_ltr(pdf, data["siteUrl"], MARGIN, 58, "KOSIF", 7.5, VIOLET)
pdf.showPage()

pdf.save()
