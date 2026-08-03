import { describe, expect, it } from 'vitest'
import { missingHeaders, parseCsv } from '@/lib/csv/parseCsv'

// Every case below is a bug the previous hand-rolled parser had. Bulk import
// writes fleet data, and the old failure mode was silent — a shifted column
// imported as a success — so these pin the shape guarantees, not just the happy path.
describe('parseCsv', () => {
  it('parses a simple file into header-keyed rows', () => {
    const { headers, rows, errors } = parseCsv('a,b\n1,2\n3,4')
    expect(headers).toEqual(['a', 'b'])
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { line: 2, values: { a: '1', b: '2' } },
      { line: 3, values: { a: '3', b: '4' } },
    ])
  })

  it('normalises headers the way the templates expect', () => {
    const { headers } = parseCsv('Full Name, EMAIL \nx,y')
    expect(headers).toEqual(['full_name', 'email'])
  })

  it('keeps commas inside quoted values', () => {
    const { rows } = parseCsv('name,address\nJohn,"123 Main Street, Kochi"')
    expect(rows[0].values.address).toBe('123 Main Street, Kochi')
  })

  it('unescapes doubled quotes instead of dropping them', () => {
    // The old parser toggled on `"` and never emitted one, so this value came
    // back as `Ambulance Co` with the quotes silently deleted.
    const { rows } = parseCsv('name\n"Ambulance ""Express"" Co"')
    expect(rows[0].values.name).toBe('Ambulance "Express" Co')
  })

  it('keeps newlines inside quoted values', () => {
    // The old parser split on \n before parsing quotes, tearing this into two
    // broken records.
    const { rows, errors } = parseCsv('name,address\nJohn,"Line one\nLine two"')
    expect(errors).toEqual([])
    expect(rows).toHaveLength(1)
    expect(rows[0].values.address).toBe('Line one\nLine two')
  })

  it('handles CRLF line endings from Excel', () => {
    const { rows, errors } = parseCsv('a,b\r\n1,2\r\n')
    expect(errors).toEqual([])
    expect(rows).toEqual([{ line: 2, values: { a: '1', b: '2' } }])
  })

  it('strips a UTF-8 BOM so the first header still matches', () => {
    const { headers } = parseCsv('﻿full_name,email\nx,y')
    expect(headers).toEqual(['full_name', 'email'])
  })

  it('rejects a row with too many columns instead of shifting values', () => {
    // This is the dangerous one: an unquoted comma in an address used to push
    // every later value one column left and still import as a success.
    const { rows, errors } = parseCsv('name,address,pincode\nJohn,123 Main St, Kochi,682001')
    expect(rows).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Row 2')
    expect(errors[0]).toContain('expected 3 columns but found 4')
  })

  it('rejects a row with too few columns', () => {
    const { rows, errors } = parseCsv('a,b,c\n1,2')
    expect(rows).toHaveLength(0)
    expect(errors[0]).toContain('expected 3 columns but found 2')
  })

  it('keeps good rows when a sibling row is malformed', () => {
    const { rows, errors } = parseCsv('a,b\n1,2\n3,4,5\n6,7')
    expect(rows.map((r) => r.line)).toEqual([2, 4])
    expect(errors).toHaveLength(1)
  })

  it('skips blank lines rather than failing them', () => {
    const { rows, errors } = parseCsv('a,b\n1,2\n\n3,4\n')
    expect(errors).toEqual([])
    expect(rows).toHaveLength(2)
  })

  it('reports an empty file and a header-only file distinctly', () => {
    expect(parseCsv('').errors[0]).toContain('empty')
    expect(parseCsv('a,b').errors[0]).toContain('no data rows')
  })

  it('numbers rows the way a spreadsheet does', () => {
    // Header is row 1, so the first data row must report as 2 — an error citing
    // "row 1" would send the operator to the wrong line.
    const { rows } = parseCsv('a\nfirst\nsecond')
    expect(rows[0].line).toBe(2)
    expect(rows[1].line).toBe(3)
  })
})

describe('missingHeaders', () => {
  it('names only the absent columns', () => {
    expect(missingHeaders(['full_name', 'email'], ['full_name', 'email', 'license_number'])).toEqual([
      'license_number',
    ])
  })

  it('returns nothing when every required column is present', () => {
    expect(missingHeaders(['a', 'b', 'c'], ['a', 'c'])).toEqual([])
  })
})
