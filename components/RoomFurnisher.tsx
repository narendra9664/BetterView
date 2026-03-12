import { Box, RoundedBox, Cylinder } from "@react-three/drei";
import * as THREE from "three";
import type { FloorPlanRoom } from "../lib/ai";

interface RoomFurnisherProps {
    room: FloorPlanRoom;
    cx: number;
    cz: number;
    w3: number;
    d3: number;
}

export default function RoomFurnisher({ room, cx, cz, w3, d3 }: RoomFurnisherProps) {
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    switch (room.type) {
        case "bedroom":
            return (
                <group position={[cx, 0, cz]}>
                    {/* Rug */}
                    <Box position={[0, 0.01, 0]} args={[clamp(w3 * 0.8, 2.0, 3.5), 0.02, clamp(d3 * 0.8, 2.0, 3.5)]} receiveShadow>
                        <meshStandardMaterial color="#EAE6D7" roughness={1.0} />
                    </Box>

                    {/* Bed */}
                    <group position={[0, 0.15, -clamp(d3 * 0.15, 0.2, 0.4)]}>
                        <RoundedBox args={[clamp(w3 * 0.6, 1.2, 1.8), 0.25, clamp(d3 * 0.65, 1.4, 2.1)]} radius={0.04} castShadow receiveShadow>
                            <meshPhysicalMaterial color="#2d1b10" roughness={0.4} metalness={0.1} clearcoat={0.3} />
                        </RoundedBox>
                        <RoundedBox position={[0, 0.2, 0]} args={[clamp(w3 * 0.6, 1.2, 1.8) - 0.1, 0.2, clamp(d3 * 0.65, 1.4, 2.1) - 0.1]} radius={0.08} castShadow>
                            <meshStandardMaterial color="#fcfcfc" roughness={1.0} />
                        </RoundedBox>
                        {/* Duvet / Blanket */}
                        <RoundedBox position={[0, 0.22, 0.2]} args={[clamp(w3 * 0.65, 1.3, 1.9), 0.15, clamp(d3 * 0.45, 1.0, 1.5)]} radius={0.1} castShadow>
                            <meshPhysicalMaterial color="#4a5d6e" roughness={0.8} clearcoat={0.05} />
                        </RoundedBox>
                        {/* Pillows */}
                        <RoundedBox position={[-0.35, 0.35, -0.7]} args={[0.55, 0.12, 0.35]} radius={0.05} castShadow>
                            <meshStandardMaterial color="#FFFFFF" roughness={0.9} />
                        </RoundedBox>
                        <RoundedBox position={[0.35, 0.35, -0.7]} args={[0.55, 0.12, 0.35]} radius={0.05} castShadow>
                            <meshStandardMaterial color="#FFFFFF" roughness={0.9} />
                        </RoundedBox>
                        {/* Bed Legs */}
                        <Box position={[-clamp(w3 * 0.3, 0.6, 0.9) + 0.1, -0.15, -clamp(d3 * 0.3, 0.7, 1.0) + 0.1]} args={[0.08, 0.2, 0.08]} castShadow><meshStandardMaterial color="#333" /></Box>
                        <Box position={[clamp(w3 * 0.3, 0.6, 0.9) - 0.1, -0.15, -clamp(d3 * 0.3, 0.7, 1.0) + 0.1]} args={[0.08, 0.2, 0.08]} castShadow><meshStandardMaterial color="#333" /></Box>
                        <Box position={[-clamp(w3 * 0.3, 0.6, 0.9) + 0.1, -0.15, clamp(d3 * 0.3, 0.7, 1.0) - 0.1]} args={[0.08, 0.2, 0.08]} castShadow><meshStandardMaterial color="#333" /></Box>
                        <Box position={[clamp(w3 * 0.3, 0.6, 0.9) - 0.1, -0.15, clamp(d3 * 0.3, 0.7, 1.0) - 0.1]} args={[0.08, 0.2, 0.08]} castShadow><meshStandardMaterial color="#333" /></Box>
                    </group>

                    {/* Bedside Tables */}
                    {[-1, 1].map((side) => (
                        <group key={side} position={[side * clamp(w3 * 0.45, 0.9, 1.2), 0.0, -clamp(d3 * 0.35, 0.6, 1.0)]}>
                            <Box position={[0, 0.25, 0]} args={[0.4, 0.4, 0.4]} castShadow receiveShadow>
                                <meshStandardMaterial color="#3E2723" roughness={0.7} />
                            </Box>
                            {/* Lamp */}
                            <Cylinder position={[0, 0.55, 0]} args={[0.02, 0.05, 0.2, 16]} castShadow>
                                <meshStandardMaterial color="#D4AF37" metalness={0.8} roughness={0.2} />
                            </Cylinder>
                            <Cylinder position={[0, 0.7, 0]} args={[0.15, 0.1, 0.15, 16]}>
                                <meshStandardMaterial color="#FFF9E6" emissive="#FFF9E6" emissiveIntensity={0.5} />
                            </Cylinder>
                        </group>
                    ))}
                </group>
            );

        case "living":
            return (
                <group position={[cx, 0, cz]}>
                    {/* Rug */}
                    <Box position={[0, 0.01, 0]} args={[clamp(w3 * 0.7, 2.0, 4.0), 0.02, clamp(d3 * 0.7, 2.0, 4.0)]} receiveShadow>
                        <meshStandardMaterial color="#DCDCDC" roughness={1.0} />
                    </Box>

                    {/* Premium Sofa */}
                    <group position={[0, 0, clamp(d3 * 0.25, 0.5, 1.2)]}>
                        {/* Base cushions */}
                        <RoundedBox position={[0, 0.25, 0]} args={[clamp(w3 * 0.7, 1.8, 3.0), 0.25, 0.95]} radius={0.1} castShadow receiveShadow>
                            <meshPhysicalMaterial color="#2d3436" roughness={0.85} clearcoat={0.1} />
                        </RoundedBox>
                        {/* Backrest */}
                        <RoundedBox position={[0, 0.6, 0.38]} args={[clamp(w3 * 0.7, 1.8, 3.0), 0.5, 0.25]} radius={0.1} castShadow>
                            <meshPhysicalMaterial color="#2d3436" roughness={0.85} clearcoat={0.1} />
                        </RoundedBox>
                        {/* Armrests */}
                        <RoundedBox position={[-clamp(w3 * 0.35, 0.9, 1.5) + 0.1, 0.45, 0]} args={[0.25, 0.4, 0.95]} radius={0.1} castShadow>
                            <meshPhysicalMaterial color="#2d3436" roughness={0.85} clearcoat={0.1} />
                        </RoundedBox>
                        <RoundedBox position={[clamp(w3 * 0.35, 0.9, 1.5) - 0.1, 0.45, 0]} args={[0.25, 0.4, 0.95]} radius={0.1} castShadow>
                            <meshPhysicalMaterial color="#2d3436" roughness={0.85} clearcoat={0.1} />
                        </RoundedBox>
                        {/* Legs */}
                        {[-1, 1].map((x) => [-1, 1].map((z) => (
                            <Cylinder key={`${x}-${z}`} position={[x * (clamp(w3 * 0.35, 0.9, 1.5) - 0.15), 0.1, z * 0.35]} args={[0.03, 0.02, 0.2]} castShadow>
                                <meshStandardMaterial color="#111" metalness={0.8} />
                            </Cylinder>
                        )))}
                    </group>

                    {/* Coffee Table */}
                    <group position={[0, 0, -clamp(d3 * 0.1, 0.1, 0.4)]}>
                        {/* Table top glass */}
                        <RoundedBox position={[0, 0.35, 0]} args={[1.2, 0.05, 0.8]} radius={0.02} castShadow receiveShadow>
                            <meshPhysicalMaterial color="#FFFFFF" transmission={0.9} opacity={1} roughness={0.1} ior={1.5} thickness={0.05} />
                        </RoundedBox>
                        {/* Table base */}
                        <Box position={[0, 0.15, 0]} args={[0.8, 0.3, 0.5]} castShadow>
                            <meshStandardMaterial color="#8B5A2B" roughness={0.4} />
                        </Box>
                    </group>

                    {/* TV Unit */}
                    <group position={[0, 0, -clamp(d3 * 0.4, 0.8, 1.6)]}>
                        <Box position={[0, 0.2, 0]} args={[2.5, 0.4, 0.4]} castShadow receiveShadow>
                            <meshStandardMaterial color="#2C2C2C" roughness={0.6} />
                        </Box>
                        {/* TV Screen */}
                        <Box position={[0, 0.9, 0]} args={[1.8, 1.0, 0.05]} castShadow>
                            <meshPhysicalMaterial color="#111111" roughness={0.1} metalness={0.9} clearcoat={1.0} />
                        </Box>
                    </group>
                </group>
            );

        case "dining":
            return (
                <group position={[cx, 0, cz]}>
                    {/* Rug */}
                    <Box position={[0, 0.01, 0]} args={[clamp(w3 * 0.6, 2.5, 3.5), 0.02, clamp(d3 * 0.6, 2.0, 3.0)]} receiveShadow>
                        <meshStandardMaterial color="#EAE6D7" roughness={1.0} />
                    </Box>

                    {/* Dining Table */}
                    <RoundedBox position={[0, 0.75, 0]} args={[clamp(w3 * 0.5, 1.6, 2.4), 0.05, 1.0]} radius={0.02} castShadow receiveShadow>
                        <meshPhysicalMaterial color="#FFFFFF" roughness={0.2} clearcoat={1.0} metalness={0.1} />
                    </RoundedBox>
                    <Box position={[0, 0.375, 0]} args={[0.8, 0.75, 0.4]} castShadow>
                        <meshStandardMaterial color="#333333" roughness={0.8} />
                    </Box>

                    {/* Chairs */}
                    {[[-0.6, -0.6], [0, -0.6], [0.6, -0.6], [-0.6, 0.6], [0, 0.6], [0.6, 0.6]].map(([dx, dz], i) => (
                        <group key={`chair-${i}`} position={[dx, 0, dz]} rotation={[0, dz > 0 ? Math.PI : 0, 0]}>
                            {/* Seat */}
                            <RoundedBox position={[0, 0.45, 0]} args={[0.45, 0.05, 0.45]} radius={0.02} castShadow>
                                <meshStandardMaterial color="#D4A373" roughness={0.8} />
                            </RoundedBox>
                            {/* Back */}
                            <RoundedBox position={[0, 0.75, -0.2]} args={[0.45, 0.4, 0.05]} radius={0.02} castShadow>
                                <meshStandardMaterial color="#D4A373" roughness={0.8} />
                            </RoundedBox>
                            {/* Legs */}
                            {[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([lx, lz], li) => (
                                <Cylinder key={li} position={[lx, 0.225, lz]} args={[0.02, 0.01, 0.45]} castShadow>
                                    <meshStandardMaterial color="#111" metalness={0.8} />
                                </Cylinder>
                            ))}
                        </group>
                    ))}
                </group>
            );

        case "kitchen":
            return (
                <group position={[cx, 0, cz]}>
                    <group position={[0, 0, -clamp(d3 * 0.38, 0.8, 1.8)]}>
                        {/* High-Gloss Cabinets */}
                        <Box position={[0, 0.45, 0]} args={[clamp(w3 * 0.8, 2.0, 4.0), 0.9, 0.65]} castShadow receiveShadow>
                            <meshPhysicalMaterial color="#2E3B4E" roughness={0.2} clearcoat={1.0} />
                        </Box>
                        {/* Marble Countertop */}
                        <Box position={[0, 0.92, 0]} args={[clamp(w3 * 0.8, 2.0, 4.0) + 0.05, 0.04, 0.67 + 0.05]} castShadow receiveShadow>
                            <meshPhysicalMaterial color="#FAFAFA" roughness={0.1} metalness={0.1} clearcoat={1.0} />
                        </Box>
                        {/* Sink */}
                        <Box position={[-0.8, 0.92, 0]} args={[0.7, 0.041, 0.45]}>
                            <meshStandardMaterial color="#111" />
                        </Box>
                        <Cylinder position={[-0.8, 1.1, -0.15]} args={[0.015, 0.015, 0.3]} castShadow>
                            <meshStandardMaterial color="#C0C0C0" metalness={0.9} roughness={0.1} />
                        </Cylinder>
                        {/* Stovetop */}
                        <Box position={[0.8, 0.93, 0]} args={[0.7, 0.02, 0.5]} castShadow>
                            <meshStandardMaterial color="#000000" metalness={0.9} roughness={0.1} />
                        </Box>
                    </group>

                    {/* Kitchen Island */}
                    {w3 > 3.0 && d3 > 2.8 && (
                        <group position={[0, 0, clamp(d3 * 0.1, 0.2, 0.8)]}>
                            <Box position={[0, 0.45, 0]} args={[2.0, 0.9, 0.9]} castShadow receiveShadow>
                                <meshPhysicalMaterial color="#2E3B4E" roughness={0.2} clearcoat={1.0} />
                            </Box>
                            {/* Overhang for seating */}
                            <Box position={[0, 0.92, 0.1]} args={[2.05, 0.04, 1.1]} castShadow receiveShadow>
                                <meshPhysicalMaterial color="#FAFAFA" roughness={0.1} metalness={0.1} clearcoat={1.0} />
                            </Box>
                        </group>
                    )}
                </group>
            );

        case "bathroom":
            return (
                <group position={[cx, 0, cz]}>
                    {/* Bathtub */}
                    <group position={[clamp(w3 * 0.35, 0.6, 1.2), 0.3, -clamp(d3 * 0.3, 0.5, 1.0)]}>
                        <RoundedBox args={[0.95, 0.6, 1.8]} radius={0.1} castShadow receiveShadow>
                            <meshPhysicalMaterial color="#ffffff" roughness={0.05} clearcoat={1.0} />
                        </RoundedBox>
                        {/* Tub Hole */}
                        <RoundedBox position={[0, 0.1, 0]} args={[0.75, 0.61, 1.6]} radius={0.15}>
                            <meshStandardMaterial color="#f0f0f0" roughness={0.1} />
                        </RoundedBox>
                        {/* Water */}
                        <Box position={[0, 0.15, 0]} args={[0.74, 0.1, 1.59]}>
                            <meshPhysicalMaterial color="#add8e6" transmission={0.6} roughness={0.0} ior={1.33} thickness={0.5} />
                        </Box>
                    </group>

                    {/* Vanity Unit */}
                    <group position={[-clamp(w3 * 0.3, 0.5, 1.0), 0, -clamp(d3 * 0.4, 0.6, 1.2)]}>
                        {/* Cabinet */}
                        <Box position={[0, 0.4, 0]} args={[1.2, 0.8, 0.55]} castShadow receiveShadow>
                            <meshStandardMaterial color="#3E2723" roughness={0.4} />
                        </Box>
                        {/* Countertop */}
                        <Box position={[0, 0.82, 0]} args={[1.25, 0.04, 0.6]} castShadow>
                            <meshPhysicalMaterial color="#FFFFFF" roughness={0.1} clearcoat={1.0} />
                        </Box>
                        {/* Sink */}
                        <RoundedBox position={[0, 0.85, 0]} args={[0.6, 0.05, 0.4]} radius={0.1} castShadow>
                            <meshPhysicalMaterial color="#E8E8E8" roughness={0.1} clearcoat={1.0} />
                        </RoundedBox>
                        {/* Mirror */}
                        <Box position={[0, 1.5, -0.25]} args={[1.0, 0.8, 0.05]} castShadow>
                            <meshPhysicalMaterial color="#E8E8E8" metalness={1.0} roughness={0.0} clearcoat={1.0} />
                        </Box>
                    </group>

                    {/* Toilet */}
                    <group position={[-clamp(w3 * 0.3, 0.5, 1.0), 0, clamp(d3 * 0.2, 0.3, 0.6)]}>
                        <RoundedBox position={[0, 0.2, -0.1]} args={[0.4, 0.4, 0.6]} radius={0.05} castShadow>
                            <meshPhysicalMaterial color="#FFFFFF" roughness={0.1} clearcoat={1.0} />
                        </RoundedBox>
                        <RoundedBox position={[0, 0.6, -0.3]} args={[0.4, 0.5, 0.2]} radius={0.05} castShadow>
                            <meshPhysicalMaterial color="#FFFFFF" roughness={0.1} clearcoat={1.0} />
                        </RoundedBox>
                    </group>
                </group>
            );

        case "lobby":
            return (
                <group position={[cx, 0, cz]}>
                    {/* Rug */}
                    <Box position={[0, 0.01, 0]} args={[clamp(w3 * 0.6, 1.2, 2.0), 0.02, clamp(d3 * 0.6, 1.2, 2.0)]} receiveShadow>
                        <meshStandardMaterial color="#8B7D6B" roughness={1.0} />
                    </Box>
                    {/* Console Table */}
                    <group position={[0, 0, -clamp(d3 * 0.4, 0.5, 0.8)]}>
                        <Box position={[0, 0.4, 0]} args={[clamp(w3 * 0.5, 1.0, 1.6), 0.8, 0.35]} castShadow receiveShadow>
                            <meshStandardMaterial color="#3E2723" roughness={0.4} />
                        </Box>
                        {/* Decorative item */}
                        <Cylinder position={[0, 0.9, 0]} args={[0.08, 0.12, 0.2]} castShadow>
                            <meshStandardMaterial color="#D4AF37" metalness={0.8} />
                        </Cylinder>
                    </group>
                </group>
            );

        default:
            return null;
    }
}
