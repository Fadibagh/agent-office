import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GRAPHICS, ShadowWatch, SmallThings, lower } from '../src/client/graphics.js';

function room() {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight();
  sun.position.set(-8, 18, 10);
  scene.add(sun, sun.target);
  const box = (size: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshToonMaterial());
    m.castShadow = true;
    scene.add(m);
    return m;
  };
  const desk = box(1.5);
  const mug = box(0.1);
  mug.position.set(0.3, 0.8, 0);
  scene.updateMatrixWorld(true);
  const watch = new ShadowWatch();
  watch.drew(scene, sun);
  const moved = () => {
    scene.updateMatrixWorld(true);
    return watch.changed(scene, sun);
  };
  return { scene, sun, desk, mug, watch, moved };
}

test('nothing moved: the shadows stay as they were drawn', () => {
  assert.equal(room().moved(), false);
});

test('a desk moved a few centimeters, or turned a few degrees: the shadows are drawn again', () => {
  let r = room();
  r.desk.position.x += 0.03;
  assert.equal(r.moved(), true);
  r = room();
  r.desk.rotation.y += 0.05;
  assert.equal(r.moved(), true);
});

test('stirring a millimeter at a time only counts once it adds up to something you would see', () => {
  const r = room();
  for (let i = 0; i < 9; i++) {
    r.mug.position.y += 0.001;
    assert.equal(r.moved(), false);
  }
  r.mug.position.y += 0.003;
  assert.equal(r.moved(), true);
  r.watch.drew(r.scene, r.sun);
  assert.equal(r.moved(), false);
});

test('something appearing, going or hidden, or the sun moving, draws the shadows again', () => {
  let r = room();
  r.mug.visible = false;
  assert.equal(r.moved(), true);
  r = room();
  r.mug.castShadow = false;
  assert.equal(r.moved(), true);
  r = room();
  r.scene.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry()), { castShadow: true }));
  assert.equal(r.moved(), true);
  r = room();
  r.sun.position.x += 1;
  assert.equal(r.moved(), true);
});

test('a lower quality leaves small things without shadows or outlines, but never people', () => {
  const { scene, desk, mug } = room();
  const person = Object.assign(new THREE.Group(), { userData: { character: true } });
  const eye = Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.02)), { castShadow: true });
  person.add(eye);
  scene.add(person);
  const small = new SmallThings();
  assert.equal(small.scan(scene), true);
  assert.equal(small.scan(scene), false, 'only new things are looked at');
  small.apply(GRAPHICS.medium);
  assert.equal(mug.castShadow, false);
  assert.equal(mug.layers.mask, 2, 'on the layer the outline pass skips');
  assert.equal(desk.castShadow, true);
  assert.equal(desk.layers.mask, 1);
  assert.equal(eye.castShadow, true);
  assert.equal(eye.layers.mask, 1);
  small.apply(GRAPHICS.high);
  assert.equal(mug.castShadow, true, 'back as it was');
  assert.equal(mug.layers.mask, 1);
});

test('quality steps down high, medium, low, then no further', () => {
  assert.equal(lower('high'), 'medium');
  assert.equal(lower('medium'), 'low');
  assert.equal(lower('low'), null);
});
