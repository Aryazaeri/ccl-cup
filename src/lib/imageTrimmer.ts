/**
 * Client-side Smart Image Trimmer & Canvas Processor
 * Automatically trims excess white/transparent borders and fits images to 1:1 badge dimensions.
 */

export type CropConfig = {
  zoom: number
  offsetX: number
  offsetY: number
  rotation: number
}

/** Pixel bounding box of an image's visible content. */
export type ContentBox = { minX: number; minY: number; width: number; height: number }

/**
 * Find the visible content in RGBA pixels: anything not transparent, and, when
 * the top-left corner is white or transparent, not near-white either. Null for
 * a blank image. Shared by the upload trimmer and the logo badge.
 */
export function findContentBox(data: ArrayLike<number>, width: number, height: number): ContentBox | null {
  const bgWhiteOrTransparent = data[3] < 15 || (data[0] > 240 && data[1] > 240 && data[2] > 240)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i + 3] < 15) continue
      if (bgWhiteOrTransparent && data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { minX, minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/** Where a logo's content sits inside its square image, as fractions of the side. */
export type LogoShape = { x: number; y: number; w: number; h: number }

const LOGO_SAMPLE = 96
const logoShapes = new Map<string, Promise<LogoShape | null>>()

/**
 * Measure a square logo's content once per URL, so a wide wordmark can be
 * drawn in a wide badge instead of a thin strip inside a small circle.
 * Null when the image can't be read (no CORS, broken link) or isn't square;
 * the badge then shows the image as it is.
 */
export function measureLogo(url: string): Promise<LogoShape | null> {
  const cached = logoShapes.get(url)
  if (cached) return cached
  const shape = new Promise<LogoShape | null>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        if (!img.naturalWidth || img.naturalWidth !== img.naturalHeight) return resolve(null)
        const canvas = document.createElement('canvas')
        canvas.width = LOGO_SAMPLE
        canvas.height = LOGO_SAMPLE
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, LOGO_SAMPLE, LOGO_SAMPLE)
        const box = findContentBox(ctx.getImageData(0, 0, LOGO_SAMPLE, LOGO_SAMPLE).data, LOGO_SAMPLE, LOGO_SAMPLE)
        resolve(
          box && {
            x: box.minX / LOGO_SAMPLE,
            y: box.minY / LOGO_SAMPLE,
            w: box.width / LOGO_SAMPLE,
            h: box.height / LOGO_SAMPLE,
          },
        )
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
  logoShapes.set(url, shape)
  return shape
}

/** How a measured logo sits in its badge: tile aspect and the image's crop, in %. */
export type LogoFit = { ratio: number; width: number; height: number; left: number; top: number }

/**
 * Badge geometry for a measured logo. The tile widens with the logo (up to
 * 2.4:1) so a wordmark isn't squeezed into a square, and the square image is
 * scaled so its content fills the tile with a small margin. Percentages are of
 * the tile's width (width, left) and height (height, top).
 */
export function logoFit(shape: LogoShape, margin = 0.84): LogoFit {
  const ratio = Math.min(Math.max(shape.w / shape.h, 1), 2.4)
  // Image side, in tile heights, so the content fits both ways.
  const side = Math.min((ratio * margin) / shape.w, margin / shape.h)
  const centerX = (shape.x + shape.w / 2) * side
  const centerY = (shape.y + shape.h / 2) * side
  return {
    ratio,
    width: (side / ratio) * 100,
    height: side * 100,
    left: ((ratio / 2 - centerX) / ratio) * 100,
    top: (0.5 - centerY) * 100,
  }
}

/**
 * Automatically detects non-transparent and non-white pixels to find the bounding box
 * of the actual emblem/logo, then crops and centers it with padding.
 */
export async function smartAutoTrimImage(imageSrc: string, paddingRatio: number = 0.06): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width
        const height = img.naturalHeight || img.height

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(imageSrc)
          return
        }

        ctx.drawImage(img, 0, 0)
        const imgData = ctx.getImageData(0, 0, width, height)
        const data = imgData.data

        const box = findContentBox(data, width, height)
        if (!box) {
          resolve(imageSrc)
          return
        }
        const { minX, minY } = box
        const contentWidth = box.width
        const contentHeight = box.height

        // Create square target canvas (e.g. 512x512)
        const targetSize = 512
        const outCanvas = document.createElement('canvas')
        outCanvas.width = targetSize
        outCanvas.height = targetSize
        const outCtx = outCanvas.getContext('2d')
        if (!outCtx) {
          resolve(imageSrc)
          return
        }

        const availableSize = targetSize * (1 - paddingRatio * 2)
        const scale = Math.min(availableSize / contentWidth, availableSize / contentHeight)

        const drawW = contentWidth * scale
        const drawH = contentHeight * scale
        const drawX = (targetSize - drawW) / 2
        const drawY = (targetSize - drawH) / 2

        outCtx.drawImage(
          canvas,
          minX,
          minY,
          contentWidth,
          contentHeight,
          drawX,
          drawY,
          drawW,
          drawH
        )

        resolve(outCanvas.toDataURL('image/png'))
      } catch (err) {
        console.error('Auto trim error:', err)
        resolve(imageSrc)
      }
    }
    img.onerror = () => resolve(imageSrc)
    img.src = imageSrc
  })
}

/**
 * Renders an image using manual crop/zoom/offset parameters onto a 1:1 canvas.
 */
export async function renderCustomCrop(
  imageSrc: string,
  config: CropConfig,
  outputSize: number = 512
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = outputSize
      canvas.height = outputSize
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(imageSrc)
        return
      }

      ctx.save()
      // Center origin
      ctx.translate(outputSize / 2, outputSize / 2)
      ctx.rotate((config.rotation * Math.PI) / 180)
      ctx.scale(config.zoom, config.zoom)
      ctx.translate(config.offsetX, config.offsetY)

      const baseScale = Math.min(outputSize / img.width, outputSize / img.height)
      const w = img.width * baseScale
      const h = img.height * baseScale

      ctx.drawImage(img, -w / 2, -h / 2, w, h)
      ctx.restore()

      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(imageSrc)
    img.src = imageSrc
  })
}
