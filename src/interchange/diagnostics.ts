export interface InterchangeDiagnostic {
  version: 1; code: string; severity: 'info' | 'warning'; sourceName?: string;
  loss: boolean; detail: string;
}
export const diagnostic = (code: string, detail: string, loss = true, sourceName?: string): InterchangeDiagnostic => ({
  version: 1, code, severity: loss ? 'warning' : 'info', loss, detail, ...(sourceName ? { sourceName } : {}),
});
