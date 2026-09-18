import assert from 'node:assert/strict';
import test from 'node:test';
import { matchedStatistics, percentile } from './matched-statistics.mjs';

const samples = () => Array.from({ length: 150 }, (_, index) => {
  const compact = { edit: index % 2 ? 100 : 10, prepareCapture: 1, deliverCapture: 1, callback: 0, capture: 0, transfer: 0, otherCommandWork: 8 };
  return { index, measured: index >= 30, position: index % 3, order: index % 2 ? ['candidate', 'compact'] : ['compact', 'candidate'], compact, candidate: { ...compact, edit: compact.edit + (index % 2 ? -2 : 3), callback: .1 } };
});

test('uses signed paired differences, with balanced order and position strata', () => {
  const input = samples(), measured = input.filter(s => s.measured), result = matchedStatistics(input);
  assert.equal(result.pairedAdded.p95Ms, 3);
  assert.equal(percentile(measured.map(s => s.candidate.edit), .95) - percentile(measured.map(s => s.compact.edit), .95), -2);
  assert.equal(result.byOrder.candidateFirst.p95Ms, -2);
  assert.equal(result.byOrder.compactFirst.count, 60);
  assert.equal(result.byPosition[0].count, 40);
  assert.equal(result.passed, true);
});

test('retains every measured outlier and enforces both existing timing limits', () => {
  const input = samples();
  input[0].candidate.edit = 10000; // Fixed warm-up is retained but not measured.
  assert.equal(matchedStatistics(input).passed, true);
  for (let i = 30; i < 40; i++) input[i].candidate.edit = input[i].compact.edit + 4.1;
  assert.equal(matchedStatistics(input).passed, false);
  const outlier = samples(); outlier[149].candidate.edit = outlier[149].compact.edit + 51;
  assert.equal(matchedStatistics(outlier).pairedAdded.maxMs, 51);
  assert.equal(matchedStatistics(outlier).passed, false);
});

test('rejects missing or reordered measured pairs', () => {
  assert.throws(() => matchedStatistics(samples().slice(0, -1)), /Missing\/reordered/);
  const input = samples(); [input[40], input[41]] = [input[41], input[40]];
  assert.throws(() => matchedStatistics(input), /Missing\/reordered/);
});
