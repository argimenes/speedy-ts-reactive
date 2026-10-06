import MaterialPlayground from './material-playground';
import { createThreeMaterialGraph } from './graph/three-material-graph';
import './three-material-playground.css';
/** Deliberately separate entry: production Flint and the SVG route keep their renderer. */
export default function ThreeMaterialPlayground(props: { lightFieldEnabled?: boolean }) {
  return <MaterialPlayground lightFieldEnabled={props.lightFieldEnabled} graphFactory={createThreeMaterialGraph} threeSpike />;
}
