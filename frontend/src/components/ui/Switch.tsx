'use client';

import * as React from 'react';
import { cn } from '@/lib/utils'; // Assuming you have this utility

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'checked' | 'onChange'> {
  /** The controlled checked state of the switch */
  checked?: boolean;
  /** The unchecked state of the switch when uncontrolled */
  defaultChecked?: boolean;
  /** Event handler called when the checked state changes */
  onCheckedChange?: (checked: boolean) => void;
  /** Whether the switch is disabled */
  disabled?: boolean;
  /** Whether the switch is required in a form */
  required?: boolean;
  /** The name of the switch (for forms) */
  name?: string;
  /** The value of the switch (for forms) */
  value?: string;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ 
    checked: controlledChecked,
    defaultChecked = false,
    onCheckedChange,
    disabled = false,
    required = false,
    name,
    value = 'on',
    className,
    id,
    onClick,
    onKeyDown,
    ...props 
  }, ref) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked);
    const isControlled = controlledChecked !== undefined;
    const checked = isControlled ? controlledChecked : internalChecked;
    const buttonId = id || React.useId();

    const handleToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      
      const newChecked = !checked;
      
      if (!isControlled) {
        setInternalChecked(newChecked);
      }
      
      onCheckedChange?.(newChecked);
      onClick?.(event);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      
      // Toggle on Space or Enter key
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        const newChecked = !checked;
        
        if (!isControlled) {
          setInternalChecked(newChecked);
        }
        
        onCheckedChange?.(newChecked);
      }
      
      onKeyDown?.(event);
    };

    return (
      <>
        <button
          ref={ref}
          id={buttonId}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-required={required}
          aria-disabled={disabled}
          data-state={checked ? "checked" : "unchecked"}
          data-disabled={disabled ? "" : undefined}
          disabled={disabled}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          className={cn(
            "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
            "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            checked 
              ? "bg-primary data-[state=checked]:bg-primary" 
              : "bg-input data-[state=unchecked]:bg-input",
            className
          )}
          {...props}
        >
          <span
            className={cn(
              "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0",
              "transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
            )}
            data-state={checked ? "checked" : "unchecked"}
          />
        </button>
        
        {/* Hidden input for form submission */}
        {name && (
          <input
            type="hidden"
            name={name}
            value={checked ? value : ""}
            aria-hidden="true"
            tabIndex={-1}
            readOnly
            className="sr-only"
          />
        )}
      </>
    );
  }
);

Switch.displayName = "Switch";

// For convenience, here's the cn utility if you don't have it:
// utils/cn.ts
/*
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
*/
