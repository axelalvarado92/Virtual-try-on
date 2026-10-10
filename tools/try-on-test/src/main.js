import * as THREE from "three";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { products, defaultProductId } from "./products.js";

/* -------------------------------------------------------------------------- */
/* Constantes                                                                 */
/* -------------------------------------------------------------------------- */

const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
const FACE_MODEL_PATH = "/face_landmarker.task";

const LANDMARKS = {
  LEFT_EYE: 33,
  RIGHT_EYE: 263,
};

// Puntos rojos de depuración dibujados sobre el video.
const DEBUG_POINTS = [
  33, // ojo izquierdo
  263, // ojo derecho
  1, // nariz
  61, // boca
  291, // boca
];

// Valores iniciales de prueba; se calibran con la cámara real.
const EYE_DISTANCE_RANGE = { min: 130, max: 190 }; // en píxeles del video
const FACE_CENTER_X_RANGE = { min: 0.375, max: 0.625 }; // normalizado 0..1
const REFERENCE_EYE_DISTANCE = 76; // en unidades de escena

const SELFIE_HEIGHT_RATIO = 0.9;
const Z_LAYERS = { selfie: 0, landmarks: 2, glasses: 10 };

// Definición de los sliders del panel de calibración.
const SLIDERS = {
  scale: { label: "Escala", min: 3, max: 15, step: 0.05, format: (v) => Number(v).toFixed(2) },
  offsetX: { label: "X", min: -100, max: 100, step: 1, format: (v) => String(v) },
  offsetY: { label: "Y", min: -100, max: 100, step: 1, format: (v) => String(v) },
  offsetZ: { label: "Z", min: -100, max: 100, step: 1, format: (v) => String(v) },
  rotationX: { label: "Rotación X (grados)", min: -180, max: 180, step: 1, format: (v) => `${v}°` },
  rotationY: { label: "Rotación Y (grados)", min: -180, max: 180, step: 1, format: (v) => `${v}°` },
  rotationZ: { label: "Rotación Z (grados)", min: -180, max: 180, step: 1, format: (v) => `${v}°` },
};
const CALIBRATION_KEYS = ["scale", "offsetX", "offsetY", "offsetZ"];
const ROTATION_KEYS = ["rotationX", "rotationY", "rotationZ"];

/* -------------------------------------------------------------------------- */
/* Escena                                                                     */
/* -------------------------------------------------------------------------- */

function createScene() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  const scene = new THREE.Scene();

  const camera = new THREE.OrthographicCamera(
    -width / 2,
    width / 2,
    height / 2,
    -height / 2,
    0.1,
    1000
  );
  camera.position.z = 100;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  document.body.appendChild(renderer.domElement);

  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(0, 0, 100);
  scene.add(light);

  return { scene, camera, renderer, height };
}

function createDistanceGuide() {
  const element = document.createElement("div");

  Object.assign(element.style, {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "12px 18px",
    borderRadius: "8px",
    background: "rgba(0, 0, 0, 0.75)",
    color: "white",
    fontFamily: "Arial, sans-serif",
    fontSize: "16px",
    textAlign: "center",
    zIndex: "1000",
    width: "max-content",
    maxWidth: "85vw",
  });

  element.textContent = "Buscando rostro...";
  document.body.appendChild(element);

  return element;
}

/* -------------------------------------------------------------------------- */
/* Cámara y detección facial                                                  */
/* -------------------------------------------------------------------------- */

async function createFaceLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: FACE_MODEL_PATH },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  });
}

async function startCamera() {
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;

  Object.assign(video.style, {
    position: "fixed",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(video);

  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  await video.play();

  return video;
}

/* -------------------------------------------------------------------------- */
/* Capas visuales: selfie y puntos de depuración                              */
/* -------------------------------------------------------------------------- */

function createSelfiePlane(video, sceneHeight) {
  const aspectRatio = video.videoWidth / video.videoHeight;
  const height = sceneHeight * SELFIE_HEIGHT_RATIO;
  const width = height * aspectRatio;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: new THREE.VideoTexture(video),
      depthWrite: false,
    })
  );
  mesh.position.z = Z_LAYERS.selfie;
  mesh.renderOrder = 0;

  return { mesh, width, height };
}

