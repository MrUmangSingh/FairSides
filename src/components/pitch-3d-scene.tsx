"use client";

import { Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { formation } from "@/lib/domain/formation";
import { ovr } from "@/lib/domain/ratings";
import type { Player } from "@/lib/domain/types";
import { Pitch } from "./pitch";

/** Camera placement: azimuth and polar angle in radians, zoom as a distance multiplier. */
export interface View {
  az: number;
  pol: number;
  zoom: number;
}
export type ViewInput = View | ((aspect: number) => View);

export interface Pitch3DProps {
  a: Player[];
  b: Player[];
  /** Neutral player, shown on the centre spot. */
  joker?: Player | null;
  /** Subs wait along the near touchline. */
  subs?: Player[];
  label: string;
  view: ViewInput;
  /** Let the visitor drag to look around. */
  drag?: boolean;
  /** Lean the camera gently toward the pointer. */
  parallax?: boolean;
  /** Slide the picture inside the frame, as fractions of its width and height. */
  shift?: (aspect: number) => [number, number];
  className?: string;
}

// One unit is ten metres: a full-size 105 x 68 m pitch.
const L = 10.5;
const W = 6.8;
const MARGIN = 0.45;
const SLAB = 0.85;
const FOV = 30;
const BIB = { a: "#f5d547", b: "#ff5c9a", joker: "#7fd8ff", sub: "#93a4a8" } as const;

function speckle(g: CanvasRenderingContext2D, w: number, h: number, count: number, size: number) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
    g.fillRect(Math.random() * w, Math.random() * h, size, size * (1 + Math.random() * 2));
  }
}

