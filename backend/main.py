# -*- coding: utf-8 -*-
"""
backend/main.py
================================================================
BetterView - Phase 1: Structural Mesh Extraction Engine

Pipeline:
  1. YOLO Detection  ->  raw bounding boxes for walls, doors, windows
  2. OpenCV Morphology  ->  clean binary masks, contour extraction
  3. NetworkX Topology  ->  wall graph (nodes=corners, edges=walls)
  4. Room Solver  ->  cycle detection finds enclosed rooms
  5. JSON Serialization  ->  normalized payload for React Three.js

The final JSON matches the FloorPlanData interface expected by
the frontend parser (lib/floorPlanParser.ts -> lib/ai.ts).
================================================================
"""

import sys
import io

# Force UTF-8 output on Windows to avoid charmap encoding errors
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np
import networkx as nx
from typing import Optional
import uuid
import traceback

# -- Optional: YOLO model for door/window detection ----------------------------
# If the custom model file exists, we use it. Otherwise we rely on pure OpenCV.
try:
    from ultralytics import YOLO
    import os
    MODEL_PATH = os.path.join(os.path.dirname(__file__), "best.pt")
    if os.path.exists(MODEL_PATH):
        yolo_model = YOLO(MODEL_PATH)
        print("[BetterView] [OK] Custom YOLO model loaded for door/window detection.")
    else:
        yolo_model = None
        print("[BetterView] [WARN] No best.pt found. Using pure OpenCV pipeline.")
except ImportError:
    yolo_model = None
    print("[BetterView] [WARN] ultralytics not installed. Using pure OpenCV pipeline.")


