import * as THREE from "https://unpkg.com/three@0.177.0/build/three.module.js";
import { projects } from "./data.js";
import { vertexShader, fragmentShader } from "./shaders.js";

// Détection robuste mobile/tablette/desktop
const UA = navigator.userAgent || '';
const isIpad = /iPad/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(UA);
const isAndroidPhone = isAndroid && /Mobile/.test(UA);
const isAndroidTablet = isAndroid && !/Mobile/.test(UA);

// Pointeur "grossier" (doigt) vs "fin" (souris) + taille d'écran
const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
const smallViewport = Math.min(window.innerWidth, window.innerHeight) < 768;

const IS_MOBILE = isAndroidPhone || /iPhone|iPod/.test(UA) || (hasCoarsePointer && smallViewport);
const IS_TABLET = isIpad || isAndroidTablet || (hasCoarsePointer && !smallViewport);
const IS_MOBILE_OR_TABLET = IS_MOBILE || IS_TABLET;

const getResponsiveCellSize = () => {
  if (IS_MOBILE) return 0.55;
  if (IS_TABLET) return 0.6;
  return 0.58;
};

const config = {
  cellSize: getResponsiveCellSize(),
  zoomLevel: 1.50,
  lerpFactor: 0.075,
  borderColor: "rgba(255, 255, 255, 0.14)",
  backgroundColor: "rgba(0, 0, 0, 1)",
  textColor: "rgba(128, 128, 128, 1)",
  hoverColor: "rgba(255, 255, 255, 0)",
};

let scene, camera, renderer, plane;
let isDragging = false,
  isClick = true,
  clickStartTime = 0;
let previousMouse = { x: 0, y: 0 };
let offset = { x: 0, y: 0 },
  targetOffset = { x: 0, y: 0 };
let mousePosition = { x: -1, y: -1 };
let zoomLevel = 1.0,
  targetZoom = 1.0;
let textTextures = [];
let tagsTextures = [];
let imageRotationTimers = [];
let currentImageIndices = [];
let allImageTextures = [];
let globalRotationTimer = null;
let isRotationPaused = false;

// 📷 Variables pour le mouvement de caméra suivant la souris
let cameraTargetX = 0;
let cameraTargetY = 0;
let currentCameraX = 0;
let currentCameraY = 0;
const cameraFollowSpeed = 0.05;
const cameraMaxMove = 0.08;

const rgbaToArray = (rgba) => {
  const match = rgba.match(/rgba?\(([^)]+)\)/);
  if (!match) return [1, 1, 1, 1];
  return match[1]
    .split(",")
    .map((v, i) =>
      i < 3 ? parseFloat(v.trim()) / 255 : parseFloat(v.trim() || 1)
    );
};

