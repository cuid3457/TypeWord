export interface PickResult {
  uri: string;
  width: number;
  height: number;
}

export default async function pickImage(
  source: 'camera' | 'gallery',
): Promise<PickResult | null> {
  let ImagePicker: typeof import('expo-image-picker');

  try {
    ImagePicker = require('expo-image-picker');
  } catch {
    throw new Error('NATIVE_UNAVAILABLE');
  }

  if (source === 'camera') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') throw new Error('CAMERA_PERMISSION_DENIED');
  }

  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, cameraType: ImagePicker.CameraType.back })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

export async function cropAndEncode(
  uri: string,
  crop: { originX: number; originY: number; width: number; height: number },
): Promise<string | null> {
  let IM: typeof import('expo-image-manipulator');
  try {
    IM = require('expo-image-manipulator');
  } catch {
    throw new Error('NATIVE_UNAVAILABLE');
  }

  const manipulated = await IM.manipulateAsync(
    uri,
    [{ crop }, { resize: { width: 1024 } }],
    { compress: 0.7, format: IM.SaveFormat.JPEG, base64: true },
  );

  return manipulated.base64 ?? null;
}
