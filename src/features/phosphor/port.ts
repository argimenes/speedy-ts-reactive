import type { ScreenData } from "./model";
export interface PhosphorPort {
  read(): ScreenData;
  title(): string;
  revision(): number;
  commit(data: ScreenData, label: string, expected?: number): void;
  rename(title: string): void;
  undo(): void;
  redo(): void;
  mount(root: HTMLElement, input: HTMLTextAreaElement): () => void;
  save(folder: string, filename: string): Promise<string>;
  open(folder: string, filename: string): Promise<void>;
  location(): { folder: string; filename: string } | undefined;
  status(): string;
  newDocument(example: "blank" | "rain" | "letter" | "poem"): void;
  searchEntities(query: string): Promise<{ id: string; name: string }[]>;
  createEntity(name: string): Promise<{ id: string; name: string }>;
}
