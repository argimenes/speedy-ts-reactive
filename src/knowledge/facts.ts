/** Derived semantic data only. No persistence, binding, ownership or navigation authority. */
import type {SearchSource} from '../runtime/search-matching';
export const PROFILE = 'native-facts-1';
export interface AnnotationFact {
 id:string; logicalId:string; blockId:string; type:string; start:number; end:number; value:unknown;
 /** Bounded native Cell context for derived reference presentation. */
 context?:string; contextCells?:number;
 definition?:{resourceId:string;blockId:string;annotationId:string};
}
export interface Mention {
 id:string; kind:'document'|'entity'; targetId:string; targetResourceId?:string;
 ranges:Array<{blockId:string;start:number;end:number}>; text:string; annotationIds:string[];
 definition?:AnnotationFact['definition'];
}
export interface BlockFact {id:string;type:string;ordinal?:number;cellCount?:number;text?:Omit<SearchSource,'contentKey'|'version'>}
export interface Facts {
 id:string;rootBlockId:string;title:string;hasTitle?:boolean;tags:string[];
 blocks:BlockFact[];annotations:AnnotationFact[];mentions:Mention[];diagnostics:string[];
 /** Query-specific incompleteness; unrelated tags/Entity/style payloads do not imply missing Document backlinks. */
 referenceDiagnostics?:string[];
}

/** Evidence travels separately; a byte hash is not a save generation. */
export interface SavedFactsEvidence { readonly location:{readonly folder:string;readonly filename:string}; readonly resourceId:string; readonly byteHash:string; readonly policy:string }
export interface SavedFactsContribution { readonly facts:Facts; readonly evidence:SavedFactsEvidence }
