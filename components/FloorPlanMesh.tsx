/**
 * FloorPlanMesh.tsx — Premium Isometric 3D Floor Plan Viewer
 * Redesigned to match luxury real estate dashboard reference.
 * Features: dark atmosphere, isometric view, furniture, overlay modes,
 * property stats, room highlighting, bottom navigation.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Line, Sphere, Cylinder } from "@react-three/drei";
import { useRef, useState, useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  Zap, Flame, Droplets, LayoutGrid, Image, Move3d, Map,
  BedDouble, Bath, Layers, ChevronRight
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "standard" | "electrical" | "gas" | "water";

interface Room {
  cx: number; cz: number; w: number; d: number; name: string;
  id?: string; type?: string;
}

interface Wall {
  centerX: number; centerZ: number; length: number;
  thickness: number; isHorizontal: boolean;
}

interface SceneData {
  sceneW?: number; sceneD?: number;
  walls?: Wall[]; doors?: any[]; windows?: any[];
  rooms?: Room[]; [key: string]: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRoomCategory(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("living") || n.includes("lounge")) return "living";
  if (n.includes("kitchen") || n.includes("cook")) return "kitchen";
  if (n.includes("bed") || n.includes("master") || n.includes("sleep")) return "bedroom";
  if (n.includes("bath") || n.includes("toilet") || n.includes("wc") || n.includes("wash")) return "bathroom";
  if (n.includes("dining") || n.includes("eat")) return "dining";
  if (n.includes("balcon") || n.includes("patio") || n.includes("terrace") || n.includes("porch")) return "balcony";
  if (n.includes("hall") || n.includes("entry") || n.includes("foyer") || n.includes("corridor")) return "hallway";
  if (n.includes("storage") || n.includes("util") || n.includes("laundry")) return "utility";
  return "other";
}

const ROOM_FLOOR_COLORS: Record<string, string> = {
  living: "#c9b49a",
  kitchen: "#d4c8ae",
  bedroom: "#bfb0a2",
  bathroom: "#9ab8c8",
  dining: "#c9b49a",
  balcony: "#a8b89c",
  hallway: "#c4bdb2",
  utility: "#b0b8b8",
  other: "#c4bdb2",
};

const ROOM_WALL_TINT: Record<string, string> = {
  living: "#f2ede4",
  kitchen: "#f4f0e6",
  bedroom: "#f0ebe2",
  bathroom: "#e8eff5",
  dining: "#f2ede4",
  balcony: "#e8f0e4",
  hallway: "#ede9e2",
  utility: "#e8ecec",
  other: "#ede9e2",
};

// ─── Furniture Sub-Components ─────────────────────────────────────────────────

function Box3({ pos, size, color, emissive = "#000000", emissiveIntensity = 0 }: {
  pos: [number, number, number]; size: [number, number, number];
  color: string; emissive?: string; emissiveIntensity?: number;
}) {
  return (
    <mesh position={pos} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={emissiveIntensity} roughness={0.7} metalness={0.05} />
    </mesh>
  );
}

function LivingRoomFurniture({ cx, cz, w, d }: { cx: number; cz: number; w: number; d: number }) {
  const sw = Math.min(w, d); // shorter dimension
  const scale = sw / 20;
  return (
    <group>
      {/* Sofa - L shaped */}
      <Box3 pos={[cx - w * 0.15, 0.6, cz + d * 0.2]} size={[w * 0.42, 1.0, d * 0.15]} color="#5a4e44" />
      <Box3 pos={[cx - w * 0.15, 0.6, cz + d * 0.27]} size={[w * 0.42, 1.0, d * 0.08]} color="#6b5c50" />
      <Box3 pos={[cx + w * 0.08, 0.6, cz + d * 0.23]} size={[w * 0.08, 1.0, d * 0.2]} color="#5a4e44" />
      {/* Coffee Table */}
      <Box3 pos={[cx - w * 0.15, 0.3, cz + d * 0.03]} size={[w * 0.22, 0.25, d * 0.15]} color="#3d2f22" />
      <Box3 pos={[cx - w * 0.15, 0.05, cz + d * 0.03]} size={[w * 0.18, 0.1, d * 0.11]} color="#2b2018" />
      {/* TV Stand */}
      <Box3 pos={[cx - w * 0.15, 0.2, cz - d * 0.28]} size={[w * 0.35, 0.3, d * 0.07]} color="#1e1a16" />
      <Box3 pos={[cx - w * 0.15, 0.9, cz - d * 0.28]} size={[w * 0.3, 0.8, 0.6]} color="#0d0d0d" emissive="#111111" emissiveIntensity={0.2} />
      {/* Side plant */}
      <mesh position={[cx + w * 0.3, 0.5, cz - d * 0.2]} castShadow>
        <cylinderGeometry args={[1.2, 1.5, 3, 8]} />
        <meshStandardMaterial color="#2a5a2a" roughness={0.9} />
      </mesh>
    </group>
  );
}

