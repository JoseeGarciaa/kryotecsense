// Simple lightweight toast/notification helper (no external deps, non-blocking)
// Usage: notify('Mensaje listo'); notify('Error grave', 'error');
export type NotifyType = 'success' | 'error' | 'warning' | 'info';

const TYPE_STYLES: Record<NotifyType, string> = {
  success: 'background: #16a34a; color: #fff;',
  error: 'background: #dc2626; color: #fff;',
  warning: 'background: #d97706; color: #fff;',
  info: 'background: #2563eb; color: #fff;'
};

export function notify(message: string, type: NotifyType = 'success', durationMs = 2600) {
  try {
    if (typeof document === 'undefined') return; // SSR safeguard

    let container = document.getElementById('kryo-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'kryo-toast-container';
      container.style.cssText = [
        'position:fixed',
        'top:0.75rem',
        'right:0.75rem',
        'z-index:9999',
        'display:flex',
        'flex-direction:column',
        'gap:0.5rem',
        'max-width:320px'
      ].join(';');
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.style.cssText = [
      TYPE_STYLES[type],
      'font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif',
      'font-size:0.875rem',
      'padding:0.75rem 0.9rem',
      'border-radius:0.5rem',
      'box-shadow:0 4px 12px rgba(0,0,0,0.25)',
      'line-height:1.25',
      'animation:fadeIn 120ms ease-out',
      'cursor:pointer',
      'word-break:break-word'
    ].join(';');
    toast.textContent = message;

    // Close on click
    toast.addEventListener('click', () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-4px)';
      setTimeout(() => toast.remove(), 180);
    });

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-4px)';
      setTimeout(() => toast.remove(), 180);
    }, durationMs);
  } catch (err) {
    // Fallback (last resort)
    try { alert(message); } catch {}
  }
}

// Optional helper to group multiple lines cleanly
export function notifyList(title: string, items: string[], type: NotifyType = 'info') {
  const body = items.slice(0, 6).join('\n');
  const extra = items.length > 6 ? `\n+${items.length - 6} más...` : '';
  notify(`${title}\n${body}${extra}`, type);
}
