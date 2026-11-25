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
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger'
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
