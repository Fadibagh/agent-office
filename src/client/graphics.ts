// How hard the 3D office works the graphics card: sharpness, shadows and the cartoon outlines.
// ?gfx=high|medium|low picks one and it's kept for next time; left alone it starts high and steps
// down on its own when frames come too slowly (see frame in main.ts), before the 2D view is offered.

import * as THREE from 'three';

export type Quality = 'high' | 'medium' | 'low';
/** What ⚙️ Settings offers: a quality kept for next time, or auto, which steps down by itself. */
export type QualityPick = Quality | 'auto';

export interface Graphics {
  /** The most pixels drawn per CSS pixel: 2 is a Retina screen's full sharpness. */
  maxPixelRatio: number;
  /** The sun's shadow map, a side. */
  shadowSize: number;
  /** Shadows are drawn again every this many frames: people's shadows lag a little at 2 or 3. */
  shadowEvery: number;
  /** The ink lines round everything, which draw the whole scene a second time. */
  outlines: boolean;
  /** Things smaller than this (meters across, about) cast no shadow: mugs, books, little plants. */
  shadowMinSize: number;
  /** Nor are things smaller than this outlined. */
  outlineMinSize: number;
}

export const GRAPHICS: Record<Quality, Graphics> = {
  high: { maxPixelRatio: 2, shadowSize: 2048, shadowEvery: 1, outlines: true, shadowMinSize: 0, outlineMinSize: 0 },
  medium: { maxPixelRatio: 1.5, shadowSize: 2048, shadowEvery: 2, outlines: true, shadowMinSize: 0.3, outlineMinSize: 0.25 },
  low: { maxPixelRatio: 1, shadowSize: 2048, shadowEvery: 3, outlines: false, shadowMinSize: 0.5, outlineMinSize: 0 },
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

/** Keeps a quality picked in ⚙️ Settings for next time; auto forgets it. */
export function keepQuality(pick: QualityPick) {
  try {
    if (pick === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pick);
  } catch {
    // storage blocked: it lasts until the page is reloaded
  }
}

/** One step easier on the graphics card, or null at the bottom already. */
export function lower(q: Quality): Quality | null {
  return LEVELS[LEVELS.indexOf(q) + 1] ?? null;
}

/** The layer small things go on when they aren't outlined: the camera sees it, the outline pass doesn't. */
export const NO_OUTLINE = 1;

/**
 * The small things in the scene (not people, workers or the dog, whose little parts are what make
 * them), found as the world's built and changes, so a lower quality can leave off their shadows and
 * outlines.
 */
export class SmallThings {
  private sizes = new WeakMap<THREE.Mesh, { size: number; cast: boolean }>();
  private small: THREE.Mesh[] = [];
  private sphere = new THREE.Sphere();

  /** Looks through `root` for small things not seen before; true if there were any. */
  scan(root: THREE.Object3D): boolean {
    let found = false;
    const visit = (o: THREE.Object3D) => {
      if (o.userData.character) return;
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !this.sizes.has(m)) {
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const size = this.sphere.copy(m.geometry.boundingSphere!).applyMatrix4(m.matrixWorld).radius * 2;
        this.sizes.set(m, { size, cast: m.castShadow });
        if (size < 0.5) {
          this.small.push(m);
          found = true;
        }
      }
      for (const c of o.children) visit(c);
    };
    root.updateMatrixWorld();
    visit(root);
    return found;
  }

  /** Their shadows and outlines as `gfx` has them. */
  apply(gfx: Graphics) {
    this.small = this.small.filter((m) => m.parent);
    for (const m of this.small) {
      const { size, cast } = this.sizes.get(m)!;
      m.castShadow = cast && size >= gfx.shadowMinSize;
      m.layers.set(size < gfx.outlineMinSize ? NO_OUTLINE : 0);
    }
  }
}

/**
 * Whether anything that casts a shadow has moved, come or gone since the shadows were last drawn (or
 * the sun has), by more than anyone would see in its shadow: most frames nothing has, the office stands
 * still, and the few things always stirring (someone breathing) only need drawing again once they've
 * stirred a little.
 */
export class ShadowWatch {
  /** Where each thing was when the shadows were last drawn: its world matrix, then what moves inside it. */
  private drawn = new Map<THREE.Object3D, Float64Array>();
  private seen = new Set<THREE.Object3D>();
  private sunAt = new Float64Array(32);

  /** Moved (a centimeter) or turned (about a degree) enough since the shadows were last drawn. */
  changed(scene: THREE.Object3D, sun: THREE.DirectionalLight): boolean {
    if (differs(this.sunAt, sun.matrixWorld.elements, 0) || differs(this.sunAt, sun.target.matrixWorld.elements, 16)) return true;
    let moved = false;
    let count = 0;
    scene.traverseVisible((o) => {
      if (moved) return;
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.castShadow) return;
      count++;
      const was = this.drawn.get(m);
      if (!was || differs(was, m.matrixWorld.elements, 0) || was[16] !== inner(m) || was[17] !== (m as THREE.InstancedMesh).count) moved = true;
    });
    return moved || count !== this.drawn.size;
  }

  /** The shadows were just drawn: this is where everything is in them. */
  drew(scene: THREE.Object3D, sun: THREE.DirectionalLight) {
    this.sunAt.set(sun.matrixWorld.elements, 0);
    this.sunAt.set(sun.target.matrixWorld.elements, 16);
    this.seen.clear();
    scene.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.castShadow) return;
      this.seen.add(m);
      let at = this.drawn.get(m);
      if (!at) this.drawn.set(m, (at = new Float64Array(18)));
      at.set(m.matrixWorld.elements, 0);
      at[16] = inner(m);
      at[17] = (m as THREE.InstancedMesh).count ?? 0;
    });
    for (const o of this.drawn.keys()) if (!this.seen.has(o)) this.drawn.delete(o);
  }
}

/** A version for what moves inside a mesh without it moving: its instances, or its vertices. */
function inner(m: THREE.Mesh): number {
  const inst = m as THREE.InstancedMesh;
  const pos = m.geometry.attributes.position;
  return (inst.isInstancedMesh ? inst.instanceMatrix.version * 1e6 : 0) + (pos && 'version' in pos ? pos.version : 0);
}

/** A world matrix at `at` in `was` is far enough from `now` to show in a shadow. */
function differs(was: Float64Array, now: ArrayLike<number>, at: number): boolean {
  for (let i = 0; i < 16; i++) {
    // The last column is where it is (meters); the rest how it's turned and sized.
    const d = Math.abs(was[at + i] - now[i]);
    if (d > (i >= 12 ? 0.01 : 0.02)) return true;
  }
  return false;
}
