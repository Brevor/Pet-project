import type { ReactNode } from 'react';

export interface FieldControlProps {
  id: string;
  className: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

export function Field({
  id,
  label,
  hint,
  error,
  required,
  children
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children({
        id,
        className: `input ${error ? 'input-error' : ''}`,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined
      })}
      {hint && (
        <span id={hintId} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