const waitForFont = async () => {
  try {
    if ('fonts' in document) {
      await Promise.race([
        document.fonts.load('600 16px Outfit'),
        document.fonts.load('700 16px Outfit'),
        new Promise(resolve => setTimeout(resolve, 3000))
      ]);
      
      await document.fonts.ready;
      console.log('✅ Font Outfit loaded successfully');
    } else {
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('⚠️ Font loading API not available, using timeout fallback');
    }
  } catch (error) {
    console.warn('⚠️ Font loading warning:', error);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
};

const createTextTexture = (title, year) => {
  const canvas = document.createElement("canvas");
  canvas.width = IS_MOBILE ? 3072 : (IS_TABLET ? 3072 : 2048);
  canvas.height = IS_MOBILE ? 384 : (IS_TABLET ? 384 : 256);
  
  const ctx = canvas.getContext("2d", { 
    alpha: true,
    desynchronized: false,
    willReadFrequently: false
  });

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const fontSize = IS_MOBILE ? 110 : (IS_TABLET ? 105 : 80);
  ctx.font = `400 ${fontSize}px "Outfit", -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillStyle = config.textColor;
  ctx.textBaseline = "middle";
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  const padding = IS_MOBILE ? 45 : (IS_TABLET ? 45 : 30);
  ctx.textAlign = "left";
  ctx.fillText(title.toUpperCase(), padding, canvas.height / 2);
  ctx.textAlign = "right";
  ctx.fillText(year.toString().toUpperCase(), canvas.width - padding, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  Object.assign(texture, {
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    flipY: false,
    generateMipmaps: true,
    format: THREE.RGBAFormat,
    anisotropy: renderer?.capabilities.getMaxAnisotropy() || 16,
  });

  return texture;
};

const createTagsTexture = (tags) => {
  const canvas = document.createElement("canvas");
  canvas.width = IS_MOBILE ? 3072 : (IS_TABLET ? 3072 : 2048);
  canvas.height = IS_MOBILE ? 384 : (IS_TABLET ? 384 : 256);
  
  const ctx = canvas.getContext("2d", {
    alpha: true,
    desynchronized: false,
    willReadFrequently: false
  });

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const fontSize = IS_MOBILE ? 90 : (IS_TABLET ? 82 : 65);
  ctx.font = `700 ${fontSize}px "Outfit", -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  const padding = IS_MOBILE ? 45 : (IS_TABLET ? 45 : 40);
  const spacing = IS_MOBILE ? 52 : (IS_TABLET ? 52 : 50);
  const tagHeight = IS_MOBILE ? 180 : (IS_TABLET ? 180 : 150);
  const borderRadius = IS_MOBILE ? 45 : (IS_TABLET ? 45 : 40);
  let xPosition = IS_MOBILE ? 45 : (IS_TABLET ? 45 : 30);
  
  tags.forEach((tag) => {
    const textWidth = ctx.measureText(tag).width;
    const boxWidth = textWidth + padding * 2;
    
    ctx.fillStyle = IS_MOBILE ? "rgba(60, 60, 60, 0.75)" : (IS_TABLET ? "rgba(60, 60, 60, 0.75)" : "rgba(60, 60, 60, 0.4)");
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.roundRect(xPosition, (canvas.height - tagHeight) / 2, boxWidth, tagHeight, borderRadius);
    ctx.fill();
    
    ctx.fillStyle = IS_MOBILE ? "rgba(180, 180, 180, 1)" : (IS_TABLET ? "rgba(180, 180, 180, 1)" : config.textColor);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.textAlign = "left";
    ctx.fillText(tag, xPosition + padding, canvas.height / 2);
    
    xPosition += boxWidth + spacing;
  });

  const texture = new THREE.CanvasTexture(canvas);
  Object.assign(texture, {
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    flipY: false,
    generateMipmaps: true,
    format: THREE.RGBAFormat,
    anisotropy: renderer?.capabilities.getMaxAnisotropy() || 16,
  });

  return texture;
};

const createTextureAtlas = (textures, isText = false) => {
  const atlasSize = Math.ceil(Math.sqrt(textures.length));
  let textureSize = IS_MOBILE ? 384 : (IS_TABLET ? 320 : 512);
  
  if (renderer) {
    const gl = renderer.getContext();
    const MAX_TEX = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    let atlasSide = atlasSize * textureSize;
    
    while (atlasSide > MAX_TEX && textureSize > 64) {
      textureSize = Math.floor(textureSize / 2);
      atlasSide = atlasSize * textureSize;
    }
  }
  
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = atlasSize * textureSize;
  const ctx = canvas.getContext("2d", {
    alpha: true, // ✨ TOUJOURS true pour supporter la transparence
    desynchronized: false,
    willReadFrequently: false
  });

  // ✨ Ne PAS remplir de noir, laisser transparent
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (isText) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  textures.forEach((texture, index) => {
    const x = (index % atlasSize) * textureSize;
    const y = Math.floor(index / atlasSize) * textureSize;

    if (isText && texture.source?.data) {
      ctx.drawImage(texture.source.data, x, y, textureSize, textureSize);
    } else if (!isText && texture.image?.complete) {
      ctx.drawImage(texture.image, x, y, textureSize, textureSize);
    }
  });

  const atlasTexture = new THREE.CanvasTexture(canvas);
  Object.assign(atlasTexture, {
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    flipY: false,
    generateMipmaps: isText && IS_MOBILE_OR_TABLET,
    anisotropy: isText && IS_MOBILE_OR_TABLET ? (renderer?.capabilities.getMaxAnisotropy() || 16) : 1,
  });

  return atlasTexture;
};

const disposeTexture = (texture) => {
  if (texture) {
    texture.dispose();
  }
};

const updateImageAtlas = () => {
  const currentTextures = projects.map((project, index) => {
    const currentIndex = currentImageIndices[index];
    return allImageTextures[index][currentIndex];
  });
  
  const oldAtlas = plane.material.uniforms.uImageAtlas.value;
  const newImageAtlas = createTextureAtlas(currentTextures, false);
  plane.material.uniforms.uImageAtlas.value = newImageAtlas;
  plane.material.uniforms.uImageAtlas.value.needsUpdate = true;
  
  if (oldAtlas) {
    setTimeout(() => disposeTexture(oldAtlas), 100);
  }
};

const loadTextures = async () => {
  await waitForFont();
  
  const textureLoader = new THREE.TextureLoader();
  const projectImageTextures = [];
  
  projects.forEach((project) => {
    currentImageIndices.push(Math.floor(Math.random() * project.images.length));
  });

  return new Promise((resolve, reject) => {
    let loadedProjects = 0;
    let hasError = false;

    projects.forEach((project, projectIndex) => {
      const projectTextures = [];
      let loadedImages = 0;
      let failedImages = 0;

      project.images.forEach((imagePath, imageIndex) => {
        const texture = textureLoader.load(
          imagePath,
          () => {
            loadedImages++;
            console.log(`✅ Loaded image ${loadedImages}/${project.images.length} for project ${projectIndex}`);
            
            if (loadedImages + failedImages === project.images.length) {
              loadedProjects++;
              console.log(`✅ Project ${projectIndex} complete (${loadedProjects}/${projects.length})`);
              
              if (loadedProjects === projects.length) {
                console.log(`🎉 All projects loaded successfully!`);
                resolve(projectImageTextures);
              }
            }
          },
          undefined,
          (error) => {
            failedImages++;
            console.error(`❌ Failed to load image: ${imagePath}`, error);
            
            if (loadedImages + failedImages === project.images.length) {
              loadedProjects++;
              
              if (loadedProjects === projects.length) {
                if (loadedImages > 0) {
                  console.log(`⚠️ All projects processed (some images failed)`);
                  resolve(projectImageTextures);
                } else {
                  reject(new Error('Failed to load any images'));
                }
              }
            }
          }
        );

        Object.assign(texture, {
          wrapS: THREE.ClampToEdgeWrapping,
          wrapT: THREE.ClampToEdgeWrapping,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
        });

        projectTextures.push(texture);
      });

      projectImageTextures.push(projectTextures);
      textTextures.push(createTextTexture(project.title, project.year));
      tagsTextures.push(createTagsTexture(project.tags));
      
      // Rotation individuelle uniquement sur desktop (ni mobile ni tablette)
      if (!IS_MOBILE && !IS_TABLET && project.images.length > 1) {
        const randomDelay = Math.random() * 3000;
        setTimeout(() => {
          startImageRotationDesktop(projectIndex);
        }, randomDelay);
      }
    });
    
    setTimeout(() => {
      if (!hasError && loadedProjects < projects.length) {
        console.warn('⚠️ Loading timeout - forcing initialization');
        hasError = true;
        resolve(projectImageTextures);
      }
    }, 10000);
  });
};

const startImageRotationDesktop = (projectIndex) => {
  const rotationInterval = 3000 + Math.random() * 2000;
  
  const timer = setInterval(() => {
    if (document.hidden) return;
    
    const project = projects[projectIndex];
    currentImageIndices[projectIndex] = 
      (currentImageIndices[projectIndex] + 1) % project.images.length;
    
    if (plane?.material.uniforms.uImageAtlas) {
      updateImageAtlas();
    }
  }, rotationInterval);
  
  imageRotationTimers.push(timer);
};

function startGlobalRotationMobile() {
  const CHANGES_PER_TICK = 3;
  const INTERVAL = 3000;

  globalRotationTimer = setInterval(() => {
    if (document.hidden) return;
    
    for (let i = 0; i < CHANGES_PER_TICK; i++) {
      const idx = Math.floor(Math.random() * projects.length);
      const len = allImageTextures[idx].length;
      if (len > 1) {
        currentImageIndices[idx] = (currentImageIndices[idx] + 1) % len;
      }
    }
    
    if (plane?.material.uniforms.uImageAtlas) {
      updateImageAtlas();
    }
  }, INTERVAL);
}

function startGlobalRotationTablet() {
  // Rotation personnalisée pour tablette : 2 changements toutes les 3.5 secondes
  const CHANGES_PER_TICK = 3;
  const INTERVAL = 3000;

  globalRotationTimer = setInterval(() => {
    if (document.hidden) return;
    
    for (let i = 0; i < CHANGES_PER_TICK; i++) {
      const idx = Math.floor(Math.random() * projects.length);
      const len = allImageTextures[idx].length;
      if (len > 1) {
        currentImageIndices[idx] = (currentImageIndices[idx] + 1) % len;
      }
    }
    
    if (plane?.material.uniforms.uImageAtlas) {
      updateImageAtlas();
    }
  }, INTERVAL);
}

const updateMousePosition = (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mousePosition.x = event.clientX - rect.left;
  mousePosition.y = event.clientY - rect.top;
  plane?.material.uniforms.uMousePos.value.set(
    mousePosition.x,
    mousePosition.y
  );
  
  // 📷 Mouvement de caméra qui suit la souris
  if (!isDragging && !IS_MOBILE_OR_TABLET) {
    const normalizedX = (event.clientX / window.innerWidth) * 2 - 1;
    const normalizedY = -(event.clientY / window.innerHeight) * 2 + 1;
    
    cameraTargetX = normalizedX * cameraMaxMove;
    cameraTargetY = normalizedY * cameraMaxMove;
  }
};

const startDrag = (x, y) => {
  isDragging = true;
  isClick = true;
  clickStartTime = Date.now();
  document.body.classList.add("dragging");
  previousMouse.x = x;
  previousMouse.y = y;
  setTimeout(() => isDragging && (targetZoom = config.zoomLevel), 150);
  
  cameraTargetX = 0;
  cameraTargetY = 0;
};

const onPointerDown = (e) => startDrag(e.clientX, e.clientY);
const onTouchStart = (e) => {
  e.preventDefault();
  startDrag(e.touches[0].clientX, e.touches[0].clientY);
};

const handleMove = (currentX, currentY) => {
  if (!isDragging || currentX === undefined || currentY === undefined) return;

  const deltaX = currentX - previousMouse.x;
  const deltaY = currentY - previousMouse.y;

  if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
    isClick = false;
    if (targetZoom === 1.0) targetZoom = config.zoomLevel;
  }

  targetOffset.x -= deltaX * 0.003;
  targetOffset.y += deltaY * 0.003;
  previousMouse.x = currentX;
  previousMouse.y = currentY;
};

