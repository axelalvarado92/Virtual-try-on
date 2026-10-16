export const products = {
    "glasses-001": {
    id: "glasses-001",
    name: "Modelo de prueba 001",
    modelUrl: "/glasses.glb",
    calibration: {
    scale: 8.85,
    offsetX: 1,
    offsetY: -45,
    offsetZ: 7,
    },
    modelRotation: {
    x: 0,
    y: -Math.PI / 2,
    z: 0,
    },
  },
  
  "glasses-002": {
    id: "glasses-002",
    name: "Modelo de prueba 002",
    modelUrl: "/glasses-2.glb",
    calibration: {
    scale: 838.0,
    offsetX: -3,
    offsetY: -4,
    offsetZ: 64,
    },
    modelRotation: {
    x: 0,
    y: -Math.PI / 2,
    z: 0,
    },
  },


  "glasses-003": {
    id: "glasses-003",
    name: "Armazón FIDEI - Modelo 003",
    modelUrl: "/armazon-frente-generado.glb",
    calibration: {
      scale: 986,
      offsetX: 1,
      offsetY: -8,
      offsetZ: 4,
    },
    modelRotation: {
      x: 1.640609,
      y: 0.034907,
      z: 0.034907,
    },
  },

};

export const defaultProductId = "glasses-001";
