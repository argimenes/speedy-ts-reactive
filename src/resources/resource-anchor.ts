import {validAnchor,type ResourceAnchor as IIIFCanvasAnchor} from '../iiif/resource-anchor';
import {validPdfAnchor,type PdfAnchor} from '../pdf/model';
/** Resource-space evidence never borrows native text offsets. Each renderer
 * narrows its own variant before transforming coordinates into its viewport. */
export type ResourceAnchor=IIIFCanvasAnchor|PdfAnchor;
export const validResourceAnchor=(value:unknown):value is ResourceAnchor=>validAnchor(value)||validPdfAnchor(value);
