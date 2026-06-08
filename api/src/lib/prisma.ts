import { PrismaClient } from '@prisma/client'

// Single shared client. The scan engine relies on one write authority; one
// pooled client per process keeps transactions and the optimistic lock honest.
export const prisma = new PrismaClient()
