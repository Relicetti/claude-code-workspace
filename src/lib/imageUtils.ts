// Resizes a photo client-side before it's stored/sent to the AI — keeps
// Postgres rows and the vision API payload small, and Claude's vision docs
// recommend images with a long edge around this size for good OCR/detail
// without wasting tokens.
const MAX_DIMENSION = 1024
const JPEG_QUALITY = 0.82

export async function fileToResizedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível processar a imagem')
  ctx.drawImage(bitmap, 0, 0, width, height)

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}
