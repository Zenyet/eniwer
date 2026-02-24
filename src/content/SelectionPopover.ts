import { icons } from "../icons";
import { PRESET_COLORS, getAnnotationColorConfig } from "../types/annotation";
import { appendToShadow, removeFromShadow } from "./ShadowHost";

export interface SelectionPopoverCallbacks {
  onTranslate: () => void;
  onHighlight?: (color: string) => void;
  onNote?: () => void;
  onMore?: () => void;
  onSearch?: (engine: string, text: string) => void;
}

export type PopoverPosition = "above" | "below";

// Icons for the popover
const noteIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/></svg>`;
const moreIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`;
// Highlight icon for annotation button
const highlightIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>`;

// Search engine / AI model definitions
interface SearchEngine {
  id: string;
  label: string;
  icon: string; // SVG string
  url: (query: string) => string;
}

const SEARCH_ENGINES: SearchEngine[] = [
  {
    id: 'google',
    label: 'Google',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`,
    url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22.28 9.37a5.93 5.93 0 0 0-.51-4.89 6.01 6.01 0 0 0-6.48-2.88A5.93 5.93 0 0 0 10.83.02a6.01 6.01 0 0 0-5.73 4.15A5.93 5.93 0 0 0 1.13 7.8a6.01 6.01 0 0 0 .74 7.07 5.93 5.93 0 0 0 .51 4.89 6.01 6.01 0 0 0 6.48 2.88 5.93 5.93 0 0 0 4.46 1.58 6.01 6.01 0 0 0 5.73-4.15 5.93 5.93 0 0 0 3.97-3.63 6.01 6.01 0 0 0-.74-7.07zM13.17 22.3a4.49 4.49 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.78.78 0 0 0 .39-.67v-6.74l2.02 1.17a.07.07 0 0 1 .04.06v5.58a4.51 4.51 0 0 1-4.49 4.48zm-9.65-4.12a4.49 4.49 0 0 1-.54-3.02l.14.09 4.78 2.76a.78.78 0 0 0 .78 0l5.83-3.37v2.33a.07.07 0 0 1-.03.06l-4.83 2.79a4.51 4.51 0 0 1-6.13-1.64zM2.2 7.87A4.49 4.49 0 0 1 4.56 5.9v5.69a.78.78 0 0 0 .39.67l5.83 3.37-2.02 1.17a.07.07 0 0 1-.07 0L3.86 13.99A4.51 4.51 0 0 1 2.2 7.87zm16.58 3.86-5.83-3.37 2.02-1.17a.07.07 0 0 1 .07 0l4.83 2.79a4.51 4.51 0 0 1-.7 8.11v-5.69a.78.78 0 0 0-.39-.67zm2.01-3.03-.14-.09-4.78-2.76a.78.78 0 0 0-.78 0l-5.83 3.37V6.89a.07.07 0 0 1 .03-.06l4.83-2.79a4.51 4.51 0 0 1 6.67 4.66zM8.35 13.37l-2.02-1.17a.07.07 0 0 1-.04-.06V6.56a4.51 4.51 0 0 1 7.37-3.47l-.14.08-4.78 2.76a.78.78 0 0 0-.39.67zm1.1-2.37 2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5z" fill="currentColor"/></svg>`,
    url: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'claude',
    label: 'Claude',
    icon: `<svg width="14" height="14" viewBox="0 0 32 32"><path fill="#d97757" d="m7.5 20.61l5.5-3.08l.1-.27l-.1-.15h-.27l-.92-.06a234 234 0 0 1-8.51-.34l-.67-.14l-.62-.82l.06-.41l.56-.38l.8.07c3.08.2 6.15.4 9.21.72h.46l.06-.19l-.16-.1l-.12-.12l-2.74-1.86c-2.04-1.3-3.55-2.43-5.38-3.68l-.43-.54l-.18-1.18l.76-.84l1.03.07l.26.07c2.03 1.6 4.1 3.14 6.17 4.66l.43.36l.17-.12l.02-.09l-.2-.32c-1.43-2.6-2.55-4.62-4-6.96l-.2-.72c-.08-.3-.13-.55-.13-.85l.87-1.18l.49-.16l1.16.16l.49.42c1.4 3.31 2.76 5.93 4.23 8.83l.29.97l.1.3h.19v-.17c.65-3.42 0-6.57 1.22-9.53l.87-.57l.68.33l.56.8l-.08.51c-.37 2.62-.92 5.22-1.4 7.82h.24l.29-.29a69 69 0 0 1 4.91-5.94l.64-.5h1.2l.89 1.32l-.4 1.36a53.5 53.5 0 0 0-4.66 6.47l.09.13l.22-.02c2.4-.57 4.84-.99 7.27-1.4l.97.45l.1.46l-.37.94c-3 .72-6 1.34-9 2.05l-.05.04l.06.07c2.7.26 5.62.3 7.99.47l.92.61l.55.75l-.1.56l-1.4.73c-2.93-.7-5.19-1.22-7.91-1.9h-.22v.13c2.18 2.12 4.6 4.27 6.54 6.07l.15.68l-.38.53l-.4-.06c-2.04-1.43-3.9-3.09-5.8-4.7h-.15v.2l.52.76c1.14 1.79 2.64 3.25 2.87 5.37l-.2.41l-.7.25l-.78-.14a73 73 0 0 1-4.58-7.04l-.17.09l-.78 8.46l-.37.43l-.85.33l-.71-.54l-.38-.87a114 114 0 0 0 1.53-7.97l.2-.73l-.01-.05l-.16.02a77 77 0 0 1-6.23 7.88l-.48.2l-.84-.44l.08-.77l.47-.69c2.07-2.57 3.54-4.66 5.54-7v-.19h-.07l-7.4 4.8l-1.31.17l-.57-.53l.07-.87l.27-.28l2.23-1.53z"/></svg>`,
    url: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'bing',
    label: 'Bing',
    icon: `<svg width="14" height="14" viewBox="0 0 256 388"><defs><radialGradient id="SVGxg4gNdVi" cx="93.717%" cy="77.818%" r="143.121%" fx="93.717%" fy="77.818%" gradientTransform="scale(-1 -.71954)rotate(49.091 2.036 -2.204)"><stop offset="0%" stop-color="#00cacc"/><stop offset="100%" stop-color="#048fce"/></radialGradient><radialGradient id="SVGuCnAobeX" cx="13.893%" cy="71.448%" r="150.086%" fx="13.893%" fy="71.448%" gradientTransform="matrix(.55155 -.39387 .23634 .91917 -.107 .112)"><stop offset="0%" stop-color="#00bbec"/><stop offset="100%" stop-color="#2756a9"/></radialGradient><linearGradient id="SVGpyz5FbSn" x1="50%" x2="50%" y1="0%" y2="100%"><stop offset="0%" stop-color="#00bbec"/><stop offset="100%" stop-color="#2756a9"/></linearGradient></defs><path fill="url(#SVGxg4gNdVi)" d="M129.424 122.047c-7.133.829-12.573 6.622-13.079 13.928c-.218 3.147-.15 3.36 6.986 21.722c16.233 41.774 20.166 51.828 20.827 53.243c1.603 3.427 3.856 6.65 6.672 9.544c2.16 2.22 3.585 3.414 5.994 5.024c4.236 2.829 6.337 3.61 22.818 8.49c16.053 4.754 24.824 7.913 32.381 11.664c9.791 4.86 16.623 10.387 20.944 16.946c3.1 4.706 5.846 13.145 7.04 21.64c.468 3.321.47 10.661.006 13.663c-1.008 6.516-3.021 11.976-6.101 16.545c-1.638 2.43-1.068 2.023 1.313-.939c6.74-8.379 13.605-22.7 17.108-35.687c4.24-15.718 4.817-32.596 1.66-48.57c-6.147-31.108-25.786-57.955-53.444-73.06c-1.738-.95-8.357-4.42-17.331-9.085a1633 1633 0 0 1-4.127-2.154c-.907-.477-2.764-1.447-4.126-2.154c-1.362-.708-5.282-2.75-8.711-4.539l-8.528-4.446a6021 6021 0 0 1-8.344-4.357c-8.893-4.655-12.657-6.537-13.73-6.863c-1.125-.343-3.984-.782-4.701-.723c-.152.012-.838.088-1.527.168"/><path fill="url(#SVGuCnAobeX)" d="M148.81 277.994c-.493.292-1.184.714-1.537.938c-.354.225-1.137.712-1.743 1.083a8315 8315 0 0 0-13.204 8.137a2848 2848 0 0 0-8.07 4.997a388 388 0 0 1-3.576 2.198c-.454.271-2.393 1.465-4.31 2.654a2652 2652 0 0 1-7.427 4.586a3958 3958 0 0 0-8.62 5.316a3011 3011 0 0 1-7.518 4.637c-1.564.959-3.008 1.885-3.21 2.058c-.3.257-14.205 8.87-21.182 13.121c-5.3 3.228-11.43 5.387-17.705 6.235c-2.921.395-8.45.396-11.363.003c-7.9-1.067-15.176-4.013-21.409-8.666c-2.444-1.826-7.047-6.425-8.806-8.8c-4.147-5.598-6.829-11.602-8.218-18.396c-.32-1.564-.622-2.884-.672-2.935c-.13-.13.105 2.231.528 5.319c.44 3.211 1.377 7.856 2.387 11.829c7.814 30.743 30.05 55.749 60.15 67.646c8.668 3.424 17.415 5.582 26.932 6.64c3.576.4 13.699.56 17.43.276c17.117-1.296 32.02-6.334 47.308-15.996c1.362-.86 3.92-2.474 5.685-3.585a877 877 0 0 0 4.952-3.14c.958-.615 2.114-1.341 2.567-1.614a91 91 0 0 0 2.018-1.268c.656-.424 3.461-2.2 6.235-3.944l11.092-7.006l3.809-2.406l.137-.086l.42-.265l.199-.126l2.804-1.771l9.69-6.121c12.348-7.759 16.03-10.483 21.766-16.102c2.392-2.342 5.997-6.34 6.176-6.848c.037-.104.678-1.092 1.424-2.197c3.036-4.492 5.06-9.995 6.064-16.484c.465-3.002.462-10.342-.005-13.663c-.903-6.42-2.955-13.702-5.167-18.339c-3.627-7.603-11.353-14.512-22.453-20.076c-3.065-1.537-6.23-2.943-6.583-2.924c-.168.009-10.497 6.322-22.954 14.03c-12.457 7.71-23.268 14.4-24.025 14.87s-2.056 1.263-2.888 1.764z"/><path fill="url(#SVGpyz5FbSn)" d="m.053 241.013l.054 53.689l.695 3.118c2.172 9.747 5.937 16.775 12.482 23.302c3.078 3.07 5.432 4.922 8.768 6.896c7.06 4.177 14.657 6.238 22.978 6.235c8.716-.005 16.256-2.179 24.025-6.928c1.311-.801 6.449-3.964 11.416-7.029l9.032-5.572v-127.4l-.002-58.273c-.002-37.177-.07-59.256-.188-60.988c-.74-10.885-5.293-20.892-12.948-28.461c-2.349-2.323-4.356-3.875-10.336-7.99a25160 25160 0 0 1-12.104-8.336L28.617 5.835C22.838 1.85 22.386 1.574 20.639.949C18.367.136 15.959-.163 13.67.084C6.998.804 1.657 5.622.269 12.171C.053 13.191.013 26.751.01 100.35l-.003 86.975H0z"/></svg>`,
    url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'duckduckgo',
    label: 'DuckDuckGo',
    icon: `<svg width="14" height="14" viewBox="0 0 256 255"><defs><linearGradient id="SVGlJQr9THY" x1="71.005%" x2="0%" y1="100%" y2="100%"><stop offset="0%" stop-color="#394a9f"/><stop offset="100%" stop-color="#6176b9"/></linearGradient></defs><path fill="#de5833" d="M128.145 18.841c60.002 0 108.643 48.641 108.643 108.643c0 60.001-48.641 108.642-108.643 108.642c-60.001 0-108.642-48.641-108.642-108.642c0-60.002 48.641-108.643 108.642-108.643"/><path fill="#de5833" d="M128.143 254.922c70.383 0 127.44-57.057 127.44-127.44S198.526.042 128.143.042S.703 57.099.703 127.482s57.057 127.44 127.44 127.44m0-10.62c-64.518 0-116.82-52.302-116.82-116.82s52.302-116.82 116.82-116.82s116.82 52.302 116.82 116.82s-52.302 116.82-116.82 116.82"/><path fill="#d5d7d8" d="M75.219 54.13c-.021-1.827 1.306-2.85 3.069-3.567c-.807.132-1.58.334-2.276.646c-1.838.833-3.212 3.987-3.199 5.48c8.923-.902 22.118-.278 31.767 2.602c.712-.1 1.424-.2 2.147-.283c-9.624-4.273-21.066-5.923-31.508-4.878m1.829-10.98c.201-.036.405-.061.607-.095c-1.925.239-2.94.927-4.385 1.164c1.569.139 7.514 2.914 11.25 4.44c.524-.199.996-.42 1.381-.681c-1.937-.286-6.75-4.636-8.853-4.828m9.278 21.606c-.535.206-1.043.421-1.483.652c-14.545 7.663-20.97 25.562-17.141 47.01c3.495 19.518 17.82 86.205 24.379 117.571c1.915.673 3.853 1.298 5.815 1.865c-5.841-28.24-21.784-102.24-25.504-123.023c-3.771-21.143-.102-36.314 13.934-44.075"/><path fill="#fff" d="M145.184 218.618c-.24.16-.526.31-.831.456c-.226.876-.571 1.54-1.074 1.874c-3.004 1.993-11.489 2.997-15.969 1.993c-.771-.171-1.355-.454-1.811-.843c-7.649 4.247-18.649 9.901-20.883 8.627c-3.49-2.001-3.996-28.451-3.49-34.942c.369-4.9 17.581 3.037 25.954 7.2c1.851-1.729 6.386-2.886 10.4-3.279c-6.065-14.761-10.538-31.645-7.796-43.618c-3.79-2.641-8.813-8.766-7.767-15.159c.806-4.866 13.38-14.072 22.283-14.628c8.923-.563 11.704-.436 19.138-2.216l1.209-.29c4.576-16.087-6.399-44.074-18.641-56.321c-3.991-3.991-10.127-6.503-17.041-7.829c-2.659-3.649-6.948-7.138-13.02-10.369c-11.275-5.986-25.209-8.423-38.19-6.219c-.202.034-.406.059-.607.095c2.103.192 6.916 4.542 8.853 4.828c-.385.261-.857.482-1.381.681c-1.818.692-4.289 1.112-6.232 1.904c-1.763.717-3.09 1.74-3.069 3.567c10.442-1.045 21.884.605 31.508 4.878c-.723.083-1.435.183-2.147.283c-6.825.96-13.098 2.728-17.63 5.119c-.213.111-.415.231-.624.346c-14.036 7.761-17.705 22.932-13.934 44.075C76.112 129.614 92.159 204.76 98 233c9.603 2.779 18.582 5 29.08 5c8.912 0 19.631-1.975 27.92-4c-2.911-5.613-6.656-11.82-8.964-16.271c-.308.367-.551.688-.852.889m5.873-106.561c-3.804 0-6.907-3.094-6.907-6.92c0-3.808 3.103-6.903 6.907-6.903c3.825 0 6.916 3.095 6.916 6.903a6.91 6.91 0 0 1-6.916 6.92m4.161-26.008s-4.357-2.489-7.738-2.447c-6.948.091-8.84 3.161-8.84 3.161s1.166-7.318 10.051-5.85c4.817.801 6.527 5.136 6.527 5.136m-73.255 8.997s-3.129-6.973 5.21-10.39c8.348-3.418 12.413 1.945 12.413 1.945s-6.062-2.742-11.956.962c-5.884 3.7-5.667 7.483-5.667 7.483m7.29 14.862a8.04 8.04 0 0 1 8.047-8.044a8.04 8.04 0 0 1 8.04 8.044c0 4.447-3.6 8.041-8.04 8.041a8.034 8.034 0 0 1-8.047-8.041"/><path fill="#2d4f8e" d="M105.34 109.908a8.04 8.04 0 0 0-8.04-8.044a8.04 8.04 0 0 0-8.047 8.044a8.034 8.034 0 0 0 8.047 8.041c4.44 0 8.04-3.594 8.04-8.041m-4.478-.591a2.09 2.09 0 0 1-2.081-2.09a2.085 2.085 0 1 1 4.171 0a2.09 2.09 0 0 1-2.09 2.09"/><path fill="#fff" d="M100.862 105.139a2.085 2.085 0 0 0-2.081 2.088c0 1.154.939 2.093 2.081 2.09a2.09 2.09 0 0 0 2.09-2.09a2.087 2.087 0 0 0-2.09-2.088"/><path fill="#2d4f8e" d="M151.057 98.234c-3.804 0-6.907 3.095-6.907 6.903c0 3.826 3.103 6.92 6.907 6.92a6.91 6.91 0 0 0 6.916-6.92c0-3.808-3.091-6.903-6.916-6.903m3.067 6.394c-.975 0-1.78-.793-1.78-1.789c0-.983.805-1.79 1.78-1.79c1.017 0 1.797.807 1.797 1.79c0 .996-.78 1.789-1.797 1.789"/><path fill="#fff" d="M154.124 101.049c-.975 0-1.78.807-1.78 1.79c0 .996.805 1.789 1.78 1.789a1.773 1.773 0 0 0 1.797-1.789c0-.983-.78-1.79-1.797-1.79"/><path fill="#fdd209" d="M144.2 126.299c-8.903.556-21.477 9.762-22.283 14.628c-1.046 6.393 3.977 12.518 7.767 15.159l.031.023c3.789 2.636 29.018 11.147 41.535 10.911c12.531-.244 33.111-7.918 30.851-14.067c-2.25-6.151-22.689 5.427-44.007 3.451c-15.788-1.467-18.575-8.54-15.079-13.706c4.397-6.493 12.406 1.232 25.616-2.721c13.23-3.942 31.732-10.998 38.597-14.84c15.873-8.849-6.642-12.519-11.96-10.064c-5.041 2.329-22.587 6.757-30.721 8.72l-1.209.29c-7.434 1.78-10.215 1.653-19.138 2.216"/><path fill="#65bc46" d="M124.316 206.97c0-.921.741-1.736 1.917-2.431c.033-.559.337-1.079.847-1.556c-8.373-4.163-25.585-12.1-25.954-7.2c-.506 6.491 0 32.941 3.49 34.942c2.234 1.274 13.234-4.38 20.883-8.627c-2.207-1.881-1.183-6.447-1.183-15.128m21.609 10.716l.111.043c6.854 2.645 20.498 7.624 23.461 6.537c3.995-1.527 2.995-33.453-1.489-34.47c-3.592-.797-17.343 8.892-22.753 12.839c.957 4.041 2.115 12.045.67 15.051"/><path fill="#43a244" d="M129.214 220.611c-4.495-.996-2.993-5.493-2.993-15.971c0-.034.01-.067.012-.101c-1.176.695-1.917 1.51-1.917 2.431c0 8.681-1.024 13.247 1.183 15.128c.456.389 1.04.672 1.811.843c4.48 1.004 12.965 0 15.969-1.993c.503-.334.848-.998 1.074-1.874c-3.516 1.684-11.024 2.473-15.139 1.537"/><path fill="#65bc46" d="M127.08 202.983c-.51.477-.814.997-.847 1.556c-.002.034-.012.067-.012.101c0 10.478-1.502 14.975 2.993 15.971c4.115.936 11.623.147 15.139-1.537c.305-.146.591-.296.831-.456c.301-.201.544-.522.741-.932c1.445-3.006.287-11.01-.67-15.051c-.211-.889-.411-1.589-.572-1.999c-.413-1.022-3.594-1.285-7.203-.932c-4.014.393-8.549 1.55-10.4 3.279"/></svg>`,
    url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  },
];