app = FastAPI(title="BetterView Structural Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# CONSTANTS
# ==============================================================================
GRID_SIZE = 100.0           # Normalized coordinate space (0-100) for React
WALL_THICKNESS_RATIO = 0.02 # Walls are ~2% of image width (typical for floor plans)
MIN_ROOM_AREA_RATIO = 0.005 # Ignore contours smaller than 0.5% of image area
CORNER_SNAP_DISTANCE = 8    # Pixels - nodes closer than this merge into one


# ==============================================================================
# STEP 1: IMAGE PRE-PROCESSING & WALL MASK EXTRACTION
# ==============================================================================
# Think of this like a "photo filter" - we take the colourful floor plan image
# and strip it down to a simple black (wall) and white (open space) picture.
# This makes it easy for the computer to see exactly where the walls are.

def extract_wall_mask(img: np.ndarray) -> np.ndarray:
    """
    Convert the floor plan image into a binary mask where
    white pixels = walls, black pixels = everything else.

    Strategy:
      1. Convert to grayscale
      2. Apply adaptive thresholding (handles uneven lighting/scan quality)
      3. Morphological closing (fills small gaps in wall lines)
      4. Remove tiny noise particles
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    # Adaptive threshold works better than a fixed cutoff because
    # floor plan images can have uneven brightness across the page
    binary = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,          # Invert so walls become white
        blockSize=15,                    # Neighborhood size for threshold calc
        C=10                             # Constant subtracted from mean
    )

    # Morphological "closing" = dilate then erode.
    # This fills tiny gaps in wall lines (like dashed walls or scan artifacts)
    # while keeping the overall wall shape intact.
    wall_thickness_px = max(3, int(min(h, w) * WALL_THICKNESS_RATIO))
    kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (wall_thickness_px, wall_thickness_px)
    )
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)

    # Remove small noise (specks of dust, stray text remnants)
    # by keeping only connected components above a minimum area
    min_area = int(h * w * 0.0002)  # 0.02% of image area
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(closed)
    cleaned = np.zeros_like(closed)
    for i in range(1, num_labels):  # skip background (label 0)
        if stats[i, cv2.CC_STAT_AREA] >= min_area:
            cleaned[labels == i] = 255

    return cleaned


# ==============================================================================
# STEP 2: ROOM CONTOUR DETECTION
# ==============================================================================
# Now that we have a clean black-and-white wall mask, we find the "rooms" --
# these are the enclosed white spaces BETWEEN the walls. Imagine filling each
# room with water: each puddle is a separate contour.

def detect_room_contours(wall_mask: np.ndarray, img_h: int, img_w: int):
    """
    Find enclosed regions (rooms) in the inverted wall mask.

    Returns a list of bounding-box dicts:
      { "x": px, "y": px, "w": px, "h": px, "contour": np.array }
    """
    # Invert: rooms (open space) become white, walls become black
    room_mask = cv2.bitwise_not(wall_mask)

    # Find contours of each white region
    contours, hierarchy = cv2.findContours(
        room_mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE
    )

    min_room_area = int(img_h * img_w * MIN_ROOM_AREA_RATIO)
    rooms = []

    for i, contour in enumerate(contours):
        area = cv2.contourArea(contour)
        if area < min_room_area:
            continue

        # Skip the outermost contour (it's the image border, not a room)
        if hierarchy is not None and hierarchy[0][i][3] == -1:
            # Check if this contour spans almost the entire image
            x, y, w, h = cv2.boundingRect(contour)
            if w > img_w * 0.9 and h > img_h * 0.9:
                continue

        x, y, w, h = cv2.boundingRect(contour)

        # Approximate the contour to a polygon (reduces noise in corners)
        epsilon = 0.02 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)

        rooms.append({
            "x": int(x), "y": int(y),
            "w": int(w), "h": int(h),
            "contour": approx,
            "area": area,
        })

    # Sort rooms by area (largest first) for consistent ordering
    rooms.sort(key=lambda r: r["area"], reverse=True)

    return rooms


# ==============================================================================
# STEP 3: TOPOLOGICAL WALL GRAPH (NetworkX)
# ==============================================================================
# This is the mathematical backbone. Instead of treating each wall as an
# independent floating rectangle, we build a GRAPH:
#   - Nodes = corner points where walls meet (intersections)
#   - Edges = wall segments connecting two corners
#
# Why a graph? Because in a real building, walls don't float - they CONNECT.
# A graph guarantees that every wall shares its endpoints with adjacent walls,
# so the 3D mesh will be "watertight" (no gaps or overlaps).

def build_wall_graph(
    wall_mask: np.ndarray,
    rooms: list,
    img_h: int,
    img_w: int,
) -> nx.Graph:
    """
    Build a NetworkX graph from the wall structure.

    1. Detect straight line segments using Hough Transform
    2. Find intersection points (corners) -> graph nodes
    3. Wall segments between corners -> graph edges
    4. Snap nearby nodes together (merge corners within CORNER_SNAP_DISTANCE)
    """
    G = nx.Graph()

    # -- 3a. Detect wall lines using Probabilistic Hough Transform --
    # HoughLinesP finds line segments in a binary image.
    # Think of it as: "find all the straight lines".
    edges_img = cv2.Canny(wall_mask, 50, 150, apertureSize=3)

    min_line_length = int(min(img_h, img_w) * 0.03)  # At least 3% of image
    max_line_gap = int(min(img_h, img_w) * 0.02)       # Allow small gaps

    lines = cv2.HoughLinesP(
        edges_img,
        rho=1,                     # Distance resolution in pixels
        theta=np.pi / 180,        # Angle resolution in radians
        threshold=50,              # Minimum votes (intersections in Hough space)
        minLineLength=min_line_length,
        maxLineGap=max_line_gap,
    )

    if lines is None:
        print("[BetterView] [WARN] No lines detected by Hough Transform.")
        return G

    # -- 3b. Filter to only horizontal and vertical lines --
    # Floor plans are orthogonal: walls run either horizontally or vertically.
    # We discard diagonal lines (which are usually arrows, text, or noise).
    hv_lines = []
    ANGLE_TOLERANCE = 8  # degrees - allow slight tilt from scanning

    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))

        is_horizontal = angle < ANGLE_TOLERANCE or angle > (180 - ANGLE_TOLERANCE)
        is_vertical = abs(angle - 90) < ANGLE_TOLERANCE

        if is_horizontal or is_vertical:
            # Snap to exact horizontal/vertical
            if is_horizontal:
                avg_y = (y1 + y2) // 2
                y1 = y2 = avg_y
            else:
                avg_x = (x1 + x2) // 2
                x1 = x2 = avg_x

            # Ensure consistent ordering (left->right or top->bottom)
            if x1 > x2 or (x1 == x2 and y1 > y2):
                x1, y1, x2, y2 = x2, y2, x1, y1

            hv_lines.append((x1, y1, x2, y2))

    # -- 3c. Collect all endpoints as potential corner nodes --
    raw_points = []
    for x1, y1, x2, y2 in hv_lines:
        raw_points.append((x1, y1))
        raw_points.append((x2, y2))

    if not raw_points:
        print("[BetterView] [WARN] No H/V lines found after filtering.")
        return G

    # -- 3d. Snap/merge nearby points --
    # In a scanned image, the "same" corner may appear at (100,200) and (102,198)
    # due to scan noise. We merge them into one clean node.
    snapped = _snap_points(raw_points, CORNER_SNAP_DISTANCE)

    # -- 3e. Build graph edges from line segments --
    for x1, y1, x2, y2 in hv_lines:
        p1 = _find_nearest(snapped, (x1, y1))
        p2 = _find_nearest(snapped, (x2, y2))

        if p1 == p2:
            continue  # Degenerate zero-length line

        length = np.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)
        is_horiz = abs(p2[1] - p1[1]) < abs(p2[0] - p1[0])

        G.add_node(p1, x=p1[0], y=p1[1])
        G.add_node(p2, x=p2[0], y=p2[1])
        G.add_edge(p1, p2, length=length, is_horizontal=is_horiz)

    print(f"[BetterView] Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    return G


def _snap_points(points: list, snap_dist: int) -> list:
    """Merge points that are within snap_dist pixels of each other."""
    clusters = []
    used = [False] * len(points)

    for i, (x1, y1) in enumerate(points):
        if used[i]:
            continue

        cluster = [(x1, y1)]
        used[i] = True

        for j in range(i + 1, len(points)):
            if used[j]:
                continue
            x2, y2 = points[j]
            if abs(x2 - x1) <= snap_dist and abs(y2 - y1) <= snap_dist:
                cluster.append((x2, y2))
                used[j] = True

        # Average all points in the cluster to get one clean corner
        avg_x = int(np.mean([p[0] for p in cluster]))
        avg_y = int(np.mean([p[1] for p in cluster]))
        clusters.append((avg_x, avg_y))

    return clusters


def _find_nearest(points: list, target: tuple) -> tuple:
    """Find the closest point in the list to the target."""
    best = points[0]
    best_dist = float("inf")
    for p in points:
        d = abs(p[0] - target[0]) + abs(p[1] - target[1])  # Manhattan distance
        if d < best_dist:
            best_dist = d
            best = p
    return best


# ==============================================================================
# STEP 4: YOLO-BASED DOOR/WINDOW DETECTION
# ==============================================================================
# If we have a trained YOLO model, we use it to find doors and windows.
# These are small elements that OpenCV line detection can miss.
# YOLO looks at the image and says: "that patch looks like a door" or "window."

def detect_doors_and_windows(img: np.ndarray, img_h: int, img_w: int):
    """
    Use the YOLO model to detect doors and windows.
    Returns two lists of dicts with pixel-space bounding boxes.
    """
    doors_px = []
    windows_px = []

    if yolo_model is None:
        return doors_px, windows_px

    results = yolo_model(img)

    for result in results:
        for box in result.boxes:
            x1, y1, x2, y2 = map(float, box.xyxy[0].tolist())
            class_name = yolo_model.names[int(box.cls[0].item())].lower()
            confidence = float(box.conf[0].item())

            if confidence < 0.3:
                continue  # Skip low-confidence detections

            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2
            w = x2 - x1
            h = y2 - y1
            is_horizontal = w > h

            entry = {
                "cx_px": cx, "cy_px": cy,
                "w_px": w, "h_px": h,
                "is_horizontal": is_horizontal,
                "confidence": confidence,
            }

            if class_name in ("door", "opening"):
                entry["type"] = "internal"
                doors_px.append(entry)
            elif class_name == "window":
                windows_px.append(entry)

    return doors_px, windows_px


# ==============================================================================
# STEP 5: MAP DOORS/WINDOWS TO ROOM EDGES
# ==============================================================================
# A door belongs ON a specific wall of a specific room.
# We figure out which room edge it sits on based on proximity.

def assign_openings_to_rooms(rooms_px: list, doors_px: list, windows_px: list):
    """
    For each door/window, find which room edge it's closest to,
    then attach it to that room with the correct edge and relative position.
    """
    for room in rooms_px:
        room["doors"] = []
        room["windows"] = []

        rx, ry = room["x"], room["y"]
        rw, rh = room["w"], room["h"]

        # Room edges in pixel space
        edges = {
            "top":    {"y": ry,      "x_range": (rx, rx + rw), "axis": "h"},
            "bottom": {"y": ry + rh, "x_range": (rx, rx + rw), "axis": "h"},
            "left":   {"x": rx,      "y_range": (ry, ry + rh), "axis": "v"},
            "right":  {"x": rx + rw, "y_range": (ry, ry + rh), "axis": "v"},
        }

        # Assign doors
        for door in doors_px:
            edge_name, rel_pos = _find_closest_edge(
                door["cx_px"], door["cy_px"], edges, rw, rh
            )
            if edge_name and rel_pos is not None:
                # Width as fraction of wall length
                wall_len = rw if edge_name in ("top", "bottom") else rh
                width_frac = max(door["w_px"], door["h_px"]) / wall_len
                width_frac = min(0.5, max(0.08, width_frac))

                room["doors"].append({
                    "type": door.get("type", "internal"),
                    "edge": edge_name,
                    "position": round(rel_pos, 3),
                    "width": round(width_frac, 3),
                })

        # Assign windows
        for win in windows_px:
            edge_name, rel_pos = _find_closest_edge(
                win["cx_px"], win["cy_px"], edges, rw, rh
            )
            if edge_name and rel_pos is not None:
                wall_len = rw if edge_name in ("top", "bottom") else rh
                width_frac = max(win["w_px"], win["h_px"]) / wall_len
                width_frac = min(0.5, max(0.05, width_frac))

                room["windows"].append({
                    "edge": edge_name,
                    "position": round(rel_pos, 3),
                    "width": round(width_frac, 3),
                })

    return rooms_px


def _find_closest_edge(
    cx: float, cy: float,
    edges: dict,
    room_w: float, room_h: float,
    max_dist: float = 30.0,
) -> tuple:
    """
    Given a point (cx, cy), find which room edge it's closest to.
    Returns (edge_name, relative_position_0_to_1) or (None, None).
    """
    best_edge = None
    best_dist = float("inf")
    best_pos = None

    for name, info in edges.items():
        if info["axis"] == "h":
            # Horizontal edge: distance is |cy - edge_y|
            dist = abs(cy - info["y"])
            x_lo, x_hi = info["x_range"]
            if cx < x_lo - max_dist or cx > x_hi + max_dist:
                continue
            rel = (cx - x_lo) / max(1, x_hi - x_lo)
        else:
            # Vertical edge: distance is |cx - edge_x|
            dist = abs(cx - info["x"])
            y_lo, y_hi = info["y_range"]
            if cy < y_lo - max_dist or cy > y_hi + max_dist:
                continue
            rel = (cy - y_lo) / max(1, y_hi - y_lo)

        if dist < best_dist and dist < max_dist:
            best_dist = dist
            best_edge = name
            best_pos = max(0.05, min(0.95, rel))

    return best_edge, best_pos


# ==============================================================================
# STEP 6: NORMALIZE TO GRID & BUILD FINAL JSON
# ==============================================================================
# The frontend expects everything in a 0-100 coordinate system.
# We convert pixel coordinates -> normalized grid coordinates.

def build_floorplan_json(
    rooms_px: list,
    img_h: int,
    img_w: int,
    graph: nx.Graph,
) -> dict:
    """
    Convert pixel-space room data into the FloorPlanData JSON schema
    that the React frontend expects.

    Schema (matches lib/ai.ts FloorPlanData):
    {
      totalWidth: 100,
      totalHeight: 100,
      hasStairs: false,
      hasBalcony: false,
      rooms: [
        {
          id: "r1",
          name: "Room 1",
          type: "other",      <- Phase 1: no semantic labeling
          bounds: { x, y, w, h },   <- normalized 0-100
          doors: [ { type, edge, position, width } ],
          windows: [ { edge, position, width } ]
        }
      ]
    }
    """
    rooms_json = []

    for idx, room in enumerate(rooms_px):
        # Convert pixel -> normalized (0-100)
        nx_ = (room["x"] / img_w) * GRID_SIZE
        ny_ = (room["y"] / img_h) * GRID_SIZE
        nw_ = (room["w"] / img_w) * GRID_SIZE
        nh_ = (room["h"] / img_h) * GRID_SIZE

        room_entry = {
            "id": f"r{idx + 1}",
            "name": f"Room {idx + 1}",  # Phase 1: generic names, no OCR/semantic
            "type": "other",             # Phase 1: no room type classification
            "bounds": {
                "x": round(nx_, 2),
                "y": round(ny_, 2),
                "w": round(nw_, 2),
                "h": round(nh_, 2),
            },
            "doors": room.get("doors", []),
            "windows": room.get("windows", []),
        }
        rooms_json.append(room_entry)

    return {
        "totalWidth": GRID_SIZE,
        "totalHeight": GRID_SIZE,
        "hasStairs": False,
        "hasBalcony": False,
        "rooms": rooms_json,
        # Topology metadata (not consumed by frontend yet, but useful for debugging)
        "_topology": {
            "graphNodes": graph.number_of_nodes(),
            "graphEdges": graph.number_of_edges(),
        },
    }


# ==============================================================================
# STEP 7: FALLBACK - Room detection directly from contours
# ==============================================================================
# If the graph-based approach yields no rooms (e.g., very noisy image),
# we fall back to pure contour-based room detection.

def detect_rooms_from_contours(wall_mask: np.ndarray, img_h: int, img_w: int) -> list:
    """
    Use morphological operations to find room-like enclosed areas.
    This is a robust fallback that works even on messy floor plans.
    """
    # Dilate walls to close small gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    thick_walls = cv2.dilate(wall_mask, kernel, iterations=3)

    # Invert: rooms become white blobs
    room_mask = cv2.bitwise_not(thick_walls)

    # Flood fill from corners to remove exterior regions
    # (the space OUTSIDE the building)
    flood = room_mask.copy()
    h, w = flood.shape
    mask = np.zeros((h + 2, w + 2), np.uint8)

    # Try filling from each corner - exterior regions get removed
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if flood[seed[1], seed[0]] == 255:
            cv2.floodFill(flood, mask, seed, 0)

    # Find remaining white blobs (these are rooms)
    contours, _ = cv2.findContours(
        flood, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    min_area = img_h * img_w * MIN_ROOM_AREA_RATIO
    rooms = []

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue

        x, y, cw, ch = cv2.boundingRect(contour)

        # Skip anything that's basically the whole image
        if cw > img_w * 0.9 and ch > img_h * 0.9:
            continue

        rooms.append({
            "x": int(x), "y": int(y),
            "w": int(cw), "h": int(ch),
            "area": area,
            "contour": contour,
        })

    rooms.sort(key=lambda r: r["area"], reverse=True)
    return rooms


# ==============================================================================
# OPTIONAL: Debug image output
# ==============================================================================

def save_debug_image(
    img: np.ndarray,
    rooms_px: list,
    doors_px: list,
    windows_px: list,
    graph: nx.Graph,
    path: str = "debug_output.jpg",
):
    """Draw detected rooms, doors, windows, and graph edges on the image."""
    debug = img.copy()

    # Draw rooms as green rectangles
    for room in rooms_px:
        cv2.rectangle(
            debug,
            (room["x"], room["y"]),
            (room["x"] + room["w"], room["y"] + room["h"]),
            (0, 255, 0), 2,
        )

    # Draw graph edges as blue lines
    for (p1, p2) in graph.edges():
        cv2.line(debug, (p1[0], p1[1]), (p2[0], p2[1]), (255, 0, 0), 2)

    # Draw graph nodes as red circles
    for node in graph.nodes():
        cv2.circle(debug, (node[0], node[1]), 4, (0, 0, 255), -1)

    # Draw doors as cyan rectangles
    for door in doors_px:
        x1 = int(door["cx_px"] - door["w_px"] / 2)
        y1 = int(door["cy_px"] - door["h_px"] / 2)
        x2 = int(door["cx_px"] + door["w_px"] / 2)
        y2 = int(door["cy_px"] + door["h_px"] / 2)
        cv2.rectangle(debug, (x1, y1), (x2, y2), (255, 255, 0), 2)
        cv2.putText(debug, "DOOR", (x1, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 0), 1)

    # Draw windows as magenta rectangles
    for win in windows_px:
        x1 = int(win["cx_px"] - win["w_px"] / 2)
        y1 = int(win["cy_px"] - win["h_px"] / 2)
        x2 = int(win["cx_px"] + win["w_px"] / 2)
        y2 = int(win["cy_px"] + win["h_px"] / 2)
        cv2.rectangle(debug, (x1, y1), (x2, y2), (255, 0, 255), 2)
        cv2.putText(debug, "WIN", (x1, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 0, 255), 1)

    cv2.imwrite(path, debug)
    print(f"[BetterView] Debug image saved -> {path}")


# ==============================================================================
# API ENDPOINT
# ==============================================================================

@app.post("/api/analyze-floorplan")
async def analyze_floorplan(file: UploadFile = File(...)):
    """
    Master endpoint: receives a floor plan image, runs the full pipeline,
    and returns the FloorPlanData JSON for the React 3D engine.
    """
    try:
        # -- Read & decode image --
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return {"error": "Could not decode image. Please upload a valid JPG/PNG."}

        img_h, img_w = img.shape[:2]
        print(f"[BetterView] Image loaded: {img_w}x{img_h}")

        # -- STEP 1: Extract wall mask --
        print("[BetterView] Step 1/5: Extracting wall mask...")
        wall_mask = extract_wall_mask(img)

        # -- STEP 2: Detect room contours --
        print("[BetterView] Step 2/5: Detecting room contours...")
        rooms_px = detect_room_contours(wall_mask, img_h, img_w)

        # -- STEP 3: Build wall graph --
        print("[BetterView] Step 3/5: Building topological wall graph...")
        graph = build_wall_graph(wall_mask, rooms_px, img_h, img_w)

        # -- Fallback: if contour detection found too few rooms --
        if len(rooms_px) < 2:
            print("[BetterView] [WARN] Few rooms from contours. Trying morphological fallback...")
            rooms_px = detect_rooms_from_contours(wall_mask, img_h, img_w)
            print(f"[BetterView]   -> Fallback found {len(rooms_px)} rooms.")

        # -- STEP 4: Detect doors & windows via YOLO --
        print("[BetterView] Step 4/5: Detecting doors & windows...")
        doors_px, windows_px = detect_doors_and_windows(img, img_h, img_w)
        print(f"[BetterView]   -> {len(doors_px)} doors, {len(windows_px)} windows")

        # -- STEP 5: Map openings to room edges --
        print("[BetterView] Step 5/5: Mapping openings to room edges...")
        rooms_px = assign_openings_to_rooms(rooms_px, doors_px, windows_px)

        # -- Build the final JSON payload --
        result = build_floorplan_json(rooms_px, img_h, img_w, graph)

        # -- Save debug image --
        import os
        debug_path = os.path.join(os.path.dirname(__file__), "debug_output.jpg")
        save_debug_image(img, rooms_px, doors_px, windows_px, graph, debug_path)

        print(f"[BetterView] [OK] Pipeline complete: {len(result['rooms'])} rooms extracted.")
        return result

    except Exception as e:
        traceback.print_exc()
        print(f"[BetterView] [ERROR] {str(e)}")
        return {"error": str(e)}


# -- Health check --------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "engine": "BetterView Structural Engine v1.0",
        "yolo_loaded": yolo_model is not None,
        "pipeline": "OpenCV + NetworkX + YOLO",
    }


# -- Run -----------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("  BetterView Structural Engine -- Phase 1")
    print("  Starting on http://127.0.0.1:8000")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000)