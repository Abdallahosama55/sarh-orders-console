import { useId, type ReactNode } from 'react';

export interface FieldControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

interface FieldProps {
  label: string;
  /** Keep the label for screen readers only (e.g. inside a table-like row with column headings). */
  hideLabel?: boolean;
  error?: string | undefined;
  /** Spread the given props onto the input so label, error and invalid state are wired up. */
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * The error is linked with aria-describedby instead of living inside the <label>, so it is
 * announced as a description and does not become part of the input's accessible name.
 */
export function Field({ label, hideLabel = false, error, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'field__label'}>
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })}
      {error && (
        <span id={errorId} className="field__error">
          {error}
        </span>
      )}
    </div>
  );
}
