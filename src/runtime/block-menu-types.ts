export interface BlockMenuItem {
  label: string;
  disabled?: boolean;
  restoreFocus?: boolean;
  loadChildren?: () => BlockMenuItem[];
  reason?: string;
  run?: () => void | Promise<void>;
  children?: BlockMenuItem[];
  input?: { label: string; value?: string; suggestions?: (value: string) => { value: string; label: string }[]; submit(value: string): void };
}

