// Google OAuth authentication handler
// Uses launchWebAuthFlow - does NOT require logging into Chrome
import { GoogleUser, AuthState } from '../types';

const AUTH_STATE_KEY = 'thecircle_auth_state';
const AUTH_TOKEN_KEY = 'thecircle_auth_token';
const SYNC_ENABLED_KEY = 'thecircle_sync_enabled';

// OAuth configuration
const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.file',
];

// Get client ID from manifest
function getClientId(): string {
  const manifest = chrome.runtime.getManifest();
  return (manifest as { oauth2?: { client_id?: string } }).oauth2?.client_id || '';
}

// Get redirect URL for OAuth
function getRedirectUrl(): string {
  return chrome.identity.getRedirectURL();
}

// Build OAuth authorization URL
function buildAuthUrl(silent: boolean = false): string {
  const clientId = getClientId();
  const redirectUrl = getRedirectUrl();

  const params: Record<string, string> = {
    client_id: clientId,
    redirect_uri: redirectUrl,
    response_type: 'token',
    scope: OAUTH_SCOPES.join(' '),
  };

  if (silent) {
    // For silent auth, don't show any UI
    params.prompt = 'none';
  } else {
    // For interactive auth, show account picker
    params.prompt = 'consent';
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(params).toString()}`;
}

// Parse token from redirect URL
function parseTokenFromUrl(url: string): { token: string; expiresIn: number } | null {
  try {
    // URL format: https://xxx.chromiumapp.org/#access_token=xxx&token_type=Bearer&expires_in=3600
    const hash = new URL(url).hash.substring(1);
    const params = new URLSearchParams(hash);

    const token = params.get('access_token');
    const expiresIn = parseInt(params.get('expires_in') || '3600', 10);

    if (token) {
      return { token, expiresIn };
    }
    return null;
  } catch (error) {
    console.error('Error parsing token from URL:', error);
    return null;
  }
}

// Get stored auth token
export async function getAuthToken(interactive: boolean = false): Promise<string | null> {
  // First, check stored token
  const result = await chrome.storage.local.get([AUTH_TOKEN_KEY]);
  const tokenData = result[AUTH_TOKEN_KEY];

  if (tokenData?.token && tokenData?.expiresAt > Date.now()) {
    return tokenData.token;
  }

  // Token expired or not found
  if (!interactive) {
    return null;
  }

  // Need to re-authenticate
  const loginResult = await googleLogin();
  if (loginResult.success) {
    const newResult = await chrome.storage.local.get([AUTH_TOKEN_KEY]);
    return newResult[AUTH_TOKEN_KEY]?.token || null;
  }

  return null;
}

// Fetch user info from Google
async function fetchUserInfo(token: string): Promise<GoogleUser | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
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

// Silent re-authentication - try to get a new token without user interaction
async function silentReauth(): Promise<{ success: boolean; user?: GoogleUser }> {
  try {
    const authUrl = buildAuthUrl(true); // silent mode

    console.log('[Auth] Attempting silent re-authentication...');

    const responseUrl = await new Promise<string>((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: authUrl,
          interactive: false, // No UI, silent only
        },
        (responseUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (responseUrl) {
            resolve(responseUrl);
          } else {
            reject(new Error('No response URL'));
          }
        }
      );
    });

    // Parse token from response URL
    const tokenResult = parseTokenFromUrl(responseUrl);
    if (!tokenResult) {
      console.log('[Auth] Silent reauth: failed to parse token');
      return { success: false };
    }

    // Get existing user info from storage (skip fetching to be faster)
    const result = await chrome.storage.local.get([AUTH_STATE_KEY]);
    let user = result[AUTH_STATE_KEY]?.user;

    // If no cached user, fetch it
    if (!user) {
      user = await fetchUserInfo(tokenResult.token);
      if (!user) {
        console.log('[Auth] Silent reauth: failed to fetch user info');
        return { success: false };
      }
    }

    // Save new token
    const expiresAt = Date.now() + tokenResult.expiresIn * 1000;
    console.log('[Auth] Silent reauth successful, new token expires:', new Date(expiresAt).toISOString());

    await chrome.storage.local.set({
      [AUTH_STATE_KEY]: {
        isLoggedIn: true,
        user,
      },
      [AUTH_TOKEN_KEY]: {
        token: tokenResult.token,
        expiresAt,
      },
    });

    return { success: true, user };
  } catch (error) {
    console.log('[Auth] Silent reauth failed:', error instanceof Error ? error.message : error);
    return { success: false };
  }
}

// Login with Google using launchWebAuthFlow (no Chrome login required)
export async function googleLogin(): Promise<{ success: boolean; user?: GoogleUser; error?: string }> {
  try {
    const authUrl = buildAuthUrl();

    // Launch OAuth flow in a popup window
    const responseUrl = await new Promise<string>((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: authUrl,
          interactive: true,
        },
        (responseUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (responseUrl) {
            resolve(responseUrl);
          } else {
            reject(new Error('No response URL'));
          }
        }
      );
    });

    // Parse token from response URL
    const tokenResult = parseTokenFromUrl(responseUrl);
    if (!tokenResult) {
      return { success: false, error: '无法获取授权令牌' };
    }

    // Fetch user info
    const user = await fetchUserInfo(tokenResult.token);
    if (!user) {
      return { success: false, error: '无法获取用户信息' };
    }

    // Save auth state and token
    const expiresAt = Date.now() + tokenResult.expiresIn * 1000;
    console.log('[Auth] Saving token with expiration:', {
      expiresIn: tokenResult.expiresIn,
      expiresAt,
      expiresAtDate: new Date(expiresAt).toISOString(),
    });

    await chrome.storage.local.set({
      [AUTH_STATE_KEY]: {
        isLoggedIn: true,
        user,
      },
      [AUTH_TOKEN_KEY]: {
        token: tokenResult.token,
        expiresAt,
      },
    });

    return { success: true, user };
  } catch (error) {
    console.error('Google login error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // User cancelled
    if (errorMessage.includes('canceled') || errorMessage.includes('cancelled')) {
      return { success: false, error: '登录已取消' };
    }

    return { success: false, error: `登录失败: ${errorMessage}` };
  }
}

// Logout from Google
export async function googleLogout(): Promise<{ success: boolean; error?: string }> {
  try {
    // Get stored token to revoke
    const result = await chrome.storage.local.get([AUTH_TOKEN_KEY]);
    const tokenData = result[AUTH_TOKEN_KEY];

    if (tokenData?.token) {
      // Revoke token from Google's servers
      try {
        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${tokenData.token}`);
      } catch {
        // Ignore revoke errors
      }
    }

    // Clear auth state and token
    await chrome.storage.local.remove([AUTH_STATE_KEY, AUTH_TOKEN_KEY]);

    return { success: true };
  } catch (error) {
    console.error('Google logout error:', error);
    return { success: false, error: String(error) };
  }
}

