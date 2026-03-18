import type { FloorPlanData } from "./ai";

export function parseFloorPlan(rawData: any): FloorPlanData {
  // We completely trust the Python backend's geometry!
  // Send everything directly to React Three Fiber.
  return rawData as FloorPlanData;
}