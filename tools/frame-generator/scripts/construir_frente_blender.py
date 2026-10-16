import bpy
import json
import sys
from pathlib import Path
from mathutils import Vector

# Rutas del generador.
CARPETA_PROYECTO = Path(__file__).resolve().parent.parent
CARPETA_SALIDA = CARPETA_PROYECTO / "output"

# Identificador del modelo recibido después de "--".
MODELO = (
    sys.argv[sys.argv.index("--") + 1]
    if "--" in sys.argv
    else "modelo-001"
)

if not MODELO.replace("-", "").replace("_", "").isalnum():
    raise ValueError(f"Identificador de modelo inválido: {MODELO}")

CARPETA_MODELO = CARPETA_SALIDA / MODELO
CARPETA_MODELO.mkdir(parents=True, exist_ok=True)

ARCHIVO_CONTORNOS = CARPETA_MODELO / "armazon-contornos.json"

if not ARCHIVO_CONTORNOS.exists():
    raise FileNotFoundError(
        f"No se encontró el JSON de contornos: {ARCHIVO_CONTORNOS}. "
        f"Ejecutá primero extraer_contornos.py {MODELO}."
    )

data = json.loads(
    ARCHIVO_CONTORNOS.read_text(encoding="utf-8")
)

# Dimensiones físicas en metros.
FRONT_WIDTH = 0.140
FRONT_THICKNESS = 0.002
TEMPLE_LENGTH = 0.142
TEMPLE_RADIUS = 0.0015

x0, y0, pixel_width, pixel_height = data["0"]["bbox"]
scale = FRONT_WIDTH / pixel_width

# Extremos laterales y centro vertical del frente.
outer_points = data["0"]["points"]
outer_x_min = min(point[0] for point in outer_points)
outer_x_max = max(point[0] for point in outer_points)

HINGE_LEFT_X = (
    outer_x_min - (x0 + pixel_width / 2)
) * scale

HINGE_RIGHT_X = (
    outer_x_max - (x0 + pixel_width / 2)
) * scale

HINGE_Y = 0.0
HINGE_Z = -FRONT_THICKNESS / 2


def signed_area(points):
    total = 0.0
    for i, point in enumerate(points):
        next_point = points[(i + 1) % len(points)]
        total += (
            point[0] * next_point[1]
            - next_point[0] * point[1]
        )
    return total / 2


def image_to_local(px, py):
    x = (px - (x0 + pixel_width / 2)) * scale
    y = ((y0 + pixel_height / 2) - py) * scale
    return x, y


# Escena y colección independientes para cada modelo.
NOMBRE_ESCENA = f"EscenaFrameGenerator_{MODELO}"
NOMBRE_COLECCION = f"FrameGenerator_{MODELO}"

escena = bpy.data.scenes.get(NOMBRE_ESCENA)

if escena is None:
    escena = bpy.data.scenes.new(NOMBRE_ESCENA)

coleccion = bpy.data.collections.get(NOMBRE_COLECCION)

if coleccion is None:
    coleccion = bpy.data.collections.new(NOMBRE_COLECCION)

if coleccion.name not in escena.collection.children:
    escena.collection.children.link(coleccion)

# Activar la escena de este modelo para las operaciones de Blender.
bpy.context.window.scene = escena

# Eliminar el cubo predeterminado si pertenece a esta escena.
for objeto in list(escena.objects):
    if objeto.name == "Cube":
        bpy.data.objects.remove(objeto, do_unlink=True)

# Materiales.
frame_mat = bpy.data.materials.new("MaterialArmazon")
frame_mat.diffuse_color = (0.035, 0.035, 0.035, 1.0)

temple_mat = bpy.data.materials.new("MaterialPatillas")
temple_mat.diffuse_color = (0.055, 0.055, 0.055, 1.0)

# ---------------------------------------------------------------------
# Frente: contorno exterior y dos aberturas.
# ---------------------------------------------------------------------
curve = bpy.data.curves.new("GeometriaFrente", type="CURVE")
curve.dimensions = "2D"
curve.resolution_u = 1
curve.fill_mode = "BOTH"
curve.extrude = FRONT_THICKNESS / 2

outer_points = data["0"]["points"]
outer_sign = 1 if signed_area(outer_points) >= 0 else -1

for key in ("0", "1", "3"):
    points = data[key]["points"]

    # Las aberturas deben tener orientación opuesta al perímetro exterior.
    if key != "0":
        sign = 1 if signed_area(points) >= 0 else -1
        if sign == outer_sign:
            points = list(reversed(points))

    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    spline.use_cyclic_u = True

    for i, (px, py) in enumerate(points):
        x, y = image_to_local(px, py)
        spline.points[i].co = (x, y, 0.0, 1.0)

