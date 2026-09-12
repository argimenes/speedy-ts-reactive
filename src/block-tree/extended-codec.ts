import { clone } from "./clone";
import { validateRepository } from "./repository";
import type { RepositoryState } from "./types";

export interface ExtendedRepositoryDto {
  format: "speedy-ts-reactive-repository";
  version: 1;
  savedAt: string;
  state: RepositoryState;
}

export function encodeExtendedRepository(state: RepositoryState): ExtendedRepositoryDto {
  validateRepository(state);
  return {
    format: "speedy-ts-reactive-repository",
    version: 1,
    savedAt: new Date().toISOString(),
    state: clone(state),
  };
}

export function decodeExtendedRepository(dto: ExtendedRepositoryDto): RepositoryState {
  if (dto.format !== "speedy-ts-reactive-repository" || dto.version !== 1) {
    throw new Error("Unsupported reactive repository format");
  }
  const state = clone(dto.state);
  validateRepository(state);
  return state;
}
