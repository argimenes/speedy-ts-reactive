/** Supplied housing profile extends 8.2% of the short aperture edge on each side. */
export const screenHousingOutset = (width: number, height: number) =>
  Math.min(width, height) * 0.082;