function createLandmarkLayer(video, planeWidth, planeHeight) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(planeWidth, planeHeight),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })
  );
  mesh.position.z = Z_LAYERS.landmarks;
  mesh.renderOrder = 1;

  function draw(landmarks) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "red";

    for (const index of DEBUG_POINTS) {
      const point = landmarks[index];

      context.beginPath();
      context.arc(point.x * canvas.width, point.y * canvas.height, 8, 0, Math.PI * 2);
      context.fill();
    }

    texture.needsUpdate = true;
  }

  return { mesh, draw };
}

/* -------------------------------------------------------------------------- */
/* Medición del rostro                                                        */
/* -------------------------------------------------------------------------- */

// Convierte los landmarks de los ojos en valores de escena y en píxeles de video.
function measureFace(landmarks, video, selfie) {
  const leftEye = landmarks[LANDMARKS.LEFT_EYE];
  const rightEye = landmarks[LANDMARKS.RIGHT_EYE];

  const eyeDistancePixels = Math.hypot(
    (rightEye.x - leftEye.x) * video.videoWidth,
    (rightEye.y - leftEye.y) * video.videoHeight
  );

  const toScene = (point) => ({
    x: point.x * selfie.width - selfie.width / 2,
    y: selfie.height / 2 - point.y * selfie.height,
  });
  const left = toScene(leftEye);
  const right = toScene(rightEye);

  return {
    eyeDistancePixels,
    faceCenterX: (leftEye.x + rightEye.x) / 2,
    eyeCenter: { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 },
    eyeDistance: Math.hypot(right.x - left.x, right.y - left.y),
    eyeAngle: Math.atan2(right.y - left.y, right.x - left.x),
  };
}

function evaluatePosition({ eyeDistancePixels, faceCenterX }) {
  const isCentered =
    faceCenterX >= FACE_CENTER_X_RANGE.min &&
    faceCenterX <= FACE_CENTER_X_RANGE.max;
  const isCorrectDistance =
    eyeDistancePixels >= EYE_DISTANCE_RANGE.min &&
    eyeDistancePixels <= EYE_DISTANCE_RANGE.max;

  let message = "Distancia correcta";
  if (!isCentered) {
    message = "Centrá tu rostro frente a la cámara";
  } else if (eyeDistancePixels < EYE_DISTANCE_RANGE.min) {
    message = "Acercate un poco a la cámara";
  } else if (eyeDistancePixels > EYE_DISTANCE_RANGE.max) {
    message = "Alejate un poco de la cámara";
  }

  return { isValid: isCorrectDistance && isCentered, message };
}

function updateFaceRotation(result, faceRotation) {
  const matrixData = result.facialTransformationMatrixes?.[0]?.data;
  if (!matrixData) return;

  const rotationMatrix = new THREE.Matrix4().fromArray(matrixData);
  faceRotation.setFromRotationMatrix(rotationMatrix, "YXZ");
}

function placeGlasses(glasses, metrics, faceRotation) {
  glasses.position.set(metrics.eyeCenter.x, metrics.eyeCenter.y, Z_LAYERS.glasses);
  glasses.rotation.set(
    faceRotation.x,
    faceRotation.y,
    metrics.eyeAngle + faceRotation.z,
    "YXZ"
  );
  glasses.scale.setScalar(metrics.eyeDistance / REFERENCE_EYE_DISTANCE);
}

/* -------------------------------------------------------------------------- */
/* Panel de calibración (UI)                                                  */
/* -------------------------------------------------------------------------- */

function sliderHtml(key) {
  const { label, min, max, step } = SLIDERS[key];

  return `
    <label>
      ${label}
      <input id="slider-${key}" type="range" min="${min}" max="${max}"
             step="${step}" value="0" style="width:100%;">
    </label>
    <div id="slider-${key}-value"></div>
    <br>
  `;
}

