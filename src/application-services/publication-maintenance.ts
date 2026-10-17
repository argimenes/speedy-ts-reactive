/** Narrow publication-owned maintenance. No paths or managed-asset deletion authority. */
export type MaintenanceTarget={kind:'job'|'release';id:string};
export interface MaintenanceReview {siteId:string;siteRevision:number;target:MaintenanceTarget;jobRevision?:number;bytes:number;files:number;blocked:string[];pending:boolean}
export interface MaintenanceList {targets:MaintenanceTarget[];next?:number}