front = bpy.data.objects.new("FrenteArmazon", curve)
coleccion.objects.link(front)
front.data.materials.append(frame_mat)

# Convertir el frente a malla.
bpy.context.view_layer.objects.active = front
front.select_set(True)
bpy.ops.object.convert(target="MESH")
front = bpy.context.object
front.name = "FrenteArmazon"

# ---------------------------------------------------------------------
# Patillas: geometría 3D separada, detrás del frente (Z negativo).
# El recorrido es paramétrico y se podrá calibrar después.
# ---------------------------------------------------------------------
def create_temple(name, side, hinge_x):
    """Crea una patilla independiente con origen en su bisagra.

    side:
        -1 = izquierda
         1 = derecha

    La geometría se define en coordenadas locales respecto
    de la bisagra. El origen del objeto permanece en ese punto.
    """
    hinge_position = Vector((hinge_x, HINGE_Y, HINGE_Z))

    temple_curve = bpy.data.curves.new(
        f"Geometria_{name}",
        type="CURVE",
    )
    temple_curve.dimensions = "3D"
    temple_curve.resolution_u = 16
    temple_curve.bevel_depth = TEMPLE_RADIUS
    temple_curve.bevel_resolution = 3

    spline = temple_curve.splines.new("POLY")
    spline.points.add(3)

    # Coordenadas locales: el primer punto coincide con la bisagra.
    path = [
        (0.0, 0.0, 0.0),
        (
            side * 0.004,
            -0.002,
            -TEMPLE_LENGTH * 0.30,
        ),
        (
            side * 0.010,
            -0.006,
            -TEMPLE_LENGTH * 0.68,
        ),
        (
            side * 0.016,
            -0.014,
            -TEMPLE_LENGTH,
        ),
    ]

    for index, (x, y, z) in enumerate(path):
        spline.points[index].co = (x, y, z, 1.0)

    obj = bpy.data.objects.new(name, temple_curve)
    coleccion.objects.link(obj)

    # La bisagra es el origen del nodo exportado.
    obj.location = hinge_position
    obj.data.materials.append(temple_mat)

    # Convertir a malla conserva el origen del objeto.
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")

    obj = bpy.context.object
    obj.name = name

    # Aplicar rotación y escala, nunca la ubicación de la bisagra.
    bpy.ops.object.transform_apply(
        location=False,
        rotation=True,
        scale=True,
    )

    return obj


left_temple = create_temple(
    "PatillaIzquierda",
    side=-1,
    hinge_x=HINGE_LEFT_X,
)

right_temple = create_temple(
    "PatillaDerecha",
    side=1,
    hinge_x=HINGE_RIGHT_X,
)

# Exportar únicamente los objetos del generador.
blend_path = CARPETA_MODELO / "armazon-frente-generado.blend"
glb_path = CARPETA_MODELO / "armazon-frente-generado.glb"

# Asegurar que la carpeta de salida exista.
CARPETA_SALIDA.mkdir(parents=True, exist_ok=True)

# Seleccionar exclusivamente los tres componentes del armazón.
bpy.ops.object.select_all(action="DESELECT")

objetos_exportacion = [
    front,
    left_temple,
    right_temple,
]

for objeto in objetos_exportacion:
    objeto.select_set(True)

bpy.context.view_layer.objects.active = front

# Guardar la escena de Blender.
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

# Exportar solo los tres objetos explícitos.
bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    use_selection=True,
    use_visible=False,
)

# Asegurar que solo los tres objetos del armazón estén seleccionados.
bpy.ops.object.select_all(action="DESELECT")

for objeto in (front, left_temple, right_temple):
    objeto.select_set(True)

bpy.context.view_layer.objects.active = front

print(
    "Objetos seleccionados para exportar:",
    [objeto.name for objeto in bpy.context.selected_objects],
)

print(f"Ancho frontal objetivo: {FRONT_WIDTH * 1000:.1f} mm")
print(f"Alto frontal derivado: {pixel_height * scale * 1000:.2f} mm")
print(f"Longitud de referencia por patilla: {TEMPLE_LENGTH * 1000:.1f} mm")
print(f"Objetos: {front.name}, {left_temple.name}, {right_temple.name}")
print(f"BLEND: {blend_path}")
print(f"GLB: {glb_path}")
