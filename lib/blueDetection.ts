export interface BlueDetectionConfig {
  threshold: number; // 0.01 ~ 0.5
  minBlueIntensity: number; // 최소 파란색 강도 (0-255)
  debugMode?: boolean;
}

export function detectBlueLevel(
  imageData: ImageData,
  config: BlueDetectionConfig
): number {
  const { data, width, height } = imageData;
  const { minBlueIntensity = 100 } = config;
  
  let bluePixels = 0;
  const totalPixels = width * height;
  
  // 픽셀 순회 (RGBA 형식이므로 4씩 증가)
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    // 투명 픽셀 무시
    if (a < 128) continue;
    
    // 파란색 감지 조건:
    // 1. 파란색 채널이 빨강, 초록보다 강해야 함
    // 2. 파란색 채널이 최소 강도 이상이어야 함
    // 3. 파란색이 빨강보다 20% 이상, 초록보다 20% 이상 강해야 함
    const blueRatio = b / Math.max(r, g, 1);
    const isBlue = b > minBlueIntensity && 
                   b > r * 1.2 && 
                   b > g * 1.2 &&
                   blueRatio > 1.2;
    
    if (isBlue) {
      bluePixels++;
    }
  }
  
  // 전체 픽셀 대비 파란색 픽셀 비율
  const blueLevel = bluePixels / totalPixels;
  
  return blueLevel;
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  
  return [h * 360, s, l];
}

export function detectBlueWithHsl(
  imageData: ImageData
): number {
  const { data, width, height } = imageData;
  
  let bluePixels = 0;
  const totalPixels = width * height;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    if (a < 128) continue;
    
    const [h, s, l] = rgbToHsl(r, g, b);
    
    // 파란색 색조 범위: 200-240도
    // 채도가 50% 이상
    // 명도가 20-80% 범위
    const isBlue = h >= 200 && h <= 240 && s > 0.5 && l > 0.2 && l < 0.8;
    
    if (isBlue) {
      bluePixels++;
    }
  }
  
  return bluePixels / totalPixels;
}

export function drawDebugOverlay(
  canvas: HTMLCanvasElement,
  imageData: ImageData,
  config: BlueDetectionConfig
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const { data, width, height } = imageData;
  const debugData = ctx.createImageData(width, height);
  const { minBlueIntensity = 100 } = config;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    
    const blueRatio = b / Math.max(r, g, 1);
    const isBlue = b > minBlueIntensity && 
                   b > r * 1.2 && 
                   b > g * 1.2 &&
                   blueRatio > 1.2;
    
    if (isBlue) {
      // 파란색으로 감지된 픽셀을 밝은 파란색으로 표시
      debugData.data[i] = 0;
      debugData.data[i + 1] = 150;
      debugData.data[i + 2] = 255;
      debugData.data[i + 3] = 200;
    } else {
      // 나머지는 회색조로 표시
      const gray = (r + g + b) / 3;
      debugData.data[i] = gray;
      debugData.data[i + 1] = gray;
      debugData.data[i + 2] = gray;
      debugData.data[i + 3] = a;
    }
  }
  
  ctx.putImageData(debugData, 0, 0);
}