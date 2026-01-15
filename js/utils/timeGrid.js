export const TIME_GRID_STEP_MINUTES = 15;
export const MINUTES_IN_DAY = 24 * 60;

export function minutesToPixels(minutes, pxPerMinute) {
  return minutes * pxPerMinute;
}
