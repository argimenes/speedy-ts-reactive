import { emptyFragment, validateFragment } from '../interchange/fragment';
import { materializeFragment } from '../interchange/materialize';
import { ACADEMIC_BLOCK, type AcademicCapture } from './model';
export function academicBlock(capture: AcademicCapture) {
  const f = emptyFragment();
  f.blocks = [
    {
      localId: 'academic',
      type: ACADEMIC_BLOCK,
      data: { academic: JSON.parse(JSON.stringify(capture)), sourceUrl: capture.source },
      children: [],
      relations: {},
      blockProperties: [],
    },
  ];
  f.placements = [
    { localId: 'edge', kind: 'owned', target: { kind: 'local', object: 'block', id: 'academic' } },
  ];
  f.roots = [
    { placement: 'edge', openStart: false, openEnd: false, clippedStart: false, clippedEnd: false },
  ];
  const fragment = validateFragment(f);
  return { fragment, native: materializeFragment(fragment) };
}
