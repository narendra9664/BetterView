/**
 * lib/ai.ts
 * ─────────────────────────────────────────────
 * BetterView AI pipeline — Python Computer Vision Bridge
 */

// ─── Public types ────────────────────────────────────────────────────────────

export type RoomType =
  | "bedroom"
  | "bathroom"
  | "kitchen"
  | "living"
  | "dining"
  | "hallway"
  | "balcony"
  | "lobby"
  | "stairwell"
  | "veranda"
  | "porch"
  | "other";

export type WallEdge = "top" | "bottom" | "left" | "right";

export interface DoorInfo {
  type: "internal" | "entrance" | "exit";
  edge: WallEdge;
  position: number;
  width: number;
}

export interface StairInfo {
  id: string;
  bounds: { x: number; y: number; w: number; h: number; };
  direction?: "up" | "down";
}

export interface WindowInfo {
  edge: WallEdge;
  position: number;
  width: number;
}

export interface FloorPlanRoom {
  id: string;
  name: string;
  type: RoomType;
  bounds: { x: number; y: number; w: number; h: number; };
  doors?: DoorInfo[];
  windows?: WindowInfo[];
}

export interface FloorPlanData {
  totalWidth: number;
  totalHeight: number;
  hasStairs: boolean;
  hasBalcony: boolean;
  rooms: FloorPlanRoom[];
  stairs?: StairInfo[];
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export const resizeImage = (
  src: string,
  maxDim = 1024,
  quality = 0.85
): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxDim || h > maxDim) {
        if (w >= h) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else { w = Math.round((w * maxDim) / h); h = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = src;
  });

// We are keeping this exported just in case other files import it, 
// but we no longer need it for the Python CV approach.
export const ANALYSIS_PROMPT = `Legacy prompt variable`;

// ─── Step 1 – Vision analysis (Python Bridge) ────────────────────────────────

export const analyzeFloorPlan = async (
  base64Image: string
): Promise<FloorPlanData | null> => {
  if (!base64Image || base64Image.length < 50) {
    console.warn("[BetterView] analyzeFloorPlan: no valid image source provided");
    return null;
  }

  try {
    console.log("[BetterView] Converting image and sending to local Python backend...");

    // 1. Convert the Base64 Data URL to a physical Blob file
    const fetchResponse = await fetch(base64Image);
    const blob = await fetchResponse.blob();

    // 2. Attach the file to a FormData object (like a standard HTML form upload)
    const formData = new FormData();
    formData.append("file", blob, "floorplan.jpg");

    // 3. Send it to our new local Python FastAPI server
    const res = await fetch("http://127.0.0.1:8000/api/analyze-floorplan", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Python API error: ${res.statusText}`);
    }

    // 4. Log the success message from Python so we know the bridge works!
    const pythonData = await res.json();
    console.log("✅ SUCCESS! Python backend responded:", pythonData);

    // 5. Temporarily return the fallback data so the 3D visualizer doesn't crash.
    // Once we write the OpenCV math in Python, we will return the real data here.
    return createFallbackFloorPlan();

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[BetterView] analyzeFloorPlan failed:", msg);
    throw new Error(msg);
  }
};

// ─── Fallback floor plan ─────────────────────────────────────────────────────

export const createFallbackFloorPlan = (): FloorPlanData => ({
  totalWidth: 100,
  totalHeight: 100,
  hasStairs: false,
  hasBalcony: true,
  rooms: [
    {
      id: "r1", name: "Living Room", type: "living",
      bounds: { x: 30, y: 5, w: 65, h: 42 },
      doors: [
        { type: "internal", edge: "top", position: 0.3, width: 0.2 },
        { type: "internal", edge: "right", position: 0.5, width: 0.25 },
      ],
      windows: [
        { edge: "top", position: 0.5, width: 0.35 },
        { edge: "right", position: 0.5, width: 0.3 },
      ],
    },
    {
      id: "r2", name: "Kitchen", type: "kitchen",
      bounds: { x: 30, y: 47, w: 35, h: 48 },
      doors: [
        { type: "internal", edge: "top", position: 0.3, width: 0.2 },
        { type: "internal", edge: "right", position: 0.5, width: 0.25 },
      ],
      windows: [
        { edge: "bottom", position: 0.5, width: 0.3 },
      ],
    },
    {
      id: "r3", name: "Master Bedroom", type: "bedroom",
      bounds: { x: 5, y: 5, w: 25, h: 45 },
      doors: [
        { type: "internal", edge: "right", position: 0.8, width: 0.2 },
      ],
      windows: [
        { edge: "left", position: 0.5, width: 0.35 },
        { edge: "top", position: 0.5, width: 0.3 },
      ],
    },
    {
      id: "r4", name: "Bedroom 2", type: "bedroom",
      bounds: { x: 5, y: 50, w: 25, h: 30 },
      doors: [
        { type: "internal", edge: "top", position: 0.7, width: 0.2 },
      ],
      windows: [
        { edge: "left", position: 0.5, width: 0.3 },
      ],
    },
    {
      id: "r5", name: "Bathroom", type: "bathroom",
      bounds: { x: 5, y: 80, w: 25, h: 20 },
      doors: [
        { type: "internal", edge: "top", position: 0.4, width: 0.2 },
      ],
      windows: [
        { edge: "left", position: 0.5, width: 0.2 },
      ],
    },
    {
      id: "r6", name: "Dining", type: "dining",
      bounds: { x: 65, y: 47, w: 30, h: 48 },
      doors: [
        { type: "internal", edge: "left", position: 0.5, width: 0.25 },
      ],
      windows: [
        { edge: "right", position: 0.5, width: 0.35 },
        { edge: "bottom", position: 0.5, width: 0.3 },
      ],
    },
  ],
});