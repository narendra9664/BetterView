from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import cv2
import numpy as np
import os
import pytesseract

# --- Tell Python exactly where you installed Tesseract ---
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("[BetterView] Loading Custom Architectural YOLO Model...")
model = YOLO("best.pt") 

@app.post("/api/analyze-floorplan")
async def analyze_floorplan(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        height, width, _ = img.shape

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blueprint = np.zeros((height, width), dtype=np.uint8)

        # 1. YOLO Inference
        results = model(img)
        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                class_name = model.names[int(box.cls[0].item())].lower()
                
                # Draw the structural blocks
                if class_name in ['wall', 'door', 'window', 'opening']:
                    cv2.rectangle(blueprint, (x1, y1), (x2, y2), 255, -1)
        
        # --- THE FIX: WATERTIGHT SEALING ---
        # We expand the drawn walls/doors by 15 pixels in all directions to 
        # seal the tiny gaps before we try to extract the rooms.
        kernel = np.ones((15, 15), np.uint8)
        blueprint_sealed = cv2.dilate(blueprint, kernel, iterations=2)

        # Invert to find the empty spaces
        rooms_only = cv2.bitwise_not(blueprint_sealed)

        # 2. Extract the sealed rooms
        contours, _ = cv2.findContours(rooms_only, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

        rooms = []
        room_count = 1

        for cnt in contours:
            area = cv2.contourArea(cnt)
            
            # Use the sealed rooms to find the bounding boxes
            if 3000 < area < (width * height * 0.8): 
                x, y, w, h = cv2.boundingRect(cnt)

                room_crop = gray[y:y+h, x:x+w]
                custom_config = r'--oem 3 --psm 6'
                extracted_text = pytesseract.image_to_string(room_crop, config=custom_config).lower()

                room_type = "other"
                room_name = f"Room {room_count}"

                if "bed" in extracted_text:
                    room_type = "bedroom"
                    room_name = "Bedroom"
                elif "kit" in extracted_text or "liv" in extracted_text or "lounge" in extracted_text:
                    # Your floor plan combines living/kitchen, so we group them
                    room_type = "living" 
                    room_name = "Living Area"
                elif "bath" in extracted_text or "wc" in extracted_text or "toi" in extracted_text:
                    room_type = "bathroom"
                    room_name = "Bathroom"
                elif "balc" in extracted_text or "terrace" in extracted_text:
                    room_type = "balcony"
                    room_name = "Balcony"

                print(f"[OCR] Room {room_count} read as: '{extracted_text.strip()}' -> Mapped to: {room_type}")

                pct_x = round((x / width) * 100, 2)
                pct_y = round((y / height) * 100, 2)
                pct_w = round((w / width) * 100, 2)
                pct_h = round((h / height) * 100, 2)

                rooms.append({
                    "id": f"r{room_count}",
                    "name": room_name,
                    "type": room_type,
                    "bounds": { "x": pct_x, "y": pct_y, "w": pct_w, "h": pct_h },
                    "doors": [],
                    "windows": []
                })
                room_count += 1

        print(f"[BetterView] Successfully mapped {len(rooms)} rooms!")

        return {
            "totalWidth": 100,
            "totalHeight": 100,
            "hasStairs": False,
            "hasBalcony": False,
            "rooms": rooms
        }

    except Exception as e:
        print(f"[BetterView] ERROR: {str(e)}")
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)