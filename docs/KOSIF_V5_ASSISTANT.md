# KOSIF V5 — Engagement Assistant (KOSIF Live)

`v5/continuous-assistant.js` is the in-workspace assistant. It answers from engagement state with deterministic Arabic rules; it is not a language model and it never calls an external service.

## Contract

- **Read only.** Every number in an answer comes from `assistantSnapshot()`, which reads the engagement, the trial-balance analysis and the materiality object. Nothing is generated, estimated or completed by inference.
- **Cite every answer.** Each reply carries a `cite` field naming the state path it read (`engagement.requests`, `materiality.overall`, `analysis.balanced` …), rendered under the message as «المصدر».
- **Refuse instead of guessing.** When data is missing the assistant says what is missing and how to produce it; when the question is outside its rule set it returns `unknown` with the capability list.
- **No professional authority.** The assistant cannot approve evidence, accept an adjustment, issue an opinion or build a report while gates are open. Actions are limited to pressing the application's own buttons (`#runCouncilButton`, `#demoButton`, `#buildDraftButton`, print).
- **Deterministic output.** `routeAssistantQuery(query, snapshot)` is pure: same query plus same snapshot yields the same intent, reply, view, action and citation. It is covered by `tests/v5-assistant.test.js`.

## Intents

| Intent | Answers about | Workspace |
| --- | --- | --- |
| `next` | current stage, next controlled action, open items | overview |
| `readiness` | report readiness against the six gates | report |
| `blockers` | top open requests and issues | documents / issues |
| `issues` | open issues, high-severity share, top titles | issues |
| `requests` | open evidence requests and critical ones | documents |
| `evidence` | recorded evidence and how much is reviewed | documents |
| `council` | rounds, latest round and verdict | council |
| `analysis` | trial balance, accounts, balance check | financials |
| `materiality` | overall and performance materiality and benchmark | financials |
| `adjustments` | proposed and accepted adjustments | financials |
| `report` | latest report id, version and status | report |
| `documents` | registered documents and their types | documents |
| `navigate` | any workspace by Arabic name | target |
| `help` / `unknown` | capability list, never a fabricated answer | — |

Arabic normalisation (`normalizeDashboardText`) handles hamza forms, ta-marbuta, alef-maqsura, tatweel, Arabic-Indic digits and diacritics, so «إفتح شاشة الأخطار» and «افتح المخاطر» resolve to the same workspace.

## Voice

- Listening uses `SpeechRecognition` / `webkitSpeechRecognition` with `ar-SA` when the browser exposes it; otherwise the panel says so and typing remains the only input.
- Spoken answers use `speechSynthesis` and are off by default; the «النطق» toggle cancels speech when switched off.
- The panel state (`idle`, `listening`, `thinking`, `speaking`) drives the orb animation, and `prefers-reduced-motion` disables it.
- Nothing is recorded or uploaded: recognised text goes straight into the same local rule router as typed text. Speech services are provided by the browser, exactly as documented for KOSIF 4.

## Keyboard

`V` toggles the panel outside inputs, `Escape` closes it. The floating button stays reachable on mobile above the bottom workspace navigation.
