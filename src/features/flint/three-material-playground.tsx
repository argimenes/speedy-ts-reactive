import MaterialPlayground from './material-playground';
import { createThreeMaterialGraph } from './graph/three-material-graph';
import { createMaterialGraph } from './graph/material-graph';
import './three-material-playground.css';
/** The accepted Graph keeps its XY camera, using the shell's physical environment. */
export default function ThreeMaterialPlayground(props: { lightFieldEnabled?: boolean; materialChrome?: boolean; probe?:boolean }) {
  return <MaterialPlayground lightFieldEnabled={props.lightFieldEnabled} materialChrome={props.materialChrome} probe={props.probe !== false} graphFactory={options => {
    try { return createThreeMaterialGraph(options, props.materialChrome ? options.container.closest<HTMLElement>('.flint-material-playground')! : undefined); }
    catch { options.container.replaceChildren(); delete options.container.dataset.renderer; return createMaterialGraph(options); }
  }} threeSpike />;
}
