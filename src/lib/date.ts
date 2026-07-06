// Returns the device's local calendar date as "YYYY-MM-DD". Using
// toISOString() for this would give the UTC date instead, which silently
// rolls over to the next day for evening workouts in negative UTC offsets
// (e.g. after 21:00 in GMT-3) — filing the session under the wrong day.
export function todayLocalDate(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
