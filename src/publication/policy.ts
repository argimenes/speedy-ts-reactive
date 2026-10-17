/** Trusted publication shell policy; no parser or platform dependencies. */
export const PUBLICATION_VERSION='incremental-d1';
export const PUBLICATION_CSP="default-src 'none'; img-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";
export const INTERACTIVE_CSP=PUBLICATION_CSP+"; script-src 'self'; connect-src 'self'";
export const READER_CSS=':root{color-scheme:light dark;font-family:system-ui,sans-serif;line-height:1.6}body{margin:0;padding:24px}main{max-width:78ch;margin:auto}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid gray;padding:.4rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{overflow-wrap:anywhere}a:focus-visible{outline:3px solid currentColor}';
