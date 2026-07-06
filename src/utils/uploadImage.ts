import { storage, auth } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImageManipulator from 'expo-image-manipulator';

export async function uploadImage(
  localUri: string,
  folder: 'posts' | 'avatars' | 'clubs' | 'club-chat',
): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Non authentifié');

  const maxSize = folder === 'avatars' ? 400 : 1200;
  const compressed = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: maxSize } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG },
  );

  const filename = `${folder}/${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;

  const blob: Blob = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response);
    xhr.onerror = () => reject(new Error('Erreur lecture fichier'));
    xhr.responseType = 'blob';
    xhr.open('GET', compressed.uri, true);
    xhr.send(null);
  });

  // uploadBytes (non-resumable) plus rapide qu'uploadBytesResumable pour les images
  const storageRef = ref(storage, filename);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });

  return getDownloadURL(storageRef);
}