export class SelectionPopover {
  private popover: HTMLElement | null = null;
  private callbacks: SelectionPopoverCallbacks | null = null;
  private hideTimeout: number | null = null;
  private currentRange: Range | null = null;
  private preferredPosition: PopoverPosition = "above";
  private scrollHandler: (() => void) | null = null;
  private rafId: number | null = null;
  private mode: 'search' | 'colors' = 'search';

  constructor() {}

  public show(
    rect: DOMRect,
    callbacks: SelectionPopoverCallbacks,
    position: PopoverPosition = "above",
  ): void {
    this.hide();
    this.callbacks = callbacks;
    this.preferredPosition = position;
    this.mode = 'search';

    // 保存当前选区，用于滚动时更新位置
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      this.currentRange = selection.getRangeAt(0).cloneRange();
    }

    this.createPopover(rect, position);
    this.setupScrollListener();

    // Show immediately
    requestAnimationFrame(() => {
      if (this.popover) {
        this.popover.style.opacity = "1";
      }
    });
  }

  public hide(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    this.removeScrollListener();
    if (this.popover) {
      this.popover.classList.add("thecircle-selection-popover-exit");
      const popoverRef = this.popover;
      setTimeout(() => {
        removeFromShadow(popoverRef);
      }, 150);
      this.popover = null;
    }
    this.currentRange = null;
  }

  public isVisible(): boolean {
    return this.popover !== null;
  }

  private setupScrollListener(): void {
    this.scrollHandler = () => {
      // 使用 rAF 节流，确保每帧最多更新一次
      if (this.rafId === null) {
        this.rafId = requestAnimationFrame(() => {
          this.updatePosition();
          this.rafId = null;
        });
      }
    };
    // 监听 window 和 document 的滚动事件（捕获阶段以获取所有滚动）
    window.addEventListener("scroll", this.scrollHandler, true);
  }

  private removeScrollListener(): void {
    if (this.scrollHandler) {
      window.removeEventListener("scroll", this.scrollHandler, true);
      this.scrollHandler = null;
    }
    // 取消待执行的 rAF
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private updatePosition(): void {
    if (!this.popover || !this.currentRange) return;

    // 获取当前选区的最新位置
    const rect = this.currentRange.getBoundingClientRect();

    // 如果选区滚动出视口，隐藏 popover
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      this.popover.style.opacity = "0";
      this.popover.style.pointerEvents = "none";
      return;
    } else {
      this.popover.style.opacity = "1";
      this.popover.style.pointerEvents = "auto";
    }

    const { left, top } = this.calculatePosition(rect, this.preferredPosition);
    this.popover.style.left = `${left}px`;
    this.popover.style.top = `${top}px`;
  }

  private calculatePosition(
    rect: DOMRect,
    position: PopoverPosition,
  ): { left: number; top: number } {
    const popoverWidth = 220;
    const popoverHeight = 32;
    const gap = 8;

    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    let top: number;

    if (position === "above") {
      top = rect.top - popoverHeight - gap;
      if (top < 10) {
        top = rect.bottom + gap;
      }
    } else {
      top = rect.bottom + gap;
      if (top + popoverHeight > window.innerHeight - 10) {
        top = rect.top - popoverHeight - gap;
      }
    }

    // Keep within viewport horizontally
    if (left < 10) left = 10;
    if (left + popoverWidth > window.innerWidth - 10) {
      left = window.innerWidth - popoverWidth - 10;
    }

    return { left, top };
  }

  private getSelectedText(): string {
    const selection = window.getSelection();
    return selection?.toString().trim() || '';
  }

  private buildSearchEngineButtons(): string {
    return SEARCH_ENGINES.map(engine => `
      <button
        class="thecircle-selection-popover-engine-btn"
        data-action="search"
        data-engine="${engine.id}"
        title="${engine.label}"
      >${engine.icon}</button>
    `).join('');
  }

  private buildColorButtons(): string {
    const colorButtons = PRESET_COLORS.map(color => {
      const config = getAnnotationColorConfig(color);
      return `
        <button
          class="thecircle-selection-popover-color-btn"
          data-action="highlight"
          data-color="${color}"
          title="${config.label}"
          style="background-color: ${config.bg}; border-color: ${config.border}"
        ></button>
      `;
    }).join('');

    return `
      ${colorButtons}
      <div class="thecircle-selection-popover-color-btn thecircle-selection-popover-color-custom" title="自定义颜色">
        <input type="color" class="thecircle-selection-popover-color-input" value="#ff6600">
      </div>
    `;
  }

  private createPopover(rect: DOMRect, position: PopoverPosition): void {
    this.popover = document.createElement("div");
    this.popover.className = "thecircle-selection-popover";

    const { left, top } = this.calculatePosition(rect, position);
    this.popover.style.left = `${left}px`;
    this.popover.style.top = `${top}px`;

    this.popover.innerHTML = `
      <div class="thecircle-selection-popover-container">
        <div class="thecircle-selection-popover-colors">
          ${this.buildSearchEngineButtons()}
        </div>
        <div class="thecircle-selection-popover-divider"></div>
        <button class="thecircle-selection-popover-btn thecircle-selection-popover-btn-highlight" data-action="note" title="批注">
          ${highlightIcon}
        </button>
        <button class="thecircle-selection-popover-btn" data-action="translate" title="翻译">
          ${icons.translate}
        </button>
        <button class="thecircle-selection-popover-btn" data-action="more" title="更多">
          ${moreIcon}
        </button>
      </div>
    `;

    appendToShadow(this.popover);

    // Setup event listeners
    this.setupEventListeners();

    // Prevent popover from being hidden when clicking on it
    this.popover.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });
  }

  private switchToColors(): void {
    if (!this.popover) return;
    this.mode = 'colors';
    const colorsContainer = this.popover.querySelector('.thecircle-selection-popover-colors');
    if (!colorsContainer) return;

    colorsContainer.innerHTML = this.buildColorButtons();

    // Bind color button events
    const colorBtns = colorsContainer.querySelectorAll('[data-action="highlight"]');
    colorBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const color = (btn as HTMLElement).dataset.color as string;
        this.callbacks?.onHighlight?.(color);
        this.hide();
      });
    });

    const colorInput = colorsContainer.querySelector('.thecircle-selection-popover-color-input') as HTMLInputElement;
    colorInput?.addEventListener("input", (e) => {
      e.stopPropagation();
      this.callbacks?.onHighlight?.(colorInput.value);
      this.hide();
    });

    // Mark highlight button as active
    const highlightBtn = this.popover.querySelector('.thecircle-selection-popover-btn-highlight');
    highlightBtn?.classList.add('active');
  }

  private switchToSearch(): void {
    if (!this.popover) return;
    this.mode = 'search';
    const colorsContainer = this.popover.querySelector('.thecircle-selection-popover-colors');
    if (!colorsContainer) return;

    colorsContainer.innerHTML = this.buildSearchEngineButtons();

    // Bind search engine events
    const engineBtns = colorsContainer.querySelectorAll('[data-action="search"]');
    engineBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const engineId = (btn as HTMLElement).dataset.engine as string;
        const text = this.getSelectedText();
        if (text) {
          const engine = SEARCH_ENGINES.find(se => se.id === engineId);
          if (engine) {
            window.open(engine.url(text), '_blank');
          }
        }
        this.hide();
      });
    });

    // Remove active state from highlight button
    const highlightBtn = this.popover.querySelector('.thecircle-selection-popover-btn-highlight');
    highlightBtn?.classList.remove('active');
  }

  private setupEventListeners(): void {
    if (!this.popover) return;

    // Search engine buttons
    const engineBtns = this.popover.querySelectorAll('[data-action="search"]');
    engineBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const engineId = (btn as HTMLElement).dataset.engine as string;
        const text = this.getSelectedText();
        if (text) {
          const engine = SEARCH_ENGINES.find(se => se.id === engineId);
          if (engine) {
            window.open(engine.url(text), '_blank');
          }
        }
        this.hide();
      });
    });

    // Note/Highlight button — toggles between search and color modes
    const noteBtn = this.popover.querySelector('[data-action="note"]');
    noteBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.mode === 'search') {
        this.switchToColors();
      } else {
        this.switchToSearch();
      }
    });

    // Translate button
    const translateBtn = this.popover.querySelector('[data-action="translate"]');
    translateBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks?.onTranslate();
      this.hide();
    });

    // More button
    const moreBtn = this.popover.querySelector('[data-action="more"]');
    moreBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.callbacks?.onMore?.();
      this.hide();
    });
  }
}
