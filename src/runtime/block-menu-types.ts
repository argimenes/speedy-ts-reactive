export interface BlockMenuItem {
  label: string;
  disabled?: boolean;
  reason?: string;
  run?: () => void | Promise<void>;
  children?: BlockMenuItem[];
  input?: { label: string; value?: string; submit(value: string): void };
}

