import type { ReactNode } from 'react'

type Props = {
  open: boolean
  title?: string
  message?: string
  children?: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm?: () => void
  onCancel?: () => void
}

// 微信内悬浮弹窗（替代 alert/confirm）
export default function WeChatDialog({
  open,
  title = '提示',
  message,
  children,
  confirmText = '确定',
  cancelText,
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null

  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center p-5">
      <div
        className="absolute inset-0 bg-black/35"
        onClick={() => onCancel?.()}
        role="presentation"
      />

      <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/75 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
        <div className="text-center">
          <div className="text-[15px] font-semibold text-[#111]">{title}</div>
          {message && <div className="mt-2 text-[13px] leading-relaxed text-[#333]">{message}</div>}
          {children && <div className="mt-3 text-left">{children}</div>}
        </div>

        <div className="mt-4 flex gap-2">
          {cancelText && (
            <button
              type="button"
              onClick={() => onCancel?.()}
              className="flex-1 rounded-full border border-black/10 bg-white/60 px-4 py-2 text-[13px] font-medium text-[#333] active:scale-[0.98]"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={() => onConfirm?.()}
            className="flex-1 rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
            style={{
              background: danger
                ? 'linear-gradient(135deg, #fb7185 0%, #ef4444 100%)'
                : 'linear-gradient(135deg, #34d399 0%, #07C160 100%)',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

