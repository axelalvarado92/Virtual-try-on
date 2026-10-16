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
  LEFT_TEMPLE: 127,
  RIGHT_TEMPLE: 356,
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454,
  FOREHEAD: 10,
  CHIN: 175,
  NOSE_BRIDGE: 168,
};

// Puntos rojos de depuración dibujados sobre el video.
const DEBUG_POINTS = [
  33, // ojo izquierdo
  263, // ojo derecho
  1, // nariz
  61, // boca
  291, // boca
  234, 
  454, // objetivo base de las patillas
];

// Valores iniciales de prueba; se calibran con la cámara real.
const EYE_DISTANCE_RANGE = { min: 90, max: 260 }; // en píxeles del video
const FACE_CENTER_X_RANGE = { min: 0.2, max: 0.9 }; // normalizado 0..1
const REFERENCE_EYE_DISTANCE = 76; // en unidades de escena
const REFERENCE_FACE_WIDTH = 140;
const REFERENCE_FACE_HEIGHT = 210;

const SMOOTHING = {
  positionBase: 0.75,
  positionMovement: 0.020,
  positionMin: 0.75,
  positionMax: 1,
  rotationBase: 0.65,
  rotationChange: 0.80,
  rotationMin: 0.65,
  rotationMax: 1,
  scaleBase: 0.55,
  scaleMovement: 0.01,
  scaleMin: 0.55,
  scaleMax: 0.9,
};

const SELFIE_HEIGHT_RATIO = 0.9;
const Z_LAYERS = { selfie: 0, landmarks: 2, glasses: 10 };
const OCCLUSION = {
  depthScale: 0.3,
  depthOffset: 40,
};
const TEMPLE_EAR_LANDMARKS = { left: 234, right: 454 };
const TEMPLE_MAX_ANGLE = THREE.MathUtils.degToRad(70); // límite para evitar giros extraños
const TEMPLE_SMOOTHING = 0.5;
const EAR_EXTEND = 1.25; // >1 mueve el objetivo hacia atrás, más allá del borde de la cara

const TEMPLE_CLIP_DEPTH = 110; // cuánto de la patilla queda visible (en unidades locales)
const localTempleClipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), TEMPLE_CLIP_DEPTH);
const templeClipPlane = new THREE.Plane();

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
  const scene = new THREE.Scene();

  const camera = new THREE.OrthographicCamera(
    -1,
    1,
    1,
    -1,
    0.1,
    1000
  );

  camera.position.z = 100;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });

  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.localClippingEnabled = true;

  Object.assign(renderer.domElement.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    display: "block",
    pointerEvents: "none",
  });

  document.body.appendChild(renderer.domElement);

  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(0, 0, 100);
  scene.add(light);

  return { scene, camera, renderer };
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
    baseOptions: {
      modelAssetPath: FACE_MODEL_PATH,
      delegate: "GPU",
    },
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
  let height = sceneHeight * SELFIE_HEIGHT_RATIO;
  let width = height * aspectRatio;

  const geometry = new THREE.PlaneGeometry(width, height);

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      map: new THREE.VideoTexture(video),
      depthWrite: false,
    })
  );

  mesh.position.z = Z_LAYERS.selfie;
  mesh.renderOrder = 0;

  function resize(nextSceneHeight) {
    height = nextSceneHeight * SELFIE_HEIGHT_RATIO;
    width = height * aspectRatio;
  
    mesh.geometry.dispose();
    mesh.geometry = new THREE.PlaneGeometry(width, height);
  
    return { width, height };
  }

  return {
    mesh,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    resize,
  };
}


