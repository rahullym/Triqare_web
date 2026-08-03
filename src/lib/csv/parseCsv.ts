/**
 * CSV parsing for the admin bulk-import routes.
 *
 * REPLACES a hand-rolled parser that was duplicated across three upload routes
 * and got several things wrong, all of them silently:
 *
 *   - it split the file on "\n" BEFORE handling quotes, so a quoted value
 *     containing a newline was torn into fragments;
 *   - it toggled on `"` and never emitted one, so RFC-4180 `""` escaping was
 *     broken and any literal quote in a value was dropped;
 *   - it mapped values to headers positionally with no column-count check, so an
 *     unquoted comma in an address shifted every later column by one — the
 *     pincode landing in `city_name` — and the row still imported as a success.
 *
 * The last one is the dangerous one: bad data that reports as good. So this
 * parser returns per-row errors rather than a best-effort record, and callers
 * surface them.
 */

export interface CsvRow {
  /** 1-based line number as a spreadsheet shows it (header is row 1). */
  line: number
  values: Record<string, string>
}

export interface ParsedCsv {
  headers: string[]
  rows: CsvRow[]
  /** Rows rejected before any business validation ran (shape problems). */
  errors: string[]
}

/**
 * Split raw CSV text into records of fields, honouring RFC 4180 quoting.
 *
 * Handles CRLF and lone-CR line endings, quoted fields containing commas and
 * newlines, and `""` as an escaped quote. A UTF-8 BOM is stripped explicitly
 * rather than relying on String.trim() happening to treat U+FEFF as whitespace.
 */
function tokenize(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const endField = () => {
    record.push(field)
    field = ''
  }
  const endRecord = () => {
    endField()
    records.push(record)
    record = []
  }

  while (i < src.length) {
    const char = src[i]

    if (inQuotes) {
      if (char === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (src[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += char
      i++
      continue
    }

    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === ',') {
      endField()
      i++
      continue
    }
    if (char === '\r') {
      // Consume CRLF as one terminator; a lone CR also ends the record.
      endRecord()
      i += src[i + 1] === '\n' ? 2 : 1
      continue
    }
    if (char === '\n') {
      endRecord()
      i++
      continue
    }

    field += char
    i++
  }

  // Trailing field/record, unless the file ended exactly on a line break.
  if (field.length > 0 || record.length > 0) {
    endRecord()
  }

  return records
}

/** True when a record carries no content at all (blank line). */
function isBlank(record: string[]): boolean {
  return record.every((value) => value.trim() === '')
}

/**
 * Parse CSV text into header-keyed rows.
 *
 * Headers are normalised the way the previous parser did — trimmed, lowercased,
 * whitespace to underscores — so a spreadsheet column typed as "Full Name" still
 * matches `full_name` and existing templates keep working.
 */
export function parseCsv(text: string): ParsedCsv {
  const records = tokenize(text).filter((r) => !isBlank(r))
  if (records.length < 2) {
    return {
      headers: [],
      rows: [],
      errors: records.length === 0 ? ['The file is empty.'] : ['The file has a header row but no data rows.'],
    }
  }

  const headers = records[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const rows: CsvRow[] = []
  const errors: string[] = []

  records.slice(1).forEach((values, index) => {
    // +2: one for the header row, one to make it 1-based like a spreadsheet.
    const line = index + 2

    if (values.length !== headers.length) {
      errors.push(
        `Row ${line}: expected ${headers.length} columns but found ${values.length}. ` +
          'If a value contains a comma (an address, for example), wrap it in double quotes.'
      )
      return
    }

    const record: Record<string, string> = {}
    headers.forEach((header, i) => {
      record[header] = (values[i] ?? '').trim()
    })
    rows.push({ line, values: record })
  })

  return { headers, rows, errors }
}

/**
 * Names of template columns that are missing from an uploaded file.
 *
 * Uploading last month's template against a changed importer used to fail row by
 * row with "missing required fields"; naming the absent column once, up front, is
 * the difference between a fixable message and a wall of noise.
 */
export function missingHeaders(headers: string[], required: string[]): string[] {
  return required.filter((h) => !headers.includes(h))
}
