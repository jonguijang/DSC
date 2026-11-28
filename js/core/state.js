import { CONFIG, ROLE_LEVEL } from './config.js';

export const state = {
  currentRole: '외부인',
  currentCategory: 'ALL',
  currentTab: 'home',
  currentIdToken: '',
  currentUserProfile: null,
  hubCache: {
    bulletins: [],
    galleries: [],
    events: [],
    duties: [],
    portalMenus: [],
    smallGroups: CONFIG.DEFAULT_SMALL_GROUPS.slice()
  },
  favoriteIds: [],
  cachedMasterMembers: []
};

export function getViewMode() {
  return window.innerWidth < 768 ? 'MOBILE_COMPACT' : 'PC_DETAIL';
}

export function sanitizeMemberName(rawName) {
  const hasVerifiedSession = Boolean(state.currentIdToken) && (ROLE_LEVEL[state.currentRole] || 1) >= 2;
  if (!hasVerifiedSession) {
    return '로그인 후 열람 가능';
  }
  return rawName || '배정 예정';
}

export function applyTheme(theme) {
  const html = document.documentElement;
  const icon = document.getElementById('theme-icon');
  if (theme === 'dark') {
    html.classList.add('dark');
    if (icon) icon.textContent = '☀️';
  } else {
    html.classList.remove('dark');
    if (icon) icon.textContent = '🌙';
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
    state.favoriteIds = raw ? JSON.parse(raw) : ['예배참석예약', '출석현황 (화/금/안)', '달란트 관리', '헌금내역 조회'];
  } catch (e) {
    state.favoriteIds = ['예배참석예약', '출석현황 (화/금/안)', '달란트 관리', '헌금내역 조회'];
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
    (profile && (profile.groupName || profile.groupNo || profile['소속반'] || profile['소속반(1~9반)'] || '')) || ''
  ).trim();
  if (rawUserGroup) {
    if (list.includes(rawUserGroup)) return rawUserGroup;
    const numMatch = /^([1-9])반$/.exec(rawUserGroup);
    if (numMatch && list[Number(numMatch[1]) - 1]) return list[Number(numMatch[1]) - 1];
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