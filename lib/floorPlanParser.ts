/**
 * lib/floorPlanParser.ts
 * ─────────────────────────────────────────────
 * Converts a FloorPlanData JSON (from AI vision analysis) into a SceneData
 * object that the MeshVisualizer Three.js scene can consume directly.
 *
 * Key features:
 *  • Wall segments are deduplicated using a normalised string key
 *  • Door & window openings are parsed into wall gaps
 *  • Room areas are calculated in square metres
 */

import type { FloorPlanData, DoorInfo, WindowInfo, WallEdge } from "./ai";

// 100% maps to SCALE Three.js world units
export const SCENE_SCALE = 20;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface WallSegment {
  centerX: number;
  centerZ: number;
  length: number;
  thickness: number;
  isHorizontal: boolean; // true → runs along X-axis; false → along Z-axis
}

export interface DoorSegment {
  centerX: number;
  centerZ: number;
  width: number;
  isHorizontal: boolean;
  type: "internal" | "entrance" | "exit";
}

export interface WindowSegment {
  centerX: number;
  centerZ: number;
  width: number;
  height: number;
  isHorizontal: boolean;
}

export interface StairSegment {
  id: string;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  direction: "up" | "down";
}

export interface SceneRoom {
  id: string;
  name: string;
  type: string;
  cx: number; // centre X in Three.js world units
  cz: number; // centre Z in Three.js world units
  w: number;  // width  in world units
  d: number;  // depth  in world units
  areaSqM: number; // area in square metres (approximate)
}

export interface SceneData {
  rooms: SceneRoom[];
  walls: WallSegment[];
  doors: DoorSegment[];
  windows: WindowSegment[];
  stairs: StairSegment[];
  sceneW: number;
  sceneD: number;
  /** Shift so the plan is centred at world origin */
  offsetX: number;
  offsetZ: number;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseFloorPlan(data: FloorPlanData): SceneData {
  const s = SCENE_SCALE / 100; // percentage → world units

  // --- Rooms ------------------------------------------------------------------
  const rooms: SceneRoom[] = data.rooms.map((r) => {
    const wWorld = r.bounds.w * s;
    const dWorld = r.bounds.h * s;
    // Approximate real-world area: assume 100% = ~20m, so each world unit ≈ 1m
    const areaSqM = parseFloat((wWorld * dWorld).toFixed(2));

    return {
      id: r.id,
      name: r.name,
      type: r.type,
      cx: (r.bounds.x + r.bounds.w / 2) * s,
      cz: (r.bounds.y + r.bounds.h / 2) * s,
      w: wWorld,
      d: dWorld,
      areaSqM,
    };
  });

  // --- Walls (deduplicated) ---------------------------------------------------
  const wallMap = new Map<string, WallSegment>();

  const fix = (n: number) => parseFloat(n.toFixed(4));

  const addWall = (x1: number, z1: number, x2: number, z2: number) => {
    // Normalise so the smaller coordinate is always first
    let [ax, az, bx, bz] = [x1, z1, x2, z2];
    if (ax > bx || (ax === bx && az > bz)) {
      [ax, az, bx, bz] = [bx, bz, ax, az];
    }
    const key = `${fix(ax)},${fix(az)},${fix(bx)},${fix(bz)}`;
    if (wallMap.has(key)) return; // already registered by an adjacent room

    const isHoriz = Math.abs(bz - az) < 0.001;
    wallMap.set(key, {
      centerX: (ax + bx) / 2,
      centerZ: (az + bz) / 2,
      length: (isHoriz ? bx - ax : bz - az) + 0.15, // Add thickness overlap to corners
      thickness: 0.15, // 15cm thick walls
      isHorizontal: isHoriz,
    });
  };

  for (const r of data.rooms) {
    const x1 = r.bounds.x * s;
    const z1 = r.bounds.y * s;
    const x2 = (r.bounds.x + r.bounds.w) * s;
    const z2 = (r.bounds.y + r.bounds.h) * s;

    addWall(x1, z1, x2, z1); // top    (horizontal)
    addWall(x1, z2, x2, z2); // bottom (horizontal)
    addWall(x1, z1, x1, z2); // left   (vertical)
    addWall(x2, z1, x2, z2); // right  (vertical)
  }

  // --- Doors & Windows -------------------------------------------------------
  const doors: DoorSegment[] = [];
  const windows: WindowSegment[] = [];

  for (const r of data.rooms) {
    const rx1 = r.bounds.x * s;
    const rz1 = r.bounds.y * s;
    const rw = r.bounds.w * s;
    const rd = r.bounds.h * s;

    // Process doors
    if (r.doors) {
      for (const door of r.doors) {
        const seg = computeOpeningPosition(rx1, rz1, rw, rd, door.edge, door.position, door.width);
        if (seg) {
          doors.push({
            centerX: seg.cx,
            centerZ: seg.cz,
            width: seg.openingWidth,
            isHorizontal: seg.isHorizontal,
            type: door.type,
          });
        }
      }
    }

    // Process windows
    if (r.windows) {
      for (const win of r.windows) {
        const seg = computeOpeningPosition(rx1, rz1, rw, rd, win.edge, win.position, win.width);
        if (seg) {
          windows.push({
            centerX: seg.cx,
            centerZ: seg.cz,
            width: seg.openingWidth,
            height: 1.0, // standard window height
            isHorizontal: seg.isHorizontal,
          });
        }
      }
    }
  }

  // --- Stairs ----------------------------------------------------------------
  const stairs: StairSegment[] = [];
  if (data.stairs) {
    for (const stair of data.stairs) {
      const stairW = stair.bounds.w * s;
      const stairD = stair.bounds.h * s;
      stairs.push({
        id: stair.id,
        centerX: (stair.bounds.x + stair.bounds.w / 2) * s,
        centerZ: (stair.bounds.y + stair.bounds.h / 2) * s,
        width: stairW,
        depth: stairD,
        direction: stair.direction || "up",
      });
    }
  }

  const sceneW = (data.totalWidth ?? 100) * s;
  const sceneD = (data.totalHeight ?? 100) * s;

  return {
    rooms,
    walls: Array.from(wallMap.values()),
    doors,
    windows,
    stairs,
    sceneW,
    sceneD,
    offsetX: -sceneW / 2,
    offsetZ: -sceneD / 2,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeOpeningPosition(
  rx: number, rz: number, rw: number, rd: number,
  edge: WallEdge, position: number, widthFrac: number,
) {
  const pos = Math.max(0, Math.min(1, position));
  const wFrac = Math.max(0.05, Math.min(0.5, widthFrac));

  switch (edge) {
    case "top": {
      const wallLen = rw;
      const openingWidth = wallLen * wFrac;
      return {
        cx: rx + wallLen * pos,
        cz: rz,
        openingWidth,
        isHorizontal: true,
      };
    }
    case "bottom": {
      const wallLen = rw;
      const openingWidth = wallLen * wFrac;
      return {
        cx: rx + wallLen * pos,
        cz: rz + rd,
        openingWidth,
        isHorizontal: true,
      };
    }
    case "left": {
      const wallLen = rd;
      const openingWidth = wallLen * wFrac;
      return {
        cx: rx,
        cz: rz + wallLen * pos,
        openingWidth,
        isHorizontal: false,
      };
    }
    case "right": {
      const wallLen = rd;
      const openingWidth = wallLen * wFrac;
      return {
        cx: rx + rw,
        cz: rz + wallLen * pos,
        openingWidth,
        isHorizontal: false,
      };
    }
    default:
      return null;
  }
}
