type ToastKind = 'success' | 'warning' | 'error' | 'info'

function show(message: string, kind: ToastKind) {
  const root = document.createElement('div')
  root.className = `wz-toast wz-toast--${kind}`
  root.setAttribute('role', 'status')
  root.textContent = message
  document.body.appendChild(root)
  requestAnimationFrame(() => root.classList.add('is-in'))
  window.setTimeout(() => {
    root.classList.remove('is-in')
    root.classList.add('is-out')
    window.setTimeout(() => root.remove(), 220)
  }, 2400)
}

export const toast = {
  success: (message: string) => show(message, 'success'),
  warning: (message: string) => show(message, 'warning'),
  error: (message: string) => show(message, 'error'),
  info: (message: string) => show(message, 'info'),
}
