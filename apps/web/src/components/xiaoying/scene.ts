import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type PetMotion = 'idle' | 'hello' | 'joy' | 'sleep' | 'listen' | 'think' | 'speak';
export type PetRenderer = { play: (motion: PetMotion) => void; pause: (value: boolean) => void; dispose: () => void };
const clips: Record<PetMotion, string> = { idle: '01_Idle', hello: '02_Hello', joy: '07_Joy', sleep: '08_Sleep', listen: '03_Listen', think: '05_Think', speak: '03_Listen' };

/** Owns all GPU resources and listeners; React owns only the accessible controls. */
export function mountPet(host: HTMLElement, onReady: () => void, onError: () => void, onMotion: (motion: PetMotion) => void): PetRenderer {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-3, 3, 2.1, -2.1, .1, 50);
  camera.position.set(2.2, 2.8, 7);
  camera.lookAt(0, .5, 0);
  scene.add(new THREE.HemisphereLight(0xf2f5ff, 0xc1b6a5, 2.5));
  const light = new THREE.DirectionalLight(0xfff3dd, 3.5);
  light.position.set(-3, 6, 4); light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  Object.assign(light.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: .1, far: 20 });
  light.shadow.bias = -.001;
  light.shadow.radius = 3;
  scene.add(light);
  const rim = new THREE.DirectionalLight(0xc8dcff, 2);
  rim.position.set(3, 2, -3); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: .13 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.025; floor.receiveShadow = true; scene.add(floor);
  const pivot = new THREE.Group(); scene.add(pivot);
  const abort = new AbortController();
  let disposed = false;
  let model: THREE.Group | undefined;
  let mixer: THREE.AnimationMixer | undefined;
  let active: THREE.AnimationAction | undefined;
  const actions = new Map<string, THREE.AnimationAction>();
  let requested: PetMotion = 'idle';
  let userPaused = false;
  let inView = true;
  let raf = 0;
  let last = 0;
  let targetLook = 0;
  let pointerActive = false;
  let elapsed = 0;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  const render = () => renderer.render(scene, camera);
  const running = () => !disposed && !document.hidden && inView && !userPaused && !reduce.matches;
  function frame(now: number) {
    raf = 0;
    if (!running()) return;
    const dt = last ? Math.min((now - last) / 1000, .05) : 0;
    last = now;
    elapsed += dt;
    mixer?.update(dt);
    const sleeping = requested === 'sleep';
    const working = requested === 'think' || requested === 'speak' || requested === 'listen';
    const breath = sleeping ? 0 : 0.016 * Math.sin(elapsed * 1.35);
    const workBob = requested === 'speak' ? 0.045 * Math.sin(elapsed * 7)
      : requested === 'think' ? 0.038 * Math.sin(elapsed * 2.35)
      : requested === 'listen' ? 0.02 * Math.sin(elapsed * 1.6)
      : 0;
    pivot.position.y = breath + workBob;
    pivot.position.x = requested === 'think' ? 0.028 * Math.sin(elapsed * 1.7) : 0;
    pivot.rotation.z = requested === 'think' ? 0.04 * Math.sin(elapsed * 1.55)
      : requested === 'listen' ? 0.018 * Math.sin(elapsed * 0.9)
      : 0;
    const look = sleeping ? 0 : pointerActive ? targetLook : 0.34 * Math.sin(elapsed * 0.28);
    pivot.rotation.y += (look * (working ? 0.16 : 0.12) - pivot.rotation.y) * Math.min(dt * 5, 1);
    render();
    raf = requestAnimationFrame(frame);
  }
  function syncLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; last = 0;
    if (running()) raf = requestAnimationFrame(frame);
    else if (!disposed) render();
  }
  function play(motion: PetMotion) {
    requested = motion;
    pivot.rotation.z = 0;
    pivot.position.x = 0;
    const next = actions.get(clips[motion]);
    if (!next || !mixer) return;
    const old = active;
    const pace = motion === 'think' ? 1.12 : motion === 'listen' ? 0.92 : 1;
    next.reset().setEffectiveTimeScale(pace).setEffectiveWeight(1);
    next.setLoop(motion === 'hello' || motion === 'joy' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = true;
    next.play();
    if (old && old !== next) old.fadeOut(.25);
    next.fadeIn(.25); active = next;
    if (reduce.matches || userPaused) { next.time = motion === 'sleep' ? 3 : .8; mixer.update(.3); }
    onMotion(motion); syncLoop();
  }
  function finished(event: { action: THREE.AnimationAction }) {
    if (event.action === active && (requested === 'hello' || requested === 'joy')) play('idle');
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    const halfHeight = Math.max(1.9, 3.1 / (width / height));
    camera.left = -halfHeight * width / height; camera.right = -camera.left;
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
    if (model) render();
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  const intersection = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; syncLoop(); });
  intersection.observe(host);
  const pointer = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    pointerActive = true;
    const rect = host.getBoundingClientRect();
    targetLook = (event.clientX - rect.left) / rect.width * 2 - 1;
  };
  const leave = () => { pointerActive = false; };
  const contextLost = (event: Event) => { event.preventDefault(); dispose(); onError(); };
  host.addEventListener('pointermove', pointer); host.addEventListener('pointerleave', leave);
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  document.addEventListener('visibilitychange', syncLoop);
  reduce.addEventListener('change', syncLoop);

  function release(object: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    object.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    textures.forEach(texture => { texture.dispose(); const data = texture.source.data; if (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap) data.close(); });
    materials.forEach(material => material.dispose()); geometries.forEach(geometry => geometry.dispose());
  }
  async function load() {
    try {
      const response = await fetch('/xiaoying/xiaoying.glb', { signal: abort.signal });
      if (!response.ok) throw new Error('Pet asset unavailable');
      const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/xiaoying/');
      if (disposed) { release(gltf.scene); return; }
      model = gltf.scene;
      // Precise rest-pose bounds: conservative morph bounds include raised wings
      // and sleeping shapes, which otherwise shrink and float the character.
      const box = new THREE.Box3().setFromObject(model, true);
      const size = box.getSize(new THREE.Vector3()); const center = box.getCenter(new THREE.Vector3());
      const scale = 4.8 / size.x;
      model.scale.multiplyScalar(scale);
      model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      model.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; } });
      pivot.add(model);
      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach(clip => actions.set(clip.name, mixer!.clipAction(clip)));
      mixer.addEventListener('finished', finished);
      if (!renderer.domElement.isConnected) host.appendChild(renderer.domElement);
      resize(); play(requested); onReady();
    } catch (error) {
      if (!disposed) { dispose(); onError(); }
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true; abort.abort(); cancelAnimationFrame(raf);
    resizeObserver.disconnect(); intersection.disconnect();
    host.removeEventListener('pointermove', pointer); host.removeEventListener('pointerleave', leave);
    document.removeEventListener('visibilitychange', syncLoop); reduce.removeEventListener('change', syncLoop);
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    mixer?.removeEventListener('finished', finished); mixer?.stopAllAction();
    if (model) mixer?.uncacheRoot(model);
    release(scene); renderer.dispose(); renderer.domElement.remove();
  }
  void load();
  return { play, pause(value) { userPaused = value; syncLoop(); }, dispose };
}