function createLandmarkLayer(video, planeWidth, planeHeight) {
  const canvas = document.createElement("canvas");

  let currentPlaneWidth = planeWidth;
  let currentPlaneHeight = planeHeight;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);

  // Capa visual de depuración: conserva los puntos rojos.
  const debugMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(planeWidth, planeHeight),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })
  );

  debugMesh.position.z = Z_LAYERS.landmarks;
  debugMesh.renderOrder = 2;

  // Construye los triángulos a partir de las conexiones de teselación.
  const connections = FaceLandmarker.FACE_LANDMARKS_TESSELATION;

  if (!connections?.length) {
    throw new Error(
      "MediaPipe no expone FACE_LANDMARKS_TESSELATION."
    );
  }

  const adjacency = new Map();

  for (const { start, end } of connections) {
    if (!adjacency.has(start)) adjacency.set(start, new Set());
    if (!adjacency.has(end)) adjacency.set(end, new Set());

    adjacency.get(start).add(end);
    adjacency.get(end).add(start);
  }

  const triangleIndices = [];

  for (const [a, neighbors] of adjacency) {
    for (const b of neighbors) {
      if (b <= a) continue;

      for (const c of neighbors) {
        if (c <= b) continue;
        if (adjacency.get(b)?.has(c)) {
          triangleIndices.push(a, b, c);
        }
      }
    }
  }

  if (triangleIndices.length === 0) {
    throw new Error("No se pudieron generar triángulos faciales.");
  }

  // La teselación deja huecos en los ojos: se rellenan desde el centro del iris.
  const EYE_FILLS = [
    { connections: FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, center: 468 },
    { connections: FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, center: 473 },
  ];
  
  for (const { connections: eyeConnections, center } of EYE_FILLS) {
    for (const { start, end } of eyeConnections) {
      triangleIndices.push(center, start, end);
    }
  }

  const occlusionGeometry = new THREE.BufferGeometry();
  const landmarkCount = 478;
  const positions = new Float32Array(landmarkCount * 3);

  occlusionGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );
  occlusionGeometry.setIndex(triangleIndices);

  // No escribe color: solo actualiza el búfer de profundidad.
  const occlusionMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    side: THREE.DoubleSide,
  });

  const occlusionMesh = new THREE.Mesh(
    occlusionGeometry,
    occlusionMaterial
  );

  occlusionMesh.renderOrder = 1;
  occlusionMesh.frustumCulled = false;

  function draw(landmarks) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "red";

    for (const index of DEBUG_POINTS) {
      const point = landmarks[index];
      if (!point) continue;

      context.beginPath();
      context.arc(
        point.x * canvas.width,
        point.y * canvas.height,
        8,
        0,
        Math.PI * 2
      );
      context.fill();
    }

    texture.needsUpdate = true;

    const positionAttribute =
      occlusionGeometry.attributes.position;

    for (let i = 0; i < landmarkCount; i++) {
      const point = landmarks[i];

      if (!point) continue;

      positionAttribute.setXYZ(
        i,
        point.x * currentPlaneWidth - currentPlaneWidth / 2,
        currentPlaneHeight / 2 - point.y * currentPlaneHeight,
        Z_LAYERS.glasses -
          point.z * currentPlaneWidth * OCCLUSION.depthScale -
          OCCLUSION.depthOffset
      );
    }

    positionAttribute.needsUpdate = true;
    occlusionGeometry.computeBoundingSphere();
  }

  function dispose() {
    debugMesh.geometry.dispose();
    debugMesh.material.dispose();
    texture.dispose();
    occlusionGeometry.dispose();
    occlusionMaterial.dispose();
  }

  function resize(nextPlaneWidth, nextPlaneHeight) {
    currentPlaneWidth = nextPlaneWidth;
    currentPlaneHeight = nextPlaneHeight;

    debugMesh.geometry.dispose();
    debugMesh.geometry = new THREE.PlaneGeometry(
      currentPlaneWidth,
      currentPlaneHeight
    );
  }

  return {
    mesh: debugMesh,
    occlusionMesh,
    resize,
    draw,
    dispose,
  };
}


/* -------------------------------------------------------------------------- */
/* Medición del rostro                                                        */
/* -------------------------------------------------------------------------- */

