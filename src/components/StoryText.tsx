const webAddressPattern = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi

function trimSentencePunctuation(value: string): string {
  let result = value
  while (result) {
    const last = result.at(-1)!
    if (/[.,!?;:]/.test(last)) {
      result = result.slice(0, -1)
      continue
    }
    const opening = { ')': '(', ']': '[', '}': '{' }[last]
    if (opening && result.split(last).length > result.split(opening).length) {
      result = result.slice(0, -1)
      continue
    }
    break
  }
  return result
}

/** Keep editorial content as escaped text, making only web addresses interactive. */
export function StoryText({ text }: { text: string }) {
  return text.split(webAddressPattern).map((part, index) => {
    if (index % 2 === 0) return part
    const label = trimSentencePunctuation(part)
    const href = /^www\./i.test(label) ? `https://${label}` : label
    try {
      const url = new URL(href)
      if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) return part
    } catch {
      return part
    }
    return (
      <span key={index}>
        <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
        {part.slice(label.length)}
      </span>
    )
  })
}
