// GRYNX API client — typed, with token storage + transparent refresh.
// Base URL from VITE_API_BASE (defaults to local dev).

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:4000'

export type RoleName = 'admin' | 'ppc' | 'dept_head' | 'qc' | 'fg_stock' | 'maintenance'
export interface Role {
  role: RoleName
  departmentId: string | null
}
export interface ApiUser {
  id: string
  username: string
  fullName: string
  roles: Role[]
}

const K = { access: 'grynx-access', refresh: 'grynx-refresh', user: 'grynx-user' }

let access: string | null = localStorage.getItem(K.access)
let refresh: string | null = localStorage.getItem(K.refresh)
let user: ApiUser | null = safeParse(localStorage.getItem(K.user))

function safeParse(s: string | null): ApiUser | null {
  try {
    return s ? (JSON.parse(s) as ApiUser) : null
  } catch {
    return null
  }
}

function persist() {
  if (access) localStorage.setItem(K.access, access)
  else localStorage.removeItem(K.access)
  if (refresh) localStorage.setItem(K.refresh, refresh)
  else localStorage.removeItem(K.refresh)
  if (user) localStorage.setItem(K.user, JSON.stringify(user))
  else localStorage.removeItem(K.user)
}

export function getUser() {
  return user
}
export function isAuthed() {
  return !!access && !!user
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown,
  ) {
    super(typeof data === 'object' && data && 'error' in data ? String((data as { error: unknown }).error) : `HTTP ${status}`)
  }
}

async function doRefresh(): Promise<boolean> {
  if (!refresh) return false
  const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  })
  if (!res.ok) return false
  const data = (await res.json()) as { accessToken: string }
  access = data.accessToken
  persist()
  return true
}

async function req<T>(method: string, path: string, body?: unknown, _retry = true): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      // only set JSON content-type when there's a body — Fastify 400s on an
      // empty body with application/json (e.g. bodyless POST /approve)
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401 && _retry && (await doRefresh())) {
    return req<T>(method, path, body, false)
  }
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new ApiError(res.status, data)
  return data as T
}

// ── auth ──────────────────────────────────────────────────────────────────
export async function login(username: string, pin: string): Promise<ApiUser> {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, pin }),
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new ApiError(res.status, data)
  access = data.accessToken
  refresh = data.refreshToken
  user = data.user
  persist()
  return user!
}

export function logout() {
  access = refresh = null
  user = null
  persist()
}

export const me = () => req<{ user: ApiUser }>('GET', '/api/v1/auth/me')

// ── signup + approval ────────────────────────────────────────────────────────
export interface DeptLite {
  id: string
  code: string
  name: string
}
export const publicDepartments = () =>
  req<{ departments: DeptLite[] }>('GET', '/api/v1/auth/departments')

export interface SignupInput {
  phone: string
  fullName: string
  departmentId: string
  pin: string
}
export const signup = (input: SignupInput) =>
  req<{ user: { id: string; username: string; status: string }; message: string }>('POST', '/api/v1/auth/signup', input)

export interface PendingUser {
  id: string
  username: string
  fullName: string
  status: string
  createdAt: string
  roles: { role: string; department: { code: string; name: string } | null }[]
}
export const listUsers = (status?: 'pending' | 'active' | 'suspended') =>
  req<{ users: PendingUser[] }>('GET', `/api/v1/users${status ? `?status=${status}` : ''}`)
export const approveUser = (id: string) => req<{ ok: boolean }>('POST', `/api/v1/users/${id}/approve`)
export const rejectUser = (id: string) => req<{ ok: boolean }>('POST', `/api/v1/users/${id}/reject`)

// ── catalogue ───────────────────────────────────────────────────────────────
export interface ProductDTO {
  id: string
  code: string
  name: string
  description: string | null
  models: { id: string; code: string; name: string }[]
  pipelines: { id: string; name: string; isDefault: boolean; steps: { sequence: number; department: { id: string; code: string; name: string } }[] }[]
}
export const getProducts = () => req<{ products: ProductDTO[] }>('GET', '/api/v1/products')
export const getDepartments = () =>
  req<{ departments: { id: string; code: string; name: string; sortOrder: number }[] }>('GET', '/api/v1/departments')

// ── jobs ──────────────────────────────────────────────────────────────────
export interface JobStepDTO {
  id: string
  sequence: number
  status: string
  slaDueAt: string | null
  department: { code: string; name: string }
}
export interface JobDTO {
  id: string
  jobNo: string
  displayLabel: string
  status: string
  priority: string
  totalQty: number
  product?: { code: string; name: string }
  steps?: JobStepDTO[]
  models?: { quantity: number; model: { code: string; name: string } }[]
  events?: { id: string; type: string; body: string | null; createdAt: string }[]
}

export const getJobs = (status?: string) =>
  req<{ jobs: JobDTO[] }>('GET', `/api/v1/jobs${status ? `?status=${status}` : ''}`)
export const getJob = (id: string) => req<{ job: JobDTO }>('GET', `/api/v1/jobs/${id}`)

export interface CreateJobInput {
  productId: string
  priority: 'normal' | 'urgent'
  jobType?: 'production' | 'rework'
  startDate?: string
  models: { modelId: string; quantity: number }[]
}
export const createJob = (input: CreateJobInput) =>
  req<{ job: JobDTO }>('POST', '/api/v1/jobs', input)

/** Fetch the printable job-card HTML with the auth header (keeps token out of URLs). */
export async function getJobCardHtml(id: string): Promise<string> {
  const res = await fetch(`${BASE}/api/v1/jobs/${id}/card`, {
    headers: access ? { Authorization: `Bearer ${access}` } : {},
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.text()
}

// ── scan engine ─────────────────────────────────────────────────────────────
export interface ScanResult {
  result: 'applied' | 'forced' | 'duplicate' | 'rejected_out_of_seq' | 'superseded'
  label?: string
  station?: string
  completed?: string | null
  jobStatus?: string
  reason?: string
  hint?: string
  replayed?: boolean
  preview?: boolean
  from?: string | null
  to?: string
  completes?: string | null
}
export interface ScanInput {
  jobNo: string
  idempotencyKey: string
  clientTs: string
  note?: string
  force?: boolean
  preview?: boolean
  stationDepartmentId?: string
}
export async function scan(input: ScanInput): Promise<{ status: number; data: ScanResult }> {
  // scan never auto-throws on 409/403 — the caller renders the result/exception
  const res = await fetch(`${BASE}/api/v1/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(access ? { Authorization: `Bearer ${access}` } : {}) },
    body: JSON.stringify(input),
  })
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : {} }
}

export const newIdempotencyKey = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`)
