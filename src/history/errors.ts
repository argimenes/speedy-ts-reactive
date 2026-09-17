export class HistoryError extends Error {
  constructor(readonly status: "incomplete" | "unsupported" | "invalid" | "disposed", message: string) { super(message); this.name = "HistoryError"; }
}
