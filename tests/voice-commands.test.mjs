import test from "node:test";
import assert from "node:assert/strict";
import { canUseVoiceCommands, normalizeVoiceText, parseVoiceCommand } from "../src/voice-commands.js";

test("voice commands normalize Arabic variants and route to workspaces", () => {
  assert.equal(normalizeVoiceText("أقرأ التقرير"), "اقرا التقرير");
  assert.deepEqual(parseVoiceCommand("افتح الأدلة"), {
    type: "view",
    view: "evidence",
    text: "افتح الادله",
    reply: "فتحت مساحة evidence.",
  });
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

