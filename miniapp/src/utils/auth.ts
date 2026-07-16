const tokenKey = 'nearby-shop-access-token';

export function getAccessToken(): string | null {
  return uni.getStorageSync(tokenKey) || null;
}

export function setAccessToken(token: string): void {
  uni.setStorageSync(tokenKey, token);
}

export function clearAccessToken(): void {
  uni.removeStorageSync(tokenKey);
}
