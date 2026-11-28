// 새로고침(F5) 및 재접속에도 10분간 유지되는 세션 관리자
const SESSION_STORAGE_KEY = 'dsc_portal_session_v4';
export const SESSION_DURATION_MS = 10 * 60 * 1000; // 10분

let timerHandle = null;

export function saveSession({ idToken = '', userProfile = null, role = '외부인', isPreview = false }) {
  if (!role || role === '외부인') {
    clearSession();
    return null;
  }
  const sessionData = {
    idToken,
    userProfile,
    role,
    isPreview,
    expiresAt: Date.now() + SESSION_DURATION_MS
  };
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData));
  } catch (e) {
    console.warn('세션 저장 실패:', e);
  }
  return sessionData;
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.expiresAt || Date.now() >= parsed.expiresAt) {
      clearSession();
      return null;
    }
    return parsed;
  } catch (e) {
    clearSession();
    return null;
  }
}

export function extendSession() {
  const current = loadSession();
  if (!current) return null;
  current.expiresAt = Date.now() + SESSION_DURATION_MS;
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(current));
  } catch (e) {}
  return current;
}

export function clearSession() {
  stopSessionTimer();
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (e) {}
}

export function stopSessionTimer() {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

export function startSessionTimer(onTick, onExpire) {
  stopSessionTimer();

  const update = () => {
    const data = loadSession();
    if (!data) {
      stopSessionTimer();
      if (typeof onExpire === 'function') onExpire();
      return;
    }
    const remainSec = Math.max(0, Math.floor((data.expiresAt - Date.now()) / 1000));
    const mm = String(Math.floor(remainSec / 60)).padStart(2, '0');
    const ss = String(remainSec % 60).padStart(2, '0');
    if (typeof onTick === 'function') onTick(`${mm}:${ss}`, remainSec);

    if (remainSec <= 0) {
      clearSession();
      if (typeof onExpire === 'function') onExpire();
    }
  };

  update();
  timerHandle = setInterval(update, 1000);
}