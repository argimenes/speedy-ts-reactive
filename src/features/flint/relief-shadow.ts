import type { MaterialResponse } from './material-response';
const NS = 'http://www.w3.org/2000/svg';
function element(tag: string, attributes: Record<string, string> = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}
function attribute(element: Element, name: string, value: number) {
  const text = String(value); if (element.getAttribute(name) !== text) element.setAttribute(name, text);
}
/** The tight shadow consumes a cheap monochrome silhouette, not the textured
 * artwork's offscreen bitmap. Both filters use unscaled graph-local CSS pixels.
 */
export function installReliefShadow(castFilter: Element, contactFilter: Element) {
  const cast = element('feDropShadow', { 'flood-color': '#443e33' }); castFilter.append(cast);
  const blur = element('feGaussianBlur');
  const offset = element('feOffset');
  const transfer = element('feComponentTransfer'), alpha = element('feFuncA', { type: 'linear' }); transfer.append(alpha);
  contactFilter.append(blur, offset, transfer);
  return (response: MaterialResponse) => {
    const shadow = response.castShadow, contact = response.contactShadow;
    attribute(cast, 'stdDeviation', shadow.blur / 2); attribute(cast, 'dx', shadow.x); attribute(cast, 'dy', shadow.y); attribute(cast, 'flood-opacity', shadow.opacity);
    attribute(blur, 'stdDeviation', contact.blur / 2); attribute(offset, 'dx', contact.x); attribute(offset, 'dy', contact.y); attribute(alpha, 'slope', contact.opacity);
  };
}
