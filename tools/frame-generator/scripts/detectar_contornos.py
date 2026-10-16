
from pathlib import Path

import cv2
import numpy as np

folder = Path(__file__).parent
image_path = folder / "try-on.png"
img = cv2.imread(str(image_path), cv2.IMREAD_UNCHANGED)

if img is None or img.ndim != 3 or img.shape[2] != 4:
    raise ValueError(f"No se pudo leer un PNG RGBA válido: {image_path}")

alpha = img[:, :, 3]
mask = np.where(alpha > 128, 255, 0).astype(np.uint8)

contours, hierarchy = cv2.findContours(
    mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE
)

preview = img[:, :, :3].copy()
hierarchy = hierarchy[0] if hierarchy is not None else []

for i, contour in enumerate(contours):
    area = cv2.contourArea(contour)
    if area < 100:
        continue

    x, y, w, h = cv2.boundingRect(contour)
    cv2.drawContours(preview, [contour], -1, (0, 255, 0), 2)

    # Número en el centro de la caja delimitadora.
    center = (x + w // 2, y + h // 2)
    cv2.putText(
        preview,
        str(i),
        center,
        cv2.FONT_HERSHEY_SIMPLEX,
        1.0,
        (0, 0, 255),
        2,
        cv2.LINE_AA,
    )

    parent = int(hierarchy[i][3]) if len(hierarchy) else -1
    print(
        f"Contorno {i}: area={area:.0f}, "
        f"caja=({x}, {y}, {w}, {h}), padre={parent}"
    )

output_path = folder / "try-on-contornos-numerados.png"
cv2.imwrite(str(output_path), preview)
print(f"Imagen numerada: {output_path}")
