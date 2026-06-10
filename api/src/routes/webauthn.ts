import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { prisma } from '../lib/prisma.js'
import { authenticate, type AccessPayload } from '../lib/auth.js'
import { issueSession } from './auth.js'

// Domain-bound config. WebAuthn credentials only work on the rpID/origin they
// were registered on, so these are env-driven — set them on the Mac Mini (its
// real domain) and biometric login works there with zero code change.
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost'
const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'GRYNX'
const ORIGINS = (process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim())

const b64uToBytes = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'))
const bytesToB64u = (b: Uint8Array) => Buffer.from(b).toString('base64url')

export async function webauthnRoutes(app: FastifyInstance) {
  // ── enrol a new authenticator (must be signed in via PIN first) ────────────
  app.post('/register/options', { preHandler: authenticate }, async (req, reply) => {
    const actorId = (req.user as AccessPayload).sub
    const user = await prisma.user.findUnique({ where: { id: actorId }, include: { webauthnCredentials: true } })
    if (!user) return reply.code(404).send({ error: 'not_found' })

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new TextEncoder().encode(user.id),
      userName: user.username,
      userDisplayName: user.fullName,
      attestationType: 'none',
      excludeCredentials: user.webauthnCredentials.map((c) => ({ id: c.credentialId })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred', authenticatorAttachment: 'platform' },
    })
    await prisma.user.update({ where: { id: user.id }, data: { webauthnChallenge: options.challenge } })
    return { options }
  })

  app.post('/register/verify', { preHandler: authenticate }, async (req, reply) => {
    const actorId = (req.user as AccessPayload).sub
    const body = z.object({ response: z.any(), label: z.string().max(60).optional() }).parse(req.body)
    const user = await prisma.user.findUnique({ where: { id: actorId } })
    if (!user?.webauthnChallenge) return reply.code(400).send({ error: 'no_challenge' })

    let verification
    try {
      verification = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge: user.webauthnChallenge,
        expectedOrigin: ORIGINS,
        expectedRPID: RP_ID,
        requireUserVerification: false,
      })
    } catch (e) {
      return reply.code(400).send({ error: 'verify_failed', detail: (e as Error).message })
    }
    if (!verification.verified || !verification.registrationInfo) return reply.code(400).send({ error: 'not_verified' })

    const cred = verification.registrationInfo.credential
    await prisma.webauthnCredential.create({
      data: {
        userId: user.id,
        credentialId: cred.id,
        publicKey: bytesToB64u(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports?.join(',') ?? null,
        label: body.label ?? null,
      },
    })
    await prisma.user.update({ where: { id: user.id }, data: { webauthnChallenge: null } })
    return { ok: true }
  })

  // ── biometric sign-in (no PIN) ──────────────────────────────────────────────
  app.post('/login/options', async (req, reply) => {
    const { username } = z.object({ username: z.string().min(1) }).parse(req.body)
    const user = await prisma.user.findFirst({
      where: { username: { equals: username.trim(), mode: 'insensitive' } },
      include: { webauthnCredentials: true },
    })
    if (!user || user.webauthnCredentials.length === 0) return reply.code(404).send({ error: 'no_credentials' })

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'preferred',
      allowCredentials: user.webauthnCredentials.map((c) => ({
        id: c.credentialId,
        transports: c.transports
          ? (c.transports.split(',').filter(Boolean) as ('ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb')[])
          : undefined,
      })),
    })
    await prisma.user.update({ where: { id: user.id }, data: { webauthnChallenge: options.challenge } })
    return { options }
  })

  app.post('/login/verify', async (req, reply) => {
    const body = z.object({ username: z.string().min(1), response: z.any() }).parse(req.body)
    const user = await prisma.user.findFirst({
      where: { username: { equals: body.username.trim(), mode: 'insensitive' } },
      include: { webauthnCredentials: true },
    })
    if (!user?.webauthnChallenge) return reply.code(400).send({ error: 'no_challenge' })
    const cred = user.webauthnCredentials.find((c) => c.credentialId === body.response.id)
    if (!cred) return reply.code(400).send({ error: 'unknown_credential' })

    let verification
    try {
      verification = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge: user.webauthnChallenge,
        expectedOrigin: ORIGINS,
        expectedRPID: RP_ID,
        credential: { id: cred.credentialId, publicKey: b64uToBytes(cred.publicKey), counter: cred.counter },
        requireUserVerification: false,
      })
    } catch (e) {
      return reply.code(400).send({ error: 'verify_failed', detail: (e as Error).message })
    }
    if (!verification.verified) return reply.code(401).send({ error: 'not_verified' })

    await prisma.webauthnCredential.update({
      where: { id: cred.id },
      data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
    })
    await prisma.user.update({ where: { id: user.id }, data: { webauthnChallenge: null } })
    if (user.status !== 'active') return reply.code(403).send({ error: user.status === 'pending' ? 'account_pending' : 'account_suspended' })
    return reply.send(await issueSession(reply, user, 'biometric'))
  })
}
