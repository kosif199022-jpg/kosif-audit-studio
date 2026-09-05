// Compatibility helpers for the local v4 agent. No accounting engine is replaced.
export const normalizeText = (value = '') => String(value).replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[\u064B-\u065F\u0670]/g, '').replace(/\s+/g, ' ');
export function fnv1a(value) {
 let hash = 0x811c9dc5;
 for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193); }
 return hash >>> 0;
}
export function isReviewedEvidence(item = {}) { return item.reviewRecorded === true; }
