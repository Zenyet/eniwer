// Google OAuth authentication handler
// Supports chrome.identity.getAuthToken (Chrome) with launchWebAuthFlow fallback (Edge, Brave, Arc, etc.)
import { GoogleUser, AuthState } from '../types';

const AUTH_STATE_KEY = 'thecircle_auth_state';
const SYNC_ENABLED_KEY = 'thecircle_sync_enabled';
const AUTH_METHOD_KEY = 'thecircle_auth_method';
const WEB_TOKEN_KEY = 'thecircle_web_token';

// Web OAuth config — requires a "Web Application" OAuth client in Google Cloud Console
// Redirect URI must be set to: chrome.identity.getRedirectURL()
const WEB_OAUTH_CLIENT_ID = '1071438021242-n8aqlc8of5bgdn8rim048eep6n1jemdg.apps.googleusercontent.com';
const REDIRECT_URL = chrome.identity.getRedirectURL();
const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

type AuthMethod = 'chrome' | 'web';

interface WebTokenData {
  accessToken: string;
  expiresAt: number;
}

// Lock to prevent concurrent interactive login popups
let isInteractiveAuthInProgress = false;

// --- Storage helpers ---

async function getStoredAuthMethod(): Promise<AuthMethod | null> {
  const result = await chrome.storage.local.get([AUTH_METHOD_KEY]);
  return result[AUTH_METHOD_KEY] || null;
}

async function setStoredAuthMethod(method: AuthMethod): Promise<void> {
  await chrome.storage.local.set({ [AUTH_METHOD_KEY]: method });
}

async function getStoredWebToken(): Promise<WebTokenData | null> {
  const result = await chrome.storage.local.get([WEB_TOKEN_KEY]);
  return result[WEB_TOKEN_KEY] || null;
}

async function setStoredWebToken(data: WebTokenData): Promise<void> {
  await chrome.storage.local.set({ [WEB_TOKEN_KEY]: data });
}

async function clearStoredWebToken(): Promise<void> {
  await chrome.storage.local.remove([WEB_TOKEN_KEY]);
}

// --- Chrome identity API ---

// Cache the probe result so we only test once per service worker lifetime
let chromeIdentityProbeResult: boolean | null = null;

// Probe whether chrome.identity.getAuthToken actually works.
// Edge/Brave/Arc expose the function but it hangs on call. A silent (non-interactive)
// call should resolve almost instantly on real Chrome, so we use a short timeout.
async function probeChromeIdentity(): Promise<boolean> {
  if (typeof chrome.identity?.getAuthToken !== 'function') return false;

  try {
    const result = await Promise.race([
      chrome.identity.getAuthToken({ interactive: false }).then(() => true, () => true),
      new Promise<false>(resolve => setTimeout(() => resolve(false), 1000)),
    ]);
    return result;
  } catch {
    return false;
  }
}

async function chromeGetAuthToken(interactive: boolean): Promise<string | null> {
  if (chromeIdentityProbeResult === null) {
    chromeIdentityProbeResult = await probeChromeIdentity();
    console.log(`[Auth] Chrome identity probe: ${chromeIdentityProbeResult ? 'supported' : 'not supported'}`);
  }
  if (!chromeIdentityProbeResult) return null;

  try {
    const result = await chrome.identity.getAuthToken({ interactive });
    return result?.token || null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`[Auth] getAuthToken(interactive=${interactive}) failed:`, msg);
    return null;
  }
}

// --- Web OAuth flow ---

async function webAuthLogin(): Promise<string | null> {
  try {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', WEB_OAUTH_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URL);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', SCOPES);

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });

    if (!responseUrl) return null;
    return extractAndStoreToken(responseUrl);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Auth] launchWebAuthFlow failed:', msg);
    return null;
  }
}

// Silent token refresh — re-runs the flow with prompt=none
async function refreshWebTokenSilent(): Promise<string | null> {
  try {
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', WEB_OAUTH_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URL);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('prompt', 'none');

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: false,
    });

    if (!responseUrl) return null;
    return extractAndStoreToken(responseUrl);
  } catch {
    return null;
  }
}

function extractAndStoreToken(responseUrl: string): string | null {
  // Implicit flow returns token in URL fragment: #access_token=...&expires_in=...
  const hash = new URL(responseUrl).hash.substring(1);
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  const expiresIn = params.get('expires_in');

  if (!accessToken) {
    console.error('[Auth] No access_token in redirect URL');
    return null;
  }

  const tokenData: WebTokenData = {
    accessToken,
    expiresAt: Date.now() + (Number(expiresIn) || 3600) * 1000,
  };
  // Fire and forget — don't block on storage
  setStoredWebToken(tokenData);
  return accessToken;
}

async function getWebToken(interactive: boolean): Promise<string | null> {
  const stored = await getStoredWebToken();

  if (stored?.accessToken) {
    // Token still fresh — use it
    if (stored.expiresAt > Date.now() + 60_000) {
      return stored.accessToken;
    }
    // Expired — try silent refresh
    const refreshed = await refreshWebTokenSilent();
    if (refreshed) return refreshed;
  }

  // No valid token — need interactive login
  if (!interactive) return null;
  return webAuthLogin();
}

