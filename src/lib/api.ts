// GRYNX API client — typed, with token storage + transparent refresh.
// Base URL from VITE_API_BASE; when unset, routes to the in-browser demo backend.
import * as demo from './demo'

const RAW_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.trim()
// No API URL configured → run the in-browser DEMO backend (src/lib/demo.ts).
// This is what makes the Vercel build work with no server. Set VITE_API_BASE
// (Render / Mac Mini) to switch to the real API with zero code change.
export const DEMO = !RAW_BASE
const BASE = (RAW_BASE ?? '').replace(/\/$/, '')

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
// Store a freshly-minted session (shared by PIN and biometric sign-in).
function applySession(data: { accessToken: string; refreshToken: string; user: ApiUser }) {
  access = data.accessToken
  refresh = data.refreshToken
  user = data.user
  persist()
  // re-send the FCM push token now that we're authed (native app only; no-op on web)
  import('./native').then((n) => n.syncPushAfterLogin()).catch(() => {})
}

// Register this device's FCM push token against the signed-in user.
export const registerDevice = (token: string, platform = 'android') =>
  DEMO ? Promise.resolve({ ok: true }) : req<{ ok: boolean }>('POST', '/api/v1/devices/register', { token, platform })

export async function login(username: string, pin: string): Promise<ApiUser> {
  if (DEMO) {
    applySession(demo.demoLogin(username, pin)) // throws ApiError on bad creds
    return user!
  }
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, pin }),
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new ApiError(res.status, data)
  applySession(data)
  return user!
}

export function logout() {
  access = refresh = null
  user = null
  persist()
}

// ── Biometric login (WebAuthn passkeys: Face ID / Touch ID / fingerprint) ────
// Credentials are domain-bound; enrolment lives on the real backend (not DEMO).
const BIO_KEY = 'grynx-bio-users'
export const biometricSupported = () => !DEMO && typeof window !== 'undefined' && !!window.PublicKeyCredential
export function enrolledBiometricUsers(): string[] {
  try {
    return JSON.parse(localStorage.getItem(BIO_KEY) || '[]')
  } catch {
    return []
  }
}
export function isBiometricEnrolled(username?: string) {
  const list = enrolledBiometricUsers()
  return username ? list.includes(username.trim().toLowerCase()) : list.length > 0
}
function rememberBiometricUser(username: string) {
  const u = username.trim().toLowerCase()
  const list = enrolledBiometricUsers()
  if (!list.includes(u)) localStorage.setItem(BIO_KEY, JSON.stringify([...list, u]))
}
export function forgetBiometric(username: string) {
  const u = username.trim().toLowerCase()
  localStorage.setItem(BIO_KEY, JSON.stringify(enrolledBiometricUsers().filter((x) => x !== u)))
}

// Enrol this device's authenticator — must already be signed in (via PIN).
export async function registerBiometric(label?: string): Promise<void> {
  const { startRegistration } = await import('@simplewebauthn/browser')
  const { options } = await req<{ options: unknown }>('POST', '/api/v1/auth/webauthn/register/options', {})
  const att = await startRegistration({ optionsJSON: options as never })
  await req('POST', '/api/v1/auth/webauthn/register/verify', { response: att, label })
  if (user) rememberBiometricUser(user.username)
}