const onPointerMove = (e) => handleMove(e.clientX, e.clientY);
const onTouchMove = (e) => {
  e.preventDefault();
  handleMove(e.touches[0].clientX, e.touches[0].clientY);
};

// 🎬 FONCTION DE TRANSITION AVANCÉE (CORRIGÉE)
function triggerPageTransition(url) {
  const overlay = document.querySelector('.page-transition-overlay');
  const gallery = document.getElementById('gallery');
  const navbar = document.querySelector('.nav-wrap');
  
  if (!overlay) {
    console.warn('⚠️ Overlay not found');
    window.location.href = url;
    return;
  }
  
  console.log('🎬 Starting advanced transition to:', url);
  
  // ⚠️ CRITIQUE : Arrêter le parallaxe pendant la transition
  window.isTransitioning = true;
  
  // 1. Désactiver les interactions
  if (gallery) gallery.style.pointerEvents = 'none';
  if (navbar) navbar.style.pointerEvents = 'none';
  
  // 2. Ajouter la classe de transition (gérée en CSS)
  if (gallery) {
    gallery.classList.add('transitioning');
  }
  
  // 3. Faire monter l'overlay noir du bas vers le haut
  setTimeout(() => {
    overlay.classList.add('active');
    console.log('✅ Overlay activated');
  }, 300);
  
  // 4. Naviguer vers la nouvelle page
  setTimeout(() => {
    sessionStorage.setItem('fromGallery', 'true');
    window.location.href = url;
  }, 1100);
}

