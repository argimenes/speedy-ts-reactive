export const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
export function matchedStatistics(samples) {
  const measured = samples.filter(sample => sample.measured);
  if (measured.length !== 120 || measured.some((s, i) => s.index !== i + 30)) throw Error('Missing/reordered measured pairs');
  const summary = values => ({ count: values.length, medianMs: percentile(values, .5), p95Ms: percentile(values, .95), maxMs: Math.max(...values) });
  const stages = ['edit', 'prepareCapture', 'deliverCapture', 'callback', 'capture', 'transfer', 'otherCommandWork'];
  const differences = measured.map(s => s.candidate.edit - s.compact.edit);
  const result = { pairedAdded: summary(differences), byOrder: {}, byPosition: {}, stages: {} };
  for (const mode of ['compact', 'candidate']) result.byOrder[mode + 'First'] = summary(measured.filter(s => s.order[0] === mode).map(s => s.candidate.edit - s.compact.edit));
  for (const position of [0, 1, 2]) result.byPosition[position] = summary(measured.filter(s => s.position === position).map(s => s.candidate.edit - s.compact.edit));
  for (const stage of stages) result.stages[stage] = { compact: summary(measured.map(s => s.compact[stage])), candidate: summary(measured.map(s => s.candidate[stage])), pairedAdded: summary(measured.map(s => s.candidate[stage] - s.compact[stage])) };
  return { ...result, passed: result.pairedAdded.p95Ms <= 4 && result.pairedAdded.maxMs <= 50 && result.stages.callback.candidate.maxMs <= 50 };
}
