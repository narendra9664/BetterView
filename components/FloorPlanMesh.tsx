import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows, Text, SoftShadows } from "@react-three/drei";
import { Geometry, Base, Subtraction } from "@react-three/csg";
import { useState, useCallback, useRef } from "react";
import * as THREE from "three";
import { Download, Palette } from "lucide-react";
import type { FloorPlanData, FloorPlanRoom, RoomType } from "../lib/ai";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const WALL_H = 2.8;
const WALL_T = 0.14;
const FLOOR_H = 0.08;

const ROOM_FLOOR_COLORS: Record<RoomType | string, string> = {
  bedroom: "#F5EDD8",
  bathroom: "#D9EEF3",
  kitchen: "#EEEEE8",
  living: "#F8F0E4",
  dining: "#F4EDD4",
  office: "#E8EFF6",
  utility: "#EFEFEF",
  hallway: "#E8E8E8",
  balcony: "#E5F4E5",
  lobby: "#F0EAD6", // Custard color for lobby
  stairwell: "#E5E4E2",
  veranda: "#D9EBD9",
  porch: "#E8DED1",
  other: "#F0F0F0",
};

const WALL_PALETTE = [
  { hex: "#F5F4F0", label: "Warm White" },
  { hex: "#FFFFFF", label: "Pure White" },
  { hex: "#E8E0D0", label: "Cream" },
  { hex: "#2C2C2C", label: "Charcoal" },
  { hex: "#3B4F6B", label: "Navy" },
  { hex: "#2D5A3D", label: "Forest" },
];

// ─────────────────────────────────────────────
// Scene capture (for GLTF export)
// ─────────────────────────────────────────────
let _capturedScene: THREE.Scene | null = null;

function SceneCapture() {
  const { scene } = useThree();
  _capturedScene = scene;
  return null;
}

// ─────────────────────────────────────────────
// Furniture per room type
// ─────────────────────────────────────────────
import RoomFurnisher from "./RoomFurnisher";

