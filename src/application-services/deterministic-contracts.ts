import type { AcademicCapture, AcademicProjection, AcademicFormat } from '../academic/model';
import type { AcademicIdentifier } from '../academic/identifiers';
import type { JobSummary } from './contracts';
export interface DeterministicOperations {
  'deterministic.review': {
    input: { id: string; operationId: string; targetId?: string; name?: string; note: string };
    output: { entityId: string; identityId: string; snapshotId: string };
  };
  'deterministic.xml': {
    input: { id: string; source: string };
    output: { capture: AcademicCapture; jobId: string };
  };
  'deterministic.import': {
    input: { id: string; source: string };
    output: { capture: AcademicCapture; jobId: string };
  };
  'deterministic.inspect': { input: { id: string }; output: { job: JobSummary } };
  'deterministic.resume': {
    input: { id: string };
    output: { capture: AcademicCapture; jobId: string };
  };
}
export const deterministicOperations = [
  'deterministic.xml',
  'deterministic.review',
  'deterministic.import',
  'deterministic.inspect',
  'deterministic.resume',
] as const;
export interface DeterministicTask {
  kind: 'deterministic-parse';
  format: AcademicFormat | 'ocr';
  bytes: Uint8Array;
  identity?: AcademicIdentifier;
  secondary?: Uint8Array;
  discovery?: Uint8Array[];
}
export interface DeterministicResult {
  kind: 'deterministic-projection';
  projection: AcademicProjection;
}
