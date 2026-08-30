import { sha256BytesHex } from "./governance.js";

const DATABASE_NAME = "kosif-audit-evidence-v1";
const STORE_NAME = "attachments";

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open evidence store"));
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("Evidence transaction aborted"));
    transaction.onerror = () => reject(transaction.error || new Error("Evidence transaction failed"));
  });
}

export async function storeEvidenceBytes(key, bytes, metadata = {}) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({
      key,
      bytes: bytes instanceof ArrayBuffer ? bytes.slice(0) : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      storedAt: new Date().toISOString(),
      ...metadata,
    });
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function readEvidenceBytes(key) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    const record = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Could not read evidence"));
    });
    await transactionComplete(transaction);
    return record?.bytes || null;
  } finally {
    database.close();
  }
}

export async function deleteEvidenceBytes(key) {
  if (!key) return;
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function clearEvidenceStore() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function verifyRetainedEvidence(items = [], {
  readBytes = readEvidenceBytes,
  hashBytes = sha256BytesHex,
} = {}) {
  const retainedItems = items.filter((item) => item?.attachmentStorage === "indexeddb-local");
  for (const item of retainedItems) {
    if (!item.storageKey || !Number.isInteger(item.fileSize) || item.fileSize <= 0 || !/^[a-f0-9]{64}$/i.test(item.hash || "")) {
      return { ok: false, evidenceId: item.id || null, reason: "metadata" };
    }
    let bytes;
    try {
      bytes = await readBytes(item.storageKey);
    } catch {
      return { ok: false, evidenceId: item.id || null, reason: "unavailable" };
    }
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== item.fileSize) {
      return { ok: false, evidenceId: item.id || null, reason: "size" };
    }
    if (await hashBytes(bytes) !== item.hash) {
      return { ok: false, evidenceId: item.id || null, reason: "digest" };
    }
  }
  return { ok: true, checked: retainedItems.length };
}
