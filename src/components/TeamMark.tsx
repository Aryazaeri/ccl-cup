import { getCountry } from '../lib/countries'

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

  return (
    <span className={`team-mark-wrapper size-${size}`}>
      {logoUrl ? (
        <span className="team-logo-img-wrap" style={{ borderColor: color }}>
          <img src={logoUrl} alt={name} className="team-logo-img" />
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

