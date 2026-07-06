import AsyncStorage from '@react-native-async-storage/async-storage';

const MIGRATION_FLAG = 'fluide_storage_migration_v1';

export async function migrateStorageKeys(uid: string): Promise<void> {
  // Ne migre qu'une seule fois par uid
  const flag = await AsyncStorage.getItem(`${MIGRATION_FLAG}_${uid}`);
  if (flag) return;

  const profileId = '1'; // seul profil possible

  await Promise.allSettled([
    migrateKey(
      `fluide_app_state`,                          // ancienne clé globale sans uid
      `fluide_app_state_${uid}`,
    ),
    migrateKey(
      `fluide_training_state_${profileId}`,        // ancienne clé training sans uid
      `fluide_training_state_${uid}_${profileId}`,
    ),
    migrateKey(
      `fluide_repas_${profileId}`,                 // ancienne clé repas sans uid
      `fluide_repas_${uid}_${profileId}`,
    ),
  ]);

  await AsyncStorage.setItem(`${MIGRATION_FLAG}_${uid}`, '1');
}

async function migrateKey(oldKey: string, newKey: string): Promise<void> {
  const newData = await AsyncStorage.getItem(newKey);
  if (newData) return; // la nouvelle clé a déjà des données, on ne l'écrase pas

  const oldData = await AsyncStorage.getItem(oldKey);
  if (!oldData) return; // rien à migrer

  await AsyncStorage.setItem(newKey, oldData);
  // On garde l'ancienne clé pour sécurité (pas de suppression)
}
