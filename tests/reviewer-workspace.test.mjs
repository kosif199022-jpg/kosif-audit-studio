import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(
  new URL("../src/components/ReviewerWorkspace.jsx", import.meta.url),
  "utf8",
);
const css = await readFile(
  new URL("../src/reviewer-workspace.css", import.meta.url),
  "utf8",
);

test("reviewer workspace restores three functional local tabs", () => {
  assert.match(component, /سجل PBC/);
  assert.match(component, /ملاحظات المراجع/);
  assert.match(component, /مركز المصادر/);
  assert.match(component, /role="tablist"/);
  assert.match(component, /aria-orientation="horizontal"/);
  assert.match(component, /setActiveTab\(id\)/);
  assert.match(component, /event\.key === "ArrowLeft"/);
  assert.match(component, /event\.key === "ArrowRight"/);
  assert.match(component, /event\.key === "Home"/);
  assert.match(component, /event\.key === "End"/);
  assert.match(component, /document\.getElementById\(`reviewer-tab-\$\{nextTab\}`\)\?\.focus\(\)/);
  assert.match(component, /engagement\.evidence\?\.length/);
  assert.match(component, /manualPbcRequests/);
  assert.match(component, /reviewerNotes/);
  assert.match(component, /customProfessionalSources/);
});

test("manual PBC requests are linked to rounds and counted with evidence", () => {
  assert.match(component, /manualPbcRequests: \[\.\.\.\(current\.manualPbcRequests \|\| \[\]\), request\]/);
  assert.match(component, /roundId: draft\.roundId/);
  assert.match(component, /onOpenRound\?\.\(request\.roundId\)/);
  assert.match(component, /\(engagement\.evidence\?\.length \|\| 0\) \+ \(engagement\.manualPbcRequests\?\.length \|\| 0\)/);
  assert.match(component, /humanApproval: false/);
});

test("reviewer notes support contextual links and local browser dictation", () => {
  assert.match(component, /accountId: draft\.accountId \|\| null/);
  assert.match(component, /roundId: draft\.roundId \|\| null/);
  assert.match(component, /standardId: draft\.standardId \|\| null/);
  assert.match(component, /window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/);
  assert.match(component, /recognition\.lang = "ar-SA"/);
  assert.match(component, /لم يُرسل أي صوت خارجيًا/);
  assert.match(component, /filter\(\(item\) => item\.id !== note\.id\)/);
  assert.doesNotMatch(component, /fetch\(|WebSocket|Gemini|OpenAI|Claude|API[_ -]?key/i);
});

test("reviewer account selector searches a bounded list and retains the selected account", () => {
  assert.match(component, /const ACCOUNT_OPTION_LIMIT = 100/);
  assert.match(component, /const \[accountSearch, setAccountSearch\] = useState\(""\)/);
  assert.match(component, /const selectedAccount = draft\.accountId[\s\S]*accounts\.find/);
  assert.match(component, /const result = selectedAccount \? \[selectedAccount\] : \[\]/);
  assert.match(component, /result\.length >= ACCOUNT_OPTION_LIMIT/);
  assert.match(component, /accountOptions\.map\(\(account\) => <option/);
  assert.doesNotMatch(component, /\{accounts\.map\(\(account\) => <option/);
});

test("sources distinguish authority and reject unsafe credential-bearing links", () => {
  assert.match(component, /officialSources/);
  assert.match(component, /attachedReferenceLibrary/);
  assert.match(component, /parsed\.protocol !== "https:"/);
  assert.match(component, /parsed\.username \|\| parsed\.password/);
  assert.match(component, /api\[-_\]\?key\|access\[-_\]\?token\|auth\|password\|secret\|signature/);
  assert.match(component, /rel="noopener noreferrer"/);
  assert.match(component, /لا يعرضها بدرجة سلطة واحدة/);
});

test("reviewer workspace remains responsive and provides touch-sized tabs", () => {
  assert.match(css, /\.reviewer-tabs button[\s\S]*min-height: 48px/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.reviewer-source-grid[\s\S]*grid-template-columns: repeat\(3/);
  assert.match(css, /prefers-reduced-motion/);
});
