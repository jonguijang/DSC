import { CONFIG, ROLE_LEVEL } from './config.js';

export const state = {
  currentRole: '외부인',
  currentCategory: 'ALL',
  currentIdToken: '',
  currentUserProfile: null,
  hubCache: {
    bulletins: [],
    galleries: [],
    events: [],
    duties: [],
    smallGroups: CONFIG.DEFAULT_SMALL_GROUPS.slice()
  },
  favoriteIds: [],
  cachedMasterMembers: []
};

export function getViewMode() {
  return window.innerWidth < 768 ? 'MOBILE_COMPACT' : 'PC_DETAIL';
}

// 외부인(비로그인) 또는 서버 미인증 상태에서는 성도 실명을 절대 노출하지 않음
export function sanitizeMemberName(rawName) {
  const hasVerifiedSession = Boolean(state.currentIdToken) && ROLE_LEVEL[state.currentRole] >= 2;
  if (!hasVerifiedSession) {
    return '로그인 후 열람 가능';
  }
  return rawName || '배정 예정';
}

export function applyTheme(theme) {
  const html = document.documentElement;
  const icon = document.getElementById('theme-icon');
  const text = document.getElementById('theme-text');
  if (theme === 'dark') {
    html.classList.add('dark');
    if (icon) icon.textContent = '☀️';
    if (text) text.textContent = '밝음';
  } else {
    html.classList.remove('dark');
    if (icon) icon.textContent = '🌙';
    if (text) text.textContent = '어두움';
  }
  try { localStorage.setItem('dsc_theme', theme); } catch (e) {}
}

export function initTheme() {
  let saved = 'light';
  try { saved = localStorage.getItem('dsc_theme') || 'light'; } catch (e) {}
  applyTheme(saved);
}

export function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  applyTheme(isDark ? 'light' : 'dark');
}

export function loadFavorites() {
  try {
    const raw = localStorage.getItem('dsc_quick_favorites');
    state.favoriteIds = raw ? JSON.parse(raw) : ['헌금내역 조회', '달란트 관리', '예배주보 (Drive)'];
  } catch (e) {
    state.favoriteIds = ['헌금내역 조회', '달란트 관리', '예배주보 (Drive)'];
  }
}

export function saveFavorites() {
  try { localStorage.setItem('dsc_quick_favorites', JSON.stringify(state.favoriteIds)); } catch (e) {}
}

export function getSmallGroupNames() {
  const sourceList = (state.hubCache.smallGroups && state.hubCache.smallGroups.length)
    ? state.hubCache.smallGroups
    : CONFIG.DEFAULT_SMALL_GROUPS;
  const names = sourceList
    .filter(g => g && g.active !== false)
    .map(g => String(g.name || g['반명'] || g['소그룹명'] || g.groupName || '').trim())
    .filter(Boolean);
  return names.length ? names : CONFIG.DEFAULT_SMALL_GROUPS.map(g => g.name);
}

export function getUserDefaultGroup(groupNames) {
  const list = groupNames && groupNames.length ? groupNames : getSmallGroupNames();
  const profile = state.currentUserProfile;
  const rawUserGroup = String(
    (profile && (
      profile.groupName ||
      profile.groupNo ||
      profile['소속반'] ||
      profile['소속반(1~9반)'] ||
      ''
    )) || ''
  ).trim();

  if (rawUserGroup) {
    if (list.includes(rawUserGroup)) return rawUserGroup;
    const numMatch = /^([1-9])반$/.exec(rawUserGroup);
    if (numMatch) {
      const idx = Number(numMatch[1]) - 1;
      if (list[idx]) return list[idx];
    }
  }
  return list[0] || '겸손반';
}

export function getDefaultWorshipByDate(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!match) return '특별집회';
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const day = d.getDay();
  if (day === 2) return '화요예배';
  if (day === 5) return '금요저녁예배';
  if (day === 6) return '안식일예배';
  return '특별집회';
}

export function renderWorshipOptionsHtml(dateStr, selectedVal = '') {
  const defaultVal = selectedVal || getDefaultWorshipByDate(dateStr);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  const day = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getDay() : -1;

  const options = [];
  if (day === 2) {
    options.push({ value: '화요예배', label: '화요예배 (기본 · 화 19:30)' });
    options.push({ value: '특별집회', label: '특별집회 (선택가능)' });
    options.push({ value: '금요저녁예배', label: '금요예배 (금 19:30)' });
    options.push({ value: '안식일예배', label: '안식일예배 (토 10:00)' });
  } else if (day === 5) {
    options.push({ value: '금요저녁예배', label: '금요예배 (기본 · 금 19:30)' });
    options.push({ value: '특별집회', label: '특별집회 (선택가능)' });
    options.push({ value: '화요예배', label: '화요예배 (화 19:30)' });
    options.push({ value: '안식일예배', label: '안식일예배 (토 10:00)' });
  } else if (day === 6) {
    options.push({ value: '안식일예배', label: '안식일예배 (기본 · 토 10:00)' });
    options.push({ value: '특별집회', label: '특별집회 (선택가능)' });
    options.push({ value: '화요예배', label: '화요예배 (화 19:30)' });
    options.push({ value: '금요저녁예배', label: '금요예배 (금 19:30)' });
  } else {
    options.push({ value: '특별집회', label: '특별집회 (기본 · 전 요일 선택가능)' });
    options.push({ value: '화요예배', label: '화요예배 (화 19:30)' });
    options.push({ value: '금요저녁예배', label: '금요예배 (금 19:30)' });
    options.push({ value: '안식일예배', label: '안식일예배 (토 10:00)' });
  }

  return options
    .map(o => `<option value="${o.value}"${o.value === defaultVal ? ' selected' : ''}>${o.label}</option>`)
    .join('');
}
