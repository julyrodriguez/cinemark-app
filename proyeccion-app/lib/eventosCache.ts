import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_KEY_PREFIX = "eventos_cache_";
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutos

interface CacheEntry {
  data: any;
  timestamp: number;
}

export async function getCachedEventos(
  startDate: number,
  endDate: number
): Promise<any[] | null> {
  try {
    const key = `${CACHE_KEY_PREFIX}${startDate}_${endDate}`;
    const cached = await AsyncStorage.getItem(key);
    
    if (!cached) return null;
    
    const entry: CacheEntry = JSON.parse(cached);
    const now = Date.now();
    
    if (now - entry.timestamp > CACHE_EXPIRY_MS) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    
    return entry.data;
  } catch (error) {
    console.error("Error reading cache:", error);
    return null;
  }
}

export async function setCachedEventos(
  startDate: number,
  endDate: number,
  eventos: any[]
): Promise<void> {
  try {
    const key = `${CACHE_KEY_PREFIX}${startDate}_${endDate}`;
    const entry: CacheEntry = {
      data: eventos,
      timestamp: Date.now(),
    };
    
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.error("Error writing cache:", error);
  }
}

export async function clearEventosCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((key) => key.startsWith(CACHE_KEY_PREFIX));
    await AsyncStorage.multiRemove(cacheKeys);
  } catch (error) {
    console.error("Error clearing cache:", error);
  }
}
