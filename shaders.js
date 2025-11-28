export const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  uniform vec2 uOffset;
  uniform vec2 uResolution;
  uniform vec4 uBorderColor;
  uniform vec4 uHoverColor;
  uniform vec4 uBackgroundColor;
  uniform vec2 uMousePos;
  uniform float uZoom;
  uniform float uCellSize;
  uniform float uTextureCount;
  uniform sampler2D uImageAtlas;
  uniform sampler2D uTextAtlas;
  uniform sampler2D uTagsAtlas;
  uniform float uTime;
  varying vec2 vUv;
  
  void main() {
    vec2 screenUV = (vUv - 0.5) * 2.0;
    
    float radius = length(screenUV);
    float distortion = 1.0 - 0.13 * radius * radius - 0.05;
    vec2 distortedUV = screenUV * distortion;
    
    vec2 aspectRatio = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 worldCoord = distortedUV * aspectRatio;
    
    worldCoord *= uZoom;
    worldCoord += uOffset;
    
    vec2 cellPos = worldCoord / uCellSize;
    vec2 cellId = floor(cellPos);
    vec2 cellUV = fract(cellPos);
    
    vec2 mouseScreenUV = (uMousePos / uResolution) * 2.0 - 1.0;
    mouseScreenUV.y = -mouseScreenUV.y;
    
    float mouseRadius = length(mouseScreenUV);
    float mouseDistortion = 1.0 - 0.08 * mouseRadius * mouseRadius;
    vec2 mouseDistortedUV = mouseScreenUV * mouseDistortion;
    vec2 mouseWorldCoord = mouseDistortedUV * aspectRatio;
    
    mouseWorldCoord *= uZoom;
    mouseWorldCoord += uOffset;
    
    vec2 mouseCellPos = mouseWorldCoord / uCellSize;
    vec2 mouseCellId = floor(mouseCellPos);
    
    vec2 cellCenter = cellId + 0.5;
    vec2 mouseCellCenter = mouseCellId + 0.5;
    float cellDistance = length(cellCenter - mouseCellCenter);
    float hoverIntensity = 1.0 - smoothstep(0.4, 0.7, cellDistance);
    bool isHovered = hoverIntensity > 0.0 && uMousePos.x >= 0.0;
    
    vec3 backgroundColor = uBackgroundColor.rgb;
    
    // 💫 ONDE CIRCULAIRE
    if (isHovered) {
      vec2 cellCenterLocal = vec2(0.5, 0.5);
      float distFromCenter = length(cellUV - cellCenterLocal);
      
      float waveSpeed = 1.5;
      float waveRadius = mod(uTime * waveSpeed, 1.5);
      
      float distToWave = abs(distFromCenter - waveRadius);
      float waveWidth = 0.25;
      float waveIntensity = smoothstep(waveWidth, 0.0, distToWave);
      
      float fadeFactor = 1.0 - smoothstep(0.5, 1.0, waveRadius);
      waveIntensity *= fadeFactor;
      
      float centerPulse = smoothstep(0.3, 0.0, distFromCenter) * 0.3;
      
      float finalIntensity = (waveIntensity + centerPulse) * hoverIntensity * 0.5;
      
      backgroundColor = mix(backgroundColor, uHoverColor.rgb, finalIntensity);
    }
    
    float lineWidth = 0.005;
    float gridX = smoothstep(0.0, lineWidth, cellUV.x) * smoothstep(0.0, lineWidth, 1.0 - cellUV.x);
    float gridY = smoothstep(0.0, lineWidth, cellUV.y) * smoothstep(0.0, lineWidth, 1.0 - cellUV.y);
    float gridMask = gridX * gridY;
    
    float imageSize = 0.68;
    float imageBorder = (1.0 - imageSize) * 0.5;
    
    vec2 imageUV = (cellUV - imageBorder) / imageSize;
    
    float edgeSmooth = 0.01;
    vec2 imageMask = smoothstep(-edgeSmooth, edgeSmooth, imageUV) * 
                    smoothstep(-edgeSmooth, edgeSmooth, 1.0 - imageUV);
    float imageAlpha = imageMask.x * imageMask.y;
    
    bool inImageArea = imageUV.x >= 0.0 && imageUV.x <= 1.0 && imageUV.y >= 0.0 && imageUV.y <= 1.0;
    
    float textHeight = 0.08;
    float textY = 0.88;
    bool inTextArea = cellUV.x >= 0.05 && cellUV.x <= 0.95 && cellUV.y >= textY && cellUV.y <= (textY + textHeight);
    
    float tagsHeight = 0.06;
    float tagsY = 0.05;
    bool inTagsArea = cellUV.x >= 0.05 && cellUV.x <= 0.75 && cellUV.y >= tagsY && cellUV.y <= (tagsY + tagsHeight);
    
    float texIndex = mod(cellId.x + cellId.y * 5.0, uTextureCount);
    
    vec3 color = backgroundColor;
    
    if (inImageArea && imageAlpha > 0.0) {
      float atlasSize = ceil(sqrt(uTextureCount));
      vec2 flippedImageUV = vec2(imageUV.x, 1.0 - imageUV.y);
      vec2 atlasPos = vec2(mod(texIndex, atlasSize), floor(texIndex / atlasSize));
      vec2 atlasUV = (atlasPos + flippedImageUV) / atlasSize;
      
      vec4 imageColorWithAlpha = texture2D(uImageAtlas, atlasUV);
      vec3 imageColor = imageColorWithAlpha.rgb;
      float imageTransparency = imageColorWithAlpha.a;
      
      color = mix(color, imageColor, imageAlpha * imageTransparency);
    }
    
    if (inTextArea) {
      vec2 textCoord = vec2((cellUV.x - 0.05) / 0.9, (cellUV.y - textY) / textHeight);
      textCoord.y = 1.0 - textCoord.y;
      
      float atlasSize = ceil(sqrt(uTextureCount));
      vec2 atlasPos = vec2(mod(texIndex, atlasSize), floor(texIndex / atlasSize));
      vec2 atlasUV = (atlasPos + textCoord) / atlasSize;
      
      vec4 textColor = texture2D(uTextAtlas, atlasUV);
      
      vec3 textBgColor = backgroundColor;
      color = mix(textBgColor, textColor.rgb, textColor.a);
    }
    
    if (inTagsArea) {
      vec2 tagsCoord = vec2((cellUV.x - 0.05) / 0.7, (cellUV.y - tagsY) / tagsHeight);
      tagsCoord.y = 1.0 - tagsCoord.y;
      
      float atlasSize = ceil(sqrt(uTextureCount));
      vec2 atlasPos = vec2(mod(texIndex, atlasSize), floor(texIndex / atlasSize));
      vec2 atlasUV = (atlasPos + tagsCoord) / atlasSize;
      
      vec4 tagsColor = texture2D(uTagsAtlas, atlasUV);
      
      vec3 tagsBgColor = backgroundColor;
      color = mix(tagsBgColor, tagsColor.rgb, tagsColor.a);
    }
    
    vec3 borderRGB = uBorderColor.rgb;
    float borderAlpha = uBorderColor.a;
    color = mix(color, borderRGB, (1.0 - gridMask) * borderAlpha);
    
    float fade = 1.0 - smoothstep(1.2, 1.8, radius);
    
    gl_FragColor = vec4(color * fade, 1.0);
  }
`;