function BedroomFurniture({ cx, cz, w, d }: { cx: number; cz: number; w: number; d: number }) {
  return (
    <group>
      {/* Bed frame */}
      <Box3 pos={[cx, 0.3, cz + d * 0.1]} size={[w * 0.55, 0.55, d * 0.7]} color="#7a6a58" />
      {/* Mattress */}
      <Box3 pos={[cx, 0.6, cz + d * 0.1]} size={[w * 0.52, 0.15, d * 0.65]} color="#e8e0d5" />
      {/* Pillow x2 */}
      <Box3 pos={[cx - w * 0.1, 0.75, cz - d * 0.2]} size={[w * 0.18, 0.1, d * 0.15]} color="#ffffff" />
      <Box3 pos={[cx + w * 0.1, 0.75, cz - d * 0.2]} size={[w * 0.18, 0.1, d * 0.15]} color="#ffffff" />
      {/* Headboard */}
      <Box3 pos={[cx, 1.1, cz - d * 0.35]} size={[w * 0.55, 1.2, 0.8]} color="#5c4a38" />
      {/* Nightstand L */}
      <Box3 pos={[cx - w * 0.35, 0.45, cz - d * 0.18]} size={[w * 0.12, 0.8, d * 0.13]} color="#7a6a58" />
      {/* Nightstand R */}
      <Box3 pos={[cx + w * 0.35, 0.45, cz - d * 0.18]} size={[w * 0.12, 0.8, d * 0.13]} color="#7a6a58" />
      {/* Wardrobe */}
      <Box3 pos={[cx + w * 0.35, 1.2, cz + d * 0.2]} size={[w * 0.12, 2.3, d * 0.55]} color="#6b5840" />
    </group>
  );
}

function KitchenFurniture({ cx, cz, w, d }: { cx: number; cz: number; w: number; d: number }) {
  return (
    <group>
      {/* Lower counter - back wall */}
      <Box3 pos={[cx, 0.55, cz - d * 0.38]} size={[w * 0.85, 1.0, d * 0.15]} color="#2e2e2e" />
      {/* Counter top */}
      <Box3 pos={[cx, 1.05, cz - d * 0.38]} size={[w * 0.85, 0.08, d * 0.15]} color="#8a8a8a" />
      {/* Upper cabinets */}
      <Box3 pos={[cx, 2.1, cz - d * 0.38]} size={[w * 0.85, 0.7, d * 0.1]} color="#3a3a3a" />
      {/* Side counter */}
      <Box3 pos={[cx + w * 0.38, 0.55, cz - d * 0.08]} size={[d * 0.13, 1.0, d * 0.55]} color="#2e2e2e" />
      <Box3 pos={[cx + w * 0.38, 1.05, cz - d * 0.08]} size={[d * 0.13, 0.08, d * 0.55]} color="#8a8a8a" />
      {/* Stove indicator */}
      <Box3 pos={[cx - w * 0.08, 1.12, cz - d * 0.38]} size={[w * 0.25, 0.04, d * 0.12]} color="#1a1a1a" />
      {/* Fridge */}
      <Box3 pos={[cx - w * 0.4, 1.0, cz - d * 0.3]} size={[w * 0.1, 1.9, d * 0.13]} color="#c8c8c8" />
    </group>
  );
}

