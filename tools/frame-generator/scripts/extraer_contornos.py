from pathlib import Path
import json
import sys
import cv2
import numpy as np

CARPETA_PROYECTO = Path(__file__).resolve().parent.parent
CARPETA_ASSETS = CARPETA_PROYECTO / "assets"
CARPETA_OUTPUT = CARPETA_PROYECTO / "output"

MODELO = sys.argv[1] if len(sys.argv) > 1 else "modelo-001"

if not MODELO.replace("-", "").replace("_", "").isalnum():
    raise ValueError(f"Identificador de modelo inválido: {MODELO}")

CARPETA_ENTRADA = CARPETA_ASSETS / MODELO
CARPETA_SALIDA = CARPETA_OUTPUT / MODELO
CARPETA_SALIDA.mkdir(parents=True, exist_ok=True)

IMAGEN = CARPETA_ENTRADA / "try-on.png"

imagen = cv2.imread(str(IMAGEN), cv2.IMREAD_UNCHANGED)

if imagen is None:
    raise FileNotFoundError(f"No se pudo abrir la imagen: {IMAGEN}")

if imagen.ndim != 3 or imagen.shape[2] != 4:
    raise ValueError("La imagen debe ser un PNG RGBA con transparencia.")
    
alpha = imagen[:, :, 3]
mascara = np.where(alpha > 128, 255, 0).astype(np.uint8)

contornos, jerarquia = cv2.findContours(
    mascara.copy(),
    cv2.RETR_TREE,
    cv2.CHAIN_APPROX_SIMPLE,
)

if jerarquia is None:
    raise ValueError("No se detectaron contornos.")

jerarquia = jerarquia[0]

print(f"Imagen: {IMAGEN.name}")
print(f"Dimensiones: {imagen.shape[1]} x {imagen.shape[0]}")
print(f"Contornos detectados: {len(contornos)}")

diagnostico = cv2.cvtColor(mascara, cv2.COLOR_GRAY2BGR)
datos = {}

for i, contorno in enumerate(contornos):
    area = float(cv2.contourArea(contorno))
    x, y, w, h = cv2.boundingRect(contorno)
    padre = int(jerarquia[i][3])

    print(
        f"Contorno {i}: área={area:.0f}, "
        f"caja=({x},{y},{w},{h}), padre={padre}"
    )

    cv2.drawContours(diagnostico, [contorno], -1, (0, 255, 0), 2)
    cv2.putText(
        diagnostico,
        str(i),
        (x, max(20, y - 5)),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (0, 0, 255),
        2,
    )

    datos[str(i)] = {
        "area": area,
        "bbox": [int(x), int(y), int(w), int(h)],
        "parent": padre,
        "points": contorno.reshape(-1, 2).tolist(),
    }

archivo_json = CARPETA_SALIDA / "armazon-contornos.json"
archivo_mascara = CARPETA_SALIDA / "armazon-mascara-limpia.png"
archivo_diagnostico = CARPETA_SALIDA / "armazon-contornos-diagnostico.png"

CARPETA_SALIDA.mkdir(parents=True, exist_ok=True)

with archivo_json.open("w", encoding="utf-8") as f:
    json.dump(datos, f, ensure_ascii=False)

cv2.imwrite(str(archivo_mascara), mascara)
cv2.imwrite(str(archivo_diagnostico), diagnostico)

print("\nArchivos generados:")
print(archivo_json)
print(archivo_mascara)
print(archivo_diagnostico)
