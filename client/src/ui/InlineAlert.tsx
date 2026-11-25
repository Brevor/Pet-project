import type { ReactNode } from 'react';

type Variant = 'info' | 'success' | 'warning' | 'error';

const TONES: Record<Variant, string> = {
  info: 'border-line bg-subtle text-ink',
  success: 'border-success-border bg-success-soft text-success',
  warning: 'border-warning-border bg-warning-soft text-warning',
  error: 'border-danger-border bg-danger-soft text-danger'
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