// Convierte los landmarks de los ojos en valores de escena y en píxeles de video.
function measureFace(landmarks, video, selfie) {
  const getPoint = (index) => landmarks[index];

  const leftEye = getPoint(LANDMARKS.LEFT_EYE);
  const rightEye = getPoint(LANDMARKS.RIGHT_EYE);
  const leftTemple = getPoint(LANDMARKS.LEFT_TEMPLE);
  const rightTemple = getPoint(LANDMARKS.RIGHT_TEMPLE);
  const leftCheek = getPoint(LANDMARKS.LEFT_CHEEK);
  const rightCheek = getPoint(LANDMARKS.RIGHT_CHEEK);
  const forehead = getPoint(LANDMARKS.FOREHEAD);
  const chin = getPoint(LANDMARKS.CHIN);
  const noseBridge = getPoint(LANDMARKS.NOSE_BRIDGE);

  const toScene = (point) => ({
    x: point.x * selfie.width - selfie.width / 2,
    y: selfie.height / 2 - point.y * selfie.height,
  });

  const toVideoPixels = (point) => ({
    x: point.x * video.videoWidth,
    y: point.y * video.videoHeight,
  });
  
  const toReferencePixels = (point) => ({
    x: point.x * 1280,
    y: point.y * 720,
  });

  const distance2D = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;

    return Math.hypot(dx, dy);
  };

  const eyeLeftPixels = toReferencePixels(leftEye);
  const eyeRightPixels = toReferencePixels(rightEye);
  
  const eyeDistancePixels = distance2D(
    eyeLeftPixels,
    eyeRightPixels
  );
  
  const faceWidthPixels = Math.max(
    distance2D(
      toReferencePixels(leftTemple),
      toReferencePixels(rightTemple)
    ),
    distance2D(
      toReferencePixels(leftCheek),
      toReferencePixels(rightCheek)
    ),
    eyeDistancePixels
  );
  
  const faceHeightPixels = distance2D(
    toReferencePixels(forehead),
    toReferencePixels(chin)
  );

  const left = toScene(leftEye);
  const right = toScene(rightEye);
  const noseBridgeScene = toScene(noseBridge);

  return {
    noseBridge: noseBridgeScene,
    eyeDistancePixels,
    faceWidthPixels,
    faceHeightPixels,
    faceCenterX: (leftEye.x + rightEye.x) / 2,
    eyeCenter: {
      x: (left.x + right.x) / 2,
      y: (left.y + right.y) / 2,
    },
    eyeDistance: Math.hypot(
      right.x - left.x,
      right.y - left.y
    ),
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


const faceRotationMatrix = new THREE.Matrix4();

const faceFlipQuaternion = new THREE.Quaternion()
  .setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    Math.PI
  );

function updateFaceRotation(landmarks, video, selfie, faceRotation) {
  const toFaceSpace = (index) => {
    const point = landmarks[index];

    return new THREE.Vector3(
      point.x * selfie.width - selfie.width / 2,
      selfie.height / 2 - point.y * selfie.height,
      -point.z * selfie.width
    );
  };

  const leftEye = toFaceSpace(LANDMARKS.LEFT_EYE);
  const rightEye = toFaceSpace(LANDMARKS.RIGHT_EYE);
  const forehead = toFaceSpace(LANDMARKS.FOREHEAD);
  const chin = toFaceSpace(LANDMARKS.CHIN);

  const xAxis = rightEye
    .clone()
    .sub(leftEye)
    .normalize();

  const yRaw = forehead
    .clone()
    .sub(chin)
    .normalize();

  const zAxis = xAxis
    .clone()
    .cross(yRaw)
    .normalize();

  if (zAxis.z < 0) {
    zAxis.negate();
  }

  const yAxis = zAxis
    .clone()
    .cross(xAxis)
    .normalize();

  faceRotationMatrix.makeBasis(xAxis, yAxis, zAxis);
  faceRotation.setFromRotationMatrix(faceRotationMatrix);
}


