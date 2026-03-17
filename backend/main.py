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
MIN_WALL_THICKNESS = 5      # Pixels - lines thinner than this are dimension lines
MIN_SUBGRAPH_NODES = 4      # Isolated clusters smaller than this get pruned
TJUNCTION_SEARCH_DIST = 25  # Pixels - max ray-cast distance to seal T-junctions


# ==============================================================================
# STEP 1: IMAGE PRE-PROCESSING & WALL MASK EXTRACTION
# ==============================================================================
# Think of this like a "photo filter" - we take the colourful floor plan image
# and strip it down to a simple black (wall) and white (open space) picture.
# This makes it easy for the computer to see exactly where the walls are.

def extract_wall_mask(img: np.ndarray) -> np.ndarray:
    """
    Convert the floor plan into a pure binary mask using YOLO!
    This explicitly ignores text, furniture, and dimensions.
    """
    h, w = img.shape[:2]
    blueprint = np.zeros((h, w), dtype=np.uint8)

    if yolo_model is not None:
        # 1. Use YOLO to draw ONLY the structural elements
        results = yolo_model(img)
        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                class_name = yolo_model.names[int(box.cls[0].item())].lower()
                
                if class_name in ['wall', 'door', 'window', 'opening']:
                    cv2.rectangle(blueprint, (x1, y1), (x2, y2), 255, -1)
        
        # 2. The Mathematical Caulk: Dilate the YOLO boxes to seal tiny pixel gaps 
        # between doors and walls so the rooms don't bleed together.
        kernel = np.ones((15, 15), np.uint8)
        blueprint = cv2.dilate(blueprint, kernel, iterations=2)
        
    else:
        print("[BetterView] [ERROR] YOLO not loaded. Falling back to messy OpenCV...")
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blueprint = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 10)

    return blueprint


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

    # ──────────────────────────────────────────────────────────────
    # FIX 1: DIMENSION LINE FILTER (Aspect Ratio & Thickness)
    # ──────────────────────────────────────────────────────────────
    # Real walls are thick (≥5 pixels).  Dimension / leader lines
    # are hair-thin (1-3 pixels).  For every candidate line we
    # measure its *actual perpendicular thickness* inside the
    # wall_mask.  If the average thickness is below MIN_WALL_THICKNESS
    # the line is a dimension annotation, not a wall → discard it.
    thick_lines = []
    for x1, y1, x2, y2 in hv_lines:
        thickness = _measure_line_thickness(wall_mask, x1, y1, x2, y2)
        if thickness >= MIN_WALL_THICKNESS:
            thick_lines.append((x1, y1, x2, y2))

    rejected = len(hv_lines) - len(thick_lines)
    if rejected:
        print(f"[BetterView] [FIX-1] Dimension-line filter removed {rejected} thin lines.")
    hv_lines = thick_lines

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

    print(f"[BetterView] Graph (raw): {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

    # ──────────────────────────────────────────────────────────────
    # FIX 2: ISOLATED SUBGRAPH PRUNER
    # ──────────────────────────────────────────────────────────────
    # A real building is one big connected skeleton.  Floating
    # table edges / car outlines form tiny isolated clusters of
    # 2-3 nodes.  We keep only components with ≥ MIN_SUBGRAPH_NODES.
    G = _prune_isolated_subgraphs(G)

    # ──────────────────────────────────────────────────────────────
    # FIX 3: T-JUNCTION EXTENDER (Ray-Cast Gap Sealer)
    # ──────────────────────────────────────────────────────────────
    # Dead-end nodes (degree 1) often sit just a few pixels short
    # of a perpendicular wall.  We cast a ray in the wall direction
    # and, if it hits another edge, stretch the wall to form a
    # perfect T-junction.
    G = _extend_t_junctions(G)

    print(f"[BetterView] Graph (clean): {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
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
# FIX 1 HELPER: Measure perpendicular thickness of a line in the wall mask
# ==============================================================================
# Imagine holding a ruler *across* a wall (not along it).  We do this at several
# points along the line and average the measurement.  A real wall might measure
# 8-15 px; a dimension leader line measures 1-3 px.

def _measure_line_thickness(
    wall_mask: np.ndarray,
    x1: int, y1: int,
    x2: int, y2: int,
    num_samples: int = 7,
    max_probe: int = 30,
) -> float:
    """
    Sample the wall_mask perpendicular to the line at `num_samples` points.
    Return the average thickness (in pixels).
    """
    h, w = wall_mask.shape[:2]
    is_horizontal = (y1 == y2)
    thicknesses = []

    for i in range(num_samples):
        # Pick a point along the line  (0.1 … 0.9 to stay away from endpoints)
        t = 0.1 + 0.8 * i / max(1, num_samples - 1)
        cx = int(x1 + t * (x2 - x1))
        cy = int(y1 + t * (y2 - y1))

        count = 0
        if is_horizontal:
            # Probe vertically (up and down)
            for dy in range(-max_probe, max_probe + 1):
                py = cy + dy
                if 0 <= py < h and wall_mask[py, cx] > 0:
                    count += 1
        else:
            # Probe horizontally (left and right)
            for dx in range(-max_probe, max_probe + 1):
                px = cx + dx
                if 0 <= px < w and wall_mask[cy, px] > 0:
                    count += 1

        thicknesses.append(count)

    return float(np.mean(thicknesses)) if thicknesses else 0.0


# ==============================================================================
# FIX 2: Isolated Subgraph Pruner
# ==============================================================================
# In Graph Theory a "connected component" is a group of nodes where you can
# walk from any node to any other.  A real house is ONE big component.
# A stray table edge might add a tiny 2-node component.  We delete any
# component smaller than MIN_SUBGRAPH_NODES.

def _prune_isolated_subgraphs(G: nx.Graph) -> nx.Graph:
    """
    Remove tiny disconnected clusters (furniture ghosts, car outlines, etc.).
    Keeps only connected components with >= MIN_SUBGRAPH_NODES nodes.
    """
    if G.number_of_nodes() == 0:
        return G

    components = list(nx.connected_components(G))
    pruned = 0

    for comp in components:
        if len(comp) < MIN_SUBGRAPH_NODES:
            G.remove_nodes_from(comp)
            pruned += len(comp)

    if pruned:
        print(f"[BetterView] [FIX-2] Subgraph pruner removed {pruned} floating nodes.")
    return G


# ==============================================================================
# FIX 3: T-Junction Extender (Ray-Cast Gap Sealer)
# ==============================================================================
# When a wall ends just *short* of another wall we get a visible gap.
# This fix looks at every "dead-end" node (degree == 1) and asks:
#   "If I keep going in the same direction, do I hit another wall?"
# If yes, it stretches the wall to create a watertight T-junction.
#
# Analogy: Imagine pushing a curtain rod until it touches the opposite wall.
#          That's exactly what this function does for each dangling wall end.

def _extend_t_junctions(G: nx.Graph) -> nx.Graph:
    """
    For each degree-1 node, cast a ray along the wall's direction.
    If the ray intersects (or nearly touches) an existing edge,
    split that edge and create a T-junction.
    """
    if G.number_of_nodes() == 0:
        return G

    extensions_made = 0
    max_iterations = 3  # Repeat a few times - fixing one gap may reveal another

    for _iteration in range(max_iterations):
        new_extensions = 0
        dead_ends = [n for n in G.nodes() if G.degree(n) == 1]

        for node in dead_ends:
            if G.degree(node) != 1:
                continue  # May have changed from a previous extension this round

            neighbor = list(G.neighbors(node))[0]
            edge_data = G.edges[node, neighbor]
            is_horiz = edge_data.get("is_horizontal", True)

            # Direction vector: node → away from neighbor (the "open" end)
            dx = node[0] - neighbor[0]
            dy = node[1] - neighbor[1]
            length = max(1.0, np.sqrt(dx*dx + dy*dy))
            dx_norm = dx / length
            dy_norm = dy / length

            # Cast a ray from the dead-end node
            best_hit = None
            best_dist = float("inf")

            for (e1, e2) in list(G.edges()):
                if node in (e1, e2):
                    continue  # Skip the node's own edge

                target_is_horiz = G.edges[e1, e2].get("is_horizontal", True)

                # We want perpendicular hits (H-wall → V-wall or V → H)
                if target_is_horiz == is_horiz:
                    continue

                # Project the dead-end onto the target edge
                if target_is_horiz:
                    # Target is horizontal: check if dead-end's Y is close to target's Y
                    target_y = (e1[1] + e2[1]) / 2
                    # The ray must be heading toward target_y
                    if abs(dy_norm) < 0.5:
                        continue
                    dist_y = target_y - node[1]
                    if (dist_y * dy_norm) < 0:
                        continue  # Wrong direction
                    abs_dist = abs(dist_y)
                    if abs_dist > TJUNCTION_SEARCH_DIST:
                        continue
                    # Check if the node's X falls within the target edge's X range
                    min_x = min(e1[0], e2[0]) - 3
                    max_x = max(e1[0], e2[0]) + 3
                    if not (min_x <= node[0] <= max_x):
                        continue
                    if abs_dist < best_dist:
                        best_dist = abs_dist
                        hit_point = (node[0], int(target_y))
                        best_hit = (e1, e2, hit_point)
                else:
                    # Target is vertical: check if dead-end's X is close to target's X
                    target_x = (e1[0] + e2[0]) / 2
                    if abs(dx_norm) < 0.5:
                        continue
                    dist_x = target_x - node[0]
                    if (dist_x * dx_norm) < 0:
                        continue  # Wrong direction
                    abs_dist = abs(dist_x)
                    if abs_dist > TJUNCTION_SEARCH_DIST:
                        continue
                    min_y = min(e1[1], e2[1]) - 3
                    max_y = max(e1[1], e2[1]) + 3
                    if not (min_y <= node[1] <= max_y):
                        continue
                    if abs_dist < best_dist:
                        best_dist = abs_dist
                        hit_point = (int(target_x), node[1])
                        best_hit = (e1, e2, hit_point)

            # If we found a hit, create the T-junction
            if best_hit is not None:
                e1, e2, hit_point = best_hit
                target_data = G.edges[e1, e2]

                # 1. Remove the old target edge
                G.remove_edge(e1, e2)

                # 2. Add the new junction node
                G.add_node(hit_point, x=hit_point[0], y=hit_point[1])

                # 3. Split the target edge at the hit point
                len_a = np.sqrt((hit_point[0]-e1[0])**2 + (hit_point[1]-e1[1])**2)
                len_b = np.sqrt((hit_point[0]-e2[0])**2 + (hit_point[1]-e2[1])**2)
                G.add_edge(e1, hit_point, length=len_a, is_horizontal=target_data["is_horizontal"])
                G.add_edge(hit_point, e2, length=len_b, is_horizontal=target_data["is_horizontal"])

                # 4. Connect the dead-end to the new junction
                ext_len = np.sqrt((hit_point[0]-node[0])**2 + (hit_point[1]-node[1])**2)
                G.add_edge(node, hit_point, length=ext_len, is_horizontal=is_horiz)

                new_extensions += 1

        extensions_made += new_extensions
        if new_extensions == 0:
            break  # No more gaps to seal

    if extensions_made:
        print(f"[BetterView] [FIX-3] T-junction extender sealed {extensions_made} gaps.")
    return G


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
    doors_px: list, 
    windows_px: list,
    img_h: int,
    img_w: int,
    graph: nx.Graph,
) -> dict:
    
    GRID_SIZE = 100.0
    aspect_ratio = img_h / img_w
    scene_depth = GRID_SIZE * aspect_ratio

    # 1. Extract perfectly snapped walls from NetworkX Edges
    walls_json = []
    for p1, p2, edge_data in graph.edges(data=True):
        cx_px = (p1[0] + p2[0]) / 2
        cy_px = (p1[1] + p2[1]) / 2
        
        # Convert to 0-100 React Grid
        cx = (cx_px / img_w) * GRID_SIZE
        cz = (cy_px / img_h) * scene_depth
        length = (edge_data["length"] / img_w) * GRID_SIZE
        
        walls_json.append({
            "centerX": cx,
            "centerZ": cz,
            "length": length,
            "thickness": 1.5, # Standardized 3D wall thickness
            "isHorizontal": edge_data["is_horizontal"]
        })

    # 2. Extract Doors for global wall-cutting
    doors_json = []
    for d in doors_px:
        doors_json.append({
            "centerX": (d["cx_px"] / img_w) * GRID_SIZE,
            "centerZ": (d["cy_px"] / img_h) * scene_depth,
            "width": max((d["w_px"] / img_w) * GRID_SIZE, 3.0), # Ensure minimum door width
            "isHorizontal": d["is_horizontal"],
            "type": d.get("type", "internal")
        })

    # 3. Extract Windows for global wall-cutting
    windows_json = []
    for w in windows_px:
        windows_json.append({
            "centerX": (w["cx_px"] / img_w) * GRID_SIZE,
            "centerZ": (w["cy_px"] / img_h) * scene_depth,
            "width": max((w["w_px"] / img_w) * GRID_SIZE, 3.0),
            "isHorizontal": w["is_horizontal"],
            "height": 1.2
        })

    # 4. Extract Rooms (for the floor tiles)
    rooms_json = []
    for idx, room in enumerate(rooms_px):
        nx_ = ((room["x"] + room["w"]/2) / img_w) * GRID_SIZE
        ny_ = ((room["y"] + room["h"]/2) / img_h) * scene_depth
        nw_ = (room["w"] / img_w) * GRID_SIZE
        nh_ = (room["h"] / img_h) * scene_depth

        rooms_json.append({
            "id": f"r{idx + 1}",
            "name": f"Room {idx + 1}",
            "type": "other",
            "cx": nx_,
            "cz": ny_,
            "w": nw_,
            "d": nh_,
        })

    return {
        "sceneW": GRID_SIZE,
        "sceneD": scene_depth,
        "totalWidth": GRID_SIZE,
        "totalHeight": scene_depth,
        "hasStairs": False,
        "hasBalcony": False,
        "walls": walls_json,
        "doors": doors_json,
        "windows": windows_json,
        "rooms": rooms_json,
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
        result = build_floorplan_json(rooms_px, doors_px, windows_px, img_h, img_w, graph)

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