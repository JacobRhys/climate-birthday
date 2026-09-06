import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Climatology, Mapping } from './mapping';
import { fromDoy, MONTHS } from './mapping';

export type Marker = { city: Climatology; mapping: Mapping };

type Props = {
  markers: Marker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Element the connector line is drawn to (the readout card). */
  anchorRef: React.RefObject<HTMLElement | null>;
};

const R = 6;
// Minimum screen spacing before a label's text is hidden (label is ~90×26 px).
const LABEL_GAP_X = 96;
const LABEL_GAP_Y = 30;

// Lat/lon → point on a three.js SphereGeometry with default UVs (equirectangular map, lon 0 at −x).
function toVec(lat: number, lon: number, r = R) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

// Dot colour by how far the birthday has moved: green (0 days) → yellow
// (~15) → red-orange (30+). Extinct cities use the flashing red instead.
const SHIFT_STOPS: [number, [number, number, number]][] = [
  [0, [46, 204, 113]],
  [15, [241, 196, 15]],
  [30, [255, 79, 31]],
];
export function shiftColor(days: number): string {
  const d = Math.min(30, Math.abs(days));
  for (let i = 0; i < SHIFT_STOPS.length - 1; i++) {
    const [a, ca] = SHIFT_STOPS[i];
    const [b, cb] = SHIFT_STOPS[i + 1];
    if (d <= b) {
      const u = (d - a) / (b - a);
      const c = ca.map((v, k) => Math.round(v + (cb[k] - v) * u));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  const c = SHIFT_STOPS[SHIFT_STOPS.length - 1][1];
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function shortDate(doy: number) {
  const { month, day } = fromDoy(doy);
  return `${day} ${MONTHS[month].slice(0, 3)}`;
}

export default function Globe({ markers, selectedId, onSelect, anchorRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  // Set when the selection changes; the frame loop eases the camera round to face that city.
  const focusRef = useRef<string | null>(null);
  useEffect(() => {
    focusRef.current = selectedId;
  }, [selectedId]);

  // Scene lives for the component's lifetime; markers/labels are read from refs each frame.
  useEffect(() => {
    const host = hostRef.current!;
    const labelLayer = labelsRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    camera.position.set(0, 4, 25);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(6, 4, 8);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x6688ff, 0.5);
    rim.position.set(-5, -2, -4);
    scene.add(rim);

    const starGeom = new THREE.BufferGeometry();
    const starPos = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = 150 * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = 150 * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = 150 * Math.cos(phi);
    }
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeom, new THREE.PointsMaterial({ color: 0xffffff, size: 0.3 })));

    const texLoader = new THREE.TextureLoader();
    const earthTex = texLoader.load('/earth/earth_daymap.webp');
    earthTex.colorSpace = THREE.SRGBColorSpace;
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(R, 64, 48),
      new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.85, metalness: 0 }),
    );
    scene.add(earth);
    const cloudsTex = texLoader.load('/earth/earth_clouds.jpg');
    cloudsTex.colorSpace = THREE.SRGBColorSpace;
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.02, 64, 48),
      new THREE.MeshStandardMaterial({
        map: cloudsTex,
        alphaMap: cloudsTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.6,
      }),
    );
    scene.add(clouds);
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.05, 48, 32),
      new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vNormal;
          void main() {
            float rim = pow(1.0 - abs(vNormal.z), 3.0);
            gl_FragColor = vec4(0.35, 0.6, 1.0, rim * 0.55);
          }
        `,
      }),
    );
    scene.add(atmo);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 9;
    controls.maxDistance = 40;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
      focusRef.current = null;
    });

    // HTML labels, one per marker, positioned by projecting the city's 3D point each frame.
    const labelEls = new Map<string, HTMLButtonElement>();
    const positions = new Map<string, THREE.Vector3>();

    // Connector from the selected city to the readout card.
    const svgNS = 'http://www.w3.org/2000/svg';
    const connector = document.createElementNS(svgNS, 'svg');
    connector.setAttribute('class', 'globe-connector');
    const line = document.createElementNS(svgNS, 'line');
    const endDot = document.createElementNS(svgNS, 'circle');
    endDot.setAttribute('r', '3');
    connector.append(line, endDot);
    labelLayer.appendChild(connector);
    const ensureLabels = () => {
      for (const m of markersRef.current) {
        if (labelEls.has(m.city.id)) continue;
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'globe-label';
        el.addEventListener('click', () => onSelect(m.city.id));
        labelLayer.appendChild(el);
        labelEls.set(m.city.id, el);
        positions.set(m.city.id, toVec(m.city.lat, m.city.lon));
      }
    };

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const v = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    const cur = new THREE.Spherical();
    const want = new THREE.Spherical();
    let raf = 0;
    let lastSig = '';
    let lastT = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastT) / 1000);
      lastT = now;
      if (focusRef.current) {
        const p = positions.get(focusRef.current);
        if (p) {
          controls.autoRotate = false;
          // Ease the orbit's azimuth/polar angles toward the city (shortest way round),
          // so the camera swings across the surface rather than over a pole.
          cur.setFromVector3(camera.position);
          want.setFromVector3(p);
          // On wide screens the readout card sits on the right; park the city left of centre.
          if (host.clientWidth >= 768) want.theta += 0.55;
          let dTheta = want.theta - cur.theta;
          dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
          const dPhi = want.phi - cur.phi;
          if (Math.abs(dTheta) < 0.005 && Math.abs(dPhi) < 0.005) focusRef.current = null;
          const k = 1 - Math.exp(-6 * dt); // time-based ease, ~0.5 s
          cur.theta += dTheta * k;
          cur.phi += dPhi * k;
          camera.position.setFromSpherical(cur);
        }
      }
      controls.update();
      clouds.rotation.y += 0.0002;
      renderer.render(scene, camera);

      ensureLabels();
      const w = host.clientWidth;
      const h = host.clientHeight;
      camDir.copy(camera.position).normalize();
      // Rebuild label text only when the mapping set or selection changed.
      const sig = markersRef.current.map((m) => `${m.city.id}:${m.mapping.mapped}:${m.mapping.extinct}`).join('|') + selectedRef.current;
      if (sig !== lastSig) {
        lastSig = sig;
        for (const m of markersRef.current) {
          const el = labelEls.get(m.city.id)!;
          const extinct = m.mapping.extinct !== null;
          el.classList.toggle('is-extinct', extinct);
          el.classList.toggle('is-selected', m.city.id === selectedRef.current);
          el.style.setProperty('--dot', extinct ? '#ff2d2d' : shiftColor(m.mapping.shiftDays ?? 0));
          el.innerHTML = `<span class="dot"></span><span class="txt">${m.city.name}<br><b>${
            extinct ? 'gone' : shortDate(m.mapping.mapped!)
          }</b></span>`;
          el.setAttribute(
            'aria-label',
            `${m.city.name}: ${extinct ? 'this weather no longer occurs' : `climate birthday ${shortDate(m.mapping.mapped!)}`}`,
          );
        }
      }
      // Project every visible marker, then declutter: labels are placed in
      // priority order (selected first, then most face-on) and any label whose
      // screen position lands within LABEL_GAP px of an already-placed one keeps
      // its dot but hides its text. Zooming in spreads them out and the text
      // returns.
      const placed: { x: number; y: number }[] = [];
      const visible: { m: Marker; sx: number; sy: number; facing: number }[] = [];
      for (const m of markersRef.current) {
        const el = labelEls.get(m.city.id)!;
        const p = positions.get(m.city.id)!;
        const facing = p.clone().normalize().dot(camDir);
        if (facing < 0.12) {
          el.style.display = 'none';
          continue;
        }
        v.copy(p).project(camera);
        visible.push({ m, sx: (v.x * 0.5 + 0.5) * w, sy: (-v.y * 0.5 + 0.5) * h, facing });
      }
      visible.sort((a, b) => {
        const sa = a.m.city.id === selectedRef.current ? 1 : 0;
        const sb = b.m.city.id === selectedRef.current ? 1 : 0;
        return sb - sa || b.facing - a.facing;
      });
      for (const { m, sx, sy, facing } of visible) {
        const el = labelEls.get(m.city.id)!;
        let crowded = false;
        for (const q of placed) {
          if (Math.abs(q.x - sx) < LABEL_GAP_X && Math.abs(q.y - sy) < LABEL_GAP_Y) {
            crowded = true;
            break;
          }
        }
        if (!crowded) placed.push({ x: sx, y: sy });
        el.classList.toggle('is-crowded', crowded);
        el.style.display = '';
        el.style.transform = `translate(${sx}px, ${sy}px)`;
        el.style.opacity = String(0.35 + 0.65 * Math.min(1, (facing - 0.12) / 0.5));
      }

      // Connector line: selected city → nearest edge midpoint of the anchor card.
      const anchor = anchorRef.current;
      const sel = selectedRef.current;
      const selPos = sel ? positions.get(sel) : undefined;
      let show = false;
      if (anchor && selPos && selPos.clone().normalize().dot(camDir) > 0.12) {
        v.copy(selPos).project(camera);
        const x1 = (v.x * 0.5 + 0.5) * w;
        const y1 = (-v.y * 0.5 + 0.5) * h;
        const hr = host.getBoundingClientRect();
        const ar = anchor.getBoundingClientRect();
        const left = ar.left - hr.left;
        const top = ar.top - hr.top;
        let x2: number;
        let y2: number;
        if (left > x1) {
          x2 = left;
          y2 = top + ar.height / 2;
        } else if (top > y1) {
          x2 = left + ar.width / 2;
          y2 = top;
        } else {
          x2 = left + ar.width;
          y2 = top + ar.height / 2;
        }
        line.setAttribute('x1', x1.toFixed(1));
        line.setAttribute('y1', y1.toFixed(1));
        line.setAttribute('x2', x2.toFixed(1));
        line.setAttribute('y2', y2.toFixed(1));
        endDot.setAttribute('cx', x2.toFixed(1));
        endDot.setAttribute('cy', y2.toFixed(1));
        show = true;
      }
      connector.style.display = show ? '' : 'none';
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      labelLayer.replaceChildren();
    };
  }, [onSelect, anchorRef]);

  return (
    <div ref={hostRef} className="globe-host relative h-full w-full">
      <div ref={labelsRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