// base64url ↔ ArrayBuffer (for the raw WebAuthn assertion below)
function abToB64u(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64uToAb(str: string): ArrayBuffer {
  const pad = '='.repeat((4 - (str.length % 4)) % 4)
  const bin = atob((str + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

// Sign in with biometrics (no PIN). Uses navigator.credentials.get directly —
// @simplewebauthn/browser's startAuthentication shares a singleton abort signal
// that stalls across the enroll→login ceremonies within one SPA session.
export async function loginBiometric(username: string): Promise<ApiUser> {
  const optRes = await fetch(`${BASE}/api/v1/auth/webauthn/login/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  })
  const optData = await optRes.json().catch(() => null)
  if (!optRes.ok) throw new ApiError(optRes.status, optData)
  const o = optData.options as {
    challenge: string
    rpId?: string
    timeout?: number
    userVerification?: UserVerificationRequirement
    allowCredentials?: { id: string; transports?: AuthenticatorTransport[] }[]
  }
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: b64uToAb(o.challenge),
      rpId: o.rpId,
      timeout: o.timeout,
      userVerification: o.userVerification,
      allowCredentials: (o.allowCredentials ?? []).map((c) => ({
        type: 'public-key' as const,
        id: b64uToAb(c.id),
        transports: c.transports,
      })),
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new ApiError(0, { error: 'cancelled' })
  const r = cred.response as AuthenticatorAssertionResponse
  const asr = {
    id: cred.id,
    rawId: abToB64u(cred.rawId),
    type: cred.type,
    clientExtensionResults: cred.getClientExtensionResults(),
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    response: {
      clientDataJSON: abToB64u(r.clientDataJSON),
      authenticatorData: abToB64u(r.authenticatorData),
      signature: abToB64u(r.signature),
      userHandle: r.userHandle ? abToB64u(r.userHandle) : undefined,
    },
  }
  const verRes = await fetch(`${BASE}/api/v1/auth/webauthn/login/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, response: asr }),
  })
  const verData = await verRes.json().catch(() => null)
  if (!verRes.ok) throw new ApiError(verRes.status, verData)
  applySession(verData)
  rememberBiometricUser(username)
  return user!
}

export const me = () => (DEMO ? Promise.resolve({ user: getUser()! }) : req<{ user: ApiUser }>('GET', '/api/v1/auth/me'))

// ── signup + approval ────────────────────────────────────────────────────────
export interface DeptLite {
  id: string
  code: string
  name: string
}
export const publicDepartments = () =>
  DEMO ? demo.demoDepartments() : req<{ departments: DeptLite[] }>('GET', '/api/v1/auth/departments')

export interface SignupInput {
  phone: string
  fullName: string
  departmentId: string
  pin: string
}
export const signup = (input: SignupInput) =>
  DEMO
    ? demo.demoSignup(input)
    : req<{ user: { id: string; username: string; status: string }; message: string }>('POST', '/api/v1/auth/signup', input)

export interface PendingUser {
  id: string
  username: string
  fullName: string
  status: string
  createdAt: string
  roles: { role: string; department: { code: string; name: string } | null }[]
}
export const listUsers = (status?: 'pending' | 'active' | 'suspended') =>
  DEMO ? demo.demoListUsers(status) : req<{ users: PendingUser[] }>('GET', `/api/v1/users${status ? `?status=${status}` : ''}`)
export const approveUser = (id: string) =>
  DEMO ? demo.demoSetStatus(id, 'active') : req<{ ok: boolean }>('POST', `/api/v1/users/${id}/approve`)
export const rejectUser = (id: string) =>
  DEMO ? demo.demoSetStatus(id, 'suspended') : req<{ ok: boolean }>('POST', `/api/v1/users/${id}/reject`)

// ── catalogue ───────────────────────────────────────────────────────────────
export interface ProductDTO {
  id: string
  code: string
  name: string
  description: string | null
  models: { id: string; code: string; name: string; sizes: string[] }[]
  pipelines: { id: string; name: string; isDefault: boolean; steps: { sequence: number; department: { id: string; code: string; name: string } }[] }[]
}
export const getProducts = () => (DEMO ? demo.demoProducts() : req<{ products: ProductDTO[] }>('GET', '/api/v1/products'))
export const getDepartments = () =>
  DEMO
    ? demo.demoDepartments().then((d) => ({ departments: d.departments.map((x, i) => ({ ...x, sortOrder: (i + 1) * 10 })) }))
    : req<{ departments: { id: string; code: string; name: string; sortOrder: number }[] }>('GET', '/api/v1/departments')

// ── jobs ──────────────────────────────────────────────────────────────────
export interface JobStepDTO {
  id: string
  sequence: number
  status: string
  slaDueAt: string | null
  acceptedAt?: string | null
  completedAt?: string | null
  department: { code: string; name: string }
}
export interface JobDTO {
  id: string
  jobNo: string
  displayLabel: string
  status: string
  priority: string
  totalQty: number
  startDate?: string | null
  completionDate?: string | null
  createdAt?: string
  product?: { code: string; name: string }
  steps?: JobStepDTO[]
  models?: { quantity: number; size?: string | null; model: { code: string; name: string } }[]
  events?: { id: string; type: string; body: string | null; createdAt: string }[]
}

export interface QueueJob extends JobDTO {
  stepStatus?: string
  slaDueAt?: string | null
}
export const getQueue = (departmentId?: string) =>
  DEMO
    ? demo.demoQueue(departmentId)
    : req<{ jobs: QueueJob[] }>('GET', `/api/v1/jobs/queue${departmentId ? `?departmentId=${departmentId}` : ''}`)

export const getJobs = (status?: string) =>
  DEMO ? demo.demoGetJobs() : req<{ jobs: JobDTO[] }>('GET', `/api/v1/jobs${status ? `?status=${status}` : ''}`)
export const getJob = (id: string) => (DEMO ? demo.demoGetJob(id) : req<{ job: JobDTO }>('GET', `/api/v1/jobs/${id}`))
// resolve a scanned code (jobNo or displayLabel) → full detail (admin history lookup)
export const lookupJob = (code: string) =>
  DEMO ? demo.demoLookupJob(code) : req<{ job: JobDTO }>('GET', `/api/v1/jobs/lookup?code=${encodeURIComponent(code)}`)

export interface CreateJobInput {
  productId: string
  priority: 'normal' | 'urgent'
  jobType?: 'production' | 'rework'
  startDate?: string
  models: { modelId: string; size?: string; quantity: number }[]
}
export const createJob = (input: CreateJobInput) =>
  DEMO ? demo.demoCreateJob(input) : req<{ job: JobDTO }>('POST', '/api/v1/jobs', input)

/** Fetch the printable job-card HTML with the auth header (keeps token out of URLs). */
export async function getJobCardHtml(id: string): Promise<string> {
  if (DEMO) return demo.demoJobCardHtml(id)
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
  if (DEMO) return demo.demoScanForUser(getUser()?.roles ?? [], input.jobNo, input.preview ?? false)
  // scan never auto-throws on 409/403 — the caller renders the result/exception
  const res = await fetch(`${BASE}/api/v1/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(access ? { Authorization: `Bearer ${access}` } : {}) },
    body: JSON.stringify(input),
  })
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : {} }
}

// ── maintenance ───────────────────────────────────────────────────────────
export interface MaintUserBrief {
  id: string
  fullName: string
  username: string
}
export interface MaintTicket {
  id: string
  ticketNo: string
  category: string
  priority: string
  status: string
  locationText: string
  description: string
  etaHours: number | null
  partsNeeded: string | null
  closeRemark: string | null
  photoUrl?: string | null
  reportedById: string
  assignedToId: string | null
  createdAt: string
  updatedAt: string
  assignedTo?: MaintUserBrief | null
  reportedBy?: MaintUserBrief | null
  events?: { id: string; type: string; body: string | null; actorId: string | null; createdAt: string }[]
  _count?: { events: number }
}
export interface RaiseTicketInput {
  category: string
  priority: string
  locationText: string
  description: string
  photo?: string // compressed JPEG data URL
}
export interface MaintUpdateInput {
  note?: string
  etaHours?: number | null
  partsNeeded?: string | null
  status?: 'in_progress' | 'completed'
}
export const listMaintenance = (status?: string) =>
  DEMO ? demo.demoMaintList(status) : req<{ tickets: MaintTicket[] }>('GET', `/api/v1/maintenance${status ? `?status=${status}` : ''}`)
export const getMaintenance = (id: string) =>
  DEMO ? demo.demoMaintGet(id) : req<{ ticket: MaintTicket }>('GET', `/api/v1/maintenance/${id}`)
export const raiseMaintenance = (input: RaiseTicketInput) =>
  DEMO ? demo.demoMaintRaise(input) : req<{ ticket: MaintTicket }>('POST', '/api/v1/maintenance', input)
export const maintenanceCrew = () =>
  DEMO ? demo.demoMaintCrew() : req<{ crew: MaintUserBrief[] }>('GET', '/api/v1/maintenance/crew')
export const assignMaintenance = (id: string, assignedToId: string) =>
  DEMO ? demo.demoMaintAssign(id, assignedToId) : req<{ ticket: MaintTicket }>('POST', `/api/v1/maintenance/${id}/assign`, { assignedToId })
export const updateMaintenance = (id: string, body: MaintUpdateInput) =>
  DEMO ? demo.demoMaintUpdate(id, body) : req<{ ticket: MaintTicket }>('POST', `/api/v1/maintenance/${id}/update`, body)
export const closeMaintenance = (id: string, remark: string) =>
  DEMO ? demo.demoMaintClose(id, remark) : req<{ ticket: MaintTicket }>('POST', `/api/v1/maintenance/${id}/close`, { remark })

// ── PPC requests ──────────────────────────────────────────────────────────
export interface PpcRequest {
  id: string
  requestNo: string
  priority: string
  status: string
  startDate: string | null
  targetDate: string | null
  createdAt: string
  createdById: string
  approvedJobId: string | null
  clarificationNote: string | null
  product: { id: string; code: string; name: string }
  models: { quantity: number; size: string | null; model: { id: string; code: string; name: string } }[]
}
export const createPpcRequest = (input: CreateJobInput) =>
  DEMO ? demo.demoPpcCreate(input) : req<{ request: PpcRequest }>('POST', '/api/v1/ppc', input)
export const listPpcRequests = (status?: string) =>
  DEMO ? demo.demoPpcList(status) : req<{ requests: PpcRequest[] }>('GET', `/api/v1/ppc${status ? `?status=${status}` : ''}`)
export const getPpcRequest = (id: string) =>
  DEMO ? demo.demoPpcGet(id) : req<{ request: PpcRequest }>('GET', `/api/v1/ppc/${id}`)
export const approvePpcRequest = (id: string) =>
  DEMO ? demo.demoPpcApprove(id) : req<{ job: JobDTO }>('POST', `/api/v1/ppc/${id}/approve`)
export const rejectPpcRequest = (id: string, note?: string) =>
  DEMO ? demo.demoPpcReject() : req<{ ok: boolean }>('POST', `/api/v1/ppc/${id}/reject`, note ? { note } : undefined)
export const ppcCount = () => (DEMO ? demo.demoPpcCount() : req<{ pending: number }>('GET', '/api/v1/ppc/count'))
// PPC's own inbox: requests still needing my action (pending_confirm / clarification / submitted)
export const listMyPpcRequests = () =>
  DEMO ? demo.demoPpcMine() : req<{ requests: PpcRequest[] }>('GET', '/api/v1/ppc/mine')
// admin requests changes (RC) → back to PPC with feedback
export const requestPpcChange = (id: string, note: string) =>
  DEMO ? demo.demoPpcRequestChange(id, note) : req<{ ok: boolean }>('POST', `/api/v1/ppc/${id}/request-change`, { note })
// admin proposes edits → PPC must confirm (round-trip)
export const proposePpcEdit = (id: string, input: CreateJobInput & { note?: string }) =>
  DEMO ? demo.demoPpcPropose(id, input) : req<{ request: PpcRequest }>('POST', `/api/v1/ppc/${id}/propose`, input)
// PPC confirms admin's proposed edits → back to admin to approve
export const confirmPpcRequest = (id: string) =>
  DEMO ? demo.demoPpcConfirm(id) : req<{ ok: boolean }>('POST', `/api/v1/ppc/${id}/confirm`)
// PPC resubmits after an RC → back to admin queue
export const resubmitPpcRequest = (id: string, input: CreateJobInput) =>
  DEMO ? demo.demoPpcResubmit(id, input) : req<{ request: PpcRequest }>('POST', `/api/v1/ppc/${id}/resubmit`, input)

// ── notifications ───────────────────────────────────────────────────────────
export interface Notification {
  id: string
  type: string
  body: string
  jobId: string | null
  ticketId: string | null
  entityId: string | null
  readAt: string | null
  createdAt: string
}
export const getNotifications = () =>
  DEMO ? Promise.resolve({ notifications: [] as Notification[] }) : req<{ notifications: Notification[] }>('GET', '/api/v1/notifications')
export const notificationCount = () =>
  DEMO ? Promise.resolve({ unread: 0 }) : req<{ unread: number }>('GET', '/api/v1/notifications/count')
export const markNotificationRead = (id: string) =>
  DEMO ? Promise.resolve({ ok: true }) : req<{ ok: boolean }>('POST', `/api/v1/notifications/${id}/read`)
export const markAllNotificationsRead = () =>
  DEMO ? Promise.resolve({ ok: true }) : req<{ ok: boolean }>('POST', '/api/v1/notifications/read-all')

// ── QC ──────────────────────────────────────────────────────────────────────
export const getQcQueue = () =>
  DEMO ? Promise.resolve({ jobs: [] as QueueJob[] }) : req<{ jobs: QueueJob[] }>('GET', '/api/v1/qc/queue')
export const qcApprove = (jobId: string, notes?: string) =>
  DEMO ? Promise.resolve({ ok: true }) : req<{ ok: boolean }>('POST', `/api/v1/qc/${jobId}/approve`, notes ? { notes } : {})
export const qcRework = (jobId: string, notes: string) =>
  DEMO ? Promise.resolve({ ok: true }) : req<{ ok: boolean }>('POST', `/api/v1/qc/${jobId}/rework`, { notes })

// ── FG Stock ────────────────────────────────────────────────────────────────
export interface FgJob extends QueueJob {
  serialCount?: number
}
export const getFgQueue = () =>
  DEMO ? Promise.resolve({ jobs: [] as FgJob[] }) : req<{ jobs: FgJob[] }>('GET', '/api/v1/fg/queue')
export const getSerials = (jobId: string) =>
  DEMO ? Promise.resolve({ serials: [] as { id: string; serialNo: string; modelCode: string | null; size: string | null }[] }) : req<{ serials: { id: string; serialNo: string; modelCode: string | null; size: string | null }[] }>('GET', `/api/v1/fg/${jobId}/serials`)
export const addSerials = (jobId: string, serials: string[], modelCode?: string, size?: string) =>
  DEMO ? Promise.resolve({ added: serials.length }) : req<{ added: number }>('POST', `/api/v1/fg/${jobId}/serials`, { serials, modelCode, size })
export const requestClosure = (jobId: string, receivedQty: number) =>
  DEMO ? Promise.resolve({ ok: true }) : req<{ ok: boolean }>('POST', `/api/v1/fg/${jobId}/closure`, { receivedQty })

// ── Purchase ────────────────────────────────────────────────────────────────
export interface MaterialLine {
  id: string
  item: string
  materialType: string | null
  vendor: string | null
  batchRef: string | null
  quantity: string | null
}
export interface PurchaseInput {
  item: string
  materialType?: string
  vendor?: string
  batchRef?: string
  quantity?: string
}
export const getPurchaseJobs = () =>
  DEMO ? Promise.resolve({ jobs: [] as (QueueJob & { materialCount?: number })[] }) : req<{ jobs: (QueueJob & { materialCount?: number })[] }>('GET', '/api/v1/purchase/jobs')
export const getMaterials = (jobId: string) =>
  DEMO ? Promise.resolve({ materials: [] as MaterialLine[] }) : req<{ materials: MaterialLine[] }>('GET', `/api/v1/purchase/${jobId}/materials`)
export const logMaterial = (jobId: string, input: PurchaseInput) =>
  DEMO ? Promise.resolve({ material: { id: 'x', ...input, materialType: input.materialType ?? null, vendor: input.vendor ?? null, batchRef: input.batchRef ?? null, quantity: input.quantity ?? null } as MaterialLine }) : req<{ material: MaterialLine }>('POST', `/api/v1/purchase/${jobId}/materials`, input)

export const newIdempotencyKey = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`)

/** Is the real API reachable? Always false in demo mode (no server configured). */
export async function ping(): Promise<boolean> {
  if (DEMO) return false
  try {
    const r = await fetch(`${BASE}/health`, { cache: 'no-store' })
    return r.ok
  } catch {
    return false
  }
}
