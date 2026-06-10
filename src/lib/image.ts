// Compress a picked/captured image to a small JPEG data URL so it can be stored
// inline (DB text) without bloat. Resizes to fit maxEdge and re-encodes as JPEG.
export async function compressImage(file: File, maxEdge = 1280, quality = 0.6): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(new Error('read failed'))
    fr.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('decode failed'))
    i.src = dataUrl
  })
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl // fallback: original (rare)
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}
