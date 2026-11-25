import type { ReactNode } from 'react';

export function Table({
  caption,
  children,
  className = ''
}: {
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <table className={`w-full border-collapse text-sm ${className}`}>
      <caption className="sr-only">{caption}</caption>
      {children}
    </table>
  );
}
