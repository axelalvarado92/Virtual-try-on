import * as THREE from "three";
import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { products, defaultProductId } from "./products.js";

async function main() {

  const scene = new THREE.Scene();
  
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  const camera = new THREE.OrthographicCamera(
    -width / 2,
    width / 2,
    height / 2,
    -height / 2,
    0.1,
    1000
  );
  
  camera.position.z = 100;
  
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);

  document.body.appendChild(renderer.domElement);
  
  const textureLoader = new THREE.TextureLoader();
  
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm"
  );
  
  const faceLandmarker = await FaceLandmarker.createFromOptions(
    vision,
    {
      baseOptions: {
        modelAssetPath: "/face_landmarker.task",
      },
      runningMode: "IMAGE",
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
    }
  );
  
  textureLoader.load("/axel-selfie-2.jpeg", (texture) => {
    const image = texture.image;

    let faceRotation = new THREE.Euler(0, 0, 0, "YXZ");
  
    const result = faceLandmarker.detect(image);
  
    console.log("Face Landmarker result:", result);

    console.log(
      "Faces detected:",
      result.faceLandmarks.length
    );
    
    if (result.faceLandmarks.length > 0) {
      console.log(
        "Landmarks:",
        result.faceLandmarks[0].length
      );

      console.log(
        "Facial transformation:",
        result.facialTransformationMatrixes
      );

      const facialMatrix =
        result.facialTransformationMatrixes[0];
      
      console.log(
        "Matrix data:",
        facialMatrix.data
      );

      const matrix = facialMatrix.data;

      console.table([
        [matrix[0], matrix[1], matrix[2], matrix[3]],
        [matrix[4], matrix[5], matrix[6], matrix[7]],
        [matrix[8], matrix[9], matrix[10], matrix[11]],
        [matrix[12], matrix[13], matrix[14], matrix[15]],
      ]);

      const rotationMatrix = new THREE.Matrix4().fromArray(matrix);

      faceRotation.setFromRotationMatrix(
        rotationMatrix,
        "YXZ"
      );
      
      console.log("Rotación facial (radianes):", {
        x: faceRotation.x,
        y: faceRotation.y,
        z: faceRotation.z,
      });
      
      console.log("Rotación facial (grados):", {
        x: THREE.MathUtils.radToDeg(faceRotation.x),
        y: THREE.MathUtils.radToDeg(faceRotation.y),
        z: THREE.MathUtils.radToDeg(faceRotation.z),
      });
    }

    
    
    const landmarks = result.faceLandmarks[0];
    const imageWidth = texture.image.width;
    const imageHeight = texture.image.height;
  
    const aspectRatio = imageWidth / imageHeight;
  
    const planeHeight = height * 0.9;
    const planeWidth = planeHeight * aspectRatio;
  
    const geometry = new THREE.PlaneGeometry(
      planeWidth,
      planeHeight
    );
  
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      depthWrite: false,
    });
  
    const selfie = new THREE.Mesh(
      geometry,
      material
    );
  
    selfie.position.z = 0;
    selfie.renderOrder = 0;
  
    scene.add(selfie);

    const landmarkCanvas = document.createElement("canvas");

    landmarkCanvas.width = imageWidth;
    landmarkCanvas.height = imageHeight;
    
    const landmarkContext = landmarkCanvas.getContext("2d");
    
    landmarkContext.fillStyle = "red";
    
    const pointsToDraw = [
      33,   // ojo izquierdo
      263,  // ojo derecho
      1,    // nariz
      61,   // boca
      291   // boca
    ];
    
    for (const index of pointsToDraw) {
      const point = landmarks[index];
    
      const x = point.x * imageWidth;
      const y = point.y * imageHeight;
    
      landmarkContext.beginPath();
      landmarkContext.arc(x, y, 8, 0, Math.PI * 2);
      landmarkContext.fill();
    }

    const landmarkTexture = new THREE.CanvasTexture(
      landmarkCanvas
    );
    
    const landmarkMaterial = new THREE.MeshBasicMaterial({
      map: landmarkTexture,
      transparent: true,
      depthWrite: false,
    });
    
    const landmarkGeometry = new THREE.PlaneGeometry(
      planeWidth,
      planeHeight
    );
    
    const landmarkLayer = new THREE.Mesh(
      landmarkGeometry,
      landmarkMaterial
    );
    
    landmarkLayer.position.z = 2;
    landmarkLayer.renderOrder = 1;
    
    scene.add(landmarkLayer);

    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(0, 0, 100);

    scene.add(light);
  
    
    const glasses = new THREE.Group();
    
    let glassesModel = new THREE.Group();
    glasses.add(glassesModel);

    let currentProduct = products[defaultProductId];
    let selectedProductId = defaultProductId;

    const config = {
      scale: currentProduct.calibration.scale,
      offsetX: currentProduct.calibration.offsetX,
      offsetY: currentProduct.calibration.offsetY,
      offsetZ: currentProduct.calibration.offsetZ,
    };
    
    // Aplicar transformación facial usando landmarks
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    
    const leftEyeX = leftEye.x * planeWidth - planeWidth / 2;
    const leftEyeY = planeHeight / 2 - leftEye.y * planeHeight;
    
    const rightEyeX = rightEye.x * planeWidth - planeWidth / 2;
    const rightEyeY = planeHeight / 2 - rightEye.y * planeHeight;
    
    const eyeCenterX = (leftEyeX + rightEyeX) / 2;
    const eyeCenterY = (leftEyeY + rightEyeY) / 2;
    
    const eyeDistance = Math.hypot(
      rightEyeX - leftEyeX,
      rightEyeY - leftEyeY
    );
    
    const eyeAngle = Math.atan2(
      rightEyeY - leftEyeY,
      rightEyeX - leftEyeX
    );
    
    const referenceEyeDistance = 76;
    
    const faceScale = eyeDistance / referenceEyeDistance;
    
    glasses.position.set(
      eyeCenterX,
      eyeCenterY,
      10
    );
    
    glasses.rotation.set(
      faceRotation.x,
      faceRotation.y,
      eyeAngle + faceRotation.z,
      "YXZ"
    );
    
    glasses.scale.setScalar(faceScale);
    
    glasses.renderOrder = 2;
    
    scene.add(glasses);

    const gltfLoader = new GLTFLoader();

    let productLoadVersion = 0;
    
    function loadProduct(productId) {
    const product = products[productId];
    
    if (!product) {
    console.error("Producto inexistente:", productId);
    return;
    }
    
    const loadVersion = ++productLoadVersion;
    
    gltfLoader.load(
    product.modelUrl,
    (gltf) => {
    if (loadVersion !== productLoadVersion) {
    return;
    }
    
      const model = gltf.scene;
    
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
    
      model.position.sub(center);
    
      model.rotation.set(
        product.modelRotation.x,
        product.modelRotation.y,
        product.modelRotation.z
      );
    
      currentProduct = product;
      selectedProductId = productId;
    
      config.scale = product.calibration.scale;
      config.offsetX = product.calibration.offsetX;
      config.offsetY = product.calibration.offsetY;
      config.offsetZ = product.calibration.offsetZ;
    
      model.scale.setScalar(config.scale);
    
      model.position.set(
        config.offsetX,
        config.offsetY,
        config.offsetZ
      );
    
      glasses.remove(glassesModel);
      glassesModel = model;
      glasses.add(glassesModel);
    
      scaleInput.value = config.scale;
      xInput.value = config.offsetX;
      yInput.value = config.offsetY;
      zInput.value = config.offsetZ;
    
      scaleValue.textContent = config.scale.toFixed(2);
      xValue.textContent = config.offsetX;
      yValue.textContent = config.offsetY;
      zValue.textContent = config.offsetZ;
    
      console.log("Producto cargado:", currentProduct.name);
    },
    undefined,
    (error) => {
      console.error(
        "Error al cargar el producto:",
        product.modelUrl,
        error
      );
    }
    
    );
  }

    
    const panel = document.createElement("div");

    panel.style.position = "fixed";
    panel.style.top = "20px";
    panel.style.left = "20px";
    panel.style.zIndex = "1000";
    panel.style.padding = "12px";
    panel.style.background = "rgba(0, 0, 0, 0.75)";
    panel.style.color = "white";
    panel.style.fontFamily = "Arial, sans-serif";
    panel.style.fontSize = "14px";
    panel.style.borderRadius = "8px";
    panel.style.width = "220px";
    
    panel.innerHTML = `
      <div style="margin-bottom:8px;font-weight:bold;">
        Probador virtual
      </div>
      
      <label>
        Modelo
        <select id="product-selector" style="width:100%;margin-top:4px;">
          ${Object.values(products).map(product =>
            `<option value="${product.id}" ${
              product.id === defaultProductId ? "selected" : ""
            }>${product.name}</option>`
          ).join("")}
        </select>
      </label>
      
      <div style="margin-top:12px;margin-bottom:8px;font-weight:bold;">
        Calibración de gafas
      </div>

    
      <label>
        Escala
        <input
          id="glasses-scale"
          type="range"
          min="3"
          max="15"
          step="0.05"
          value="${config.scale}"
          style="width:100%;"
        >
      </label>
    
      <div id="scale-value">${config.scale}</div>
    
      <br>
    
      <label>
        X
        <input
          id="glasses-x"
          type="range"
          min="-100"
          max="100"
          step="1"
          value="0"
          style="width:100%;"
        >
      </label>
    
      <div id="x-value">0</div>
    
      <br>
    
      <label>
        Y
        <input
          id="glasses-y"
          type="range"
          min="-100"
          max="100"
          step="1"
          value="0"
          style="width:100%;"
        >
      </label>
    
      <div id="y-value">0</div>
    
      <br>
    
      <label>
        Z
        <input
          id="glasses-z"
          type="range"
          min="-100"
          max="100"
          step="1"
          value="0"
          style="width:100%;"
        >
      </label>
    
      <div id="z-value">0</div>
    `;
    
    document.body.appendChild(panel);

    const productSelector =
      document.getElementById("product-selector");
    
    productSelector.addEventListener("change", () => {
      loadProduct(productSelector.value);
    });

    const scaleInput =
      document.getElementById("glasses-scale");
    
    const xInput =
      document.getElementById("glasses-x");
    
    const yInput =
      document.getElementById("glasses-y");
    
    const zInput =
      document.getElementById("glasses-z");
    
    const scaleValue =
      document.getElementById("scale-value");
    
    const xValue =
      document.getElementById("x-value");
    
    const yValue =
      document.getElementById("y-value");
    
    const zValue =
      document.getElementById("z-value");
    
    scaleInput.addEventListener("input", () => {
      config.scale = Number(scaleInput.value);
    
      glassesModel.scale.setScalar(
        config.scale
      );
    
      scaleValue.textContent =
        config.scale.toFixed(2);
    });
    
    xInput.addEventListener("input", () => {
      config.offsetX = Number(xInput.value);
    
      glassesModel.position.x =
        config.offsetX;
    
      xValue.textContent =
        config.offsetX;
    });
    
    yInput.addEventListener("input", () => {
      config.offsetY = Number(yInput.value);
    
      glassesModel.position.y =
        config.offsetY;
    
      yValue.textContent =
        config.offsetY;
    });
    
    zInput.addEventListener("input", () => {
      config.offsetZ = Number(zInput.value);
    
      glassesModel.position.z =
        config.offsetZ;
    
      zValue.textContent =
        config.offsetZ;
    });

    loadProduct(defaultProductId);
  
    function animate() {
      requestAnimationFrame(animate);
  
      renderer.render(scene, camera);
    }
  
    animate();
  });
}
main();
