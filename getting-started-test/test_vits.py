from transformers import pipeline
from PIL import Image
import numpy as np
import cv2

# Initialize the pipeline
pipe = pipeline(task="depth-estimation", model="depth-anything/Depth-Anything-V2-Small-hf", device="cpu")

# Load image
img_path = '../../ml-depth-pro/data/example.jpg'
image = Image.open(img_path)

# Run inference
result = pipe(image)
depth_pil = result["depth"]

# --- SHOW THE IMAGE ---

# Option 1: Quick PIL popup (opens default system image viewer)
# depth_pil.show()

# Option 2: OpenCV Window (Better for real-time/video)
# Convert PIL image to numpy array for OpenCV
depth_map = np.array(depth_pil)

# Enhance visualization: Apply a colormap (Magma or Plasma look great for depth)
depth_color = cv2.applyColorMap(depth_map, cv2.COLORMAP_MAGMA)

# Resize to fit screen
screen_height, screen_width = 1080, 1920  # Adjust to your screen resolution
h, w = depth_color.shape[:2]
scale = min(screen_width / w, screen_height / h, 1.0)
resized = cv2.resize(depth_color, (int(w * scale), int(h * scale)))

cv2.imshow('Depth Anything V2 - Small', resized)

print("Press any key on the image window to exit...")
cv2.waitKey(0) # Wait for a key press to close the window
cv2.destroyAllWindows()