// Get current auth status
export async function getAuthStatus(): Promise<AuthState> {
  try {
    const result = await chrome.storage.local.get([AUTH_STATE_KEY, AUTH_TOKEN_KEY, SYNC_ENABLED_KEY]);
    const authState = result[AUTH_STATE_KEY];
    const tokenData = result[AUTH_TOKEN_KEY];
    const syncEnabled = result[SYNC_ENABLED_KEY] ?? false;

    console.log('[Auth] getAuthStatus called:', {
      hasAuthState: !!authState,
      hasTokenData: !!tokenData,
      tokenExpiresAt: tokenData?.expiresAt,
      now: Date.now(),
      isExpired: tokenData?.expiresAt ? tokenData.expiresAt < Date.now() : 'no token',
      syncEnabled,
    });

    // Check if we have valid auth state and token
    if (authState?.isLoggedIn && authState?.user && tokenData?.token) {
      // Check if token is not expired
      if (tokenData.expiresAt > Date.now()) {
        console.log('[Auth] Token valid, returning logged in state');
        return {
          isLoggedIn: true,
          user: authState.user,
          syncEnabled,
        };
      }

      // Token expired - try silent re-authentication
      console.log('[Auth] Token expired, attempting silent re-auth...');
      const reauthResult = await silentReauth();

      if (reauthResult.success && reauthResult.user) {
        console.log('[Auth] Silent re-auth successful');
        // Re-read sync enabled state
        const newResult = await chrome.storage.local.get([SYNC_ENABLED_KEY]);
        return {
          isLoggedIn: true,
          user: reauthResult.user,
          syncEnabled: newResult[SYNC_ENABLED_KEY] ?? false,
        };
      }

      // Silent re-auth failed - clear state
      console.log('[Auth] Silent re-auth failed, clearing auth state');
      await chrome.storage.local.remove([AUTH_STATE_KEY, AUTH_TOKEN_KEY]);
    }

    console.log('[Auth] Returning not logged in state');
    return {
      isLoggedIn: false,
      user: null,
      syncEnabled: false,
    };
  } catch (error) {
    console.error('Error getting auth status:', error);
    return {
      isLoggedIn: false,
      user: null,
      syncEnabled: false,
    };
  }
}

// Set sync enabled state
export async function setSyncEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [SYNC_ENABLED_KEY]: enabled });
}

// Refresh token if needed (called before API calls)
export async function refreshTokenIfNeeded(): Promise<string | null> {
  const result = await chrome.storage.local.get([AUTH_TOKEN_KEY]);
  const tokenData = result[AUTH_TOKEN_KEY];

  if (!tokenData?.token) {
    return null;
  }

  // Check if token will expire soon (within 5 minutes)
  if (tokenData.expiresAt < Date.now() + 5 * 60 * 1000) {
    // Token expired or expiring soon - try silent re-authentication
    console.log('[Auth] Token expired, attempting silent reauth...');
    const reauthResult = await silentReauth();
    if (reauthResult.success) {
      const newResult = await chrome.storage.local.get([AUTH_TOKEN_KEY]);
      return newResult[AUTH_TOKEN_KEY]?.token || null;
    }
    console.log('[Auth] Silent reauth failed, need manual re-login');
    return null;
  }

  // Verify token is still valid by making a lightweight API call
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `access_token=${tokenData.token}`,
    });

    if (!response.ok) {
      // Token is invalid - try silent reauth before giving up
      console.log('[Auth] Token invalid, attempting silent reauth...');
      const reauthResult = await silentReauth();
      if (reauthResult.success) {
        const newResult = await chrome.storage.local.get([AUTH_TOKEN_KEY]);
        return newResult[AUTH_TOKEN_KEY]?.token || null;
      }
      await chrome.storage.local.remove([AUTH_STATE_KEY, AUTH_TOKEN_KEY]);
      return null;
    }

    return tokenData.token;
  } catch {
    return tokenData.token; // Return existing token if verification fails
  }
}
