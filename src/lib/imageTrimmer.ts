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

        // Detect corner background color to handle solid white or solid color borders
        const getPixel = (x: number, y: number) => {
          const idx = (y * width + x) * 4
          return {
            r: data[idx],
            g: data[idx + 1],
            b: data[idx + 2],
            a: data[idx + 3],
          }
        }

        const topLeft = getPixel(0, 0)
        const isBgWhiteOrTransparent =
          topLeft.a < 15 || (topLeft.r > 240 && topLeft.g > 240 && topLeft.b > 240)

        const isBackground = (r: number, g: number, b: number, a: number) => {
          if (a < 15) return true
          if (isBgWhiteOrTransparent && r > 240 && g > 240 && b > 240) return true
          return false
        }

        let minX = width
        let minY = height
        let maxX = 0
        let maxY = 0
        let foundContent = false

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4
            const r = data[idx]
            const g = data[idx + 1]
            const b = data[idx + 2]
            const a = data[idx + 3]

            if (!isBackground(r, g, b, a)) {
              if (x < minX) minX = x
              if (x > maxX) maxX = x
              if (y < minY) minY = y
              if (y > maxY) maxY = y
              foundContent = true
            }
          }
        }

        if (!foundContent) {
          resolve(imageSrc)
          return
        }

        const contentWidth = maxX - minX + 1
        const contentHeight = maxY - minY + 1

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