function DiningFurniture({ cx, cz, w, d }: { cx: number; cz: number; w: number; d: number }) {
  return (
    <group>
      {/* Table */}
      <Box3 pos={[cx, 0.7, cz]} size={[w * 0.5, 0.1, d * 0.55]} color="#2a1a0e" />
      <Box3 pos={[cx, 0.35, cz]} size={[w * 0.42, 0.6, d * 0.47]} color="#3d2910" />
      {/* Chairs - 4 sides */}
      {[[-0.32, 0], [0.32, 0], [0, -0.32], [0, 0.32]].map(([rx, rz], i) => (
        <group key={i} position={[cx + rx * w, 0, cz + rz * d]}>
          <Box3 pos={[0, 0.3, 0]} size={[w * 0.12, 0.55, d * 0.12]} color="#1c1008" />
          <Box3 pos={[0, 0.7, 0]} size={[w * 0.12, 0.06, d * 0.12]} color="#2a1a0e" />
          <Box3 pos={[0, 1.1, 0]} size={[w * 0.12, 0.6, 0.5]} color="#1c1008" />
        </group>
      ))}
      {/* Decorative centerpiece */}
      <mesh position={[cx, 0.85, cz]} castShadow>
        <cylinderGeometry args={[1.5, 1.5, 0.8, 12]} />
        <meshStandardMaterial color="#8b2020" emissive="#5a1010" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function BathroomFurniture({ cx, cz, w, d }: { cx: number; cz: number; w: number; d: number }) {
  return (
    <group>
      {/* Toilet */}
      <Box3 pos={[cx - w * 0.28, 0.3, cz - d * 0.3]} size={[w * 0.2, 0.55, d * 0.25]} color="#f0ede8" />
      <Box3 pos={[cx - w * 0.28, 0.58, cz - d * 0.38]} size={[w * 0.2, 0.12, d * 0.12]} color="#e8e4df" />
      {/* Sink / Vanity */}
      <Box3 pos={[cx + w * 0.25, 0.5, cz - d * 0.35]} size={[w * 0.25, 0.85, d * 0.15]} color="#ddd9d0" />
      <Box3 pos={[cx + w * 0.25, 0.88, cz - d * 0.35]} size={[w * 0.25, 0.05, d * 0.15]} color="#c8c4bc" />
      {/* Shower / Bathtub */}
      <Box3 pos={[cx - w * 0.05, 0.1, cz + d * 0.25]} size={[w * 0.5, 0.2, d * 0.4]} color="#e0dcd6" />
      <Box3 pos={[cx - w * 0.05, 0.5, cz + d * 0.25]} size={[w * 0.5, 0.6, 0.5]} color="rgba(150,190,220,0.3)" />
    </group>
  );
}

function BalconyFurniture({ cx, cz, w, d }: { cx: number; cz: number; w: number; d: number }) {
  return (
    <group>
      {/* Small outdoor table */}
      <Box3 pos={[cx, 0.45, cz]} size={[w * 0.22, 0.08, d * 0.22]} color="#a08060" />
      <Box3 pos={[cx, 0.22, cz]} size={[w * 0.18, 0.4, d * 0.18]} color="#886640" />
      {/* 2 chairs */}
      <Box3 pos={[cx - w * 0.22, 0.25, cz]} size={[w * 0.12, 0.45, d * 0.12]} color="#7a5a30" />
      <Box3 pos={[cx + w * 0.22, 0.25, cz]} size={[w * 0.12, 0.45, d * 0.12]} color="#7a5a30" />
      {/* Plant */}
      <mesh position={[cx + w * 0.3, 0.8, cz + d * 0.3]} castShadow>
        <sphereGeometry args={[2.5, 8, 6]} />
        <meshStandardMaterial color="#2d6a2d" roughness={1} />
      </mesh>
      <mesh position={[cx + w * 0.3, 0.2, cz + d * 0.3]} castShadow>
        <cylinderGeometry args={[1.5, 2, 2.5, 8]} />
        <meshStandardMaterial color="#8b4513" roughness={0.9} />
      </mesh>
    </group>
  );
}

function RoomFurniture({ room }: { room: Room }) {
  const cat = getRoomCategory(room.name);
  const props = { cx: room.cx, cz: room.cz, w: room.w, d: room.d };
  if (cat === "living") return <LivingRoomFurniture {...props} />;
  if (cat === "bedroom") return <BedroomFurniture {...props} />;
  if (cat === "kitchen") return <KitchenFurniture {...props} />;
  if (cat === "dining") return <DiningFurniture {...props} />;
  if (cat === "bathroom") return <BathroomFurniture {...props} />;
  if (cat === "balcony") return <BalconyFurniture {...props} />;
  return null;
}

// ─── Ceiling Light ────────────────────────────────────────────────────────────

function CeilingLight({ cx, cz, show }: { cx: number; cz: number; show: boolean }) {
  return (
    <group>
      <pointLight position={[cx, 2.8, cz]} intensity={show ? 30 : 8} distance={40} color="#ffe8c0" decay={2} />
      {show && (
        <mesh position={[cx, 2.75, cz]}>
          <sphereGeometry args={[1.0, 12, 10]} />
          <meshStandardMaterial color="#fffaee" emissive="#ffe090" emissiveIntensity={3} />
        </mesh>
      )}
    </group>
  );
}

// ─── Electrical Overlay ───────────────────────────────────────────────────────

function ElectricalOverlay({ rooms, TW, TD }: { rooms: Room[]; TW: number; TD: number }) {
  if (!rooms.length) return null;
  const H = 2.85;
  const segments: Array<[THREE.Vector3, THREE.Vector3]> = [];

  // Connect each room to the next in a circuit pattern
  for (let i = 0; i < rooms.length; i++) {
    const a = rooms[i];
    const b = rooms[(i + 1) % rooms.length];
    segments.push([
      new THREE.Vector3(a.cx, H, a.cz),
      new THREE.Vector3(b.cx, H, b.cz),
    ]);
    // Add L-shaped routing
    segments.push([
      new THREE.Vector3(a.cx, H, a.cz),
      new THREE.Vector3(a.cx, H, a.cz - a.d * 0.4),
    ]);
    segments.push([
      new THREE.Vector3(a.cx, H, a.cz - a.d * 0.4),
      new THREE.Vector3(a.cx + a.w * 0.4, H, a.cz - a.d * 0.4),
    ]);
  }

  return (
    <group>
      {segments.map((seg, i) => (
        <Line key={i} points={seg} color="#00ffb8" lineWidth={1.5} transparent opacity={0.75} />
      ))}
      {rooms.map((r, i) => (
        <group key={i}>
          <mesh position={[r.cx, H, r.cz]}>
            <sphereGeometry args={[1.2, 12, 10]} />
            <meshStandardMaterial color="#00ffb8" emissive="#00ffb8" emissiveIntensity={2} transparent opacity={0.9} />
          </mesh>
          <pointLight position={[r.cx, H, r.cz]} intensity={3} distance={15} color="#00ffb8" decay={2} />
        </group>
      ))}
    </group>
  );
}

// ─── Gas / Water Overlay ──────────────────────────────────────────────────────

function PipeOverlay({ rooms, color, targets }: {
  rooms: Room[]; color: string; targets: string[];
}) {
  const relevant = rooms.filter(r => targets.some(t => getRoomCategory(r.name) === t));
  const H = 0.15;

  return (
    <group>
      {relevant.map((r, i) => {
        const next = relevant[(i + 1) % relevant.length];
        return (
          <group key={i}>
            <Line
              points={[new THREE.Vector3(r.cx, H, r.cz), new THREE.Vector3(next.cx, H, next.cz)]}
              color={color} lineWidth={2} transparent opacity={0.8}
            />
            <mesh position={[r.cx, H + 0.5, r.cz]}>
              <sphereGeometry args={[1.3, 10, 8]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} transparent opacity={0.85} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ─── 3D Scene ─────────────────────────────────────────────────────────────────

function IsoCameraRig({ TW, TD }: { TW: number; TD: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const cx = TW / 2, cz = TD / 2;
    const d = Math.max(TW, TD) * 1.05;
    camera.position.set(cx + d * 0.72, d * 0.75, cz + d * 0.72);
    camera.lookAt(cx, 0, cz);
    camera.updateProjectionMatrix();
  }, [TW, TD]);
  return null;
}

function Scene({
  data, viewMode, activeRoom, onRoomClick
}: {
  data: SceneData; viewMode: ViewMode; activeRoom: string | null;
  onRoomClick: (name: string) => void;
}) {
  const TW = data.sceneW || 100;
  const TD = data.sceneD || 100;
  const rooms = (data.rooms || []) as Room[];
  const walls = (data.walls || []) as Wall[];

  return (
    <>
      <IsoCameraRig TW={TW} TD={TD} />

      {/* Base floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[TW / 2, -0.08, TD / 2]} receiveShadow>
        <planeGeometry args={[TW + 30, TD + 30]} />
        <meshStandardMaterial color="#0d0f24" roughness={1} />
      </mesh>

      <group position={[0, 0, 0]}>
        {/* ── ROOM FLOORS ── */}
        {rooms.map((room, i) => {
          const cat = getRoomCategory(room.name);
          const floorColor = ROOM_FLOOR_COLORS[cat] || "#c4bdb2";
          const isActive = activeRoom === room.name;
          return (
            <group key={`room-${i}`}>
              {/* Floor tile */}
              <mesh
                position={[room.cx, 0.01, room.cz]}
                receiveShadow
                onClick={() => onRoomClick(room.name)}
              >
                <boxGeometry args={[room.w - 0.8, 0.12, room.d - 0.8]} />
                <meshStandardMaterial
                  color={isActive ? "#f0d080" : floorColor}
                  roughness={0.6}
                  metalness={0.02}
                />
              </mesh>
              {/* Room label */}
              {room.w > 8 && room.d > 8 && (
                <Text
                  position={[room.cx, 0.15, room.cz]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  fontSize={Math.min(room.w, room.d) * 0.08}
                  color="#3a2e22"
                  anchorX="center"
                  anchorY="middle"
                >
                  {room.name}
                </Text>
              )}
              {/* Ceiling light */}
              {viewMode !== "gas" && viewMode !== "water" && (
                <CeilingLight cx={room.cx} cz={room.cz} show={viewMode === "electrical"} />
              )}
              {/* Furniture (standard mode) */}
              {viewMode === "standard" && <RoomFurniture room={room} />}
            </group>
          );
        })}

        {/* ── WALLS ── */}
        {walls.map((wall, i) => {
          const w = wall.isHorizontal ? wall.length : wall.thickness;
          const d = wall.isHorizontal ? wall.thickness : wall.length;
          const h = 3.0;
          return (
            <mesh key={`wall-${i}`} position={[wall.centerX, h / 2, wall.centerZ]} castShadow receiveShadow>
              <boxGeometry args={[w, h, d]} />
              <meshStandardMaterial color="#f0ebe0" roughness={0.4} metalness={0.0} />
            </mesh>
          );
        })}

        {/* ── OVERLAYS ── */}
        {viewMode === "electrical" && (
          <ElectricalOverlay rooms={rooms} TW={TW} TD={TD} />
        )}
        {viewMode === "gas" && (
          <PipeOverlay rooms={rooms} color="#f5a623" targets={["kitchen", "bathroom"]} />
        )}
        {viewMode === "water" && (
          <PipeOverlay rooms={rooms} color="#4a9eff" targets={["kitchen", "bathroom", "utility"]} />
        )}
      </group>

      {/* Ambient + directional */}
      <ambientLight intensity={viewMode === "standard" ? 0.45 : 0.3} color="#ffe8d6" />
      <directionalLight
        position={[TW * 0.6, TW * 1.2, TD * 0.2]}
        intensity={1.6}
        color="#fff5e8"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-TW * 0.4, TW * 0.8, TD * 0.8]} intensity={0.5} color="#c8d8f0" />

      <OrbitControls
        enablePan={true}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={30}
        maxDistance={300}
        target={[TW / 2, 0, TD / 2]}
      />
    </>
  );
}

// ─── Mini Blueprint Overlay ───────────────────────────────────────────────────

function MiniBlueprintSVG({ data }: { data: SceneData }) {
  const W = 90, H = 70;
  const TW = data.sceneW || 100;
  const TD = data.sceneD || 100;
  const rooms = (data.rooms || []) as Room[];

  return (
    <svg viewBox={`0 0 ${TW} ${TD}`} width={W} height={H} style={{ display: "block" }}>
      <rect width={TW} height={TD} fill="#0d1020" />
      {rooms.map((r, i) => (
        <rect key={i}
          x={r.cx - r.w / 2} y={r.cz - r.d / 2} width={r.w} height={r.d}
          fill="none" stroke="#4a7bff" strokeWidth="1.5" opacity="0.8"
        />
      ))}
      {(data.walls || []).map((wall: Wall, i: number) => {
        const x = wall.centerX - (wall.isHorizontal ? wall.length / 2 : wall.thickness / 2);
        const y = wall.centerZ - (wall.isHorizontal ? wall.thickness / 2 : wall.length / 2);
        const w = wall.isHorizontal ? wall.length : wall.thickness;
        const h = wall.isHorizontal ? wall.thickness : wall.length;
        return <rect key={i} x={x} y={y} width={w} height={h} fill="#7a9aff" opacity="0.6" />;
      })}
    </svg>
  );
}

// ─── Room Stats (bottom-left) ─────────────────────────────────────────────────

function RoomStats({ rooms }: { rooms: Room[] }) {
  const beds = rooms.filter(r => getRoomCategory(r.name) === "bedroom").length;
  const baths = rooms.filter(r => getRoomCategory(r.name) === "bathroom").length;
  const floors = 1;

  return (
    <div className="floorplan-stats">
      <div className="floorplan-stat">
        <BedDouble size={14} />
        <span>{beds || 2}</span>
      </div>
      <div className="floorplan-stat">
        <Bath size={14} />
        <span>{baths || 2}</span>
      </div>
      <div className="floorplan-stat">
        <Layers size={14} />
        <span>{floors}</span>
      </div>
    </div>
  );
}

// ─── Utility Info (top-left when in overlay mode) ─────────────────────────────

const UTILITY_INFO: Record<string, { label: string; value: string; sub?: string }> = {
  electrical: { label: "Monthly average usage", value: "920.33 kWh" },
  gas: {
    label: "Annual gas utility costs",
    value: "$1,200 / 2000 m³",
    sub: "Safety Features: Built-in gas detectors",
  },
  water: {
    label: "Annual water usage",
    value: "29,200 – 36,500 gal./resident",
    sub: "Floor heating: 3 rooms",
  },
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FloorPlanMesh({
  data, projectName
}: { data: any; projectName?: string }) {
  const [viewMode, setViewMode] = useState<ViewMode>("standard");
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"map" | "room" | "gallery">("map");

  const rooms = ((data?.rooms || []) as Room[]);
  const info = UTILITY_INFO[viewMode];

  return (
    <div className="floorplan-scene">
      {/* ── Top-left utility info ── */}
      {viewMode !== "standard" && info && (
        <div className="floorplan-utility-info">
          <p className="floorplan-utility-label">{info.label}</p>
          <p className="floorplan-utility-value">{info.value}</p>
          {info.sub && <p className="floorplan-utility-sub">{info.sub}</p>}
        </div>
      )}

      {/* ── Top-right mini blueprint ── */}
      <div className="floorplan-minimap">
        <MiniBlueprintSVG data={data} />
      </div>

      {/* ── View Mode Selector ── */}
      <div className="floorplan-modes">
        {(["standard", "electrical", "gas", "water"] as ViewMode[]).map((mode) => {
          const icons: Record<ViewMode, JSX.Element> = {
            standard: <LayoutGrid size={14} />,
            electrical: <Zap size={14} />,
            gas: <Flame size={14} />,
            water: <Droplets size={14} />,
          };
          return (
            <button
              key={mode}
              className={`floorplan-mode-btn ${viewMode === mode ? "floorplan-mode-btn--active" : ""}`}
              onClick={() => setViewMode(mode)}
              title={mode.charAt(0).toUpperCase() + mode.slice(1)}
            >
              {icons[mode]}
            </button>
          );
        })}
      </div>

      {/* ── 3D Canvas ── */}
      <Canvas
        shadows
        camera={{ position: [80, 80, 80], fov: 45 }}
        style={{ width: "100%", height: "100%" }}
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
      >
        <color attach="background" args={["#131628"]} />
        <fog attach="fog" args={["#131628", 200, 500]} />
        <Scene
          data={data}
          viewMode={viewMode}
          activeRoom={activeRoom}
          onRoomClick={setActiveRoom}
        />
      </Canvas>

      {/* ── Active room label ── */}
      {activeRoom && (
        <div className="floorplan-room-label">
          <span>{activeRoom}</span>
          <button onClick={() => setActiveRoom(null)} className="floorplan-room-close">×</button>
        </div>
      )}

      {/* ── Bottom left stats ── */}
      <RoomStats rooms={rooms} />

      {/* ── Bottom right navigation tabs ── */}
      <div className="floorplan-bottom-nav">
        <button
          className={`floorplan-nav-btn ${activeTab === "gallery" ? "floorplan-nav-btn--active" : ""}`}
          onClick={() => setActiveTab("gallery")}
        >
          <Image size={15} />
          <span>Gallery {rooms.length > 0 ? rooms.length : 10}</span>
        </button>
        <button
          className={`floorplan-nav-btn ${activeTab === "room" ? "floorplan-nav-btn--active" : ""}`}
          onClick={() => setActiveTab("room")}
        >
          <Move3d size={15} />
          <span>Room view</span>
        </button>
        <button
          className={`floorplan-nav-btn ${activeTab === "map" ? "floorplan-nav-btn--active" : ""}`}
          onClick={() => setActiveTab("map")}
        >
          <Map size={15} />
          <span>Map</span>
        </button>
      </div>

      {/* ── Drag hint ── */}
      <div className="floorplan-hint">Drag to rotate · Scroll to zoom · Click room to select</div>
    </div>
  );
}
