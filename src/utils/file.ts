const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function validateImageFile(file: File): void {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Please use a PNG, JPG, JPEG, or WEBP image.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('That image is larger than 10 MB. Please choose a smaller screenshot.');
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that image file.'));
    reader.readAsDataURL(file);
  });
}

export async function loadImageElement(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not load that image.'));
    image.src = src;
  });
  return image;
}

/**
 * Keeps vision requests affordable and below typical API payload limits while
 * preserving enough resolution for text in flowchart boxes.
 */
export async function downscaleDataUrl(
  dataUrl: string,
  maxDimension = 1600,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const image = await loadImageElement(dataUrl);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  if (scale === 1 && dataUrl.length < 2_500_000) {
    return { dataUrl, width, height };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare that image.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return {
    dataUrl: canvas.toDataURL('image/png', 0.92),
    width,
    height,
  };
}
