// Three.js studio: lights, mannequin, the live cloth mesh, drawstrings, and drag-to-pull.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { makeFabricNormalMap, FABRIC_KINDS } from './fabric.js';

export class Studio {
  constructor(container) {
    this.container = container;
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    container.appendChild(renderer.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#e6e1d9');
    scene.fog = new THREE.Fog('#e6e1d9', 5, 11);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.3;

    const camera = (this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 30));
    camera.position.set(0.9, 1.45, 2.6);
    const controls = (this.controls = new OrbitControls(camera, renderer.domElement));
    controls.target.set(0, 1.18, 0);
    controls.enableDamping = true;
    controls.minDistance = 0.8;
    controls.maxDistance = 7;
    controls.maxPolarAngle = Math.PI * 0.55;
    controls.addEventListener('start', () => (this.goal = null)); // the user's orbit wins
    controls.update();

    const key = new THREE.DirectionalLight('#fff4e6', 3.2);
    key.position.set(2.2, 3.0, 1.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -1.8, right: 1.8, top: 1.8, bottom: -1.8, near: 0.5, far: 9 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.015;
    key.shadow.radius = 4;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#dfe8ff', 1.1);
    rim.position.set(-2, 2.2, -2.5);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight('#ffffff', '#a89a86', 0.35));

    const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshStandardMaterial({ color: '#d9d2c7', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    this.normalMaps = Object.fromEntries(FABRIC_KINDS.map((k) => [k, makeFabricNormalMap(k, renderer)]));
    this.material = new THREE.MeshPhysicalMaterial({
      color: '#ffffff', side: THREE.DoubleSide, vertexColors: true,
      roughness: 0.9, sheen: 1, sheenRoughness: 0.5,
    });
    this.ropeMaterial = new THREE.MeshStandardMaterial({ color: '#f1ece2', roughness: 0.8 });
    this.formMaterial = new THREE.MeshStandardMaterial({ color: '#b8a891', roughness: 0.75 });

    this.formGroup = new THREE.Group();
    scene.add(this.formGroup);

    this.raycaster = new THREE.Raycaster();
    this.dragPlane = new THREE.Plane();
    this.pointer = new THREE.Vector2();
    this.onGrab = null;
    this.bindPointer();

    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait screens: widen the view so the arms stay in frame.
    this.camera.fov = Math.min(58, 32 * Math.max(1, 0.85 / this.camera.aspect));
    this.camera.updateProjectionMatrix();
  }

  /** Glide the camera to frame a region: keeps the viewing direction, sets target height and distance. */
  focus(targetY, distance) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const target = new THREE.Vector3(0, targetY, 0);
    this.goal = { target, position: target.clone().add(dir.multiplyScalar(distance)) };
  }

  setBody(body) {
    for (const c of [...this.formGroup.children]) { c.traverse((o) => o.geometry?.dispose()); this.formGroup.remove(c); }
    for (const p of body.prims) this.formGroup.add(roundConeMesh(p, this.formMaterial));
  }

  setCloth(cloth, fabric, colorHex) {
    if (this.clothMesh) { this.scene.remove(this.clothMesh); this.clothMesh.geometry.dispose(); }
    for (const r of this.ropeMeshes || []) { this.scene.remove(r); r.geometry.dispose(); }
    this.cloth = cloth;
    const topo = cloth.topo;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(cloth.pos, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    const tile = fabric.look.tile;
    const uv = new Float32Array(topo.n * 2);
    for (let i = 0; i < topo.n; i++) { uv[2 * i] = topo.flat[2 * i] / tile; uv[2 * i + 1] = topo.flat[2 * i + 1] / tile; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const col = new Float32Array(topo.n * 3);
    for (let i = 0; i < topo.n; i++) col[3 * i] = col[3 * i + 1] = col[3 * i + 2] = topo.shade[i];
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(topo.tris, 1));
    geo.computeVertexNormals();

    const mat = this.material;
    mat.normalMap = this.normalMaps[fabric.key];
    mat.normalScale.setScalar(fabric.look.normalScale);
    mat.roughness = fabric.look.roughness;
    mat.sheen = fabric.look.sheen;
    mat.sheenRoughness = fabric.look.sheenRoughness;
    mat.needsUpdate = true;
    this.setColor(colorHex);

    const mesh = (this.clothMesh = new THREE.Mesh(geo, mat));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    this.ropeMeshes = topo.ropes.map(() => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), this.ropeMaterial);
      m.castShadow = true;
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    });
  }

  setColor(hex) {
    const c = new THREE.Color(hex);
    this.material.color.copy(c);
    this.material.sheenColor.copy(c).lerp(new THREE.Color('#ffffff'), 0.35);
    this.ropeMaterial.color.copy(c).lerp(new THREE.Color('#ffffff'), 0.15);
  }

  sync() {
    if (!this.cloth) return;
    this.posAttr.needsUpdate = true;
    this.clothMesh.geometry.computeVertexNormals();
    const { ropes, ropeMeta } = this.cloth.topo;
    ropes.forEach((ids, k) => {
      const pts = ids.map((i) => new THREE.Vector3().fromArray(this.cloth.pos, 3 * i));
      const old = this.ropeMeshes[k].geometry;
      this.ropeMeshes[k].geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, ropeMeta.radius, 8, false);
      old.dispose();
    });
  }

  render() {
    if (this.goal) {
      // Ease toward the goal, then hand control back to the user.
      this.controls.target.lerp(this.goal.target, 0.12);
      this.camera.position.lerp(this.goal.position, 0.12);
      if (this.camera.position.distanceTo(this.goal.position) < 0.005) this.goal = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  bindPointer() {
    const el = this.renderer.domElement;
    const setPointer = (e) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
    };
    el.addEventListener('pointerdown', (e) => {
      if (!this.clothMesh || e.button !== 0) return;
      setPointer(e);
      this.clothMesh.geometry.computeBoundingSphere();
      const hit = this.raycaster.intersectObject(this.clothMesh)[0];
      if (!hit) return;
      const { a, b, c } = hit.face;
      const pos = this.cloth.pos;
      let best = a, bestD = Infinity;
      for (const i of [a, b, c]) {
        const d = hit.point.distanceToSquared(new THREE.Vector3().fromArray(pos, 3 * i));
        if (d < bestD) { bestD = d; best = i; }
      }
      this.controls.enabled = false;
      this.dragPlane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()), hit.point);
      this.cloth.grab(best, hit.point.toArray());
      el.setPointerCapture(e.pointerId);
      el.classList.add('grabbing');
      this.onGrab?.(true);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.cloth || this.cloth.grabbed < 0) {
        if (!this.clothMesh) return;
        setPointer(e);
        el.classList.toggle('can-grab', !!this.raycaster.intersectObject(this.clothMesh)[0]);
        return;
      }
      setPointer(e);
      const p = this.raycaster.ray.intersectPlane(this.dragPlane, new THREE.Vector3());
      if (p) this.cloth.moveGrab(p.toArray());
    });
    const end = () => {
      if (!this.cloth || this.cloth.grabbed < 0) return;
      this.cloth.release();
      this.controls.enabled = true;
      el.classList.remove('grabbing');
      this.onGrab?.(false);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
}

/** Visible mesh for one SDF primitive: a lathed round-cone silhouette. */
function roundConeMesh(p, material) {
  const a = new THREE.Vector3(...p.a), b = new THREE.Vector3(...p.b);
  const len = a.distanceTo(b);
  const phi = Math.asin(Math.max(-1, Math.min(1, (p.ra - p.rb) / len)));
  const pts = [];
  const seg = 16;
  for (let k = 0; k <= seg; k++) {
    const t = -Math.PI / 2 + (k / seg) * (phi + Math.PI / 2);
    pts.push(new THREE.Vector2(p.ra * Math.cos(t), p.ra * Math.sin(t)));
  }
  for (let k = 0; k <= seg; k++) {
    const t = phi + (k / seg) * (Math.PI / 2 - phi);
    pts.push(new THREE.Vector2(Math.max(1e-4, p.rb * Math.cos(t)), len + p.rb * Math.sin(t)));
  }
  const geo = new THREE.LatheGeometry(pts, 48);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.scale.z = p.zs;
  g.add(mesh);
  return g;
}
