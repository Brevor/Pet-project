import { useRef } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel
}: {
  items: Array<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function select(index: number) {
    const item = items[(index + items.length) % items.length];
    if (!item) return;
    onChange(item.id);
    refs.current[items.indexOf(item)]?.focus();
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                select(index + 1);
              }
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                select(index - 1);
              }
              if (event.key === 'Home') {
                event.preventDefault();
                select(0);
              }
              if (event.key === 'End') {
                event.preventDefault();
                select(items.length - 1);
              }
            }}
            className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-secondary'}`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
