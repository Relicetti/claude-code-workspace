async function request(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Erro na requisicao: ${res.status}`)
  }
  return res.json()
}

export function todayKey() {
  return dateKey(new Date())
}

export function dateKey(d) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function dateKeysBack(count) {
  const keys = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    keys.push(dateKey(d))
  }
  return keys
}

// Monday-start week key for the given date (getDay(): 0=Sunday..6=Saturday).
export function mondayKey(d) {
  const day = d.getDay()
  const diffToMonday = day === 0 ? 6 : day - 1
  const monday = new Date(d)
  monday.setDate(monday.getDate() - diffToMonday)
  return dateKey(monday)
}

// Date keys from this week's Monday through the given date (inclusive).
export function weekKeysThrough(d) {
  const keys = []
  const cursor = new Date(mondayKey(d) + 'T00:00:00')
  const end = new Date(dateKey(d) + 'T00:00:00')
  while (cursor <= end) {
    keys.push(dateKey(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return keys
}

export const api = {
  getSettings: () => request('/settings'),
  saveSettings: (settings) => request('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  getLog: (date) => request(`/log/${date}`),
  getLogSummary: (from, to) => request(`/log/summary?from=${from}&to=${to}`),
  addLogEntry: (date, entry) => request(`/log/${date}`, { method: 'POST', body: JSON.stringify(entry) }),
  deleteLogEntry: (date, id) => request(`/log/${date}/${id}`, { method: 'DELETE' }),
  clearLog: (date) => request(`/log/${date}`, { method: 'DELETE' }),
  getDayType: (date) => request(`/day-type/${date}`),
  setDayType: (date, dayType) => request(`/day-type/${date}`, { method: 'PUT', body: JSON.stringify({ dayType }) }),
  getDayTypeSummary: (from, to) => request(`/day-type/summary?from=${from}&to=${to}`),
  analyzePhoto: (imageBase64, mediaType) =>
    request('/analyze-photo', { method: 'POST', body: JSON.stringify({ imageBase64, mediaType }) }),
  analyzeText: (description) => request('/analyze-text', { method: 'POST', body: JSON.stringify({ description }) }),
}
