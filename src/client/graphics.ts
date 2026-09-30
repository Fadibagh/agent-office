// How hard the 3D office works the graphics card: sharpness, shadows and the cartoon outlines.
// ?gfx=high|medium|low picks one and it's kept for next time; left alone it starts high and steps
// down on its own when frames come too slowly (see frame in main.ts), before the 2D view is offered.

export type Quality = 'high' | 'medium' | 'low';

export interface Graphics {
  /** The most pixels drawn per CSS pixel: 2 is a Retina screen's full sharpness. */
  maxPixelRatio: number;
  /** The sun's shadow map, a side. */
  shadowSize: number;
  /** Shadows are drawn again every this many frames: people's shadows lag a little at 2 or 3. */
  shadowEvery: number;
  /** The ink lines round everything, which draw the whole scene a second time. */
  outlines: boolean;
}

export const GRAPHICS: Record<Quality, Graphics> = {
  high: { maxPixelRatio: 2, shadowSize: 2048, shadowEvery: 1, outlines: true },
  medium: { maxPixelRatio: 1.5, shadowSize: 2048, shadowEvery: 2, outlines: true },
  low: { maxPixelRatio: 1, shadowSize: 1024, shadowEvery: 3, outlines: false },
};

const KEY = 'agent-office.gfx';
const LEVELS: Quality[] = ['high', 'medium', 'low'];
const isQuality = (q: unknown): q is Quality => LEVELS.includes(q as Quality);

/** The quality asked for in the address (kept for next time), else the one kept, else high; and whether it was chosen. */
export function chosenQuality(): { quality: Quality; chosen: boolean } {
  const asked = new URLSearchParams(location.search).get('gfx');
  try {
    if (isQuality(asked)) localStorage.setItem(KEY, asked);
    else if (asked === 'auto') localStorage.removeItem(KEY);
    const kept = localStorage.getItem(KEY);
    if (isQuality(kept)) return { quality: kept, chosen: true };
  } catch {
    // storage blocked: only the address counts
    if (isQuality(asked)) return { quality: asked, chosen: true };
  }
  return { quality: 'high', chosen: false };
}

/** One step easier on the graphics card, or null at the bottom already. */
export function lower(q: Quality): Quality | null {
  return LEVELS[LEVELS.indexOf(q) + 1] ?? null;
}
