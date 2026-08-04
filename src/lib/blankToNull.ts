/**
 * Coerce empty-string form fields to null before they reach Postgres.
 *
 * WHY THIS EXISTS. The admin "add" forms hold every optional field as '' in
 * React state and POST the object verbatim. For a uuid column (country_id,
 * state_id, city_id, pincode_id) Postgres rejects '' with
 * `22P02 invalid input syntax for type uuid: ""` — so leaving the optional
 * location fields blank, which the form presents as perfectly legal, failed the
 * whole insert with a message no operator could act on.
 *
 * Applied server-side so it holds regardless of which client posts.
 */
export function blankToNull<T extends Record<string, unknown>>(obj: T, fields: readonly string[]): T {
  const out = { ...obj } as Record<string, unknown>
  for (const field of fields) {
    const value = out[field]
    if (value === '' || (typeof value === 'string' && value.trim() === '')) {
      out[field] = null
    }
  }
  return out as T
}

/** Optional foreign keys shared by the driver and transport-company forms. */
export const LOCATION_FK_FIELDS = ['country_id', 'state_id', 'city_id', 'pincode_id'] as const
