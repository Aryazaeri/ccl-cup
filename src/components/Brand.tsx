export function Brand({ admin = false }: { admin?: boolean }) {
  if (admin) {
    return (
      <div className="brand-admin-wrap" aria-label="Sporfest Events & Organization">
        <img
          src="/assets/sporfest-logo.jpg"
          alt="Sporfest Events & Organization"
          className="brand-admin-logo"
        />
      </div>
    )
  }

  return (
    <span className="brand" aria-label="CCL Cup">
      CCL CUP
    </span>
  )
}
