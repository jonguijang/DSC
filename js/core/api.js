import { CONFIG, ROLE_LEVEL } from './config.js';
import { state, getSmallGroupNames, getUserDefaultGroup } from './state.js';

export async function callApi(action, payload = {}) {
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action,
      idToken: state.currentIdToken,
      rolePreview: state.currentRole,
      payload
    })
  });
  return await res.json();
}

export async function loadSmallGroupMaster() {
  if (!state.currentIdToken) {
    state.hubCache.smallGroups = CONFIG.DEFAULT_SMALL_GROUPS.slice();
    return;
  }
  try {
    const res = await callApi('querySheet', { sheetName: 'SmallGroup_Master' });
    if (res && res.ok && Array.isArray(res.rows) && res.rows.length) {
      const parsed = res.rows
        .map(r => {
          const name = String(r['반명'] || r['소그룹명'] || r['Group_Name'] || r['name'] || '').trim();
          const activeRaw = String(r['사용여부'] ?? r['활성여부'] ?? r['Active'] ?? 'Y').trim().toUpperCase();
          const active = !['N', 'NO', 'FALSE', '0', '비활성', '미사용'].includes(activeRaw);
          return {
            code: String(r['반코드'] || r['Group_ID'] || r['code'] || '').trim(),
            name,
            leader: String(r['반장'] || r['담당자'] || r['leader'] || '').trim(),
            location: String(r['모임장소'] || r['장소'] || r['location'] || '').trim(),
            active
          };
        })
        .filter(g => g.name);
      if (parsed.length) {
        state.hubCache.smallGroups = parsed;
        return;
      }
    }
  } catch (err) {
    console.warn('SmallGroup_Master 조회 fallback:', err);
  }
  if (!state.hubCache.smallGroups || !state.hubCache.smallGroups.length) {
    state.hubCache.smallGroups = CONFIG.DEFAULT_SMALL_GROUPS.slice();
  }
}

export async function resolveGroupByMemberName(memberName, explicitUserId = '') {
  const cleanName = String(memberName || '').trim();
  const cleanId = String(explicitUserId || '').trim();

  if (state.currentUserProfile) {
    const selfNames = [String(state.currentUserProfile.name || '').trim()];
    const selfIds = [
      String(state.currentUserProfile.userId || '').trim(),
      String(state.currentUserProfile.email || '').trim()
    ].filter(Boolean);
    if ((cleanName && selfNames.includes(cleanName)) || (cleanId && selfIds.includes(cleanId))) {
      const g = String(
        state.currentUserProfile.groupName ||
        state.currentUserProfile['소속반'] ||
        state.currentUserProfile.groupNo || ''
      ).trim();
      if (g && g !== '미배정') {
        return { groupName: g, userId: cleanId || String(state.currentUserProfile.userId || '').trim() };
      }
    }
  }

  if (!state.cachedMasterMembers.length && state.currentIdToken && ROLE_LEVEL[state.currentRole] >= 4) {
    try {
      const res = await callApi('querySheet', { sheetName: 'Users_Master' });
      if (res && res.ok && Array.isArray(res.rows)) {
        state.cachedMasterMembers = res.rows;
      }
    } catch (err) {
      console.warn('Users_Master 자동매칭 조회 스킵:', err);
    }
  }

  if (state.cachedMasterMembers.length) {
    const found = state.cachedMasterMembers.find(u => {
      const uName = String(u['성명'] || u['이름'] || '').trim();
      const uId = String(u['User_ID'] || '').trim();
      return (cleanId && uId && uId === cleanId) || (cleanName && uName && uName === cleanName);
    });
    if (found) {
      const gCol = Object.keys(found).find(k => k.includes('소속반'));
      const matchedGroup = gCol ? String(found[gCol] || '').trim() : '';
      const matchedId = cleanId || String(found['User_ID'] || '').trim();
      if (matchedGroup) return { groupName: matchedGroup, userId: matchedId };
    }
  }

  try {
    const attRes = await callApi('querySheet', { sheetName: 'Attendance_Log' });
    if (attRes && attRes.ok && Array.isArray(attRes.rows) && cleanName) {
      const prev = attRes.rows.find(
        r => String(r['성명'] || r['이름'] || '').trim() === cleanName &&
             String(r['소속반'] || r['소그룹반'] || '').trim()
      );
      if (prev) {
        const g = String(prev['소속반'] || prev['소그룹반'] || '').trim();
        const uid = cleanId || String(prev['User_ID'] || '').trim();
        return { groupName: g, userId: uid };
      }
    }
  } catch (err) {
    console.warn('Attendance_Log 과거 반명 매칭 스킵:', err);
  }

  return { groupName: getUserDefaultGroup(getSmallGroupNames()), userId: cleanId };
}

export function buildFallbackHubData() {
  const nowIso = new Date().toISOString();
  return {
    bulletins: [{ name: '다산교회 주보 폴더 (Google Drive)', updated: nowIso, url: CONFIG.FOLDERS.BULLETIN }],
    galleries: [],
    events: [
      { title: '안식일학교 및 대예배', location: '다산교회 본당 · 매주 토요일', start: nowIso },
      { title: '화요기도·말씀예배', location: '다산교회 본당 · 매주 화요일', start: nowIso },
      { title: '금요저녁예배', location: '다산교회 본당 · 매주 금요일', start: nowIso }
    ],
    duties: [],
    smallGroups: CONFIG.DEFAULT_SMALL_GROUPS.slice()
  };
}

export async function fetchPublicHubData() {
  if (!CONFIG.API_URL || CONFIG.API_URL.includes('YOUR_')) {
    return { status: 'unconfigured', data: buildFallbackHubData() };
  }

  let timedOut = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort('timeout_12000ms');
    }, 12000);

    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'getPublicHubData',
        idToken: state.currentIdToken,
        rolePreview: state.currentRole,
        payload: {}
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      throw new Error('Apps Script 응답이 JSON 형식이 아닙니다. 웹 앱 배포 권한을 확인하세요.');
    }

    if (data && data.ok) {
      const apiGroups = (data.smallGroups && data.smallGroups.length)
        ? data.smallGroups
        : ((state.hubCache.smallGroups && state.hubCache.smallGroups.length)
            ? state.hubCache.smallGroups
            : CONFIG.DEFAULT_SMALL_GROUPS.slice());

      return {
        status: 'live',
        data: {
          bulletins: data.bulletins || [],
          galleries: data.galleries || [],
          events: data.events || [],
          duties: data.duties || [],
          smallGroups: apiGroups
        }
      };
    }
    return { status: 'waiting', data: buildFallbackHubData() };
  } catch (err) {
    if (timedOut || (err && err.name === 'AbortError')) {
      console.warn('API 응답 지연(12s)으로 기본 허브 모드로 전환했습니다.');
    } else {
      console.error('API 연동 오류:', err);
    }
    return { status: 'fallback', data: buildFallbackHubData() };
  }
}