const onPointerUp = (event) => {
  isDragging = false;
  document.body.classList.remove("dragging");
  targetZoom = 1.0;

  // ✨ CORRECTION : Tolérer un léger mouvement pour le clic (mouvement de caméra)
  const endX = event.clientX || event.changedTouches?.[0]?.clientX;
  const endY = event.clientY || event.changedTouches?.[0]?.clientY;
  
  if (endX !== undefined && endY !== undefined) {
    // Calculer la distance de mouvement
    const deltaX = Math.abs(endX - previousMouse.x);
    const deltaY = Math.abs(endY - previousMouse.y);
    const totalMovement = deltaX + deltaY;
    
    // Considérer comme un clic si le mouvement est < 10px et temps < 300ms
    const isRealClick = isClick && Date.now() - clickStartTime < 300 && totalMovement < 10;
    
    if (isRealClick) {
      const rect = renderer.domElement.getBoundingClientRect();
      const screenX = ((endX - rect.left) / rect.width) * 2 - 1;
      const screenY = -(((endY - rect.top) / rect.height) * 2 - 1);

      const radius = Math.sqrt(screenX * screenX + screenY * screenY);
      const distortion = 1.0 - 0.08 * radius * radius;

      let worldX =
        screenX * distortion * (rect.width / rect.height) * zoomLevel +
        offset.x;
      let worldY = screenY * distortion * zoomLevel + offset.y;

      const cellX = Math.floor(worldX / config.cellSize);
      const cellY = Math.floor(worldY / config.cellSize);
      const texIndex = Math.floor((cellX + cellY * 5.0) % projects.length);
      const actualIndex = texIndex < 0 ? projects.length + texIndex : texIndex;

      if (projects[actualIndex]?.href) {
        // 🎬 Utiliser la nouvelle transition
        triggerPageTransition(projects[actualIndex].href);
      }
    }
  }
};

