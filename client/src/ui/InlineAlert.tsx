import type { ReactNode } from 'react';

type Variant = 'info' | 'success' | 'warning' | 'error';

const TONES: Record<Variant, string> = {
  info: 'border-line bg-subtle text-ink',
  success: 'border-success/30 bg-success/5 text-success',
  warning: 'border-warning/30 bg-warning/5 text-warning',
  error: 'border-danger/30 bg-danger/5 text-danger'
};

export function InlineAlert({
  variant = 'info',
  children
}: {
  variant?: Variant;
  children: ReactNode;
}) {
  return (
    <p
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={`rounded-md border px-3 py-2 text-sm ${TONES[variant]}`}
    >
      {children}
    </p>
  );
}
