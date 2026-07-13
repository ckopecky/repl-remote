import { logger } from "../logger";

const ATTIO_API_BASE = "https://api.attio.com/v2";

export class AttioApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "AttioApiError";
  }
}

function getApiKey(): string {
  const key = process.env.ATTIO_API_KEY;
  if (!key) {
    throw new Error("ATTIO_API_KEY is not configured");
  }
  return key;
}

async function attioRequest<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${ATTIO_API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const message =
      (json && typeof json === "object" && "message" in json && String(json.message)) ||
      `Attio API request failed with status ${res.status}`;
    logger.error({ path, status: res.status, body: json }, "Attio API request failed");
    throw new AttioApiError(message, res.status, json);
  }

  return json as T;
}

export interface AttioRecordRef {
  workspace_id: string;
  object_id: string;
  record_id: string;
}

export interface AttioRecordResponse {
  data: {
    id: AttioRecordRef;
    created_at: string;
    web_url: string;
    values: Record<string, unknown>;
  };
}

/**
 * Upserts (creates or updates) a record on a standard Attio object, matched by
 * a unique attribute (e.g. `domains` for companies, `email_addresses` for people).
 */
export async function upsertAttioRecord(
  objectSlug: string,
  matchingAttribute: string,
  values: Record<string, unknown>,
): Promise<AttioRecordResponse> {
  return attioRequest<AttioRecordResponse>(
    `/objects/${objectSlug}/records?matching_attribute=${matchingAttribute}`,
    { method: "PUT", body: { data: { values } } },
  );
}

export interface AttioNoteResponse {
  data: {
    id: { workspace_id: string; note_id: string };
    parent_object: string;
    parent_record_id: string;
    title: string;
  };
}

/**
 * Creates a note on an existing Attio record.
 */
export async function createAttioNote(input: {
  parentObject: string;
  parentRecordId: string;
  title: string;
  content: string;
}): Promise<AttioNoteResponse> {
  return attioRequest<AttioNoteResponse>("/notes", {
    method: "POST",
    body: {
      data: {
        parent_object: input.parentObject,
        parent_record_id: input.parentRecordId,
        title: input.title,
        format: "plaintext",
        content: input.content,
      },
    },
  });
}