const onWindowResize = () => {
  const container = document.getElementById("gallery");
  if (!container) return;

  const { offsetWidth: width, offsetHeight: height } = container;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  
  const maxPR = IS_MOBILE ? 2 : (IS_TABLET ? 1.8 : 2);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPR));
  
  plane?.material.uniforms.uResolution.value.set(width, height);
};

const cleanup = () => {
  if (globalRotationTimer) {
    clearInterval(globalRotationTimer);
    globalRotationTimer = null;
  }
  
  imageRotationTimers.forEach(timer => clearInterval(timer));
  imageRotationTimers = [];
  
  textTextures.forEach(disposeTexture);
  tagsTextures.forEach(disposeTexture);
  allImageTextures.forEach(projectTextures => {
    projectTextures.forEach(disposeTexture);
  });
  
  if (plane) {
    plane.geometry.dispose();
    plane.material.dispose();
  }
  
  if (renderer) {
    renderer.dispose();
  }
};

const setupEventListeners = () => {
  document.addEventListener("mousedown", onPointerDown);
  document.addEventListener("mousemove", onPointerMove);
  document.addEventListener("mouseup", onPointerUp);
  document.addEventListener("mouseleave", onPointerUp);

  const passiveOpts = { passive: false };
  document.addEventListener("touchstart", onTouchStart, passiveOpts);
  document.addEventListener("touchmove", onTouchMove, passiveOpts);
  document.addEventListener("touchend", onPointerUp, passiveOpts);

  window.addEventListener("resize", onWindowResize);
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  renderer.domElement.addEventListener("mousemove", updateMousePosition);
  renderer.domElement.addEventListener("mouseleave", () => {
    mousePosition.x = mousePosition.y = -1;
    plane?.material.uniforms.uMousePos.value.set(-1, -1);
    
    cameraTargetX = 0;
    cameraTargetY = 0;
  });
  
  window.addEventListener("beforeunload", cleanup);
  
  document.addEventListener('visibilitychange', () => {
    if (plane?.material.uniforms.uHoverColor) {
      const hoverColorArray = rgbaToArray(config.hoverColor);
      plane.material.uniforms.uHoverColor.value.w = document.hidden ? 0.0 : hoverColorArray[3];
    }
  });
};