function placeGlasses(metrics, faceRotation) {
  const widthScale =
    metrics.faceWidthPixels / REFERENCE_FACE_WIDTH;

  const heightScale =
    metrics.faceHeightPixels / REFERENCE_FACE_HEIGHT;

  const scale = widthScale * 0.7 + heightScale * 0.3;

  return {
    position: new THREE.Vector3(
      metrics.noseBridge.x,
      metrics.noseBridge.y,
      Z_LAYERS.glasses
    ),
    quaternion: faceRotation.clone(),
    scale: new THREE.Vector3(scale, scale, scale),
  };
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
    temples: [],
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
        state.temples = setupTemples(model, product.temples);

        model.traverse((child) => {
          if (!child.isMesh) return;
          child.renderOrder = 3;
          [].concat(child.material).forEach((material) => {
            material.clippingPlanes = [templeClipPlane];
          });
        });

        const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        console.log("Producto:", product.name, "| dimensiones originales:", {
          x: size.x,
          y: size.y,
          z: size.z,
        });
        console.log("Dimensiones GLB Modelo 003:", {
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

// Envuelve cada patilla en un pivote ubicado en su bisagra y guarda su dirección de reposo.

function setupTemples(model, templeNames) {
  if (!templeNames) return [];

  model.updateMatrixWorld(true);

  const modelCenter = new THREE.Box3()
    .setFromObject(model)
    .getCenter(new THREE.Vector3());

  return Object.entries(templeNames).flatMap(([side, name]) => {
    const node = model.getObjectByName(name);

    if (!node) {
      console.warn("Patilla no encontrada en el modelo:", name);
      return [];
    }

    node.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(node);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Identifica el eje longitudinal de la patilla.
    const axis = ["x", "y", "z"].reduce((a, b) =>
      size[b] > size[a] ? b : a
    );

    // Determina el extremo más cercano al centro del armazón.
    const hingeWorld = center.clone();
    hingeWorld[axis] =
      modelCenter[axis] < center[axis]
        ? box.min[axis]
        : box.max[axis];

    // Convierte la bisagra al sistema local del padre original.
    const originalParent = node.parent;
    const hingeLocal = originalParent.worldToLocal(
      hingeWorld.clone()
    );

    const pivot = new THREE.Group();
    pivot.position.copy(hingeLocal);
    originalParent.add(pivot);

    // Conserva la transformación mundial original de la patilla.
    pivot.updateMatrixWorld(true);
    pivot.attach(node);

    // Calculate the temple direction relative to its pivot.
    node.updateMatrixWorld(true);
    pivot.updateMatrixWorld(true);
    
    const centerLocal = pivot.worldToLocal(center.clone());
    
    const restDirection = centerLocal.normalize();

    return [{
      node: pivot,
      earIndex: TEMPLE_EAR_LANDMARKS[side],
      restQuaternion: pivot.quaternion.clone(),
      restDirection,
    }];
  });
}


// Gira cada patilla sobre su bisagra para que apunte a la oreja.

const earPoint = new THREE.Vector3();
const targetDirection = new THREE.Vector3();
const aimDelta = new THREE.Quaternion();
const limitedDelta = new THREE.Quaternion();
const targetQuaternion = new THREE.Quaternion();
const bridgePoint = new THREE.Vector3();

function aimTemples(temples, landmarks, selfie) {
  const noseBridgeZ = landmarks[LANDMARKS.NOSE_BRIDGE].z;

  for (const { node, earIndex, restQuaternion, restDirection } of temples) {
    const ear = landmarks[earIndex];

    earPoint.set(
      ear.x * selfie.width - selfie.width / 2,
      selfie.height / 2 - ear.y * selfie.height,
      Z_LAYERS.glasses - (ear.z - noseBridgeZ) * selfie.width
    );

    const bridge = landmarks[LANDMARKS.NOSE_BRIDGE];
    bridgePoint.set(
      bridge.x * selfie.width - selfie.width / 2,
      selfie.height / 2 - bridge.y * selfie.height,
      Z_LAYERS.glasses
    );
    // Extrapola desde el puente de la nariz a través del borde de la cara hasta la oreja estimada.
    earPoint.sub(bridgePoint).multiplyScalar(EAR_EXTEND).add(bridgePoint);

    node.parent.worldToLocal(earPoint);
    targetDirection.copy(earPoint).sub(node.position).normalize();

    aimDelta.setFromUnitVectors(restDirection, targetDirection);
    limitedDelta.identity().rotateTowards(aimDelta, TEMPLE_MAX_ANGLE);

    targetQuaternion.copy(restQuaternion).premultiply(limitedDelta);
    node.quaternion.slerp(targetQuaternion, TEMPLE_SMOOTHING);
  }
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
  productState,
}) {
  const faceRotation = new THREE.Quaternion();

  const smoothed = {
    ready: false,
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
    previousPosition: new THREE.Vector3(),
  };
  
  let validFrames = 0;
  let trackingReady = false;

  const REQUIRED_VALID_FRAMES = 8;

  function animate() {
    requestAnimationFrame(animate);

    const detectionStart = performance.now();

    const result = faceLandmarker.detectForVideo(
      video,
      performance.now()
    );
    
    const detectionDuration = performance.now() - detectionStart;
  

    if (result.faceLandmarks.length > 0) {
      const landmarks = result.faceLandmarks[0];

      updateFaceRotation(
        landmarks,
        video,
        selfie,
        faceRotation
      );
      
      landmarkLayer.draw(landmarks);
      
      const metrics = measureFace(landmarks, video, selfie);
      const position = evaluatePosition(metrics);
      const target = placeGlasses(metrics, faceRotation);
      
      const movement = target.position.distanceTo(
        smoothed.previousPosition
      );
      
      const rotationDelta =
        2 *
        Math.acos(
          THREE.MathUtils.clamp(
            Math.abs(smoothed.quaternion.dot(target.quaternion)),
            0,
            1
          )
        );
      
      const alphaPosition = THREE.MathUtils.clamp(
        SMOOTHING.positionBase +
          movement * SMOOTHING.positionMovement,
        SMOOTHING.positionMin,
        SMOOTHING.positionMax
      );
      
      const alphaRotation = THREE.MathUtils.clamp(
        SMOOTHING.rotationBase +
          rotationDelta * SMOOTHING.rotationChange,
        SMOOTHING.rotationMin,
        SMOOTHING.rotationMax
      );
      
      const alphaScale = THREE.MathUtils.clamp(
        SMOOTHING.scaleBase +
          movement * SMOOTHING.scaleMovement,
        SMOOTHING.scaleMin,
        SMOOTHING.scaleMax
      );
      
      if (!smoothed.ready) {
        smoothed.position.copy(target.position);
        smoothed.quaternion.copy(target.quaternion);
        smoothed.scale.copy(target.scale);
        smoothed.ready = true;
      } else {
        smoothed.position.lerp(target.position, alphaPosition);
        smoothed.quaternion.slerp(target.quaternion, alphaRotation);
        smoothed.scale.lerp(target.scale, alphaScale);
      }
      
      smoothed.previousPosition.copy(target.position);
      
      glasses.position.copy(smoothed.position);
      glasses.quaternion.copy(smoothed.quaternion);
      glasses.scale.copy(smoothed.scale);
      glasses.updateMatrixWorld(true);
      aimTemples(productState.temples, landmarks, selfie);

      if (position.isValid) {
        validFrames++;
      
        if (validFrames >= REQUIRED_VALID_FRAMES) {
          trackingReady = true;
        }
      } else {
        validFrames = 0;
        trackingReady = false;
      }
      
      glasses.visible = trackingReady;
      
      distanceGuide.textContent = position.isValid
        ? trackingReady
          ? "Distancia correcta"
          : "Mantené la posición..."
        : position.message;

    } else {
      glasses.visible = false;
      distanceGuide.textContent = "Ubicá tu rostro frente a la cámara";
      smoothed.ready = false;
    }
    glasses.updateMatrixWorld();
    templeClipPlane.copy(localTempleClipPlane).applyMatrix4(glasses.matrixWorld);

    renderer.render(scene, camera);
  }

  animate();
}

/* -------------------------------------------------------------------------- */
/* Punto de entrada                                                           */
/* -------------------------------------------------------------------------- */

async function main() {
  const { scene, camera, renderer } = createScene();
  const distanceGuide = createDistanceGuide();

  const faceLandmarker = await createFaceLandmarker();
  const video = await startCamera();

  const selfie = createSelfiePlane(video, window.innerHeight);
  const landmarkLayer = createLandmarkLayer(video, selfie.width, selfie.height);

  function resizeScene() {
    const width = window.innerWidth;
    const height = window.innerHeight;
  
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
  
    renderer.setSize(width, height);
  
    const dimensions = selfie.resize(height);
  
    landmarkLayer.resize(
      dimensions.width,
      dimensions.height
    );
  }
  
  resizeScene();
  window.addEventListener("resize", resizeScene);

  const glasses = new THREE.Group();
  glasses.renderOrder = 2;

  scene.add(selfie.mesh, landmarkLayer.mesh, glasses);
  scene.add(landmarkLayer.occlusionMesh);

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
    productState,
  });
}

main().catch((error) => {
  console.error("Error al iniciar el probador virtual:", error);
});