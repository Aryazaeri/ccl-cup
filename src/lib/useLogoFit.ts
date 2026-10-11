import { useEffect, useState } from 'react'
import { logoFit, measureLogo, type LogoFit, type LogoShape } from './imageTrimmer'

/**
 * Uploaded logos are padded into a square, so a wide wordmark is only a thin
 * strip of it. This measures the content once per URL and returns the tile
 * shape and crop to draw it legibly; null until measured, or when the image
 * can't be read, in which case the caller shows the image as it is.
 */
export function useLogoFit(url: string | undefined): LogoFit | null {
  const [shape, setShape] = useState<{ url: string; value: LogoShape | null } | null>(null)
  useEffect(() => {
    if (!url) return
    let live = true
    void measureLogo(url).then((value) => {
      if (live) setShape({ url, value })
    })
    return () => {
      live = false
    }
  }, [url])
  return shape && shape.url === url && shape.value ? logoFit(shape.value) : null
}

/** Inline styles for a fitted logo: the tile's aspect, and the image's crop. */
export function logoFitStyles(fit: LogoFit | null) {
  if (!fit) return { tile: undefined, img: undefined }
  return {
    tile: { aspectRatio: fit.ratio },
    img: { width: `${fit.width}%`, height: `${fit.height}%`, left: `${fit.left}%`, top: `${fit.top}%` },
  }
}
