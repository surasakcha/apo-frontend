export const API_BASE = (import.meta as any).env?.VITE_API_BASE?.replace(/\/$/, '') || ''

type StepPayload = {
  index: number
  who: string
  action: string
  tools: string[]
  details: string
  frequency: string
  outcome: string
  duration: string
  isEnd: boolean
  nextType: 'end'|'step'|'handoff'
  nextRef?: number|string
}

async function jsonFetch(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: { 'Content-Type':'application/json', ...(init?.headers||{}) } })
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json()
}

export function apiCreateProcess(name: string) {
  if (!API_BASE) throw new Error('API base not configured')
  return jsonFetch(`${API_BASE}/processes`, { method:'POST', body: JSON.stringify({ name }) })
}

export function apiUpdateProcess(processId: string, patch: { name?: string; description?: string }) {
  if (!API_BASE) throw new Error('API base not configured')
  return jsonFetch(`${API_BASE}/processes/${processId}`, { method:'PUT', body: JSON.stringify(patch) })
}

export function apiPutSteps(processId: string, steps: StepPayload[]) {
  if (!API_BASE) throw new Error('API base not configured')
  return jsonFetch(`${API_BASE}/processes/${processId}/steps`, { method:'PUT', body: JSON.stringify({ steps }) })
}
