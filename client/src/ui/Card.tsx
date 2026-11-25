import type { ReactNode } from 'react';

export function Card({
  children,
  className = ''
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card p-4 md:p-5 ${className}`}>{children}</section>;
}

export function Badge({
  children,
  tone = 'brand'
}: {
  children: ReactNode;
  tone?: 'brand' | 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-soft text-brand',
    neutral: 'bg-subtle text-muted',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger'
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
