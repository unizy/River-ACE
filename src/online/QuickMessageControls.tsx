import { useState } from 'react'
import { QUICK_MESSAGES, type QuickMessageId } from './quickMessages'

export function QuickMessageControls({
  disabled,
  onSend,
}: {
  disabled: boolean
  onSend: (messageId: QuickMessageId) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="quick-message-controls">
      <button className="quick-message-toggle" disabled={disabled} onClick={() => setOpen((value) => !value)}>
        💬 快捷语
      </button>
      {open && <div className="quick-message-menu" role="menu" aria-label="快捷语">
        {QUICK_MESSAGES.map((message) => <button key={message.id} role="menuitem" onClick={() => {
          onSend(message.id)
          setOpen(false)
        }}>{message.text}</button>)}
      </div>}
    </div>
  )
}
