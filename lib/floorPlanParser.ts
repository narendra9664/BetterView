import type { FloorPlanData } from "./ai";

export function parseFloorPlan(rawData: any): FloorPlanData {
  // We now completely trust the Python backend's geometry!
  // No more mapping or stripping fields. Send everything directly to React Three Fiber.
  return rawData as FloorPlanData;
}