// --- Unified token dispatcher ---

async function getToken(interactive: boolean): Promise<string | null> {
  const storedMethod = await getStoredAuthMethod();

  if (storedMethod === 'chrome') {
    return chromeGetAuthToken(interactive);
  }

  if (storedMethod === 'web') {
    return getWebToken(interactive);
  }

  // First-time login: try Chrome identity first, fallback to web
  if (!interactive) {
    const chromeToken = await chromeGetAuthToken(false);
    return chromeToken ?? getWebToken(false);
  }

  console.log('[Auth] First login — trying Chrome identity API...');
  const chromeToken = await chromeGetAuthToken(true);
  if (chromeToken) {
    await setStoredAuthMethod('chrome');
    return chromeToken;
  }

  console.log('[Auth] Using web OAuth flow...');
  const webToken = await webAuthLogin();
  if (webToken) {
    await setStoredAuthMethod('web');
    return webToken;
  }

  return null;
}

// --- Fetch user info ---

async function fetchUserInfo(token: string): Promise<GoogleUser | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      console.error('Failed to fetch user info:', response.status);
      return null;
    }

    const data = await response.json();
    return {
      id: data.id,
      email: data.email,
      name: data.name,
      picture: data.picture,
    };
  } catch (error) {
    console.error('Error fetching user info:', error);
    return null;
  }
}

// --- Exported functions ---

export async function googleLogin(): Promise<{ success: boolean; user?: GoogleUser; error?: string }> {
  try {
    const token = await getToken(true);
    if (!token) {
      return { success: false, error: '无法获取授权令牌' };
    }

    const user = await fetchUserInfo(token);
    if (!user) {
      return { success: false, error: '无法获取用户信息' };
    }

    await chrome.storage.local.set({
      [AUTH_STATE_KEY]: { isLoggedIn: true, user },
    });

    console.log('[Auth] Login successful:', user.email);
    return { success: true, user };
  } catch (error) {
    console.error('Google login error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('canceled') || errorMessage.includes('cancelled')) {
      return { success: false, error: '登录已取消' };
    }
    return { success: false, error: `登录失败: ${errorMessage}` };
  }
}

export async function googleLogout(): Promise<{ success: boolean; error?: string }> {
  try {
    const method = await getStoredAuthMethod();

    if (method === 'web') {
      const stored = await getStoredWebToken();
      if (stored?.accessToken) {
        try {
          await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${stored.accessToken}`);
        } catch { /* ignore */ }
      }
      await clearStoredWebToken();
    } else {
      const token = await chromeGetAuthToken(false);
      if (token) {
        if (chromeIdentityProbeResult) {
          await chrome.identity.removeCachedAuthToken({ token });
        }
        try {
          await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
        } catch { /* ignore */ }
      }
    }

    await chrome.storage.local.remove([AUTH_STATE_KEY, AUTH_METHOD_KEY]);
    return { success: true };
  } catch (error) {
    console.error('Google logout error:', error);
    return { success: false, error: String(error) };
  }
}

export async function getAuthStatus(): Promise<AuthState> {
  try {
    const result = await chrome.storage.local.get([AUTH_STATE_KEY, SYNC_ENABLED_KEY]);
    const authState = result[AUTH_STATE_KEY];
    const syncEnabled = result[SYNC_ENABLED_KEY] ?? false;

    if (!authState?.isLoggedIn || !authState?.user) {
      return { isLoggedIn: false, user: null, syncEnabled: false };
    }

    const token = await getToken(false);
    if (token) {
      return { isLoggedIn: true, user: authState.user, syncEnabled };
    }

    console.log('[Auth] Silent token fetch failed, token expired');
    return {
      isLoggedIn: true,
      user: authState.user,
      syncEnabled,
      tokenExpired: true,
    };
  } catch (error) {
    console.error('Error getting auth status:', error);
    return { isLoggedIn: false, user: null, syncEnabled: false };
  }
}

export async function setSyncEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [SYNC_ENABLED_KEY]: enabled });
}

export async function getAuthToken(interactive: boolean = false): Promise<string | null> {
  return getToken(interactive);
}

export async function refreshTokenIfNeeded(): Promise<string | null> {
  const result = await chrome.storage.local.get([AUTH_STATE_KEY]);
  if (!result[AUTH_STATE_KEY]?.isLoggedIn) {
    return null;
  }
  return getToken(false);
}

export async function refreshTokenInteractive(): Promise<string | null> {
  const token = await refreshTokenIfNeeded();
  if (token) return token;

  const result = await chrome.storage.local.get([AUTH_STATE_KEY]);
  if (!result[AUTH_STATE_KEY]?.isLoggedIn) {
    return null;
  }

  if (isInteractiveAuthInProgress) {
    console.log('[Auth] Interactive auth already in progress, skipping');
    return null;
  }

  isInteractiveAuthInProgress = true;
  try {
    console.log('[Auth] Attempting interactive reauth...');
    const loginResult = await googleLogin();
    if (loginResult.success) {
      return getToken(false);
    }
    return null;
  } finally {
    isInteractiveAuthInProgress = false;
  }
}