function createCalibrationPanel() {
  const panel = document.createElement("div");

  Object.assign(panel.style, {
    position: "fixed",
    top: "10px",
    left: "10px",
    zIndex: "9999",
    padding: "8px",
    background: "rgba(0, 0, 0, 0.85)",
    color: "white",
    fontFamily: "Arial, sans-serif",
    fontSize: "12px",
    borderRadius: "8px",
    width: "200px",
    maxHeight: "calc(100vh - 40px)",
    overflowY: "auto",
    boxSizing: "border-box",
  });

  const productOptions = Object.values(products)
    .map(
      (product) =>
        `<option value="${product.id}" ${
          product.id === defaultProductId ? "selected" : ""
        }>${product.name}</option>`
    )
    .join("");

  panel.innerHTML = `
    <div style="margin-bottom:8px;font-weight:bold;">Probador virtual</div>

    <label>
      Modelo
      <select id="product-selector" style="width:100%;margin-top:4px;">
        ${productOptions}
      </select>
    </label>

    <div style="margin-top:12px;margin-bottom:8px;font-weight:bold;">
      Calibración de gafas
    </div>
    ${CALIBRATION_KEYS.map(sliderHtml).join("")}

    <div style="margin-bottom:8px;font-weight:bold;">Rotación del modelo</div>
    ${ROTATION_KEYS.map(sliderHtml).join("")}

    <button id="save-calibration"
            style="width:100%;padding:9px;cursor:pointer;font-weight:bold;">
      Guardar calibración
    </button>
  `;
  document.body.appendChild(panel);

  const sliders = {};
  for (const key of [...CALIBRATION_KEYS, ...ROTATION_KEYS]) {
    const input = panel.querySelector(`#slider-${key}`);
    const label = panel.querySelector(`#slider-${key}-value`);

    const refreshLabel = () => {
      label.textContent = SLIDERS[key].format(input.value);
    };

    sliders[key] = {
      input,
      refreshLabel,
      get value() {
        return Number(input.value);
      },
      setValue(value) {
        input.value = value;
        refreshLabel();
      },
    };
  }

  return {
    selector: panel.querySelector("#product-selector"),
    saveButton: panel.querySelector("#save-calibration"),
    sliders,
  };
}

/* -------------------------------------------------------------------------- */
/* Productos (modelos 3D) y calibración                                       */
/* -------------------------------------------------------------------------- */

function applyCalibration({ model, config }) {
  model.scale.setScalar(config.scale);
  model.position.set(config.offsetX, config.offsetY, config.offsetZ);
}

function syncPanelWithProduct(ui, product, config) {
  const { sliders } = ui;

  // El rango de la escala depende del tamaño original de cada modelo.
  sliders.scale.input.min = Math.min(3, config.scale);
  sliders.scale.input.max = Math.max(15, config.scale * 1.5);
  sliders.scale.input.step = config.scale >= 100 ? 1 : 0.05;

  sliders.scale.setValue(config.scale);
  sliders.offsetX.setValue(config.offsetX);
  sliders.offsetY.setValue(config.offsetY);
  sliders.offsetZ.setValue(config.offsetZ);

  sliders.rotationX.setValue(THREE.MathUtils.radToDeg(product.modelRotation.x));
  sliders.rotationY.setValue(THREE.MathUtils.radToDeg(product.modelRotation.y));
  sliders.rotationZ.setValue(THREE.MathUtils.radToDeg(product.modelRotation.z));
}

// Carga productos .glb y los reemplaza dentro del grupo `glasses`.
function createProductManager(glasses, ui) {
  const loader = new GLTFLoader();
  let loadVersion = 0;

  const initialProduct = products[defaultProductId];
  const state = {
    product: initialProduct,
    model: new THREE.Group(),
    config: { ...initialProduct.calibration },
  };
  glasses.add(state.model);

  function loadProduct(productId) {
    const product = products[productId];
    if (!product) {
      console.error("Producto inexistente:", productId);
      return;
    }

    const currentLoad = ++loadVersion;

    loader.load(
      product.modelUrl,
      (gltf) => {
        // Si el usuario cambió de producto mientras cargaba, se descarta.
        if (currentLoad !== loadVersion) return;

        const model = gltf.scene;

        const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        console.log("Producto:", product.name, "| dimensiones originales:", {
          x: size.x,
          y: size.y,
          z: size.z,
        });

        model.rotation.set(
          product.modelRotation.x,
          product.modelRotation.y,
          product.modelRotation.z
        );

        glasses.remove(state.model);
        state.product = product;
        state.model = model;
        state.config = { ...product.calibration };
        glasses.add(model);

        applyCalibration(state);
        syncPanelWithProduct(ui, product, state.config);

        console.log("Producto cargado:", product.name);
      },
      undefined,
      (error) => {
        console.error("Error al cargar el producto:", product.modelUrl, error);
      }
    );
  }

  ui.selector.addEventListener("change", () => loadProduct(ui.selector.value));
  loadProduct(defaultProductId);

  return state;
}

