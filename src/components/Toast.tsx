import { Check } from 'lucide-react'

interface ToastProps {
  message: string | null
}

export function Toast({ message }: ToastProps) {
  if (!message) return null
  return (
    <div className="toast" role="status" aria-live="polite">
      <Check size={16} strokeWidth={2.5} />
      <span>{message}</span>
    </div>
  )
}
