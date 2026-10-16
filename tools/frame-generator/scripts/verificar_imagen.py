
from pathlib import Path

import cv2
import numpy as np

CARPETA = Path(__file__).resolve().parent
IMAGEN = CARPETA / "try-on.png"

imagen = cv2.imread(str(IMAGEN), cv2.IMREAD_UNCHANGED)

if imagen is None:
    raise FileNotFoundError(f"No se pudo abrir: {IMAGEN}")

print(f"Archivo: {IMAGEN}")
print(f"Dimensiones: {imagen.shape[1]} x {imagen.shape[0]}")
print(f"Canales: {imagen.shape[2] if imagen.ndim == 3 else 1}")

if imagen.ndim != 3 or imagen.shape[2] != 4:
    print("\nERROR: la imagen no tiene canal alfa.")
    print("Necesitamos PNG con transparencia real para continuar.")
    raise SystemExit(1)

alpha = imagen[:, :, 3]

pixeles_transparentes = np.count_nonzero(alpha == 0)
pixeles_opacos = np.count_nonzero(alpha == 255)

print(f"Pixeles totalmente transparentes: {pixeles_transparentes}")
print(f"Pixeles totalmente opacos: {pixeles_opacos}")
print(f"Rango alfa: {alpha.min()} a {alpha.max()}")

# Guardar una máscara para comprobar la silueta.
mascara = np.where(alpha > 128, 255, 0).astype(np.uint8)
salida_mascara = CARPETA / "verificacion-mascara.png"
cv2.imwrite(str(salida_mascara), mascara)

# Detectar y numerar los contornos actuales.
contornos, jerarquia = cv2.findContours(
    mascara.copy(),
    cv2.RETR_TREE,
    cv2.CHAIN_APPROX_SIMPLE,
)

diagnostico = cv2.cvtColor(mascara, cv2.COLOR_GRAY2BGR)

print(f"\nContornos detectados: {len(contornos)}")

if jerarquia is not None:
    jerarquia = jerarquia[0]

    for i, contorno in enumerate(contornos):
        area = cv2.contourArea(contorno)
        x, y, w, h = cv2.boundingRect(contorno)
        padre = int(jerarquia[i][3])

        print(
            f"Contorno {i}: area={area:.0f}, "
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

salida_contornos = CARPETA / "verificacion-contornos.png"
cv2.imwrite(str(salida_contornos), diagnostico)

print(f"\nMáscara: {salida_mascara}")
print(f"Diagnóstico: {salida_contornos}")
print("Verificación terminada.")
