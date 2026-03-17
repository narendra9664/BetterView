import sys
import io

# Force UTF-8 output on Windows to avoid charmap encoding errors with emojis
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import os
import requests
import shutil
import time

API_URL = "http://127.0.0.1:8000/api/analyze-floorplan"
TEST_DIR = "test_blueprints"
RESULTS_DIR = "test_results"

# Ensure the results folder exists
if not os.path.exists(RESULTS_DIR):
    os.makedirs(RESULTS_DIR)

print("==================================================")
print("🚀 Starting Betterview Batch Stress Test")
print("==================================================")

# Get all images in the test folder
image_files = [f for f in os.listdir(TEST_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]

if not image_files:
    print(f"❌ No images found in '{TEST_DIR}'. Please add some floor plans!")
    exit()

success_count = 0

for index, filename in enumerate(image_files):
    filepath = os.path.join(TEST_DIR, filename)
    print(f"\n[{index + 1}/{len(image_files)}] Analyzing: {filename}...")
    
    start_time = time.time()
    
    try:
        # Simulate a user uploading the file to your API
        with open(filepath, 'rb') as f:
            files = {'file': (filename, f, 'image/jpeg')}
            response = requests.post(API_URL, files=files)
        
        process_time = round(time.time() - start_time, 2)
        
        if response.status_code == 200:
            data = response.json()
            walls = len(data.get("walls", []))
            doors = len(data.get("doors", []))
            windows = len(data.get("windows", []))
            
            print(f"  ✅ Success! ({process_time}s) -> Found: {walls} Walls, {doors} Doors, {windows} Windows")
            success_count += 1
            
            # The API currently saves a local 'debug_output.jpg'. 
            # We need to rename and move it so it doesn't get overwritten by the next image.
            if os.path.exists("debug_output.jpg"):
                new_debug_name = f"result_{filename}"
                shutil.move("debug_output.jpg", os.path.join(RESULTS_DIR, new_debug_name))
                
        else:
            print(f"  ❌ API Failed with Status: {response.status_code}")
            print(f"  Error: {response.text}")
            
    except Exception as e:
         print(f"  ❌ Crash: {str(e)}")

print("\n==================================================")
print(f"🏁 Test Complete! Successfully processed {success_count}/{len(image_files)} images.")
print(f"Check the '{RESULTS_DIR}' folder to visually review the X-Ray maps.")
print("==================================================")