function grassTexture() {
  const px = 190;
  const w = Math.round((L + MARGIN * 2) * px);
  const h = Math.round((W + MARGIN * 2) * px);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;

  const bands = 14;
  for (let i = 0; i < bands; i++) {
    g.fillStyle = i % 2 ? "#2a8f3f" : "#36a94c";
    g.fillRect((i * w) / bands, 0, w / bands + 1, h);
  }
  speckle(g, w, h, 26000, 2);

  const X = (u: number) => (u + L / 2 + MARGIN) * px;
  const Y = (v: number) => (v + W / 2 + MARGIN) * px;
  g.strokeStyle = "rgba(255,255,255,0.94)";
  g.fillStyle = "rgba(255,255,255,0.94)";
  g.lineWidth = 0.065 * px;

  g.strokeRect(X(-L / 2), Y(-W / 2), L * px, W * px);
  g.beginPath();
  g.moveTo(X(0), Y(-W / 2));
  g.lineTo(X(0), Y(W / 2));
  g.stroke();
  g.beginPath();
  g.arc(X(0), Y(0), 0.915 * px, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(X(0), Y(0), 0.07 * px, 0, Math.PI * 2);
  g.fill();

  for (const s of [-1, 1]) {
    const line = (s * L) / 2;
    const box = (depth: number, width: number) => {
      const x0 = Math.min(line, line - s * depth);
      g.strokeRect(X(x0), Y(-width / 2), depth * px, width * px);
    };
    box(1.65, 4.03);
    box(0.55, 1.83);
    const spot = line - s * 1.1;
    g.beginPath();
    g.arc(X(spot), Y(0), 0.06 * px, 0, Math.PI * 2);
    g.fill();
    // The "D": the part of the penalty arc outside the box.
    const open = Math.acos(0.55 / 0.915);
    const mid = s === 1 ? Math.PI : 0;
    g.beginPath();
    g.arc(X(spot), Y(0), 0.915 * px, mid - open, mid + open);
    g.stroke();
    for (const t of [-1, 1]) {
      const start = Math.atan2(-t, -s);
      g.beginPath();
      g.arc(X(line), Y((t * W) / 2), 0.16 * px, start - Math.PI / 4, start + Math.PI / 4);
      g.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function soilTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#6b4426");
  grad.addColorStop(1, "#23140a");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 128);
  speckle(g, 1024, 128, 5000, 3);
  g.fillStyle = "#2a8f3f";
  g.fillRect(0, 0, 1024, 12);
  g.fillStyle = "#1f6f30";
  for (let x = 0; x < 1024; x += 5) g.fillRect(x, 10, 3, 3 + Math.random() * 7);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function netTexture(rx: number, ry: number) {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.lineWidth = 2.5;
  g.strokeRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(70,240,160,0.75)");
  grad.addColorStop(0.45, "rgba(40,170,150,0.22)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function Ground() {
  const grass = useMemo(() => grassTexture(), []);
  const soil = useMemo(() => soilTexture(), []);
  const glow = useMemo(() => glowTexture(), []);
  return (
    <group>
      <mesh position={[0, -SLAB / 2, 0]} receiveShadow>
        <boxGeometry args={[L + MARGIN * 2, SLAB, W + MARGIN * 2]} />
        <meshStandardMaterial attach="material-0" map={soil} roughness={1} />
        <meshStandardMaterial attach="material-1" map={soil} roughness={1} />
        <meshStandardMaterial attach="material-2" map={grass} roughness={0.92} />
        <meshStandardMaterial attach="material-3" color="#1a0f08" roughness={1} />
        <meshStandardMaterial attach="material-4" map={soil} roughness={1} />
        <meshStandardMaterial attach="material-5" map={soil} roughness={1} />
      </mesh>
      <mesh position={[0, -SLAB - 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[26, 19]} />
        <meshBasicMaterial
          map={glow}
          transparent
          opacity={0.6}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

const GOAL = { width: 1.05, height: 0.38, depth: 0.32, post: 0.024 };

function Goal({ side }: { side: -1 | 1 }) {
  const back = useMemo(() => netTexture(14, 5), []);
  const top = useMemo(() => netTexture(14, 4), []);
  const flank = useMemo(() => netTexture(4, 5), []);
  const { width, height, depth, post } = GOAL;
  const net = { transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 } as const;
  return (
    <group position={[(side * L) / 2, 0, 0]} scale={[side, 1, 1]}>
      {[-1, 1].map((z) => (
        <mesh key={z} position={[0, height / 2, (z * width) / 2]} castShadow>
          <cylinderGeometry args={[post, post, height, 12]} />
          <meshStandardMaterial color="#ffffff" roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[post, post, width + post * 2, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[depth, height / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={back} {...net} />
      </mesh>
      <mesh position={[depth / 2, height, 0]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial map={top} {...net} />
      </mesh>
      {[-1, 1].map((z) => (
        <mesh key={z} position={[depth / 2, height / 2, (z * width) / 2]}>
          <planeGeometry args={[depth, height]} />
          <meshBasicMaterial map={flank} {...net} />
        </mesh>
      ))}
    </group>
  );
}

interface Placed {
  player: Player;
  team: keyof typeof BIB;
  keeper: boolean;
  x: number;
  z: number;
}

/** A name tag drawn to a texture, so it lives in the scene and hides behind nearer players. */
function labelTexture(rating: number, name: string, color: string) {
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const h = 64;
  const font = `600 30px ${family}`;
  g.font = font;
  const w = Math.ceil(8 + 58 + 12 + g.measureText(name).width + 24);
  c.width = w;
  c.height = h;
  g.fillStyle = "rgba(2,5,6,0.82)";
  g.beginPath();
  g.roundRect(1, 1, w - 2, h - 2, h / 2);
  g.fill();
  g.strokeStyle = "rgba(255,255,255,0.22)";
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(8, 9, 58, h - 18, (h - 18) / 2);
  g.fill();
  g.textBaseline = "middle";
  g.textAlign = "center";
  g.fillStyle = "#05090b";
  g.font = `800 30px ${family}`;
  g.fillText(String(rating), 37, h / 2 + 2);
  g.textAlign = "left";
  g.fillStyle = "#edf5f2";
  g.font = font;
  g.fillText(name, 78, h / 2 + 2);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, ratio: w / h };
}

function Label({ rating, name, color, y, size }: { rating: number; name: string; color: string; y: number; size: number }) {
  const { texture, ratio } = useMemo(() => labelTexture(rating, name, color), [rating, name, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  const height = 0.33 * size;
  return (
    <sprite position={[0, y, 0]} scale={[height * ratio, height, 1]} renderOrder={5}>
      <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

function Figure({ spot, size, still }: { spot: Placed; size: number; still: boolean }) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.MeshStandardMaterial>(null);
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  const [start] = useState<[number, number, number]>(() => [spot.x, 0, spot.z]);
  const [startColor] = useState(() => BIB[spot.team]);
  const goal = useMemo(() => new THREE.Color(BIB[spot.team]), [spot.team]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const k = still ? 1 : 1 - Math.exp(-4.2 * dt);
    g.position.x += (spot.x - g.position.x) * k;
    g.position.z += (spot.z - g.position.z) * k;
    const left = Math.hypot(spot.x - g.position.x, spot.z - g.position.z);
    g.position.y = Math.min(0.55, left * 0.2);
    const ck = still ? 1 : 1 - Math.exp(-6 * dt);
    body.current?.color.lerp(goal, ck);
    body.current?.emissive.lerp(goal, ck);
    ring.current?.color.lerp(goal, ck);
  });

  return (
    <group ref={group} position={start}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[0.2 * size, 0.26 * size, 40]} />
        <meshBasicMaterial ref={ring} color={startColor} toneMapped={false} transparent opacity={0.95} />
      </mesh>
      {spot.keeper ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[0.31 * size, 0.335 * size, 40]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} transparent opacity={0.9} />
        </mesh>
      ) : null}
      <group scale={size}>
        <mesh position={[0, 0.11, 0]} castShadow>
          <cylinderGeometry args={[0.085, 0.07, 0.22, 16]} />
          <meshStandardMaterial color="#0d1418" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.39, 0]} castShadow>
          <capsuleGeometry args={[0.118, 0.2, 6, 18]} />
          <meshStandardMaterial
            ref={body}
            color={startColor}
            emissive={startColor}
            emissiveIntensity={0.5}
            roughness={0.42}
          />
        </mesh>
        <mesh position={[0, 0.69, 0]} castShadow>
          <sphereGeometry args={[0.088, 20, 20]} />
          <meshStandardMaterial color="#eef2f4" roughness={0.35} />
        </mesh>
      </group>
      <Label rating={Math.round(ovr(spot.player))} name={spot.player.name} color={BIB[spot.team]} y={1.0 * size} size={size} />
    </group>
  );
}

function Rig({
  view,
  parallax,
  shift,
  offset,
  still,
}: {
  view: ViewInput;
  parallax: boolean;
  shift?: (aspect: number) => [number, number];
  offset: React.RefObject<{ az: number; pol: number }>;
  still: boolean;
}) {
  const cur = useRef<View | null>(null);
  const applied = useRef("");

  useFrame((state, dt) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const { width, height } = state.size;
    const aspect = width / height;
    const v = typeof view === "function" ? view(aspect) : view;
    const az = v.az + offset.current.az + (parallax ? state.pointer.x * 0.14 : 0);
    const pol = THREE.MathUtils.clamp(
      v.pol + offset.current.pol - (parallax ? state.pointer.y * 0.05 : 0),
      0.12,
      1.44,
    );
    if (!cur.current) cur.current = { az, pol, zoom: v.zoom };
    const c = cur.current;
    const k = still ? 1 : 1 - Math.exp(-3.4 * dt);
    c.az += (az - c.az) * k;
    c.pol += (pol - c.pol) * k;
    c.zoom += (v.zoom - c.zoom) * k;

    // Back off far enough for the whole slab to fit the frame at this angle.
    const hx = L / 2 + 0.9;
    const hz = W / 2 + 0.9;
    const halfW = Math.abs(Math.cos(c.az)) * hx + Math.abs(Math.sin(c.az)) * hz;
    const halfD = Math.abs(Math.sin(c.az)) * hx + Math.abs(Math.cos(c.az)) * hz;
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const dH = halfW / (t * aspect) + halfD * Math.sin(c.pol) * 0.7;
    const dV = (halfD * Math.cos(c.pol) + 1.3 * Math.sin(c.pol) + 0.3) / t + halfD * Math.sin(c.pol) * 0.5;
    const d = Math.max(dH, dV) * c.zoom;

    camera.position.set(
      d * Math.sin(c.pol) * Math.sin(c.az),
      d * Math.cos(c.pol),
      d * Math.sin(c.pol) * Math.cos(c.az),
    );
    camera.lookAt(0, 0.05, 0);

    const [sx, sy] = shift ? shift(aspect) : [0, 0];
    const key = `${width}|${height}|${sx}|${sy}`;
    if (key !== applied.current) {
      applied.current = key;
      if (sx === 0 && sy === 0) camera.clearViewOffset();
      else camera.setViewOffset(width, height, -sx * width, sy * height, width, height);
    }
  });
  return null;
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

const NO_SUBS: Player[] = [];

export default function Pitch3DScene({ a, b, joker = null, subs = NO_SUBS, label, view, drag = false, parallax = false, shift, className }: Pitch3DProps) {
  const [supported] = useState(hasWebGL);
  const [still] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [visible, setVisible] = useState(true);
  const wrap = useRef<HTMLDivElement>(null);
  const offset = useRef({ az: 0, pol: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // A new preset starts from its own angle, not from wherever the last drag ended.
  useEffect(() => {
    offset.current.az = 0;
    offset.current.pol = 0;
  }, [view]);

  const placed = useMemo<Placed[]>(() => {
    const depth = L / 2 - 0.8;
    const spread = W - 1.1;
    const side = (team: Player[], key: "a" | "b", s: -1 | 1) =>
      formation(team).map((spot) => ({
        player: spot.player,
        team: key,
        keeper: spot.keeper,
        x: s * (L / 2 - 0.38 - (spot.y / 100) * depth),
        z: -s * (spot.x / 100 - 0.5) * spread,
      }));
    const extras: Placed[] = subs.map((player, i) => ({
      player,
      team: "sub",
      keeper: false,
      x: (i - (subs.length - 1) / 2) * Math.min(1.1, (L - 2) / Math.max(1, subs.length)),
      z: W / 2 + 0.2,
    }));
    if (joker) extras.push({ player: joker, team: "joker", keeper: false, x: 0, z: 0 });
    return [...side(a, "a", -1), ...side(b, "b", 1), ...extras].sort((p, q) => (p.player.id < q.player.id ? -1 : 1));
  }, [a, b, joker, subs]);

  if (!supported) {
    return (
      <div className={`grid place-items-center p-4 ${className ?? ""}`}>
        <div className="h-full max-h-full" style={{ aspectRatio: "2 / 3" }}>
          <Pitch a={a} b={b} joker={joker} label={label} />
        </div>
      </div>
    );
  }

  const perSide = Math.max(a.length, b.length);
  const size = perSide <= 6 ? 1.2 : perSide <= 9 ? 1.02 : 0.88;

  return (
    <div
      ref={wrap}
      role="img"
      aria-label={label}
      className={className}
      style={drag ? { touchAction: "pan-y", cursor: "grab" } : undefined}
      onPointerDown={
        drag
          ? (e) => {
              dragging.current = { x: e.clientX, y: e.clientY };
            }
          : undefined
      }
      onPointerMove={
        drag
          ? (e) => {
              const from = dragging.current;
              if (!from) return;
              offset.current.az -= (e.clientX - from.x) * 0.006;
              if (e.pointerType === "mouse") offset.current.pol -= (e.clientY - from.y) * 0.004;
              dragging.current = { x: e.clientX, y: e.clientY };
            }
          : undefined
      }
      onPointerUp={() => (dragging.current = null)}
      onPointerLeave={() => (dragging.current = null)}
      onPointerCancel={() => (dragging.current = null)}
    >
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        frameloop={visible ? "always" : "never"}
        camera={{ fov: FOV, near: 0.1, far: 120, position: [0, 9, 14] }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={1.1} />
        <directionalLight
          position={[3.5, 9, 4.5]}
          intensity={2.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
          shadow-camera-near={0.5}
          shadow-camera-far={30}
        />
        <directionalLight position={[-6, 4, -5]} intensity={0.9} color="#8fd8ff" />
        <Ground />
        <Goal side={-1} />
        <Goal side={1} />
        {placed.map((spot) => (
          <Figure key={spot.player.id} spot={spot} size={spot.team === "sub" ? size * 0.82 : size} still={still} />
        ))}
        {still ? null : <Sparkles count={70} scale={[15, 4.5, 11]} position={[0, 2, 0]} size={2.2} speed={0.25} opacity={0.45} color="#bfffe2" />}
        <Rig view={view} parallax={parallax} shift={shift} offset={offset} still={still} />
      </Canvas>
    </div>
  );
}
