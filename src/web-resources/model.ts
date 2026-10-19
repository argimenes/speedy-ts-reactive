import {
  managedAsset,
  type ManagedAssetReference,
} from "../interchange/managed-asset";
export const WEB_BLOCK = "mutable/web-resource-block";
export type Provider = "web" | "google-maps" | "x" | "bluesky";
export interface WebIdentity {
  source: string;
  url: string;
  provider: Provider;
  id?: string;
  account?: string;
  location?: {
    query: string;
    coordinates?: [number, number];
    placeId?: string;
  };
  diagnostic?: string;
}
export interface SocialPost {
  platform: "x" | "bluesky";
  text?: string;
  author?: string;
  handle?: string;
  published?: string;
  avatar?: string;
  attachments: { type: string; description?: string; url?: string }[];
  quote?: { text?: string; author?: string; url?: string };
}
export interface WebProjection {
  provider: Provider;
  title?: string;
  site?: string;
  description?: string;
  author?: string;
  published?: string;
  image?: string;
  type?: string;
  canonicalUrl?: string;
  location?: WebIdentity["location"];
  social?: SocialPost;
  embedId?: string;
  diagnostics: string[];
  status: "captured" | "link-only" | "unavailable";
}
/** JSON envelope retains exact decoded UTF-8 response text, endpoint and identity; never executable. */
export interface WebOriginal {
  version: 1;
  source: string;
  endpoint?: string;
  format: "html" | "x-oembed" | "bluesky" | "url";
  body?: string;
  capturedAt: string;
  failure?: string;
}
export interface WebCapture {
  version: 1;
  snapshotId: string;
  source: string;
  capturedAt: string;
  asset: ManagedAssetReference;
  projection: WebProjection;
}
export function webUrl(value: unknown): URL {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    /[\u0000-\u0020\\]/.test(value.trim())
  )
    throw Error("Enter one HTTP(S) URL");
  const u = new URL(value.trim());
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.port
  )
    throw Error("Use a credential-free standard-port URL");
  return u;
}
export function safeWebUrl(value: unknown, base?: string): string | undefined {
  try {
    return webUrl(
      base && typeof value === "string" ? new URL(value, base).href : value,
    ).href;
  } catch {
    return;
  }
}
export function webCapture(v: any): v is WebCapture {
  try {
    return (
      v?.version === 1 &&
      typeof v.snapshotId === "string" &&
      v.snapshotId.length <= 100 &&
      !!webUrl(v.source) &&
      !!managedAsset(v.asset) &&
      typeof v.capturedAt === "string" &&
      Number.isFinite(Date.parse(v.capturedAt)) &&
      ["web", "google-maps", "x", "bluesky"].includes(v.projection?.provider) &&
      ["captured", "link-only", "unavailable"].includes(v.projection.status) &&
      validProjection(v.projection) &&
      JSON.stringify(v.projection).length <= 40000
    );
  } catch {
    return false;
  }
}
export const stableJson = (value: unknown) =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );

function validProjection(p:any):boolean {
 const str=(v:any,n:number)=>v===undefined||typeof v==='string'&&v.length<=n;
 const url=(v:any)=>v===undefined||typeof v==='string'&&!!safeWebUrl(v);
 if(!Array.isArray(p.diagnostics)||p.diagnostics.length>20||!p.diagnostics.every((s:any)=>typeof s==='string'&&s.length<=2000))return false;
 for(const k of ['title','site','description','author','published','type','embedId'])if(!str(p[k],2000))return false;
 if(!url(p.image)||!url(p.canonicalUrl))return false;
 if(p.location){const l=p.location;if(typeof l.query!=='string'||l.query.length>500||!str(l.placeId,250))return false;if(l.coordinates&&(!Array.isArray(l.coordinates)||l.coordinates.length!==2||!l.coordinates.every(Number.isFinite)||Math.abs(l.coordinates[0])>90||Math.abs(l.coordinates[1])>180))return false;}
 if(p.social){const s=p.social;if(!['x','bluesky'].includes(s.platform)||s.platform!==p.provider||!str(s.text,12000)||!str(s.author,300)||!str(s.handle,300)||!str(s.published,80)||!url(s.avatar)||!Array.isArray(s.attachments)||s.attachments.length>6)return false;for(const a of s.attachments)if(!a||typeof a.type!=='string'||!str(a.type,100)||!str(a.description,1000)||!url(a.url))return false;if(s.quote&&(!str(s.quote.text,2000)||!str(s.quote.author,300)||!url(s.quote.url)))return false;}
 return true;
}
