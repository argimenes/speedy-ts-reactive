import { Show } from "solid-js";
export function CoffeeSurface(props: { id: string; settings: Readonly<Record<string, unknown>>; contact: (element: SVGGElement) => void }) {
  return (
    <svg class="three-d-object__surface" width="100%" height="100%" aria-hidden="true">
      <defs><radialGradient id={props.id}><stop offset="0" stop-color="#292019" stop-opacity=".25" /><stop offset="1" stop-color="#292019" stop-opacity="0" /></radialGradient></defs>
      <g ref={props.contact}><ellipse rx="1.15" ry="1.18" fill={`url(#${props.id})`} />
        <Show when={props.settings.coffeeStain}><g fill="none" stroke="#845022" stroke-width=".065" opacity=".42">
          <path d="M .99 .08 C 1.03 .52 .55 .97 .05 1 C -.57 1.02 -1 .55 -.99 -.08 C -.96 -.62 -.5 -.99 .05 -.98 C .51 -.97 .85 -.62 .95 -.28" />
          <path d="M .75 -.7 C .26 -1.12 -.39 -1.01 -.76 -.59 M -.87 .45 C -.49 .93 .23 1.06 .65 .74" stroke-width=".03" />
          <ellipse cx="1.12" cy=".55" rx=".04" ry=".06" fill="#845022" stroke="none" />
        </g></Show>
      </g>
    </svg>
  );
}
