import { AlertTriangle } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { Modal } from './Modal'

/* ------------------------------------------------------------------ *
 * Destructive-action confirmation
 *
 * Every delete in the panel used to fire on a single click with no undo and
 * no warning, and the deletes cascade further than the button suggests —
 * removing a season takes its clubs, players, fixtures and groups with it.
 *
 * `consequences` is meant to state what the database will actually do, not to
 * caution in the abstract. `requireTyping` raises the bar for the handful of
 * actions that destroy a whole tournament: the confirm button stays disabled
 * until the name is typed back exactly.
 * ------------------------------------------------------------------ */

export type ConfirmOptions = {
  title: string
  body: ReactNode
  /** Concrete, verified effects — one line each. */
  consequences?: string[]
  confirmLabel?: string
  /** When set, the user must retype this string before confirming. */
  requireTyping?: string
}

type PendingRequest = {
  options: ConfirmOptions
  resolve: (confirmed: boolean) => void
}

export function useConfirm() {
  const [pending, setPending] = useState<PendingRequest | null>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ options, resolve })
      }),
    [],
  )

  const settle = (confirmed: boolean) => {
    pending?.resolve(confirmed)
    setPending(null)
  }

  const confirmDialog = pending ? (
    <ConfirmDialog options={pending.options} onCancel={() => settle(false)} onConfirm={() => settle(true)} />
  ) : null

  return { confirm, confirmDialog }
}

function ConfirmDialog({
  options,
  onCancel,
  onConfirm,
}: {
  options: ConfirmOptions
  onCancel: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState('')
  const needsTyping = Boolean(options.requireTyping)
  const canConfirm = !needsTyping || typed.trim() === options.requireTyping

  return (
    <Modal title={options.title} onClose={onCancel}>
      <div className="confirm-dialog">
        <div className="confirm-lead">
          <AlertTriangle size={22} />
          <div>{options.body}</div>
        </div>

        {options.consequences && options.consequences.length > 0 ? (
          <ul className="confirm-consequences">
            {options.consequences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}

        <p className="confirm-note">This cannot be undone.</p>

        {needsTyping ? (
          <label className="confirm-typing">
            Type <strong>{options.requireTyping}</strong> to confirm
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={options.requireTyping}
              autoFocus
            />
          </label>
        ) : null}

        <div className="confirm-actions">
          <button type="button" className="confirm-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="confirm-delete" disabled={!canConfirm} onClick={onConfirm}>
            {options.confirmLabel ?? 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