function bindCalibrationControls(ui, state) {
  const { sliders } = ui;

  for (const key of CALIBRATION_KEYS) {
    sliders[key].input.addEventListener("input", () => {
      state.config[key] = sliders[key].value;
      applyCalibration(state);
      sliders[key].refreshLabel();
    });
  }

  const updateModelRotation = () => {
    const rotation = {
      x: THREE.MathUtils.degToRad(sliders.rotationX.value),
      y: THREE.MathUtils.degToRad(sliders.rotationY.value),
      z: THREE.MathUtils.degToRad(sliders.rotationZ.value),
    };

    Object.assign(state.product.modelRotation, rotation);
    state.model.rotation.set(rotation.x, rotation.y, rotation.z);

    ROTATION_KEYS.forEach((key) => sliders[key].refreshLabel());
  };

  for (const key of ROTATION_KEYS) {
    sliders[key].input.addEventListener("input", updateModelRotation);
  }
}

function formatRotation(value) {
  if (Math.abs(value + Math.PI / 2) < 0.000001) return "-Math.PI / 2";
  if (Math.abs(value - Math.PI / 2) < 0.000001) return "Math.PI / 2";
  return Number(value.toFixed(6)).toString();
}

// Genera el bloque listo para pegar en products.js.
function buildProductSnippet({ product, config }) {
  const { modelRotation } = product;

  return `"${product.id}": {
    id: "${product.id}",
    name: ${JSON.stringify(product.name)},
    modelUrl: ${JSON.stringify(product.modelUrl)},
    calibration: {
      scale: ${config.scale},
      offsetX: ${config.offsetX},
      offsetY: ${config.offsetY},
      offsetZ: ${config.offsetZ},
    },
    modelRotation: {
      x: ${formatRotation(modelRotation.x)},
      y: ${formatRotation(modelRotation.y)},
      z: ${formatRotation(modelRotation.z)},
    },
  },`;
}

function bindSaveButton(ui, state) {
  ui.saveButton.addEventListener("click", async () => {
    const snippet = buildProductSnippet(state);

    console.log("=== CALIBRACIÓN PARA products.js ===");
    console.log(snippet);
    console.log("=== FIN DE LA CALIBRACIÓN ===");

    try {
      await navigator.clipboard.writeText(snippet);
      ui.saveButton.textContent = "¡Copiado!";
      setTimeout(() => {
        ui.saveButton.textContent = "Guardar calibración";
      }, 2000);
    } catch {
      console.warn(
        "No se pudo copiar automáticamente. Copiá el bloque desde la consola."
      );
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Loop de render                                                             */
/* -------------------------------------------------------------------------- */

function startRenderLoop({
  renderer,
  scene,
  camera,
  video,
  faceLandmarker,
  selfie,
  landmarkLayer,
  glasses,
  distanceGuide,
}) {
  const faceRotation = new THREE.Euler(0, 0, 0, "YXZ");

  let validFrames = 0;
  let trackingReady = false;

  const REQUIRED_VALID_FRAMES = 8;

  function animate() {
    requestAnimationFrame(animate);

    const result = faceLandmarker.detectForVideo(video, performance.now());

    if (result.faceLandmarks.length > 0) {
      const landmarks = result.faceLandmarks[0];

      updateFaceRotation(result, faceRotation);
      landmarkLayer.draw(landmarks);

      const metrics = measureFace(landmarks, video, selfie);
      const position = evaluatePosition(metrics);

      placeGlasses(glasses, metrics, faceRotation);
      glasses.visible = position.isValid;
      distanceGuide.textContent = position.message;
    } else {
      glasses.visible = false;
      distanceGuide.textContent = "Ubicá tu rostro frente a la cámara";
    }

    renderer.render(scene, camera);
  }

  animate();
}

/* -------------------------------------------------------------------------- */
/* Punto de entrada                                                           */
/* -------------------------------------------------------------------------- */

async function main() {
  const { scene, camera, renderer, height } = createScene();
  const distanceGuide = createDistanceGuide();

  const faceLandmarker = await createFaceLandmarker();
  const video = await startCamera();

  const selfie = createSelfiePlane(video, height);
  const landmarkLayer = createLandmarkLayer(video, selfie.width, selfie.height);

  const glasses = new THREE.Group();
  glasses.renderOrder = 2;

  scene.add(selfie.mesh, landmarkLayer.mesh, glasses);

  const ui = createCalibrationPanel();
  const productState = createProductManager(glasses, ui);
  bindCalibrationControls(ui, productState);
  bindSaveButton(ui, productState);

  startRenderLoop({
    renderer,
    scene,
    camera,
    video,
    faceLandmarker,
    selfie,
    landmarkLayer,
    glasses,
    distanceGuide,
  });
}

main().catch((error) => {
  console.error("Error al iniciar el probador virtual:", error);
});