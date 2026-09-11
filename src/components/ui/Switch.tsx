"use client";

interface SwitchProps {
  name?: string;
  id?: string;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}

/** Checkbox real (para que funcione dentro de <form>) con apariencia de switch. */
export function Switch({ name, id, defaultChecked, onChange, disabled }: SwitchProps) {
  return (
    <label htmlFor={id} className="relative inline-flex shrink-0 cursor-pointer">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="peer sr-only"
      />
      <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-teal-600 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50" />
      <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
    </label>
  );
}
