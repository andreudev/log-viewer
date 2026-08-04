import React from 'react';

/**
 * Drop-in replacement for buttons that show a Material icon.
 *
 * Accessibility:
 *   - Always sets `aria-label` from the required `label` prop.
 *   - Adds `type="button"` by default (prevents accidental form submit).
 *   - Uses `title` as a fallback tooltip for mouse users.
 *
 * Usage:
 *   <IconButton icon="close" label="Cerrar panel" onClick={handleClose} />
 *   <IconButton icon="delete" label="Eliminar preset" variant="danger" />
 *
 * Future migrations: search for `<button[^>]*>\s*<span class="material-icons-round"`
 * and replace with <IconButton icon="..." label="..." ...otherProps />.
 */
export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-label' | 'children'> {
  /** Material Icons name (e.g. "close", "delete", "settings"). */
  icon: string;
  /**
   * Required accessible label. Read by screen readers in place of the
   * icon's text content (icons are decorative for SR users).
   */
  label: string;
  /** Optional icon size in px (default 18). */
  iconSize?: number;
  /** Optional variant for visual styling hooks. */
  variant?: 'default' | 'danger' | 'primary' | 'ghost';
  children?: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, iconSize = 18, variant = 'default', style, className, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={rest.title || label}
        data-variant={variant}
        className={['icon-btn', `icon-btn--${variant}`, className].filter(Boolean).join(' ')}
        {...rest}
      >
        <span
          className="material-icons-round"
          style={{ fontSize: `${iconSize}px`, pointerEvents: 'none' }}
          aria-hidden="true"
        >
          {icon}
        </span>
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
