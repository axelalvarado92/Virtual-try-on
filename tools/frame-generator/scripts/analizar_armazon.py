from PIL import Image
from pathlib import Path

folder = Path(__file__).parent
image_path = folder / "try-on.png"

img = Image.open(image_path).convert("RGBA")
alpha = img.getchannel("A")

print(f"Imagen: {img.width} x {img.height}")

for threshold in (10, 64, 128, 200, 250):
    mask = alpha.point(
        lambda value: 255 if value > threshold else 0
    )
    bbox = mask.getbbox()
    print(f"Umbral alfa > {threshold}: {bbox}")

# Guardar una máscara para inspección visual.
threshold = 128
mask = alpha.point(
    lambda value: 255 if value > threshold else 0
)
mask_path = folder / "try-on-mask-128.png"
mask.save(mask_path)

print(f"Máscara guardada: {mask_path}")