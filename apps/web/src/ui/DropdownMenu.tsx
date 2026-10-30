import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

interface DropdownMenuProps {
  readonly trigger: (props: {
    readonly open: boolean;
    readonly toggle: () => void;
    readonly menuId: string;
  }) => ReactNode;
  readonly children: ReactNode;
  readonly align?: 'start' | 'end';
  readonly testId?: string;
}

export function DropdownMenu({ trigger, children, align = 'end', testId }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const toggle = (): void => {
    setOpen((current) => !current);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node) !== true) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="ui-menu" ref={rootRef} data-testid={testId}>
      {trigger({ open, toggle, menuId })}
      {open ? (
        <div
          id={menuId}
          className={`ui-menu__panel ui-menu__panel--${align}`}
          role="menu"
          onKeyDown={onMenuKeyDown}
          onClick={() => {
            setOpen(false);
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

interface DropdownMenuItemProps {
  readonly children: ReactNode;
  readonly onSelect: () => void;
  readonly destructive?: boolean;
  readonly testId?: string;
}

export function DropdownMenuItem({
  children,
  onSelect,
  destructive = false,
  testId,
}: DropdownMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`ui-menu__item${destructive ? ' ui-menu__item--danger' : ''}`}
      data-testid={testId}
      onClick={() => {
        onSelect();
      }}
    >
      {children}
    </button>
  );
}
