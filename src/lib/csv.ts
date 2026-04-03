import Papa from "papaparse";

export interface ParseResult<T> {
  data: T[];
  errors: string[];
  warnings: string[];
}

export interface LeadRow {
  email: string;
  first_name: string;
  last_name: string;
  company_name: string;
  [key: string]: string;
}

export interface SequenceRow {
  seq_number: string;
  subject: string;
  body: string;
  delay_days: string;
  [key: string]: string;
}

export interface InboxRow {
  email_account_id: string;
  [key: string]: string;
}

function parseCSV<T>(file: File): Promise<Papa.ParseResult<T>> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(file, {
      header: true,
      skipEmptyLines: true,
      worker: false, // worker:true requires a separate worker file; we keep it fast via streaming
      complete: resolve,
      error: reject,
    });
  });
}

function sanitizeText(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B\uFFFD]/g, "'") // curly/smart single quotes → straight apostrophe
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')        // curly double quotes → straight quote
    .replace(/\u2013/g, "-")                             // en dash → hyphen
    .replace(/\u2014/g, "--");                           // em dash → double hyphen
}

function normalizeHeaders<T extends Record<string, string>>(
  rows: T[]
): T[] {
  return rows.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key.trim().toLowerCase()] = sanitizeText(String(value ?? "").trim());
    }
    return normalized as T;
  });
}

export async function parseLeads(
  file: File
): Promise<ParseResult<LeadRow>> {
  const result = await parseCSV<LeadRow>(file);
  const rawRows = normalizeHeaders(result.data);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (rawRows.length === 0) {
    errors.push("leads.csv is empty.");
    return { data: [], errors, warnings };
  }

  const firstRow = rawRows[0];
  if (!("email" in firstRow)) {
    errors.push('leads.csv is missing required column: "email".');
    return { data: rawRows, errors, warnings };
  }

  // Normalize company → company_name (Smartlead's field name)
  const rows = rawRows.map((row) => {
    if ("company" in row && !("company_name" in row)) {
      const { company, ...rest } = row as Record<string, string>;
      return { ...rest, company_name: company } as LeadRow;
    }
    return row as LeadRow;
  });

  // Warn about missing expected columns (not errors — upload still works)
  const expectedCols: Array<[string, string]> = [
    ["first_name", "First Name"],
    ["last_name", "Last Name"],
    ["company_name", "Company"],
  ];
  const missingCols = expectedCols.filter(([col]) => !(col in rows[0]));
  if (missingCols.length > 0) {
    const display = missingCols.map(([, label]) => `"${label}"`).join(", ");
    warnings.push(
      `Missing column(s): ${display}. These will be blank in your sequences.`
    );
  }

  if (rows.length > 20000) {
    warnings.push(
      `leads.csv has ${rows.length.toLocaleString()} rows — over the 20,000 soft limit. Upload will proceed.`
    );
  }

  return { data: rows, errors, warnings };
}

export async function parseSequences(
  file: File
): Promise<ParseResult<SequenceRow>> {
  const result = await parseCSV<SequenceRow>(file);
  const rows = normalizeHeaders(result.data);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (rows.length === 0) {
    errors.push("sequence.csv is empty.");
    return { data: [], errors, warnings };
  }

  const required = ["seq_number", "subject", "body", "delay_days"];
  const firstRow = rows[0];
  const missing = required.filter((col) => !(col in firstRow));

  if (missing.length > 0) {
    errors.push(
      `sequence.csv is missing required column(s): ${missing.map((c) => `"${c}"`).join(", ")}.`
    );
  }

  // Filter out rows with missing or invalid seq_number (e.g. overflow lines from Excel multiline cells)
  const validRows = rows.filter((r) => {
    const n = Number(r.seq_number);
    return Number.isInteger(n) && n >= 1;
  });

  const skipped = rows.length - validRows.length;
  if (skipped > 0) {
    warnings.push(
      `${skipped} row(s) skipped — blank or invalid seq_number (likely overflow lines from Excel).`
    );
  }

  return { data: validRows, errors, warnings };
}

export async function parseInboxes(
  file: File
): Promise<ParseResult<InboxRow>> {
  const result = await parseCSV<InboxRow>(file);
  const rows = normalizeHeaders(result.data);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (rows.length === 0) {
    errors.push("inboxes.csv is empty.");
    return { data: [], errors, warnings };
  }

  const firstRow = rows[0];
  if (!("email_account_id" in firstRow)) {
    errors.push('inboxes.csv is missing required column: "email_account_id".');
    return { data: rows, errors, warnings };
  }

  if (rows.length > 1500) {
    warnings.push(
      `inboxes.csv has ${rows.length.toLocaleString()} rows — over the 1,500 soft limit. Upload will proceed.`
    );
  }

  return { data: rows, errors, warnings };
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
