import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows, RoundedBox } from "@react-three/drei";
import { useRef, useState } from "react";
import * as THREE from "three";
import { Copy, Plus, Minus, Move } from "lucide-react";
import Button from "./ui/Button";

// A stylized, dynamic 3D representation of a house
// For this MVP, we create a beautiful generic layout to represent the "Premium" generation
function HouseModel({ wallColor, floorColor }: { wallColor: string, floorColor: string }) {
    const groupRef = useRef<THREE.Group>(null);

    // Slowly rotate the model for a premium presentation effect
    useFrame(() => {
        if (groupRef.current) {
            groupRef.current.rotation.y += 0.001;
        }
    });

    const WallMaterial = <meshStandardMaterial color={wallColor} roughness={0.2} metalness={0.1} />;
    const FloorMaterial = <meshStandardMaterial color={floorColor} roughness={0.8} />;

    return (
        <group ref={groupRef} position={[0, -1, 0]}>
            <spotLight position={[10, 15, 10]} angle={0.3} penumbra={1} intensity={2} castShadow />

            {/* Main Floor Base */}
            <RoundedBox args={[12, 0.4, 8]} position={[0, 0, 0]} radius={0.05} castShadow receiveShadow>
                {FloorMaterial}
            </RoundedBox>

            {/* Patio Base */}
            <RoundedBox args={[4, 0.2, 3]} position={[5, -0.1, 2]} radius={0.05} castShadow receiveShadow>
                <meshStandardMaterial color="#444" roughness={0.9} />
            </RoundedBox>

            {/* Walls - Outer */}
            <RoundedBox args={[11.6, 2.5, 0.2]} position={[0, 1.45, -3.8]} radius={0.02} castShadow receiveShadow>
                {WallMaterial}
            </RoundedBox>
            <RoundedBox args={[11.6, 2.5, 0.2]} position={[0, 1.45, 3.8]} radius={0.02} castShadow receiveShadow>
                {WallMaterial}
            </RoundedBox>
            <RoundedBox args={[0.2, 2.5, 7.6]} position={[-5.8, 1.45, 0]} radius={0.02} castShadow receiveShadow>
                {WallMaterial}
            </RoundedBox>
            <RoundedBox args={[0.2, 2.5, 4]} position={[5.8, 1.45, -1.8]} radius={0.02} castShadow receiveShadow>
                {WallMaterial}
            </RoundedBox>

            {/* Inner Walls (Rooms) */}
            <RoundedBox args={[6, 2.5, 0.2]} position={[-2.8, 1.45, 0]} radius={0.02} castShadow receiveShadow>
                {WallMaterial}
            </RoundedBox>
            <RoundedBox args={[0.2, 2.5, 3.8]} position={[0.1, 1.45, 1.8]} radius={0.02} castShadow receiveShadow>
                {WallMaterial}
            </RoundedBox>

            {/* Furniture Representations */}
            <group position={[-3, 0.6, 2]}>
                {/* Bed */}
                <RoundedBox args={[2, 0.4, 3]} position={[0, 0, 0]} castShadow>
                    <meshStandardMaterial color="#ddd" roughness={0.9} />
                </RoundedBox>
                <RoundedBox args={[2, 0.1, 1]} position={[0, 0.25, -1]} castShadow>
                    <meshStandardMaterial color="#fff" />
                </RoundedBox>
            </group>

            <group position={[3, 0.6, -1.5]}>
                {/* Kitchen Island */}
                <RoundedBox args={[3, 1, 1]} position={[0, 0, 0]} castShadow>
                    <meshStandardMaterial color="#111" />
                </RoundedBox>
            </group>

            <group position={[2.5, 0.5, 2]}>
                {/* Sofa */}
                <RoundedBox args={[2.5, 0.6, 1]} position={[0, 0, -0.5]} castShadow>
                    <meshStandardMaterial color="#333" />
                </RoundedBox>
                <RoundedBox args={[1, 0.6, 1.5]} position={[0.75, 0, 0.75]} castShadow>
                    <meshStandardMaterial color="#333" />
                </RoundedBox>
                {/* TV Wall */}
                <RoundedBox args={[2, 1.5, 0.1]} position={[-0.5, 0.5, 1.5]} castShadow>
                    <meshStandardMaterial color="#111" roughness={0.1} />
                </RoundedBox>
            </group>
        </group>
    )
}

