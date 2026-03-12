/**
 * lib/ai.ts
 * ─────────────────────────────────────────────
 * BetterView AI pipeline — two-step generation
 *
 *  Step 1 (analyzeFloorPlan): GPT-4o vision reads the user's floor plan image
 *         and returns a typed JSON structure describing every room, plus door
 *         and window positions for realistic 3D wall openings.
 *
 *  Step 2 (generateRender): We build a rich, room-accurate prompt from that
 *         JSON and call txt2img for a photorealistic top-down render.
 */

// AI vision analysis is handled server-side via Groq (see visualizer.$id.tsx action).
// This file contains shared types, the analysis prompt, and the client-side
// image resize helper used before sending to the server.

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

/** Which wall edge a door/window sits on */
export type WallEdge = "top" | "bottom" | "left" | "right";

export interface DoorInfo {
  /** Type of door: internal connecting rooms, entrance (front-door), or exit (back-door) */
  type: "internal" | "entrance" | "exit";
  /** Which wall edge the door is on */
  edge: WallEdge;
  /** Position along that edge as a fraction 0-1 (0 = start, 1 = end) */
  position: number;
  /** Width of door opening as fraction of wall length (typically 0.15-0.35) */
  width: number;
}

export interface StairInfo {
  id: string;
  bounds: {
    x: number; // % of total width
    y: number; // % of total height
    w: number;
    h: number;
  };
  /** Direction the stairs go up: "up", "down", or "both" */
  direction?: "up" | "down";
}

export interface WindowInfo {
  /** Which wall edge the window is on */
  edge: WallEdge;
  /** Position along that edge as a fraction 0-1 */
  position: number;
  /** Width of window as fraction of wall length (typically 0.2-0.4) */
  width: number;
}

export interface FloorPlanRoom {
  id: string;
  name: string;
  type: RoomType;
  bounds: {
    x: number; // left edge, % of total width  (0–100)
    y: number; // top  edge, % of total height (0–100)
    w: number; // width  as %
    h: number; // height as %
  };
  /** Doors connecting this room to adjacent rooms or exterior */
  doors?: DoorInfo[];
  /** Windows on exterior walls */
  windows?: WindowInfo[];
}

export interface FloorPlanData {
  totalWidth: number;    // normalised, usually 100
  totalHeight: number;
  hasStairs: boolean;
  hasBalcony: boolean;
  rooms: FloorPlanRoom[];
  stairs?: StairInfo[];
}


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

// ─── Step 1 – Vision analysis ────────────────────────────────────────────────

export const ANALYSIS_PROMPT = `
You are an expert architectural AI floor plan parser. 
Analyse this 2D floor plan image and return ONLY a valid JSON object.
No markdown, no code fences, no prose — raw JSON only.

Required structure:
{
  "totalWidth": 100,
  "totalHeight": 100,
  "hasStairs": false,
  "hasBalcony": false,
  "rooms": [
    {
      "id": "r1",
      "name": "Living Room",
      "type": "living",
      "bounds": { "x": 10, "y": 10, "w": 40, "h": 45 },
      "doors": [
        { "type": "entrance", "edge": "left", "position": 0.5, "width": 0.25 }
      ],
      "windows": [
        { "edge": "top", "position": 0.5, "width": 0.3 }
      ]
    }
  ],
  "stairs": [
    { "id": "s1", "bounds": { "x": 50, "y": 20, "w": 10, "h": 15 }, "direction": "up" }
  ]
}

Critical Rules for Absolute Accuracy:
1. **Irregular Footprints**: DO NOT force the rooms to fill a perfect 100x100 square. If the house is L-shaped, U-shaped, or has cutouts, leave those areas empty by setting bounds only where actual rooms exist.
2. **Proportions**: Carefully measure the relative widths and heights of rooms from the image. 
3. **Room Types**: "type" must be one of: bedroom | bathroom | kitchen | living | dining | hallway | balcony | lobby | stairwell | veranda | porch | other.
4. **No Overlaps**: Rooms MUST NOT overlap. Adjacent rooms should share an edge exactly.
5. **Openings (Doors/Windows)**: 
   - **Front Door**: Identify the main entry point and set type as "entrance".
   - **Back Door**: Identify secondary exits and set type as "exit".
   - **Internal Doors**: Set type as "internal".
   - Position windows on exterior-facing walls.
   - "edge": top | bottom | left | right.
   - "position": 0-1 along the edge.
   - "width": fraction of edge length (0.15-0.35).
6. **Stairs**: Detect any stairs (labelled or visual). Provide their exact bounds.
7. **Completeness**: Include every labelled or implied space (closets, hallways, lobbies, etc.). If a space isn't labelled but is clearly part of the floor plan, use type "other" or "lobby" if it's near the entrance.
`.trim();

/** Wraps a promise with a timeout — rejects if it doesn't resolve in time */
const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`[BetterView] ${label} timed out after ${ms / 1000}s`)), ms)
  );
  return Promise.race([promise, timeout]);
};

export const analyzeFloorPlan = async (
  base64Image: string
): Promise<FloorPlanData | null> => {
  // Guard: if there's no image source at all, skip the API call
  if (!base64Image || base64Image.length < 50) {
    console.warn("[BetterView] analyzeFloorPlan: no valid image source provided");
    return null;
  }

  try {
    const small = await withTimeout(
      resizeImage(base64Image, 1024),
      10_000,
      "Image resize"
    );

    // NOTE: Floor plan analysis is now handled server-side via Groq.
    // This client-side path is kept as a stub — real work happens in the
    // React Router action() in visualizer.$id.tsx which calls Groq securely.
    throw new Error("Use the server-side action() for floor plan analysis via Groq.");

    // Unreachable — satisfies TypeScript return type below
    const data = {} as FloorPlanData;
    if (!Array.isArray(data.rooms) || data.rooms.length === 0) {
      throw new Error("No rooms found");
    }

    // Ensure every room has an id and sanitize doors/windows
    data.rooms = data.rooms.map((r, i) => ({
      ...r,
      id: r.id ?? `r${i + 1}`,
      doors: Array.isArray(r.doors) ? r.doors : [],
      windows: Array.isArray(r.windows) ? r.windows : [],
    }));

    return data;
  } catch (err) {
    // Surface the real error message so handleGenerate can show it to the user
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[BetterView] analyzeFloorPlan failed:", msg);
    // Re-throw so callers can decide whether to use the fallback or show an error
    throw new Error(msg);
  }
};

// ─── Fallback floor plan (when vision analysis fails) ────────────────────────

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
