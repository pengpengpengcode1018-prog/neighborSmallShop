export function readStorage<T>(key: string): T | null {
  const value = uni.getStorageSync(key);
  return value === '' ? null : (value as T);
}

export function writeStorage<T>(key: string, value: T): void {
  uni.setStorageSync(key, value);
}

export function removeStorage(key: string): void {
  uni.removeStorageSync(key);
}
