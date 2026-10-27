/* The sign-in page's animated road scene: the street grid, a scripted collision,
   a gold response route, and the attending vehicles. Ported from the standalone
   Road_Accident_Tracker_Sign_in.html mock, so the visuals are unchanged.

   Three.js comes from the CDN script in index.html rather than a dependency. If
   it is missing or WebGL is unavailable, the host gets the lgn-no3d class and the
   page's CSS road grid takes over.

   The scene is decoration: every position in it is simulated, not GPS data. */

export default function createLoginScene(host) {
  const vis = host;
  const fallback = () => vis.classList.add('lgn-no3d');
  if (!window.THREE) { fallback(); return { setTheme() {}, destroy() {} }; }

  // The canvas and the pin label are created here rather than in JSX so a React
  // remount always gets a fresh canvas: a WebGL context belongs to one element.
  const cv = document.createElement('canvas');
  cv.className = 'lgn-art lgn-fade';
  cv.setAttribute('aria-hidden', 'true');
  vis.prepend(cv);
  const pl = document.createElement('div');
  pl.className = 'lgn-plabel';
  pl.setAttribute('aria-hidden', 'true');
  pl.textContent = 'Sample incident';
  vis.prepend(pl);

  let isLt = document.documentElement.dataset.theme === 'light';
  const T = window.THREE;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = matchMedia('(max-width:900px)');
  let R;
  try { R = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch (e) { cv.remove(); pl.remove(); fallback(); return { setTheme() {}, destroy() {} }; }
  R.setPixelRatio(Math.min(devicePixelRatio || 1, narrow.matches ? 1.5 : 1.75));

  const disp = [];
  const G = (o) => { disp.push(o); return o; };
  const sc = new T.Scene();
  const fog = new T.Fog(0x121212, 430, 1080);
  let gm;
  sc.fog = fog;
  const cam = new T.PerspectiveCamera(36, 1, 10, 3000);
  const tgt = new T.Vector3(20, 0, -10);
  const amb = new T.AmbientLight(0x9a968a, 0.62);
  sc.add(amb);
  const d1 = new T.DirectionalLight(0xE9DDAA, 0.95);
  d1.position.set(-300, 420, 200);
  sc.add(d1);
  const d2 = new T.DirectionalLight(0xC9A45C, 0.3);
  d2.position.set(300, 200, -300);
  sc.add(d2);
  const carLight = new T.PointLight(0x4F80C8, 0, 95, 1.5);
  sc.add(carLight);
  const W = new T.Group();
  W.rotation.y = -0.55;
  sc.add(W);
  const N = 18, C = 52, o = N / 2, RW = 11, SW = 16, SPAN = N * C;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const sx = (i) => (i - o) * C;
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  const prog = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

  const ground = new T.Mesh(G(new T.PlaneGeometry(3200, 3200)), (gm = G(new T.MeshBasicMaterial({ color: 0x171715 }))));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  W.add(ground);

  /* ---- roads: one surface + one kerb strip per street line, all on the existing grid ---- */
  const pg = G(new T.PlaneGeometry(1, 1));
  pg.rotateX(-Math.PI / 2);
  const nR = (N + 1) * 2;
  const roads = new T.InstancedMesh(pg, G(new T.MeshBasicMaterial({ color: 0xffffff })), nR);
  const walks = new T.InstancedMesh(pg, G(new T.MeshBasicMaterial({ color: 0xffffff })), nR);
  const rd = [], ob = new T.Object3D();
  let i, j;
  for (i = 0; i <= N; i++) for (let k = 0; k < 2; k++) { /* k0: street along z, k1: along x */
    const c = sx(i), id = i * 2 + k;
    ob.position.set(k ? 0 : c, k ? 0.05 : 0.06, k ? c : 0);
    ob.scale.set(k ? SPAN : RW, 1, k ? RW : SPAN);
    ob.updateMatrix();
    roads.setMatrixAt(id, ob.matrix);
    ob.position.y = k ? 0.02 : 0.03;
    ob.scale.set(k ? SPAN : SW, 1, k ? SW : SPAN);
    ob.updateMatrix();
    walks.setMatrixAt(id, ob.matrix);
    rd.push({ id, d: Math.abs(c) });
  }
  W.add(walks);
  W.add(roads);
  const gcol = new T.Color(0x171715), rcol = new T.Color(0x211f1c), scol = new T.Color(0x34342f), col = new T.Color();

  /* lane dashes, kept clear of intersections */
  const dp = [];
  for (i = 0; i <= N; i++) for (let v = -SPAN / 2 + 11; v < SPAN / 2 - 5; v += 14) {
    const r = ((v % C) + C) % C;
    if (r < 9 || r > C - 9) continue;
    dp.push(sx(i), v, 0, v, sx(i), 1);
  }
  const dashes = new T.InstancedMesh(G(pg.clone()), G(new T.MeshBasicMaterial({ color: 0xC9A45C, transparent: true, opacity: 0, depthWrite: false, fog: true })), dp.length / 3);
  for (i = 0; i < dp.length / 3; i++) {
    const q = dp[i * 3 + 2];
    ob.position.set(dp[i * 3], 0.085, dp[i * 3 + 1]);
    ob.scale.set(q ? 5 : 0.7, 1, q ? 0.7 : 5);
    ob.updateMatrix();
    dashes.setMatrixAt(i, ob.matrix);
  }
  // For q=1 (street along x) the pair is (z,x), so the position is (x=v, z=sx).
  W.add(dashes);

  /* ---- where vehicles travel (buildings beside these stay low so the cars stay visible) ---- */
  const CORR = [[[104, 364], [104, 156], [0, 156], [0, 0], [52, 0]], [[-98, 0], [52, 0]], [[52, -150], [52, 0]], [[156, 150], [156, 0], [84, 0]]];
  const NL = [[[-364, 156], [-208, 156], [-208, 312], [-364, 312]], [[104, -156], [-156, -156], [-156, -260], [104, -260]], [[260, -52], [364, -52], [364, 156], [260, 156]], [[-208, 104], [-208, 0], [-312, 0], [-312, 104]]];
  function segD(px, pz, a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const u = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(px - a[0] - u * dx, pz - a[1] - u * dz);
  }
  function nearPoly(px, pz, L, closed) {
    const n = closed ? L.length : L.length - 1;
    for (let a = 0; a < n; a++) if (segD(px, pz, L[a], L[(a + 1) % L.length]) < 40) return true;
    return false;
  }
  function heightCap(px, pz) {
    for (let a = 0; a < CORR.length; a++) if (nearPoly(px, pz, CORR[a], false)) return 12;
    for (let a = 0; a < NL.length; a++) if (nearPoly(px, pz, NL[a], true)) return 20;
    return 999;
  }

  /* ---- buildings (instanced): window grid, floor ledges, roof edge, setbacks, rooftop units ---- */
  const items = [], ZN = { x0: 0, x1: 104, z0: -52, z1: 52 }, pal = [0x1f1f1d, 0x252523, 0x2a2a28, 0x31312e];
  for (i = 0; i < N; i++) for (j = 0; j < N; j++) {
    const cx = (i + 0.5 - o) * C, cz = (j + 0.5 - o) * C;
    if (cx > ZN.x0 && cx < ZN.x1 && cz > ZN.z0 && cz < ZN.z1) continue;
    if (rnd() < 0.07) continue;
    const dd = Math.sqrt(cx * cx + cz * cz);
    let h = 6 + rnd() * 18;
    if (dd < 300) h += (1 - dd / 300) * 80 * Math.pow(rnd(), 1.4);
    h = Math.min(h, heightCap(cx, cz));
    const w = C - 18 - rnd() * 8, dpt = C - 18 - rnd() * 8, px = cx + (rnd() - 0.5) * 4, pz = cz + (rnd() - 0.5) * 4, cc = pal[Math.min(3, Math.floor(h / 24))];
    items.push({ x: px, z: pz, w, d: dpt, h, dist: dd, c: cc, base: 0 });
    if (h > 38) {
      const th = h * 0.2 + 4;
      items.push({ x: px, z: pz, w: w * 0.62, d: dpt * 0.62, h: th, dist: dd, c: cc, base: h });
      if (h > 72) items.push({ x: px, z: pz, w: 1.4, d: 1.4, h: 14, dist: dd, c: 0x4a4a44, base: h + th });
    } else if (rnd() < 0.4) items.push({ x: px + (rnd() - 0.5) * w * 0.4, z: pz + (rnd() - 0.5) * dpt * 0.4, w: 7 + rnd() * 5, d: 7 + rnd() * 5, h: 2.2 + rnd() * 2.4, dist: dd, c: 0x3d3d38, base: h });
  }
  const box = G(new T.BoxGeometry(1, 1, 1));
  box.translate(0, 0.5, 0);
  const bmat = G(new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }));
  bmat.onBeforeCompile = (sh) => {
    const vars = 'varying vec3 vLoc;varying vec3 vSc;varying vec3 vIn;varying vec3 vNo;';
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + vars)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc=position;vNo=normal;\n#ifdef USE_INSTANCING\nvSc=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));vIn=instanceMatrix[3].xyz;\n#else\nvSc=vec3(1.);vIn=vec3(0.);\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + vars + 'float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float vh=vLoc.y*vSc.y;
      if(abs(vNo.y)<.5){
        bool fx=abs(vNo.x)>.5;
        float u=fx?vLoc.z*vSc.z:vLoc.x*vSc.x;
        float hw=(fx?vSc.z:vSc.x)*.5;
        float side=fx?sign(vNo.x)*2.:sign(vNo.z);
        vec2 cell=vec2(floor(u/6.),floor(vh/5.));
        vec2 f=vec2(fract(u/6.),fract(vh/5.));
        float win=step(.2,f.x)*step(f.x,.8)*step(.3,f.y)*step(f.y,.78)*step(5.,vh)*step(vh,vSc.y-3.)*step(3.,hw-abs(u))*step(7.,vSc.y);
        float hh=h21(cell+vIn.xz*.37+vec2(side*7.3,vIn.y*.13));
        float lit=step(.84,hh);
        diffuseColor.rgb*=mix(.72,1.,smoothstep(0.,34.,vh));
        diffuseColor.rgb*=1.+.22*step(f.y,.07)*step(5.,vh);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.34,win);
        totalEmissiveRadiance+=win*lit*vec3(.79,.62,.34)*.5;
      } else if(vNo.y>.5){
        vec2 e=.5-abs(vLoc.xz);
        float ed=min(e.x*vSc.x,e.y*vSc.z);
        diffuseColor.rgb*=ed<1.4?1.4:.8;
      }`);
  };
  const inst = new T.InstancedMesh(box, bmat, items.length);
  items.forEach((it, n) => { col.setHex(it.c); inst.setColorAt(n, col); });
  W.add(inst);
  const dm = new T.Object3D();

  /* ---- paths: straight street segments joined by rounded corners ---- */
  const RC = 12;
  const V3 = (p) => new T.Vector3(p[0], 0, p[1]);
  function cn(a, b, c) {
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    return { e: [b[0] - (b[0] - a[0]) / l1 * RC, b[1] - (b[1] - a[1]) / l1 * RC], x: [b[0] + (c[0] - b[0]) / l2 * RC, b[1] + (c[1] - b[1]) / l2 * RC] };
  }
  function openPath(P) {
    const cp = new T.CurvePath();
    let cur = P[0];
    for (let k = 1; k < P.length - 1; k++) {
      const q = cn(P[k - 1], P[k], P[k + 1]);
      cp.add(new T.LineCurve3(V3(cur), V3(q.e)));
      cp.add(new T.QuadraticBezierCurve3(V3(q.e), V3(P[k]), V3(q.x)));
      cur = q.x;
    }
    cp.add(new T.LineCurve3(V3(cur), V3(P[P.length - 1])));
    return cp;
  }
  function loopPath(P, k0) {
    const n = P.length, cp = new T.CurvePath();
    let cur = cn(P[(k0 - 1 + n) % n], P[k0], P[(k0 + 1) % n]).x;
    for (let m = 1; m <= n; m++) {
      const k = (k0 + m) % n, q = cn(P[(k - 1 + n) % n], P[k], P[(k + 1) % n]);
      cp.add(new T.LineCurve3(V3(cur), V3(q.e)));
      cp.add(new T.QuadraticBezierCurve3(V3(q.e), V3(P[k]), V3(q.x)));
      cur = q.x;
    }
    return cp;
  }
  function track(path, closed) {
    const n = 720, P = path.getSpacedPoints(n), X = [], Z = [], TX = [], TZ = [], m = closed ? n : n + 1;
    for (let a = 0; a < m; a++) {
      const p0 = P[closed ? (a - 1 + n) % n : Math.max(0, a - 1)], p1 = P[closed ? (a + 1) % n : Math.min(n, a + 1)];
      const dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.hypot(dx, dz) || 1;
      X.push(P[a].x); Z.push(P[a].z); TX.push(dx / l); TZ.push(dz / l);
    }
    return { L: path.getLength(), n, c: closed, X, Z, TX, TZ };
  }
  const pose = { x: 0, z: 0, h: 0 };
  function at(tr, s) {
    let u, a, f, b;
    if (tr.c) { u = (((s % tr.L) + tr.L) % tr.L) / tr.L * tr.n; a = Math.floor(u); b = (a + 1) % tr.n; }
    else { u = Math.min(1, Math.max(0, s / tr.L)) * tr.n; a = Math.min(tr.n - 1, Math.floor(u)); b = a + 1; }
    f = u - a;
    pose.x = tr.X[a] + (tr.X[b] - tr.X[a]) * f;
    pose.z = tr.Z[a] + (tr.Z[b] - tr.Z[a]) * f;
    pose.h = Math.atan2(-(tr.TZ[a] + (tr.TZ[b] - tr.TZ[a]) * f), tr.TX[a] + (tr.TX[b] - tr.TX[a]) * f);
  }

  /* ---- routes drawn as ribbons lying on the road ---- */
  function ribbon(path, wd, c, op, y) {
    const n = 260, P = path.getSpacedPoints(n), pos = new Float32Array((n + 1) * 6), ix = [];
    for (let a = 0; a <= n; a++) {
      const p0 = P[Math.max(0, a - 1)], p1 = P[Math.min(n, a + 1)];
      const dx = p1.x - p0.x, dz = p1.z - p0.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * wd / 2, nz = dx / l * wd / 2;
      pos.set([P[a].x + nx, y, P[a].z + nz, P[a].x - nx, y, P[a].z - nz], a * 6);
      if (a < n) { const s = a * 2; ix.push(s, s + 1, s + 2, s + 1, s + 3, s + 2); }
    }
    const g = G(new T.BufferGeometry());
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setIndex(ix);
    const m = new T.Mesh(g, G(new T.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, side: T.DoubleSide, depthWrite: false, fog: false })));
    m.userData.n = ix.length;
    g.setDrawRange(0, 0);
    m.renderOrder = 2;
    W.add(m);
    return m;
  }
  const drawTo = (m, p) => { m.geometry.setDrawRange(0, Math.floor(m.userData.n * p / 3) * 3); };
  const rp = [[104, 364 - RC], [104, 156], [0, 156], [0, 0], [40, 0]]; /* response route to the crash */
  const rpPath = openPath(rp), route = ribbon(rpPath, 2.6, 0x4F80C8, 1, 0.24), halo = ribbon(rpPath, 7, 0x4F80C8, 0.14, 0.18);
  const ambP = openPath([[156, 150], [156, 0], [84, 0]]), routeM = ribbon(ambP, 2.6, 0xC9544A, 1, 0.24), haloM = ribbon(ambP, 7, 0xC9544A, 0.14, 0.18);
  const sec = ribbon(openPath([[-468, -52], [-260, -52], [-260, -104], [468, -104]]), 1.6, 0xA09D94, 0.4, 0.2);

  /* ---- incident zone ---- */
  const V = (x, z) => new T.Vector3(x, 1.4, z);
  const shape = new T.Shape();
  shape.moveTo(ZN.x0, -ZN.z0); shape.lineTo(ZN.x1, -ZN.z0); shape.lineTo(ZN.x1, -ZN.z1); shape.lineTo(ZN.x0, -ZN.z1); shape.closePath();
  const zone = new T.Mesh(G(new T.ShapeGeometry(shape)), G(new T.MeshBasicMaterial({ color: 0xC9A45C, transparent: true, opacity: 0, side: T.DoubleSide, fog: false, depthWrite: false })));
  zone.rotation.x = -Math.PI / 2;
  zone.position.y = 0.7;
  W.add(zone);
  const zl = new T.LineLoop(G(new T.BufferGeometry().setFromPoints([V(0, -52), V(104, -52), V(104, 52), V(0, 52)])), G(new T.LineBasicMaterial({ color: 0xC9A45C, transparent: true, opacity: 0, fog: false })));
  zl.position.y = -0.6;
  W.add(zl);

  /* ---- pins: pin 0 is the sample incident ---- */
  function tex(k) {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 120;
    const x = c.getContext('2d');
    const cl = k === 'res' ? (isLt ? '#8A6420' : '#E9DDAA') : k === 'rep' ? '#C9A45C' : '#A09D94';
    x.beginPath(); x.moveTo(48, 116); x.bezierCurveTo(16, 88, 8, 64, 8, 44); x.arc(48, 44, 40, Math.PI, 0); x.bezierCurveTo(88, 64, 80, 88, 48, 116); x.closePath(); x.fillStyle = cl; x.fill();
    x.beginPath(); x.arc(48, 44, 22, 0, 7); x.fillStyle = '#121212'; x.fill(); x.fillStyle = cl; x.strokeStyle = cl; x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round';
    if (k === 'res') { x.beginPath(); x.arc(48, 44, 9, 0, 7); x.fill(); }
    else if (k === 'rep') { x.fillRect(45, 30, 6, 17); x.beginPath(); x.arc(48, 56, 3.6, 0, 7); x.fill(); }
    else { x.beginPath(); x.moveTo(38, 45); x.lineTo(45, 52); x.lineTo(59, 37); x.stroke(); }
    return G(new T.CanvasTexture(c));
  }
  const tx = { res: tex('res'), rep: tex('rep'), clr: tex('clr') }, pins = [];
  [{ x: 52, z: 0, k: 'res', s: 1.45 }].forEach((q) => {
    const s = q.s || 1, H = 24 * s + 6;
    const sp = new T.Sprite(G(new T.SpriteMaterial({ map: tx[q.k], transparent: true, opacity: 0, depthTest: false, fog: false })));
    sp.center.set(0.5, 0);
    sp.scale.set(30 * s, 37.5 * s, 1);
    sp.renderOrder = 10;
    sp.position.set(q.x, H, q.z);
    W.add(sp);
    const ln = new T.Line(G(new T.BufferGeometry().setFromPoints([new T.Vector3(q.x, 0.8, q.z), new T.Vector3(q.x, H, q.z)])), G(new T.LineBasicMaterial({ color: 0xC9A45C, transparent: true, opacity: 0, fog: false })));
    W.add(ln);
    const rg = new T.Mesh(G(new T.RingGeometry(5 * s, 6.6 * s, 40)), G(new T.MeshBasicMaterial({ color: q.k === 'clr' ? 0xA09D94 : 0xC9A45C, transparent: true, opacity: 0, fog: false, side: T.DoubleSide })));
    rg.rotation.x = -Math.PI / 2;
    rg.position.set(q.x, 1.2, q.z);
    W.add(rg);
    pins.push({ q, sp, ln, rg, H });
  });
  function setPin(n, a, b) {
    b = b === undefined ? a : b;
    n.sp.material.opacity = b;
    n.sp.position.y = n.H + (1 - a) * 28;
    n.ln.material.opacity = 0.5 * b;
    n.rg.material.opacity = 0.55 * b;
  }
  const pulse = new T.Mesh(G(new T.RingGeometry(9, 10.6, 48)), G(new T.MeshBasicMaterial({ color: 0xE9DDAA, transparent: true, opacity: 0, fog: false, side: T.DoubleSide })));
  pulse.rotation.x = -Math.PI / 2;
  pulse.position.set(50, 1.4, 0);
  W.add(pulse);

  /* ---- vehicles: low-poly, shared geometry ---- */
  const cgm = [G(new T.BoxGeometry(14, 2.4, 6.4)), G(new T.BoxGeometry(7, 2.2, 5.4)), G(new T.BoxGeometry(6.4, 0.4, 5.4)), G(new T.CylinderGeometry(1.2, 1.2, 1.1, 10)), G(new T.BoxGeometry(0.4, 0.8, 1.5))];
  cgm[3].rotateX(Math.PI / 2);
  const glass = G(new T.MeshStandardMaterial({ color: 0x0e0e0d, roughness: 0.4, metalness: 0.2 }));
  const tyre = G(new T.MeshStandardMaterial({ color: 0x0b0b0a, roughness: 1 }));
  const head = G(new T.MeshBasicMaterial({ color: 0xF2E8B8 }));
  const tail = G(new T.MeshBasicMaterial({ color: 0x8f4a42 }));
  function makeCar(body, emis) {
    const bm = G(new T.MeshStandardMaterial({ color: body, roughness: 0.55, metalness: 0.25, emissive: emis || 0, emissiveIntensity: emis ? 0.3 : 0 }));
    const g = new T.Group();
    let m;
    m = new T.Mesh(cgm[0], bm); m.position.y = 2.3; g.add(m);
    m = new T.Mesh(cgm[1], glass); m.position.set(-1.2, 4.5, 0); g.add(m);
    m = new T.Mesh(cgm[2], bm); m.position.set(-1.2, 5.75, 0); g.add(m);
    [[4.4, 3], [4.4, -3], [-4.4, 3], [-4.4, -3]].forEach((w) => { m = new T.Mesh(cgm[3], tyre); m.position.set(w[0], 1.2, w[1]); g.add(m); });
    [[7.1, 2.1, head], [7.1, -2.1, head], [-7.1, 2.1, tail], [-7.1, -2.1, tail]].forEach((l) => { m = new T.Mesh(cgm[4], l[2]); m.position.set(l[0], 2.5, l[1]); g.add(m); });
    g.rotation.order = 'YXZ';
    g.scale.setScalar(0.01);
    g.visible = false;
    W.add(g);
    return g;
  }
  /* emergency vehicles: police car + ambulance, with a soft alternating light bar */
  const lbg = G(new T.BoxGeometry(1.6, 0.6, 1.9));
  function lightBar(g, x, y) {
    const ma = G(new T.MeshBasicMaterial({ color: 0x000000, fog: false })), mb = G(new T.MeshBasicMaterial({ color: 0x000000, fog: false }));
    let m;
    m = new T.Mesh(lbg, ma); m.position.set(x, y, 1.1); g.add(m);
    m = new T.Mesh(lbg, mb); m.position.set(x, y, -1.1); g.add(m);
    g.userData.L = { a: ma, b: mb };
  }
  function makePolice() {
    const g = makeCar(0x1d2025, 0), dpaint = G(new T.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.5 }));
    let m;
    [3.3, -3.3].forEach((z) => { m = new T.Mesh(G(new T.BoxGeometry(4.2, 1.7, 0.14)), dpaint); m.position.set(0.4, 2.4, z); g.add(m); });
    lightBar(g, -1.2, 6.2);
    return g;
  }
  function makeAmb() {
    const g = new T.Group(), bm = G(new T.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.5, metalness: 0.15 })), rm = G(new T.MeshStandardMaterial({ color: 0xb5473f, roughness: 0.6 }));
    let m;
    m = new T.Mesh(G(new T.BoxGeometry(16, 4.4, 6.6)), bm); m.position.set(-1, 3.4, 0); g.add(m);
    m = new T.Mesh(G(new T.BoxGeometry(3.2, 2.2, 5.8)), glass); m.position.set(6.6, 4.5, 0); g.add(m);
    [3.36, -3.36].forEach((z) => { m = new T.Mesh(G(new T.BoxGeometry(14, 0.9, 0.12)), rm); m.position.set(-1, 3.1, z); g.add(m); });
    [[5, 3.1], [5, -3.1], [-5.5, 3.1], [-5.5, -3.1]].forEach((w) => { m = new T.Mesh(cgm[3], tyre); m.position.set(w[0], 1.2, w[1]); g.add(m); });
    [[7.1, 2.2], [7.1, -2.2]].forEach((l) => { m = new T.Mesh(cgm[4], head); m.position.set(l[0], 2.4, l[1]); g.add(m); });
    lightBar(g, 6.2, 6.0);
    g.rotation.order = 'YXZ';
    g.scale.setScalar(0.01);
    g.visible = false;
    W.add(g);
    return g;
  }
  function siren(g, on) {
    const L = g.userData.L, k = reduce ? 0.6 : (0.5 + 0.5 * Math.sin(clk * 9.4)), j = 1 - k, x = 0.2 + 0.8 * k, y = 0.2 + 0.8 * j;
    L.a.color.setRGB(0.78 * x * on, 0.2 * x * on, 0.18 * x * on);
    L.b.color.setRGB(0.2 * y * on, 0.4 * y * on, 0.82 * y * on);
  }
  /* quiet background traffic: closed loops that never cross each other or the incident */
  const cars = [];
  function addCar(P, body, v, frac, delay) {
    const tr = track(loopPath(P, 0), true);
    cars.push({ g: makeCar(body, 0), tr, v, s0: frac * tr.L, sz: 1.25, d: delay });
  }
  addCar(NL[0], 0x6b6962, 24, 0.1, 2.8);
  addCar(NL[1], 0x57554f, 28, 0.45, 3.1);
  addCar(NL[2], 0x7a776c, 22, 0.3, 3.4);
  addCar(NL[3], 0x4f4d48, 26, 0.6, 3.7);

  /* the scripted sample incident: two cars collide at the intersection, a response vehicle follows the gold route */
  const carA = makeCar(0x8a867a, 0), carB = makeCar(0x5a5750, 0), carR = makePolice(), carM = makeAmb();
  const trR = track(rpPath, false), sStop = trR.L - 30, trM = track(openPath([[156, 150], [156, 0], [84, 0]]), false);
  const glow = new T.Mesh(G(new T.CircleGeometry(15, 32)), G(new T.MeshBasicMaterial({ color: 0x4F80C8, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, fog: false })));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.3;
  W.add(glow);
  const dg = G(new T.BoxGeometry(1.5, 1.5, 1.5)), dmA = G(new T.MeshStandardMaterial({ color: 0x3a3935, roughness: 0.8 })), dmB = G(new T.MeshStandardMaterial({ color: 0xC9A45C, roughness: 0.5, emissive: 0xC9A45C, emissiveIntensity: 0.35 })), deb = [];
  for (i = 0; i < 9; i++) {
    const an = i / 9 * Math.PI * 2 + 0.4, spd = 18 + (i % 3) * 9, dbm = new T.Mesh(dg, i % 3 ? dmA : dmB);
    dbm.visible = false;
    W.add(dbm);
    deb.push({ m: dbm, vx: Math.cos(an) * spd, vz: Math.sin(an) * spd, vy: 22 + (i % 4) * 7 });
  }

  let D = 0, lite = false;
  const E0 = 2.4, PER = 32, CT = 3.4;
  let clk = reduce ? 99 : 0, introT = 99;
  const sm = (x) => x * x * (3 - 2 * x);
  const cyc = () => (reduce ? 20.5 : (clk < E0 ? -1 : (clk - E0) % PER));
  function placeCars(t) {
    for (let n = 0; n < cars.length; n++) {
      const c = cars[n], e = ease(prog(t, c.d, c.d + 0.9));
      c.g.visible = e > 0 && !(lite && n > 1);
      if (!c.g.visible) continue;
      at(c.tr, c.s0 + c.v * D);
      c.g.position.set(pose.x, 0.1, pose.z);
      c.g.rotation.y = pose.h;
      c.g.scale.setScalar(Math.max(0.01, c.sz * e));
    }
  }

  /* ---- frame ---- */
  const lv = new T.Vector3(), S0 = new T.Vector3(-120, 640, 800), F0 = new T.Vector3(0, 470, 520), P = new T.Vector3();
  let mult = 1;
  function intro(t) {
    introT = t;
    const p = ease(prog(t, 0, 3.8));
    P.lerpVectors(S0, F0, p).multiplyScalar(mult);
    cam.position.copy(P);
    cam.lookAt(tgt);
    cam.updateMatrixWorld();
    items.forEach((it, n) => {
      const e = ease(prog(t, 0.1 + it.dist / 800, 1.4 + it.dist / 800));
      dm.position.set(it.x, it.base * e, it.z);
      dm.scale.set(it.w, Math.max(0.01, it.h * e), it.d);
      dm.updateMatrix();
      inst.setMatrixAt(n, dm.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    rd.forEach((q) => {
      const e = ease(prog(t, 0.3 + q.d / 470 * 1.1, 1.3 + q.d / 470 * 1.1));
      col.copy(gcol).lerp(rcol, e); roads.setColorAt(q.id, col);
      col.copy(gcol).lerp(scol, e); walks.setColorAt(q.id, col);
    });
    roads.instanceColor.needsUpdate = true;
    walks.instanceColor.needsUpdate = true;
    dashes.material.opacity = 0.3 * ease(prog(t, 1.8, 3.2));
    drawTo(sec, ease(prog(t, 1.2, 3.0)));
    pins.forEach((n, k) => { if (k) setPin(n, ease(prog(t, n.q.d, n.q.d + 0.6))); });
  }
  function event(c) {
    const fo = 1 - ease(prog(c, 25, 26.4)), q = ease(prog(c, CT, CT + 0.9)), p = prog(c, 0.3, CT);
    let s;
    /* the two colliding cars */
    s = ease(prog(c, 0, 0.7)) * fo;
    carA.visible = s > 0.02;
    if (carA.visible) {
      carA.position.set(-98 + 137.3 * p - 2.5 * q, 0.1, 2 * q);
      carA.rotation.set(0, 0.42 * q, 0);
      carA.scale.setScalar(1.25 * s);
    }
    carB.visible = carA.visible;
    if (carB.visible) {
      carB.position.set(52 + 4 * q, 0.1, -150 + 145.25 * p - 3 * q);
      carB.rotation.set(0.06 * q, -Math.PI / 2 - 0.5 * q, 0);
      carB.scale.setScalar(1.25 * s);
    }
    /* a few fragments thrown out at impact */
    const td = c - CT;
    deb.forEach((d) => {
      const on = td > 0 && td < 1.2 && fo > 0.05;
      d.m.visible = on;
      if (on) {
        d.m.position.set(48 + d.vx * td, Math.max(0.4, 4 + d.vy * td - 45 * td * td), 1 + d.vz * td);
        d.m.scale.setScalar(Math.max(0.01, 1 - td / 1.2));
        d.m.rotation.set(td * 6, td * 4, 0);
      }
    });
    const pr = prog(c, CT, CT + 1.5);
    pulse.scale.setScalar(0.5 + pr * 2.4);
    pulse.material.opacity = pr > 0 && pr < 1 ? 0.7 * (1 - pr) * fo : 0;
    /* marker, zone and route appear after the crash */
    const a0 = ease(prog(c, CT + 0.5, CT + 1.1)) * fo;
    const bk = reduce ? 1 : 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((c - CT - 1.4) * 7));
    const bl = 1 - (1 - bk) * ease(prog(c, CT + 1.3, CT + 1.7));
    setPin(pins[0], a0, a0 * bl);
    const zz = ease(prog(c, CT + 0.8, CT + 1.6)) * fo;
    zone.material.opacity = 0.1 * zz;
    zl.material.opacity = 0.55 * zz;
    const rr = ease(prog(c, 4.6, 7.6)) * (1 - ease(prog(c, 25, 26.6)));
    drawTo(route, rr);
    drawTo(halo, rr);
    const ra = ease(prog(c, 6.2, 9.2)) * (1 - ease(prog(c, 25, 26.6)));
    drawTo(routeM, ra);
    drawTo(haloM, ra);
    /* response vehicle */
    s = ease(prog(c, 5, 5.7)) * fo;
    carR.visible = s > 0.02;
    at(trR, sStop * sm(prog(c, 5.2, 19.2)));
    if (carR.visible) {
      carR.position.set(pose.x, 0.1, pose.z);
      carR.rotation.set(0, pose.h, 0);
      carR.scale.setScalar(1.3 * s);
    }
    siren(carR, s > 0.02 ? 1 : 0);
    glow.position.set(pose.x, 0.3, pose.z);
    glow.material.opacity = 0.16 * s;
    carLight.position.set(pose.x, 12, pose.z);
    W.localToWorld(carLight.position);
    carLight.intensity = 1.2 * s;
    /* ambulance arrives from the east a little later */
    s = ease(prog(c, 6.8, 7.5)) * fo;
    carM.visible = s > 0.02;
    at(trM, trM.L * sm(prog(c, 7, 18)));
    if (carM.visible) {
      carM.position.set(pose.x, 0.1, pose.z);
      carM.rotation.set(0, pose.h, 0);
      carM.scale.setScalar(1.25 * s);
    }
    siren(carM, s > 0.02 ? 1 : 0);
    /* label follows the marker */
    const w = vis.clientWidth, h = vis.clientHeight;
    lv.set(52, pins[0].H + 40, 0);
    W.localToWorld(lv);
    lv.project(cam);
    pl.style.transform = 'translate(' + Math.round((lv.x * 0.5 + 0.5) * w + 26) + 'px,' + Math.round((-lv.y * 0.5 + 0.5) * h - 8) + 'px)';
    pl.style.opacity = ease(prog(c, CT + 1, CT + 1.5)) * fo;
  }
  const draw = () => { intro(introT); placeCars(clk); event(cyc()); R.render(sc, cam); };
  function size() {
    const w = vis.clientWidth, h = vis.clientHeight;
    if (!w || !h) return;
    lite = narrow.matches;
    R.setPixelRatio(Math.min(devicePixelRatio || 1, lite ? 1.5 : 1.75));
    R.setSize(w, h, false);
    cam.aspect = w / h;
    mult = Math.max(1, 1 / (w / h));
    cam.updateProjectionMatrix();
    draw();
  }
  /* light/dark palette for the scene; tonL maps the dark building tones to a warm light scale */
  function tonL(h) {
    const l = (((h >> 16) & 255) + ((h >> 8) & 255) + (h & 255)) / 765;
    const v = Math.max(0.5, 0.97 - 1.3 * l);
    return new T.Color(v, v * 0.985, v * 0.94);
  }
  function applyTheme(L, redraw) {
    isLt = L;
    fog.color.setHex(L ? 0xEEEBE3 : 0x121212);
    gm.color.setHex(L ? 0xE9E5DB : 0x171715);
    gcol.setHex(L ? 0xE9E5DB : 0x171715);
    rcol.setHex(L ? 0xC2BDAE : 0x211f1c);
    scol.setHex(L ? 0xF7F4EC : 0x34342f);
    amb.color.setHex(L ? 0xffffff : 0x9a968a);
    amb.intensity = 0.62;
    d1.color.setHex(L ? 0xFFF3D6 : 0xE9DDAA); d1.intensity = L ? 0.5 : 0.95;
    d2.intensity = L ? 0.15 : 0.3;
    dashes.material.color.setHex(L ? 0x7A5A1A : 0xC9A45C);
    pulse.material.color.setHex(L ? 0x8A6420 : 0xE9DDAA);
    items.forEach((it, n) => { if (L) col.copy(tonL(it.c)); else col.setHex(it.c); inst.setColorAt(n, col); });
    inst.instanceColor.needsUpdate = true;
    pins[0].sp.material.map = tex('res');
    pins[0].sp.material.needsUpdate = true;
    if (redraw) draw();
  }

  if (isLt) applyTheme(true, false);
  size();
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null;
  if (ro) ro.observe(vis); else addEventListener('resize', size);

  /* ---- loop: one rAF, paused when off screen, torn down on unmount ---- */
  let raf = 0, t0 = null, prev = 0, settled = false, io = null;
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (t0 === null) { t0 = ts; prev = ts; }
    const t = (ts - t0) / 1000, dt = Math.min(0.05, (ts - prev) / 1000);
    prev = ts;
    clk = t;
    D += ease(prog(t, 2.4, 4.4)) * dt;
    if (t < 5) intro(t); else if (!settled) { intro(99); settled = true; }
    placeCars(t);
    event(cyc());
    R.render(sc, cam);
  }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function start() { if (!raf && !reduce) { prev = performance.now(); raf = requestAnimationFrame(loop); } }
  function destroy() {
    stop();
    removeEventListener('pagehide', destroy);
    if (io) io.disconnect();
    if (ro) ro.disconnect(); else removeEventListener('resize', size);
    disp.forEach((d) => { d.dispose && d.dispose(); });
    inst.dispose();
    roads.dispose();
    walks.dispose();
    dashes.dispose();
    R.dispose();
    // A remount must start on a fresh canvas: a WebGL context cannot be
    // re-created on an element that already has one.
    cv.remove();
    pl.remove();
  }

  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); fallback(); });
  addEventListener('pagehide', destroy);
  if (reduce) { introT = 99; draw(); return { setTheme: applyTheme, destroy }; }
  introT = 0;
  draw();
  start();
  if (window.IntersectionObserver) {
    io = new IntersectionObserver((en) => { if (en[0].isIntersecting) start(); else stop(); });
    io.observe(vis);
  }
  return { setTheme: applyTheme, destroy };
}
