// Web-only image picker + cropper used by the OCR flow. Replaces the
// native expo-image-picker / expo-image-manipulator pair, which don't
// have working web implementations for `manipulateAsync`.

export interface PickResult {
  uri: string;
  width: number;
  height: number;
}

// Pop a file <input> and resolve when the user selects (or cancels). The
// returned uri is an object URL the caller can feed into <Image>.
function pickFileViaInput(captureCamera: boolean): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (captureCamera) {
      // On mobile browsers this hints the camera as the default source.
      // Desktop browsers ignore it and show the regular file dialog.
      input.setAttribute('capture', 'environment');
    }
    input.style.display = 'none';

    let settled = false;
    const cleanup = () => {
      window.removeEventListener('focus', onFocus);
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.onchange = () => {
      settled = true;
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    };

    // Detect "cancelled" by watching for window refocus without an input
    // event — the file dialog blurs the page, and on return without a
    // selection no change event fires.
    const onFocus = () => {
      setTimeout(() => {
        if (settled) return;
        // Some browsers fire change after focus; give it a beat.
        if (input.files && input.files.length > 0) return;
        settled = true;
        cleanup();
        resolve(null);
      }, 300);
    };
    window.addEventListener('focus', onFocus, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

export default async function pickImage(
  source: 'camera' | 'gallery',
): Promise<PickResult | null> {
  const file = await pickFileViaInput(source === 'camera');
  if (!file) return null;

  const uri = URL.createObjectURL(file);
  // We need width/height for the crop overlay. Decode once to read them.
  let img: HTMLImageElement;
  try {
    img = await loadImage(uri);
  } catch {
    URL.revokeObjectURL(uri);
    throw new Error('NATIVE_UNAVAILABLE');
  }
  return { uri, width: img.naturalWidth, height: img.naturalHeight };
}

// Canvas-based replacement for expo-image-manipulator. Crops the region
// the user selected and downscales to the same 1024-wide JPEG @ 70%
// quality the native path produces, returning base64 without the
// data:URL prefix (matches the native API contract).
export async function cropAndEncode(
  uri: string,
  crop: { originX: number; originY: number; width: number; height: number },
): Promise<string | null> {
  const img = await loadImage(uri);
  const cropW = Math.max(1, Math.round(crop.width));
  const cropH = Math.max(1, Math.round(crop.height));
  const cropX = Math.max(0, Math.round(crop.originX));
  const cropY = Math.max(0, Math.round(crop.originY));

  // Downscale so the longest side after the crop is at most 1024px,
  // matching the native pipeline's `resize: { width: 1024 }`.
  const scale = cropW > 1024 ? 1024 / cropW : 1;
  const outW = Math.max(1, Math.round(cropW * scale));
  const outH = Math.max(1, Math.round(cropH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : null;
}
