import { useEffect, useState } from 'react'
import { getCountry } from '../lib/countries'
import { logoFit, measureLogo, type LogoShape } from '../lib/imageTrimmer'

type Props = {
  name: string
  color?: string
  secondaryColor?: string
  logoUrl?: string
  countryCode?: string
  showFlag?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function TeamMark({
  name,
  color = '#63e35b',
  secondaryColor,
  logoUrl,
  countryCode,
  showFlag = false,
  size = 'md',
}: Props) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)

  const country = countryCode ? getCountry(countryCode) : null

  // Uploaded crests are padded into a square, so a wide wordmark is only a
  // thin strip of it. Measure the content once and draw it in a tile shaped
  // to fit; until then (or if it can't be read) the image shows as it is.
  const [shape, setShape] = useState<{ url: string; value: LogoShape | null } | null>(null)
  useEffect(() => {
    if (!logoUrl) return
    let live = true
    void measureLogo(logoUrl).then((value) => {
      if (live) setShape({ url: logoUrl, value })
    })
    return () => {
      live = false
    }
  }, [logoUrl])
  const fit = shape && shape.url === logoUrl && shape.value ? logoFit(shape.value) : null

  return (
    <span className={`team-mark-wrapper size-${size}`}>
      {logoUrl ? (
        <span className={fit ? 'team-logo-img-wrap is-fitted' : 'team-logo-img-wrap'} style={fit ? { aspectRatio: fit.ratio } : undefined}>
          <img
            src={logoUrl}
            alt={name}
            className="team-logo-img"
            style={fit ? { width: `${fit.width}%`, height: `${fit.height}%`, left: `${fit.left}%`, top: `${fit.top}%` } : undefined}
          />
        </span>
      ) : (
        <span
          className="team-mark"
          style={
            {
              '--team-color': color,
              '--team-secondary-color': secondaryColor || '#ffffff',
            } as React.CSSProperties
          }
          aria-hidden="true"
        >
          {initials}
        </span>
      )}
      {showFlag && country && (
        <span className="team-flag-chip" title={country.name}>
          {country.flag}
        </span>
      )}
    </span>
  )
}

