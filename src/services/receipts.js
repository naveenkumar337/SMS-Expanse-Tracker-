// src/services/receipts.js
// Receipt photo capture (camera or gallery) + upload to Supabase Storage.
//
// Requires a Storage bucket named "receipts" to exist in the Supabase
// project. Since there's no Supabase-Auth session for Storage's own RLS to
// check (`auth.uid()`), the upload itself is delegated to the "upload-receipt"
// Supabase Edge Function (supabase/functions/upload-receipt/index.ts), which
// validates the caller's custom session (user_id + token) against the
// `users` table before writing with the service-role key. Direct
// client writes to the bucket stay denied — see
// supabase-migration-custom-auth.sql for the exact policy SQL/reasoning.

import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { File } from 'expo-file-system';
import { supabase } from './supabase';
import { getStoredSession } from './auth';

async function captureFromCamera() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission required', 'Camera access is needed to take a receipt photo.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
  if (result.canceled) return null;
  return result.assets[0].uri;
}

async function pickFromGallery() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission required', 'Gallery access is needed to attach a receipt photo.');
    return null;
  }
  // `mediaTypes` defaults to 'images', which is exactly what we want here —
  // intentionally omitted since the enum-based MediaTypeOptions API is
  // deprecated in this SDK version.
  const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
  if (result.canceled) return null;
  return result.assets[0].uri;
}

// Presents a Camera/Gallery/Cancel choice and returns the picked image's
// local URI, or null if the user cancelled at any step.
function pickReceiptSource() {
  return new Promise((resolve) => {
    Alert.alert('Attach Receipt', 'Choose a source', [
      { text: 'Camera', onPress: async () => resolve(await captureFromCamera()) },
      { text: 'Gallery', onPress: async () => resolve(await pickFromGallery()) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

async function uploadReceipt(uri, session) {
  const fileExt = (uri.split('.').pop() || 'jpg').split('?')[0];
  const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
  const fileBase64 = await new File(uri).base64();

  const { data, error } = await supabase.functions.invoke('upload-receipt', {
    body: {
      user_id: session.id,
      token: session.token,
      fileBase64,
      contentType,
      ext: fileExt,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.publicUrl;
}

// Full flow: prompt for camera/gallery, capture/pick, upload to Storage.
// Returns the uploaded receipt's public URL, or null if the user cancelled.
export async function pickAndUploadReceipt() {
  const uri = await pickReceiptSource();
  if (!uri) return null;

  const session = await getStoredSession();
  if (!session) throw new Error('User not authenticated');

  return uploadReceipt(uri, session);
}
