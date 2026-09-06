const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
const EVIDENCE_REQUEST_MAX_BYTES = EVIDENCE_MAX_BYTES + 262_144;
const EVIDENCE_KINDS = new Set([
  "confirmation",
  "contract",
  "invoice",
  "bank_statement",
  "legal_response",
  "workpaper",
  "other",
]);
const EVIDENCE_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg",
]);
const TENANT_ID = /^ten_[a-f0-9]{26}$/;
const ENGAGEMENT_ID = /^eng_[a-f0-9]{26}$/;
const LOGICAL_ID = /^evl_[a-f0-9]{26}$/;
const EVIDENCE_ID = /^ev_[a-f0-9]{26}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function cleanText(value) {
  return String(value ?? "").normalize("NFC").trim();
}

function publicEvidence(row) {
  if (!row) return null;
  return {
    id: row.id,
    logical_id: row.logical_id,
    engagement_id: row.engagement_id,
    revision: Number(row.revision),
    document_ref: row.document_ref,
    round_id: row.round_id || null,
    kind: row.kind,
    title_ar: row.title_ar,
    filename: row.filename,
    content_type: row.content_type,
    byte_length: Number(row.byte_length),
    sha256: row.sha256,
    supersedes_id: row.supersedes_id || null,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

export function normalizeEvidenceUploadInput(input) {
  const documentRef = cleanText(input?.documentRef);
  const titleAr = cleanText(input?.titleAr);
  const roundIdRaw = cleanText(input?.roundId);
  const roundId = roundIdRaw || null;
  const kind = cleanText(input?.kind);
  const filename = cleanText(input?.filename);
  const contentType = cleanText(input?.contentType).toLowerCase();
  const byteLength = Number(input?.byteLength);
  const effectiveAtRaw = cleanText(input?.effectiveAt);
  const supersedesRaw = cleanText(input?.supersedesId);
  const supersedesId = supersedesRaw || null;

  if (
    documentRef.length < 3
    || documentRef.length > 100
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(documentRef)
    || documentRef.includes("..")
  ) return { error: "invalid_document_ref" };
  if (titleAr.length < 2 || titleAr.length > 200) return { error: "invalid_evidence_title" };
  if (roundId && !/^R-\d{3}$/.test(roundId)) return { error: "invalid_round_id" };
  if (!EVIDENCE_KINDS.has(kind)) return { error: "invalid_evidence_kind" };
  if (
    !filename
    || filename.length > 180
    || filename === "."
    || filename === ".."
    || /[\\/\u0000-\u001f\u007f]/.test(filename)
  ) return { error: "invalid_filename" };
  if (!EVIDENCE_CONTENT_TYPES.has(contentType)) return { error: "unsupported_evidence_content_type" };
  if (!Number.isInteger(byteLength) || byteLength <= 0 || byteLength > EVIDENCE_MAX_BYTES) {
    return { error: "invalid_evidence_size" };
  }
  if (!effectiveAtRaw || !Number.isFinite(Date.parse(effectiveAtRaw))) return { error: "effective_at_required" };
  if (supersedesId && !EVIDENCE_ID.test(supersedesId)) return { error: "invalid_supersedes_id" };

  return {
    documentRef,
    titleAr,
    roundId,
    kind,
    filename,
    contentType,
    byteLength,
    effectiveAt: new Date(effectiveAtRaw).toISOString(),
    supersedesId,
  };
}

export function evidenceObjectKey({ tenantId, engagementId, logicalId, revision, sha256 }) {
  if (!TENANT_ID.test(String(tenantId || ""))) throw new TypeError("invalid_tenant_id");
  if (!ENGAGEMENT_ID.test(String(engagementId || ""))) throw new TypeError("invalid_engagement_id");
  if (!LOGICAL_ID.test(String(logicalId || ""))) throw new TypeError("invalid_evidence_logical_id");
  if (!Number.isInteger(revision) || revision <= 0) throw new TypeError("invalid_evidence_revision");
  if (!SHA256.test(String(sha256 || ""))) throw new TypeError("invalid_evidence_sha256");
  return `tenants/${tenantId}/engagements/${engagementId}/evidence/${logicalId}/v${revision}/${sha256}`;
}

async function sha256Bytes(bytes, cryptoImpl = crypto) {
  const digest = await cryptoImpl.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireEvidenceBucket(env) {
  const bucket = env?.EVIDENCE_BUCKET;
  if (!bucket?.put || !bucket?.get || !bucket?.delete) throw new Error("evidence_bucket_unavailable");
  return bucket;
}

async function engagementRow(db, engagementId, tenantId) {
  return db.prepare(
    "SELECT id, archived_at FROM engagements WHERE id = ?1 AND tenant_id = ?2",
  ).bind(engagementId, tenantId).first();
}

async function latestEvidence(db, engagementId, tenantId, logicalId) {
  return db.prepare(`
    SELECT id, logical_id, engagement_id, tenant_id, revision, document_ref, round_id,
           kind, title_ar, filename, content_type, byte_length, sha256, r2_key,
           supersedes_id, created_by, created_at
    FROM evidence_objects
    WHERE engagement_id = ?1 AND tenant_id = ?2 AND logical_id = ?3
    ORDER BY revision DESC
    LIMIT 1
  `).bind(engagementId, tenantId, logicalId).first();
}

async function evidenceById(db, engagementId, tenantId, evidenceId) {
  return db.prepare(`
    SELECT id, logical_id, engagement_id, tenant_id, revision, document_ref, round_id,
           kind, title_ar, filename, content_type, byte_length, sha256, r2_key,
           supersedes_id, created_by, created_at
    FROM evidence_objects
    WHERE engagement_id = ?1 AND tenant_id = ?2 AND id = ?3
    LIMIT 1
  `).bind(engagementId, tenantId, evidenceId).first();
}

function sameEvidenceRequest(row, input, sha256) {
  return Boolean(
    row
    && row.sha256 === sha256
    && row.document_ref === input.documentRef
    && (row.round_id || null) === input.roundId
    && row.kind === input.kind
    && row.title_ar === input.titleAr
    && row.filename === input.filename
    && row.content_type === input.contentType
    && Number(row.byte_length) === input.byteLength
  );
}

function downloadHeaders(row) {
  const fallback = "evidence";
  const encoded = encodeURIComponent(row.filename || fallback).replace(/'/g, "%27");
  return {
    "content-type": row.content_type,
    "content-disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
    "cache-control": "no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-kosif-sha256": row.sha256,
    "x-kosif-evidence-revision": String(row.revision),
  };
}

export function createEvidenceApi({
  jsonResponse,
  stableId,
  appendLogValues,
  canonicalVersion,
  genesisHash,
}) {
  if (typeof jsonResponse !== "function" || typeof stableId !== "function" || typeof appendLogValues !== "function") {
    throw new TypeError("invalid_evidence_api_dependencies");
  }

  async function uploadEvidence(request, env, auth, engagementId, db) {
    const bucket = requireEvidenceBucket(env);
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > EVIDENCE_REQUEST_MAX_BYTES) return jsonResponse({ error: "payload_too_large" }, 413);
    const requestType = String(request.headers.get("content-type") || "").toLowerCase();
    if (!requestType.startsWith("multipart/form-data")) return jsonResponse({ error: "multipart_form_required" }, 415);

    const engagement = await engagementRow(db, engagementId, auth.tenantId);
    if (!engagement) return jsonResponse({ error: "not_found" }, 404);
    if (engagement.archived_at) return jsonResponse({ error: "engagement_archived" }, 409);

    let form;
    try {
      form = await request.formData();
    } catch {
      return jsonResponse({ error: "invalid_multipart_form" }, 400);
    }
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function" || typeof file.name !== "string") {
      return jsonResponse({ error: "evidence_file_required" }, 422);
    }

    const normalized = normalizeEvidenceUploadInput({
      documentRef: form.get("document_ref"),
      titleAr: form.get("title_ar"),
      roundId: form.get("round_id"),
      kind: form.get("kind"),
      filename: file.name,
      contentType: file.type,
      byteLength: file.size,
      effectiveAt: form.get("effective_at"),
      supersedesId: form.get("supersedes_id"),
    });
    if (normalized.error) {
      const status = normalized.error === "invalid_evidence_size" ? 413 : 422;
      return jsonResponse({ error: normalized.error }, status);
    }

    let bytes;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      return jsonResponse({ error: "evidence_read_failed" }, 400);
    }
    if (bytes.byteLength !== normalized.byteLength || bytes.byteLength > EVIDENCE_MAX_BYTES) {
      return jsonResponse({ error: "invalid_evidence_size" }, 413);
    }

    const contentHash = await sha256Bytes(bytes);
    const logicalId = await stableId("evl", {
      tenantId: auth.tenantId,
      engagementId,
      documentRef: normalized.documentRef,
    });
    const current = await latestEvidence(db, engagementId, auth.tenantId, logicalId);

    if (!current && normalized.supersedesId) {
      return jsonResponse({ error: "evidence_revision_conflict", current_revision: 0 }, 409);
    }
    if (current && !normalized.supersedesId) {
      if (sameEvidenceRequest(current, normalized, contentHash)) {
        return jsonResponse({ evidence: publicEvidence(current), idempotent: true }, 200);
      }
      return jsonResponse({
        error: "evidence_revision_required",
        current_id: current.id,
        current_revision: Number(current.revision),
      }, 409);
    }
    if (current && normalized.supersedesId !== current.id) {
      return jsonResponse({
        error: "evidence_revision_conflict",
        current_id: current.id,
        current_revision: Number(current.revision),
      }, 409);
    }

    const revision = Number(current?.revision || 0) + 1;
    const evidenceId = await stableId("ev", {
      tenantId: auth.tenantId,
      engagementId,
      logicalId,
      revision,
      sha256: contentHash,
      documentRef: normalized.documentRef,
      roundId: normalized.roundId,
      kind: normalized.kind,
      titleAr: normalized.titleAr,
      filename: normalized.filename,
      contentType: normalized.contentType,
      byteLength: normalized.byteLength,
    });
    const r2Key = evidenceObjectKey({
      tenantId: auth.tenantId,
      engagementId,
      logicalId,
      revision,
      sha256: contentHash,
    });

    await bucket.put(r2Key, bytes, {
      httpMetadata: { contentType: normalized.contentType },
      customMetadata: {
        evidenceId,
        logicalId,
        revision: String(revision),
        sha256: contentHash,
      },
    });

    const head = await db.prepare(
      "SELECT entry_hash FROM audit_log WHERE engagement_id = ?1 ORDER BY seq DESC LIMIT 1",
    ).bind(engagementId).first();
    const log = await appendLogValues({
      engagementId,
      actor: auth.subject,
      action: "evidence.uploaded",
      payload: {
        evidence_id: evidenceId,
        logical_id: logicalId,
        revision,
        document_ref: normalized.documentRef,
        round_id: normalized.roundId,
        kind: normalized.kind,
        sha256: contentHash,
        byte_length: normalized.byteLength,
        supersedes_id: normalized.supersedesId,
      },
      at: normalized.effectiveAt,
      prevHash: head?.entry_hash || genesisHash,
    });

    try {
      await db.batch([
        db.prepare(`
          INSERT INTO evidence_objects (
            id, logical_id, engagement_id, tenant_id, revision, document_ref, round_id,
            kind, title_ar, filename, content_type, byte_length, sha256, r2_key,
            supersedes_id, created_by, created_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
        `).bind(
          evidenceId,
          logicalId,
          engagementId,
          auth.tenantId,
          revision,
          normalized.documentRef,
          normalized.roundId,
          normalized.kind,
          normalized.titleAr,
          normalized.filename,
          normalized.contentType,
          normalized.byteLength,
          contentHash,
          r2Key,
          normalized.supersedesId,
          auth.subject,
          normalized.effectiveAt,
        ),
        db.prepare(`
          INSERT INTO audit_log (engagement_id, actor, action, payload_json, at, canonical_version, prev_hash, entry_hash)
          VALUES (?1, ?2, 'evidence.uploaded', ?3, ?4, ?5, ?6, ?7)
        `).bind(
          engagementId,
          auth.subject,
          log.payloadJson,
          normalized.effectiveAt,
          canonicalVersion,
          log.prevHash,
          log.entryHash,
        ),
      ]);
    } catch (error) {
      try { await bucket.delete(r2Key); } catch { /* orphan cleanup is best effort */ }
      const message = String(error?.message || "");
      if (message.includes("archived_engagement_is_read_only")) {
        return jsonResponse({ error: "engagement_archived" }, 409);
      }
      if (message.includes("evidence_revision_lineage_invalid") || message.includes("UNIQUE")) {
        const refreshed = await latestEvidence(db, engagementId, auth.tenantId, logicalId);
        return jsonResponse({
          error: "evidence_revision_conflict",
          current_id: refreshed?.id || null,
          current_revision: Number(refreshed?.revision || 0),
        }, 409);
      }
      throw error;
    }

    const stored = await evidenceById(db, engagementId, auth.tenantId, evidenceId);
    return jsonResponse({ evidence: publicEvidence(stored), idempotent: false }, 201);
  }

  async function listEvidence(env, auth, engagementId, db) {
    if (!await engagementRow(db, engagementId, auth.tenantId)) return jsonResponse({ error: "not_found" }, 404);
    const result = await db.prepare(`
      SELECT id, logical_id, engagement_id, tenant_id, revision, document_ref, round_id,
             kind, title_ar, filename, content_type, byte_length, sha256, r2_key,
             supersedes_id, created_by, created_at
      FROM evidence_objects
      WHERE engagement_id = ?1 AND tenant_id = ?2
      ORDER BY logical_id ASC, revision DESC
      LIMIT 250
    `).bind(engagementId, auth.tenantId).all();
    return jsonResponse({ evidence: (result.results || []).map(publicEvidence) });
  }

  async function getEvidence(env, auth, engagementId, evidenceId, db) {
    const row = await evidenceById(db, engagementId, auth.tenantId, evidenceId);
    return row ? jsonResponse({ evidence: publicEvidence(row) }) : jsonResponse({ error: "not_found" }, 404);
  }

  async function downloadEvidence(env, auth, engagementId, evidenceId, db) {
    const bucket = requireEvidenceBucket(env);
    const row = await evidenceById(db, engagementId, auth.tenantId, evidenceId);
    if (!row) return jsonResponse({ error: "not_found" }, 404);
    const object = await bucket.get(row.r2_key);
    if (!object?.body) return jsonResponse({ error: "evidence_content_missing" }, 410);
    if (Number.isFinite(object.size) && Number(object.size) !== Number(row.byte_length)) {
      return jsonResponse({ error: "evidence_integrity_mismatch" }, 409);
    }
    if (object.customMetadata?.sha256 && object.customMetadata.sha256 !== row.sha256) {
      return jsonResponse({ error: "evidence_integrity_mismatch" }, 409);
    }
    return new Response(object.body, { status: 200, headers: downloadHeaders(row) });
  }

  return { uploadEvidence, listEvidence, getEvidence, downloadEvidence };
}

export { EVIDENCE_MAX_BYTES };