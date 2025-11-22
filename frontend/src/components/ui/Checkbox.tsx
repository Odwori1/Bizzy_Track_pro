import { InputHTMLAttributes } from 'react';

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={`h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${className || ''}`}
      {...props}
    />
  );
}
