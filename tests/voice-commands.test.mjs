import test from "node:test";
import assert from "node:assert/strict";
import { canUseVoiceCommands, normalizeVoiceText, parseVoiceCommand, viewLabel } from "../src/voice-commands.js";

test("voice commands normalize Arabic variants and route to workspaces", () => {
  assert.equal(normalizeVoiceText("أقرأ التقرير"), "اقرا التقرير");
  assert.deepEqual(parseVoiceCommand("افتح الأدلة"), {
    type: "view",
    view: "evidence",
    text: "افتح الادله",
    reply: "تم فتح الأدلة وطلبات PBC.",
  });
});

test("expanded commands reach high-value KOSIF workspaces", () => {
  assert.equal(parseVoiceCommand("افتح مركز النتائج").view, "results");
  assert.equal(parseVoiceCommand("روح مختبر المستندات").view, "document-lab");
  assert.equal(parseVoiceCommand("افتح مساحة عمل المراجع").view, "reviewer-workspace");
  assert.equal(parseVoiceCommand("أريد التحليلات").view, "analytics");
  assert.equal(parseVoiceCommand("افتح استوديو الذكاء").view, "intelligence");
  assert.equal(parseVoiceCommand("افتح اتصالات الذكاء").view, "ai-connections");
  assert.equal(viewLabel("council"), "مجلس المراجعين الذكي");
});

test("voice commands expose space and local report actions", () => {
  assert.equal(parseVoiceCommand("فعّل الوضع السينمائي").type, "toggle-space");
  assert.equal(parseVoiceCommand("أريد تقريرًا صوتيًا").type, "speak-report");
  assert.equal(parseVoiceCommand("توقف").type, "stop");
});

test("voice capability detection stays safe outside a browser", () => {
  assert.equal(canUseVoiceCommands({}), false);
  assert.equal(canUseVoiceCommands({ SpeechRecognition: function SpeechRecognition() {} }), true);
});
