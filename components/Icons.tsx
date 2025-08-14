export const createIcon = (size: number, color: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  if (ctx) {
    // 배경
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    
    // 원 그리기
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 3, 0, Math.PI * 2);
    ctx.fill();
    
    // 텍스트
    ctx.fillStyle = color;
    ctx.font = `bold ${size / 4}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('W', size / 2, size / 2);
  }
  
  return canvas.toDataURL('image/png');
};