const animate = () => {
  requestAnimationFrame(animate);

  offset.x += (targetOffset.x - offset.x) * config.lerpFactor;
  offset.y += (targetOffset.y - offset.y) * config.lerpFactor;
  zoomLevel += (targetZoom - zoomLevel) * config.lerpFactor;

  // 📷 Mouvement de caméra
  if (!isDragging && !IS_MOBILE_OR_TABLET) {
    currentCameraX += (cameraTargetX - currentCameraX) * cameraFollowSpeed;
    currentCameraY += (cameraTargetY - currentCameraY) * cameraFollowSpeed;
    
    const finalOffsetX = offset.x + currentCameraX;
    const finalOffsetY = offset.y + currentCameraY;
    
    if (plane?.material.uniforms) {
      plane.material.uniforms.uOffset.value.set(finalOffsetX, finalOffsetY);
      plane.material.uniforms.uZoom.value = zoomLevel;
      plane.material.uniforms.uTime.value = performance.now() / 1000.0; // 💫 Update time pour la vague
    }
  } else {
    currentCameraX *= 0.95;
    currentCameraY *= 0.95;
    
    if (plane?.material.uniforms) {
      plane.material.uniforms.uOffset.value.set(offset.x, offset.y);
      plane.material.uniforms.uZoom.value = zoomLevel;
      plane.material.uniforms.uTime.value = performance.now() / 1000.0; // 💫 Update time pour la vague
    }
  }

  renderer.render(scene, camera);
};