export default function PremiumVisualizer() {
    const [wallColor, setWallColor] = useState("#f4f4f5"); // default white/gray
    const [floorColor, setFloorColor] = useState("#d4d4d8"); // default wood-like tone
    const [isExporting, setIsExporting] = useState(false);

    return (
        <div className="w-full h-full relative rounded-xl overflow-hidden shadow-2xl bg-gradient-to-b from-gray-900 to-black flex">
            {/* The 3D Canvas */}
            <div className="flex-1 h-full w-full">
                <Canvas shadows camera={{ position: [15, 15, 15], fov: 45 }}>
                    <ambientLight intensity={0.5} />
                    <Environment preset="city" />
                    <ContactShadows position={[0, -1.1, 0]} opacity={0.6} scale={40} blur={2} far={4} />

                    <HouseModel wallColor={wallColor} floorColor={floorColor} />

                    <OrbitControls
                        enablePan={false}
                        minPolarAngle={0}
                        maxPolarAngle={Math.PI / 2.2} // Prevent going under the floor
                        minDistance={5}
                        maxDistance={30}
                    />
                </Canvas>
            </div>

            {/* Customization Toolbar Overlay */}
            <div className="absolute left-6 top-6 right-6 flex justify-between items-start pointer-events-none">
                <div className="bg-black/60 backdrop-blur-md border border-white/10 p-4 rounded-xl pointer-events-auto shadow-xl flex flex-col gap-4">
                    <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                        <Move size={16} className="text-orange-500" />
                        Premium Controls
                    </h3>

                    <div className="space-y-3">
                        <div>
                            <p className="text-xs text-gray-400 mb-1">Wall Material Color</p>
                            <div className="flex gap-2">
                                {["#f4f4f5", "#27272a", "#3b82f6", "#ef4444", "#10b981"].map((c) => (
                                    <button
                                        key={c}
                                        onClick={() => setWallColor(c)}
                                        className={`w-6 h-6 rounded-full border-2 ${wallColor === c ? 'border-white scale-110' : 'border-transparent'} transition-transform`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-xs text-gray-400 mb-1">Floor Material Color</p>
                            <div className="flex gap-2">
                                {["#d4d4d8", "#451a03", "#78716c", "#1e1e1e"].map((c) => (
                                    <button
                                        key={c}
                                        onClick={() => setFloorColor(c)}
                                        className={`w-6 h-6 rounded-full border-2 ${floorColor === c ? 'border-white scale-110' : 'border-transparent'} transition-transform`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pointer-events-auto">
                    <Button
                        size="sm"
                        className="bg-orange-600 hover:bg-orange-700 font-medium"
                        onClick={() => setIsExporting(true)}
                    >
                        <Copy size={16} className="mr-2" />
                        Export Mesh
                    </Button>
                </div>
            </div>

            {/* Export Toaster Mockup */}
            {isExporting && (
                <div className="absolute inset-x-0 bottom-6 mx-auto w-max px-6 py-3 bg-green-500/20 text-green-400 border border-green-500/30 rounded-full font-medium text-sm animate-in fade-in slide-in-from-bottom-5">
                    Premium Export successful! (3D Assets saved)
                    <button onClick={() => setIsExporting(false)} className="ml-4 text-white hover:text-gray-300">&times;</button>
                </div>
            )}

            {/* Instructions */}
            <div className="absolute bottom-6 left-6 text-gray-400/80 text-xs font-mono pointer-events-none">
                Scroll to Zoom • Drag to Rotate
            </div>
        </div>
    );
}