// ─────────────────────────────────────────────
// Room (floor + walls + label + furniture)
// ─────────────────────────────────────────────
function Room({
  room, wallColor,
}: {
  room: any; // Will strongly type later
  wallColor: string;
}) {
  const cx = room.cx;
  const cz = room.cz;
  const w3 = room.w;
  const d3 = room.d;

  const floorColor = ROOM_FLOOR_COLORS[room.type] ?? "#F0F0F0";
  const fontSize = Math.max(0.18, Math.min(w3, d3) * 0.1);

  return (
    <group>
      {/* Floor tile */}
      <mesh position={[cx, FLOOR_H / 2, cz]} receiveShadow>
        <boxGeometry args={[w3 - WALL_T * 0.5, FLOOR_H, d3 - WALL_T * 0.5]} />
        <meshStandardMaterial color={floorColor} roughness={0.88} />
      </mesh>

      {/* Room name label (flat on floor) */}
      <Text
        position={[cx, FLOOR_H + 0.02, cz]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={fontSize}
        color="#999999"
        anchorX="center"
        anchorY="middle"
        maxWidth={w3 * 0.85}
        textAlign="center"
      >
        {room.name}
      </Text>

      {/* Furniture */}
      <RoomFurnisher room={room} cx={cx} cz={cz} w3={w3} d3={d3} />
    </group>
  );
}

// ─────────────────────────────────────────────
// Stairs
// ─────────────────────────────────────────────
function Stairs({ stair }: { stair: any }) {
  const steps = 14;
  const stepH = WALL_H / steps;
  const stepD = stair.depth / steps;

  return (
    <group position={[stair.centerX, 0, stair.centerZ]}>
      {Array.from({ length: steps }).map((_, i) => (
        <mesh
          key={i}
          position={[0, (i + 0.5) * stepH, (i - steps / 2 + 0.5) * stepD]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[stair.width, stepH, stepD]} />
          <meshStandardMaterial color="#E0E0E0" roughness={0.7} />
        </mesh>
      ))}
      {/* Side walls for stairs */}
      <mesh position={[stair.width / 2 + 0.05, WALL_H / 2, 0]} castShadow>
        <boxGeometry args={[0.1, WALL_H, stair.depth]} />
        <meshStandardMaterial color="#E0E0E0" />
      </mesh>
      <mesh position={[-stair.width / 2 - 0.05, WALL_H / 2, 0]} castShadow>
        <boxGeometry args={[0.1, WALL_H, stair.depth]} />
        <meshStandardMaterial color="#E0E0E0" />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────
interface FloorPlanMeshProps {
  data: any; // SceneData
  projectName: string;
  onExportSuccess?: () => void;
}

export default function FloorPlanMesh({
  data, projectName, onExportSuccess,
}: FloorPlanMeshProps) {
  const [wallColor, setWallColor] = useState(WALL_PALETTE[0].hex);
  const [exporting, setExporting] = useState(false);

  // Scene dimensions are already pre-calculated by parser
  const TW = data.sceneW || 20;
  const TD = data.sceneD || 20;
  const camDist = Math.max(TW, TD) * 1.4;

  // ── GLTF export ──
  const handleExport = useCallback(async () => {
    if (!_capturedScene) return;
    setExporting(true);
    try {
      const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
      const exporter = new GLTFExporter();
      exporter.parse(
        _capturedScene,
        (gltf) => {
          const blob = new Blob([JSON.stringify(gltf)], { type: "model/gltf+json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${projectName.replace(/\s+/g, "_")}.gltf`;
          link.click();
          URL.revokeObjectURL(url);
          onExportSuccess?.();
          setExporting(false);
        },
        (err) => { console.error("GLTFExporter:", err); setExporting(false); },
        { binary: false }
      );
    } catch (err) {
      console.error("GLTF import failed:", err);
      setExporting(false);
    }
  }, [projectName, onExportSuccess]);

  return (
    <div className="mesh-viewer" style={{ height: "100%" }}>
      {/* ── Controls overlay ── */}
      <div className="mesh-controls">
        <div className="mesh-controls__panel">
          <div className="mesh-controls__row">
            <Palette size={13} className="text-orange-400" />
            <span className="mesh-controls__label">Wall Colour</span>
          </div>
          <div className="mesh-controls__swatches">
            {WALL_PALETTE.map(({ hex, label }) => (
              <button
                key={hex}
                title={label}
                onClick={() => setWallColor(hex)}
                className={`mesh-swatch ${wallColor === hex ? "mesh-swatch--active" : ""}`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            zIndex: 9999,
            backgroundColor: "#ea580c", // Bright orange
            color: "white",
            padding: "12px 20px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            border: "none",
            fontWeight: "bold",
            boxShadow: "0 4px 6px rgba(0,0,0,0.3)"
          }}
        >
          <Download size={16} />
          {exporting ? "Exporting..." : "Download 3D Model"}
        </button>
      </div>

      <div className="mesh-viewer__canvas">
        {/* ── Three.js canvas ── */}
        <Canvas
          shadows
          camera={{
            position: [camDist * 0.75, camDist * 0.85, camDist * 0.75],
            fov: 42,
          }}
          style={{ width: "100%", height: "100%" }}
        >
          <SceneCapture />

          {/* ── Cinematic Environment ── */}
          <color attach="background" args={["#0a0a0c"]} />
          <fog attach="fog" args={["#0a0a0c", 10, 50]} />

          <ambientLight intensity={0.4} />

          {/* Main Key Light */}
          <directionalLight
            position={[TW, 15, TD]}
            intensity={2.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-far={100}
            shadow-camera-left={-30}
            shadow-camera-right={30}
            shadow-camera-top={30}
            shadow-camera-bottom={-30}
          />

          {/* Rim Light for edge definition */}
          <directionalLight position={[-TW, 8, -TD]} intensity={0.8} color="#4c669f" />

          {/* Ground Plane (Premium Dark) */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
            <planeGeometry args={[200, 200]} />
            <meshStandardMaterial
              color="#0f0f11"
              roughness={0.85}
              metalness={0.05}
            />
          </mesh>

          <Environment preset="night" />

          <ContactShadows
            position={[0, 0.01, 0]}
            opacity={0.5}
            scale={60}
            blur={2.5}
            far={10}
          />

          <group position={[TW * -0.5, 0, TD * -0.5]}>
            {/* All thick global walls */}
            {data.walls?.map((wall: any, i: number) => {
              const wallW = wall.isHorizontal ? wall.length : wall.thickness;
              const wallD = wall.isHorizontal ? wall.thickness : wall.length;
              const wallH = WALL_H;

              return (
                <mesh
                  key={`w-${i}`}
                  position={[wall.centerX, WALL_H / 2, wall.centerZ]}
                  castShadow
                  receiveShadow
                >
                  <Geometry>
                    <Base>
                      <boxGeometry args={[wallW, wallH, wallD]} />
                    </Base>

                    {/* Cut out doors */}
                    {data.doors?.map((door: any, di: number) => {
                      const dx = door.centerX - wall.centerX;
                      const dz = door.centerZ - wall.centerZ;

                      // Simple heuristic to skip distant cuts
                      if (Math.abs(dx) > wallW / 2 + 0.5 || Math.abs(dz) > wallD / 2 + 0.5) return null;

                      const doorW = door.isHorizontal ? door.width : wall.thickness * 4.0;
                      const doorD = door.isHorizontal ? wall.thickness * 4.0 : door.width;
                      const doorH = 2.15; // Standard door height
                      const doorY = doorH / 2 - WALL_H / 2;

                      return (
                        <Subtraction key={`cut-door-${di}`} position={[dx, doorY, dz]}>
                          <boxGeometry args={[doorW, doorH, doorD]} />
                        </Subtraction>
                      );
                    })}

                    {/* Cut out windows */}
                    {data.windows?.map((win: any, wi: number) => {
                      const dx = win.centerX - wall.centerX;
                      const dz = win.centerZ - wall.centerZ;

                      if (Math.abs(dx) > wallW / 2 + 0.5 || Math.abs(dz) > wallD / 2 + 0.5) return null;

                      const winW = win.isHorizontal ? win.width : wall.thickness * 2.5;
                      const winD = win.isHorizontal ? wall.thickness * 2.5 : win.width;
                      const winH = win.height || 1.0;
                      const winY = (1.0 + winH / 2) - WALL_H / 2;

                      return (
                        <Subtraction key={`cut-win-${wi}`} position={[dx, winY, dz]}>
                          <boxGeometry args={[winW, winH, winD]} />
                        </Subtraction>
                      );
                    })}
                  </Geometry>
                  <meshStandardMaterial color={wallColor} roughness={0.52} />
                </mesh>
              );
            })}

            {/* Entrance Frames */}
            {data.doors?.filter((d: any) => d.type === "entrance" || d.type === "exit")?.map((door: any, i: number) => (
              <mesh key={`frame-${i}`} position={[door.centerX, 1.1, door.centerZ]}>
                <boxGeometry args={[
                  door.isHorizontal ? door.width + 0.1 : 0.25,
                  2.2,
                  door.isHorizontal ? 0.25 : door.width + 0.1
                ]} />
                <meshStandardMaterial color={door.type === "entrance" ? "#ff4d00" : "#4d4d4d"} metalness={0.6} roughness={0.2} transparent opacity={0.3} />
              </mesh>
            ))}

            {/* Stairs */}
            {data.stairs?.map((stair: any) => (
              <Stairs key={stair.id} stair={stair} />
            ))}

            {/* All rooms */}
            {data.rooms?.map((room: any) => (
              <Room
                key={room.id}
                room={room}
                wallColor={wallColor}
              />
            ))}
          </group>

          <OrbitControls
            enablePan
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2.1}
            minDistance={3}
            maxDistance={camDist * 3}
            target={[0, 0, 0]}
          />
          <SoftShadows size={15} samples={16} focus={0.6} />
        </Canvas>

        {/* ── Hint ── */}
        <p className="mesh-viewer__hint">Drag to rotate · Scroll to zoom · Right-click to pan</p>
      </div>
    </div>
  );
}