const init = async () => {
  const container = document.getElementById("gallery");
  if (!container) return;

  console.log('🚀 Initializing gallery...');

  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;

  renderer = new THREE.WebGLRenderer({
    antialias: !IS_MOBILE,
    alpha: false,
    powerPreference: IS_MOBILE_OR_TABLET ? 'default' : 'high-performance',
    failIfMajorPerformanceCaveat: false
  });

  renderer.setSize(container.offsetWidth, container.offsetHeight);
  
  const maxPR = IS_MOBILE ? 2 : (IS_TABLET ? 1.8 : 2);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPR));

  const bgColor = rgbaToArray(config.backgroundColor);
  renderer.setClearColor(
    new THREE.Color(bgColor[0], bgColor[1], bgColor[2]),
    bgColor[3]
  );
  container.appendChild(renderer.domElement);

  try {
    console.log('📦 Loading textures...');
    allImageTextures = await loadTextures();
    console.log('✅ Textures loaded successfully');
    
    if (IS_TABLET) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const initialTextures = projects.map((project, index) => {
      return allImageTextures[index][currentImageIndices[index]];
    });
    
    const imageAtlas = createTextureAtlas(initialTextures, false);
    const textAtlas = createTextureAtlas(textTextures, true);
    const tagsAtlas = createTextureAtlas(tagsTextures, true);

    const uniforms = {
      uOffset: { value: new THREE.Vector2(0, 0) },
      uResolution: {
        value: new THREE.Vector2(container.offsetWidth, container.offsetHeight),
      },
      uBorderColor: {
        value: new THREE.Vector4(...rgbaToArray(config.borderColor)),
      },
      uHoverColor: {
        value: new THREE.Vector4(...rgbaToArray(config.hoverColor)),
      },
      uBackgroundColor: {
        value: new THREE.Vector4(...rgbaToArray(config.backgroundColor)),
      },
      uMousePos: { value: new THREE.Vector2(-1, -1) },
      uZoom: { value: 1.0 },
      uCellSize: { value: config.cellSize },
      uTextureCount: { value: projects.length },
      uImageAtlas: { value: imageAtlas },
      uTextAtlas: { value: textAtlas },
      uTagsAtlas: { value: tagsAtlas },
      uTime: { value: 0.0 }, // 💫 Pour l'animation de la vague
    };

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
    });

    plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    setupEventListeners();
    animate();
    
    // Démarrer la rotation appropriée selon le type d'appareil
    if (IS_MOBILE) {
      startGlobalRotationMobile();
    } else if (IS_TABLET) {
      startGlobalRotationTablet();
    }
    
    console.log('✅ Gallery initialized successfully!');
    console.log(`🚀 Device: ${IS_MOBILE ? 'Mobile' : IS_TABLET ? 'Tablet' : 'Desktop'}`);
    console.log(`🔍 Zoom level: ${config.zoomLevel}`);
    console.log(`📐 Text canvas: ${IS_MOBILE ? '3072×384' : IS_TABLET ? '3072×384' : '2048×256'}`);
    console.log(`📐 Text size: ${IS_MOBILE ? '110px' : IS_TABLET ? '105px' : '80px'}`);
    console.log(`🏷️ Tags size: ${IS_MOBILE ? '90px' : IS_TABLET ? '82px' : '65px'}`);
    console.log(`🎨 PixelRatio: ${IS_MOBILE ? '2.0' : IS_TABLET ? '1.8' : '2.0'}`);
    console.log(`🔄 Rotation: ${IS_MOBILE ? 'Mobile (3 every 3s)' : IS_TABLET ? 'Tablet (2 every 3.5s)' : 'Individual desktop'}`);
  } catch (error) {
    console.error('❌ Failed to initialize gallery:', error);
    container.innerHTML = `
      <div style="color: white; text-align: center; padding: 40px; font-family: Arial, sans-serif;">
        <h2>Failed to load gallery</h2>
        <p>Please refresh the page or check your internet connection.</p>
        <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; font-size: 16px; cursor: pointer;">
          Refresh Page
        </button>
      </div>
    `;
  }
};

init();

// 🔙 GESTION DU RETOUR VERS LA GALERIE
window.addEventListener('pageshow', function(event) {
  const fromGallery = sessionStorage.getItem('fromGallery');
  const gallery = document.getElementById('gallery');
  const navbar = document.querySelector('.nav-wrap');
  
  if (fromGallery === 'true' || event.persisted) {
    console.log('🔙 Returning to gallery');
    
    // Réinitialiser le style immédiatement
    if (gallery) {
      gallery.style.transform = 'scale(1)';
      gallery.style.opacity = '1';
      gallery.style.pointerEvents = 'auto';
      gallery.style.transition = 'none';
    }
    
    if (navbar) {
      navbar.style.pointerEvents = 'auto';
    }
    
    const overlay = document.querySelector('.page-transition-overlay');
    if (overlay) {
      overlay.classList.remove('active');
    }
    
    sessionStorage.removeItem('fromGallery');
    console.log('✅ Gallery restored');
  }
});