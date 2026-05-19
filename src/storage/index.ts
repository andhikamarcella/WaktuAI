import AsyncStorage from '@react-native-async-storage/async-storage';
export const loadJson = async <T,>(key: string, fallback: T): Promise<T> => {
  try { const v = await AsyncStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
};
export const saveJson = async (key: string, value: unknown) => { try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch {} };
