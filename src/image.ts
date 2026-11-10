const MAX_SIDE = 1600
/** Qualités essayées tour à tour ; si l'image dépasse encore la taille cible, on réduit ses dimensions. */
const QUALITIES = [0.8, 0.65, 0.5]
/** Cible bien sous la limite du serveur (1,5 Mo) pour qu'une photo ne soit jamais refusée. */
const TARGET_BYTES = 900_000

/** Réduit une photo du téléphone (plusieurs Mo) en JPEG ~200–500 Ko : tient dans les quotas gratuits et se synchronise vite. */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas indisponible')
    let blob: Blob | null = null
    for (let attempt = 0; attempt < 4; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      for (const q of QUALITIES) {
        blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', q))
        if (!blob) throw new Error('Compression impossible')
        if (blob.size <= TARGET_BYTES) return blob
      }
      scale *= 0.75
    }
    if (!blob || blob.size > TARGET_BYTES * 1.5) throw new Error('Photo trop lourde, même compressée')
    return blob
  } finally {
    bitmap.close()
  }
}
