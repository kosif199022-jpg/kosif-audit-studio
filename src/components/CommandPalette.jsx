import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BookOpen,
  Command,
  CornerDownLeft,
  FileCheck2,
  FolderSearch2,
  Navigation,
  RotateCcw,
  Scale,
  Search,
  X,
} from "lucide-react";
import { navItems as workspaceNavItems } from "../data.js";
import { getAccountStandardIds, standardCatalog } from "../standards.js";
import "../command-accessibility.css";

const resultIcons = {
  view: Navigation,
  account: Scale,
  standard: BookOpen,
  round: RotateCcw,
  evidence: FileCheck2,
};

const resultTypeLabels = {
  view: "قسم",
  account: "حساب",
  standard: "معيار",
  round: "جولة",
  evidence: "دليل",
};

const limits = {
  view: 7,
  account: 9,
  standard: 8,
  round: 6,
  evidence: 6,
};

function normalizeSearch(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ؤئ]/g, "ء")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/\s+/g, " ")
    .trim();
}

function matchesQuery(values, query) {
  if (!query) return true;
  const haystack = normalizeSearch(values.filter(Boolean).join(" "));
  return query.split(" ").every((token) => haystack.includes(token));
}

function collectMatches(items, query, limit, createResult) {
  const results = [];
  for (const item of items || []) {
    const result = createResult(item);
    if (!matchesQuery(result.keywords, query)) continue;
    results.push(result);
    if (results.length >= limit) break;
  }
  return results;
}

function buildCommandResults({ navItems, accounts, standards, rounds, evidence, mappingState, query }) {
  const normalizedQuery = normalizeSearch(query);
  const views = collectMatches(navItems, normalizedQuery, normalizedQuery ? limits.view : 10, (item) => ({
    key: `view:${item.id}`,
    kind: "view",
    id: item.id,
    label: item.label,
    description: "انتقال داخل مساحة عمل الارتباط",
    keywords: [item.id, item.label],
  }));

  if (!normalizedQuery) return views;

  const accountResults = collectMatches(accounts, normalizedQuery, limits.account, (account) => {
    const standardIds = getAccountStandardIds(account, mappingState, { includeSuggested: true });
    return {
      key: `account:${account.id}`,
      kind: "account",
      id: account.id,
      label: [account.code, account.name].filter(Boolean).join(" · "),
      description: [account.areaLabel, account.nature, account.risk].filter(Boolean).join(" · "),
      standardId: standardIds[0] || null,
      keywords: [
        account.id,
        account.code,
        account.name,
        account.areaLabel,
        account.nature,
        account.category,
        ...standardIds,
      ],
    };
  });

  const standardResults = collectMatches(standards, normalizedQuery, limits.standard, (standard) => ({
    key: `standard:${standard.id}`,
    kind: "standard",
    id: standard.id,
    label: `${standard.id} · ${standard.title}`,
    description: standard.summary || standard.source || "فتح بطاقة المعيار",
    keywords: [
      standard.id,
      standard.title,
      standard.summary,
      standard.source,
      standard.family,
      ...(standard.requirements || []),
      ...(standard.scope || []),
    ],
  }));

  const roundResults = collectMatches(rounds, normalizedQuery, limits.round, (round) => ({
    key: `round:${round.id}`,
    kind: "round",
    id: round.id,
    label: round.title || round.referenceId || round.id,
    description: [round.referenceId, round.owner, round.status].filter(Boolean).join(" · "),
    keywords: [
      round.id,
      round.referenceId,
      round.title,
      round.owner,
      round.status,
      round.summary,
      round.action,
      ...(round.standards || []),
    ],
  }));

  const evidenceResults = collectMatches(evidence, normalizedQuery, limits.evidence, (item) => ({
    key: `evidence:${item.id}`,
    kind: "evidence",
    id: item.id,
    label: item.title || item.fileName || item.id,
    description: [item.area, item.owner, item.status].filter(Boolean).join(" · "),
    keywords: [
      item.id,
      item.title,
      item.fileName,
      item.area,
      item.owner,
      item.status,
      item.roundId,
      ...(item.standardIds || []),
      ...(item.assertions || []),
    ],
  }));

  return [
    ...views,
    ...accountResults,
    ...standardResults,
    ...roundResults,
    ...evidenceResults,
  ];
}

function focusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll(
    'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

export function CommandPalette({
  navItems = workspaceNavItems,
  accounts = [],
  standards = standardCatalog,
  rounds = [],
  evidence = [],
  mappingState,
  onView,
  onOpenStandard,
  onOpenRound,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const previousFocusRef = useRef(null);
  const listId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const isControlled = typeof controlledOpen === "boolean";
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const setOpen = useCallback((nextOpen) => {
    if (!isControlled) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
    if (!nextOpen) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [isControlled, onOpenChange]);

  const results = useMemo(
    () => buildCommandResults({
      navItems,
      accounts,
      standards,
      rounds,
      evidence,
      mappingState,
      query: deferredQuery,
    }),
    [navItems, accounts, standards, rounds, evidence, mappingState, deferredQuery],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [deferredQuery]);

  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!isOpen);
        return;
      }
      if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isOpen, setOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    previousFocusRef.current = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      const previousFocus = previousFocusRef.current;
      if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) {
        previousFocus.focus();
      }
    };
  }, [isOpen]);

  const chooseResult = useCallback((result) => {
    if (!result) return;
    if (result.kind === "view") {
      onView?.(result.id);
    } else if (result.kind === "standard") {
      onOpenStandard?.(result.id, null, "command-palette");
    } else if (result.kind === "account") {
      if (result.standardId) {
        onOpenStandard?.(result.standardId, result.id, "command-palette");
      } else {
        onView?.("trial-balance", { accountId: result.id, source: "command-palette" });
      }
    } else if (result.kind === "round") {
      onOpenRound?.(result.id);
    } else if (result.kind === "evidence") {
      onView?.("evidence", { evidenceId: result.id, source: "command-palette" });
    }
    setOpen(false);
  }, [onOpenRound, onOpenStandard, onView, setOpen]);

  const handleDialogKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => results.length ? (current + 1) % results.length : 0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => results.length ? (current - 1 + results.length) % results.length : 0);
      return;
    }
    if (event.key === "Enter" && document.activeElement === inputRef.current) {
      event.preventDefault();
      chooseResult(results[activeIndex]);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = focusableElements(dialogRef.current);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      {showTrigger ? (
        <button
          type="button"
          className="command-palette-trigger"
          aria-label="فتح البحث والأوامر"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-keyshortcuts="Control+K Meta+K"
          onClick={() => setOpen(true)}
        >
          <Command size={18} aria-hidden="true" />
          <span>بحث وأوامر</span>
          <kbd dir="ltr">Ctrl K</kbd>
        </button>
      ) : null}

      {isOpen ? (
        <div
          className="command-palette-backdrop"
          dir="rtl"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            ref={dialogRef}
            className="command-palette-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            onKeyDown={handleDialogKeyDown}
          >
            <header className="command-palette-heading">
              <div>
                <span className="command-palette-eyebrow">بحث محلي داخل ملف الارتباط</span>
                <h2 id={titleId}>البحث والأوامر</h2>
                <p id={descriptionId}>ابحث عن قسم أو حساب أو معيار أو جولة أو حزمة دليل.</p>
              </div>
              <button
                type="button"
                className="command-palette-close"
                aria-label="إغلاق البحث والأوامر"
                onClick={() => setOpen(false)}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>

            <div className="command-palette-search">
              <Search size={21} aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={results[activeIndex] ? `${listId}-option-${activeIndex}` : undefined}
                autoComplete="off"
                spellCheck="false"
                placeholder="مثال: IFRS 15، بنك، الجولة 4"
                onChange={(event) => setQuery(event.target.value)}
              />
              <kbd>Esc</kbd>
            </div>

            <div className="command-palette-results" id={listId} role="listbox" aria-label="نتائج البحث">
              {results.length ? results.map((result, index) => {
                const Icon = resultIcons[result.kind] || FolderSearch2;
                return (
                  <button
                    type="button"
                    role="option"
                    tabIndex={-1}
                    id={`${listId}-option-${index}`}
                    key={result.key}
                    className={activeIndex === index ? "active" : ""}
                    aria-selected={activeIndex === index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => chooseResult(result)}
                  >
                    <span className="command-result-icon" aria-hidden="true"><Icon size={19} /></span>
                    <span className="command-result-copy">
                      <strong>{result.label}</strong>
                      <small>{result.description}</small>
                    </span>
                    <span className={`command-result-kind kind-${result.kind}`}>{resultTypeLabels[result.kind]}</span>
                    {activeIndex === index ? <CornerDownLeft className="command-result-enter" size={17} aria-hidden="true" /> : null}
                  </button>
                );
              }) : (
                <div className="command-palette-empty" role="status">
                  <FolderSearch2 size={27} aria-hidden="true" />
                  <strong>لا توجد نتيجة مطابقة</strong>
                  <span>جرّب رمز حساب أو رقم معيار أو اسم جولة.</span>
                </div>
              )}
            </div>

            <footer className="command-palette-footer">
              <span><kbd>↑</kbd><kbd>↓</kbd> للتنقل</span>
              <span><kbd>Enter</kbd> للفتح</span>
              <span>يبقى البحث داخل المتصفح ولا يرسل بيانات الارتباط إلى شبكة.</span>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
