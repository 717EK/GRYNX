import { useEffect, useState } from 'react'
import { getProducts, type ProductDTO } from './api'
import type { Option } from '../components/CustomSelect'
import type { ModelType } from '../components/JobForm'

// Single source of truth for the product catalogue, shared by Create Job, PPC
// Request and PPC Review — so they always show identical data. Module-level
// cache means it loads once per session (fast page populate; no re-fetch on
// every navigation).
let cache: ProductDTO[] | null = null
let inflight: Promise<ProductDTO[]> | null = null

function load(): Promise<ProductDTO[]> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = getProducts()
      .then((r) => {
        cache = r.products
        inflight = null
        return cache
      })
      .catch((e) => {
        inflight = null
        throw e
      })
  }
  return inflight
}

/** Clear the cache (e.g. after the admin edits the catalogue). */
export function invalidateCatalogue() {
  cache = null
}

export function useCatalogue() {
  const [catalogue, setCatalogue] = useState<ProductDTO[] | null>(cache)
  const [err, setErr] = useState(false)

  useEffect(() => {
    if (cache) {
      setCatalogue(cache)
      return
    }
    let alive = true
    load()
      .then((c) => alive && setCatalogue(c))
      .catch(() => alive && setErr(true))
    return () => {
      alive = false
    }
  }, [])

  const products: Option[] = (catalogue ?? []).map((p) => ({
    value: p.code,
    label: p.name,
    desc: p.description ?? undefined,
  }))
  const modelCatalogue: Record<string, ModelType[]> = Object.fromEntries(
    (catalogue ?? []).map((p) => [p.code, p.models.map((m) => ({ code: m.code, sizes: m.sizes }))]),
  )

  return { catalogue, products, modelCatalogue, err, loading: !catalogue && !err }
}
