import argon2 from 'argon2'

// argon2id with sane defaults. Used for both PINs (floor) and passwords (office).
// A PIN is low-entropy, so rate-limiting at the auth route matters more than the
// hash cost here — but we still hash so the DB never stores a usable secret.
const OPTS: argon2.Options = { type: argon2.argon2id }

export const hashSecret = (secret: string) => argon2.hash(secret, OPTS)

export const verifySecret = (hash: string, secret: string) =>
  argon2.verify(hash, secret).catch(() => false)
