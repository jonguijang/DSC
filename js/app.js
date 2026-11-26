import { CONFIG, ROLE_LEVEL, SERVICES } from './core/config.js';
import {
  state,
  getViewMode,
  sanitizeMemberName,
  initTheme,
  toggleTheme,
  loadFavorites,
  saveFavorites,
  getSmallGroupNames,
  getDefaultWorshipByDate,
  renderWorshipOptionsHtml
} from './core/state.js';
import {
  callApi,
  loadSmallGroupMaster,
  resolveGroupByMemberName,
  fetchPublicHubData
} from './core/api.js';
import { WeeklyDutyModule } from './modules/WeeklyDutyModule.js';
import { DarakbangModule } from './modules/DarakbangModule.js';
import { OfferingsModule } from './modules/OfferingsModule.js';
import { BookRequestModule } from './modules/BookRequestModule.js';
import { SmallGroupModule } from './modules/SmallGroupModule.js';
import { TalentModule } from './modules/TalentModule.js';
import {
  AttendanceModule,
  validateAttendanceDateAndService,
  filterAttendanceRecords,
  resetAttendanceSearch
} from './modules/AttendanceModule.js';


// 모듈 레지스트리 — 향후 신규 업무 모듈 추가 시 여기에 등록
const MODULE_REGISTRY = {
  darakbang: DarakbangModule,
  offerings: OfferingsModule,
  bookRequest: BookRequestModule,
  attendance: AttendanceModule,
  smallGroup: SmallGroupModule,
  talent: TalentModule
};

function renderQuickHub() {
  const favSlot = document.getElementById('quick-favorites-slot');
  const linkSlot = document.getElementById('quick-links-slot');
  const userLv = ROLE_LEVEL[state.currentRole];

  if (favSlot) {
    const favServices = SERVICES.filter(s => state.favoriteIds.includes(s.title));
    favSlot.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-bold text-sm sm:text-base text-navy dark:text-white">⭐ 개인화 Quick 즐겨찾기</h2>
        <span class="text-[11px] text-gray-500 dark:text-slate-400">${userLv >= 2 ? '자주 쓰는 메뉴 바로가기' : '성도 로그인 후 활성화'}</span>
      </div>
      ${userLv < 2
        ? `<div class="p-3.5 rounded-xl bg-skyBg/70 dark:bg-slate-800 text-xs text-gray-600 dark:text-slate-300">
            로그인 후 서비스 카드의 ★ 버튼을 눌러 나만의 퀵 메뉴를 구성할 수 있습니다.
           </div>`
        : `<div class="flex flex-wrap gap-2">
            ${favServices.length ? favServices.map(srv => `
              <button onclick="handleServiceClick(${SERVICES.indexOf(srv)})"
                class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-skyBg dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-xs font-bold text-navy dark:text-gold transition">
                <span>${srv.icon}</span>
                <span>${srv.title}</span>
              </button>
            `).join('') : `<span class="text-xs text-gray-500">즐겨찾기로 지정한 메뉴가 없습니다.</span>`}
           </div>`
      }`;
  }

  if (linkSlot) {
    const visibleLinks = CONFIG.QUICK_HUB_LINKS.filter(l => userLv >= l.minRole);
    linkSlot.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-bold text-sm sm:text-base text-navy dark:text-white">🔗 전자 신청서비스 링크 허브</h2>
        <span class="text-[11px] text-gray-500 dark:text-slate-400">결재·영수증·제안·투표</span>
      </div>
      ${visibleLinks.length
        ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            ${visibleLinks.map(l => `
              <a href="${l.url}" target="_blank"
                class="p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-skyBg/60 dark:bg-slate-800 hover:border-navy dark:hover:border-gold transition flex items-center gap-2.5">
                <span class="text-lg">${l.icon}</span>
                <div class="min-w-0">
                  <div class="text-xs font-bold text-navy dark:text-white truncate">${l.title}</div>
                  <div class="text-[11px] text-gray-500 dark:text-slate-400 truncate">${l.desc}</div>
                </div>
              </a>
            `).join('')}
           </div>`
        : `<div class="p-3.5 rounded-xl bg-skyBg/70 dark:bg-slate-800 text-xs text-gray-600 dark:text-slate-300">
            전자 신청·결재·투표 서비스는 성도(2. 다산교회) 또는 직원(3. 직원) 로그인 시 노출됩니다.
           </div>`
      }`;
  }
}

function mountAllModules() {
  const badge = document.getElementById('view-mode-badge');
  if (badge) badge.textContent = `VIEW: ${getViewMode()}`;
  const dutyMod = new WeeklyDutyModule({ container: '#weekly-duty-slot' });
  dutyMod.mount();
  renderQuickHub();
}

function renderGalleryStrip(albums) {
  const grid = document.getElementById('gallery-strip-grid');
  if (!grid) return;
  if (!albums.length) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-6 text-xs text-gray-500 dark:text-slate-400">
        공유 드라이브 [02_활동사진_갤러리]에 행사별 폴더(예: 2026_안식일학교)를 생성하면 자동으로 앨범이 표시됩니다.
      </div>`;
    return;
  }
  grid.innerHTML = albums.slice(0, 4).map(album => {
    const thumb = (album.photos && album.photos[0]) ? album.photos[0].thumb : '';
    return `
      <a href="https://drive.google.com/drive/folders/${album.folderId}" target="_blank"
         class="group rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-skyBg dark:bg-slate-800 hover:shadow-md transition">
        <div class="aspect-video bg-gray-200 dark:bg-slate-700 overflow-hidden flex items-center justify-center">
          ${thumb
            ? `<img src="${thumb}" alt="${album.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />`
            : `<span class="text-2xl">📸</span>`}
        </div>
        <div class="p-3">
          <div class="font-bold text-xs text-navy dark:text-white truncate">${album.title}</div>
          <div class="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">사진 ${album.photos ? album.photos.length : 0}장</div>
        </div>
      </a>`;
  }).join('');
}

function renderCalendarEvents(events) {
  if (!events.length) return;
  const list = document.getElementById('calendar-event-list');
  if (!list) return;
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  list.innerHTML = events.slice(0, 4).map(ev => {
    const d = new Date(ev.start);
    const timeStr = `${d.getMonth() + 1}/${d.getDate()}(${dayNames[d.getDay()]}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `
      <li class="flex items-start justify-between pb-2 border-b border-gray-100 dark:border-slate-800 last:border-none">
        <div>
          <span class="font-bold text-navy dark:text-slate-100">${ev.title}</span>
          <p class="text-xs text-gray-500 dark:text-slate-400">${ev.location || '다산교회'}</p>
        </div>
        <span class="text-xs font-semibold text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded shrink-0">${timeStr}</span>
      </li>`;
  }).join('');
}

async function loadPublicHubData() {
  const statusDot = document.getElementById('api-status-dot');
  const result = await fetchPublicHubData();
  state.hubCache = result.data;

  if (statusDot) {
    if (result.status === 'live') {
      statusDot.innerHTML = '🟢 실시간 연동됨';
      statusDot.className = 'ml-1 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300';
    } else if (result.status === 'unconfigured') {
      statusDot.innerHTML = '🟡 API URL 미설정(기본 허브)';
      statusDot.className = 'ml-1 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200';
    } else if (result.status === 'waiting') {
      statusDot.innerHTML = '🟡 API 응답 대기(기본 허브)';
      statusDot.className = 'ml-1 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200';
    } else {
      statusDot.innerHTML = '🟡 기본 허브 모드(API 지연/점검)';
      statusDot.className = 'ml-1 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200';
    }
  }

  renderGalleryStrip(state.hubCache.galleries);
  if (result.status === 'live') {
    renderCalendarEvents(state.hubCache.events);
  }
  mountAllModules();
}

function openBulletinModal() {
  const modal = document.getElementById('service-modal');
  document.getElementById('modal-icon').textContent = '📄';
  document.getElementById('modal-title').textContent = '다산교회 예배주보 아카이브';
  document.getElementById('modal-subtitle').textContent = 'Google Drive (01_예배주보_PDF) 실시간 동기화';

  const listHtml = (state.hubCache.bulletins && state.hubCache.bulletins.length)
    ? state.hubCache.bulletins.map((b, idx) => `
        <div class="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-skyBg/50 dark:bg-slate-800">
          <div>
            <span class="font-bold text-navy dark:text-white">${idx === 0 ? '🆕 ' : ''}${b.name}</span>
            <div class="text-[11px] text-gray-500 dark:text-slate-400">업데이트: ${(b.updated || '').slice(0, 10)}</div>
          </div>
          <a href="${b.url}" target="_blank" class="bg-navy dark:bg-gold text-white dark:text-navyDark text-xs font-bold px-3 py-1.5 rounded-lg">열람하기</a>
        </div>
      `).join('')
    : `<p class="text-gray-600 dark:text-slate-300">현재 공유 드라이브 주보 폴더에서 최신 파일을 바로 열람하실 수 있습니다.</p>`;

  document.getElementById('modal-body').innerHTML = `
    <div class="space-y-3">${listHtml}</div>
    <div class="pt-3 border-t border-gray-200 dark:border-slate-700 text-right">
      <a href="${CONFIG.FOLDERS.BULLETIN}" target="_blank" class="inline-block bg-gold text-navyDark font-bold text-xs px-4 py-2 rounded-lg">
        📁 전체 주보 폴더 바로가기
      </a>
    </div>`;
  modal.classList.remove('hidden');
}

function closeServiceModal() {
  document.getElementById('service-modal')?.classList.add('hidden');
}

async function openSheetServiceModal(srv) {
  const modal = document.getElementById('service-modal');
  const body = document.getElementById('modal-body');
  document.getElementById('modal-icon').textContent = srv.icon;
  document.getElementById('modal-title').textContent = srv.title;
  document.getElementById('modal-subtitle').textContent = `연동 DB 테이블: ${srv.sheet || '마스터 시트'}`;

  if (srv.moduleKey && MODULE_REGISTRY[srv.moduleKey]) {
    const ModClass = MODULE_REGISTRY[srv.moduleKey];
    const mod = new ModClass({ viewMode: getViewMode() });
    body.innerHTML = await mod.renderHtml();
    modal.classList.remove('hidden');
    return;
  }

  const formHtml = srv.formFields ? `
    <form onsubmit="submitServiceForm(event, '${srv.sheet}')" class="p-4 rounded-xl bg-skyBg/70 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 space-y-3">
      <div class="font-bold text-navy dark:text-gold text-xs">✍️ 신규 신청 / 등록하기</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        ${srv.formFields.map(f => `
          <div>
            <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1">${f}</label>
            <input name="${f}" required class="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs" placeholder="${f} 입력" />
          </div>
        `).join('')}
      </div>
      <button type="submit" class="bg-navy dark:bg-gold text-white dark:text-navyDark font-bold text-xs px-4 py-2 rounded-lg hover:opacity-90">
        DB에 즉시 저장하기
      </button>
    </form>
  ` : '';

  body.innerHTML = `
    ${formHtml}
    <div id="modal-sheet-data" class="text-center py-6 text-xs text-gray-500">
      ${state.currentIdToken
        ? '⏳ Google Sheets에서 실시간 데이터를 불러오는 중입니다...'
        : '💡 현재 [미리보기 권한 체험 모드]입니다. Google OAuth 인증 세션(idToken) 연결 시 실제 DB 내역 조회 및 저장이 활성화됩니다.'}
    </div>`;
  modal.classList.remove('hidden');

  if (state.currentIdToken && srv.sheet) {
    if (srv.sheet === 'Users_Master') {
      await loadSmallGroupMaster();
    }
    const res = await callApi('querySheet', { sheetName: srv.sheet });
    const container = document.getElementById('modal-sheet-data');
    if (res && res.ok && res.rows && res.rows.length) {
      const isUsersMaster = srv.sheet === 'Users_Master';
      const groupColKey = isUsersMaster
        ? (Object.keys(res.rows[0]).find(k => k.includes('소속반')) || '소속반(1~9반)')
        : '';
      const cols = Object.keys(res.rows[0]).slice(0, 5);
      container.innerHTML = `
        <div class="overflow-x-auto text-left">
          ${isUsersMaster ? `<div class="mb-2 text-[11px] text-navy dark:text-gold font-semibold">📌 SmallGroup_Master 반명 목록(${getSmallGroupNames().join(', ')}) 기준으로 소속반을 선택할 수 있습니다.</div>` : ''}
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                ${cols.map(c => `<th class="p-2 font-bold">${c}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${res.rows.slice(0, 15).map((r, rowIdx) => `
                <tr class="border-b border-gray-100 dark:border-slate-800">
                  ${cols.map(c => {
                    if (isUsersMaster && c === groupColKey) {
                      const currentVal = String(r[c] || '').trim();
                      const opts = getSmallGroupNames().map(g => `<option value="${g}"${g === currentVal ? ' selected' : ''}>${g}</option>`).join('');
                      const extraOpt = (!currentVal || getSmallGroupNames().includes(currentVal))
                        ? ''
                        : `<option value="${currentVal}" selected>${currentVal}</option>`;
                      const userKey = r['User_ID'] || r['Google_Email'] || r['성명'] || rowIdx;
                      return `<td class="p-2">
                        <select onchange="handleUserGroupChange('${String(userKey).replace(/'/g, '')}', '${c}', this.value)"
                          class="px-2 py-1 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs">
                          <option value="">미배정</option>
                          ${extraOpt}
                          ${opts}
                        </select>
                      </td>`;
                    }
                    return `<td class="p-2">${r[c] ?? ''}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    } else {
      container.textContent = (res && res.error) || '조회된 데이터 내역이 없습니다.';
    }
  }
}

function switchGuideTab(tabName) {
  ['offerings', 'pathfinder', 'adventurer'].forEach(t => {
    const btn = document.getElementById('tab-' + t);
    const panel = document.getElementById('panel-' + t);
    if (!btn || !panel) return;
    if (t === tabName) {
      btn.className = 'bg-navy dark:bg-gold text-white dark:text-navyDark border-navy dark:border-gold text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg border transition whitespace-nowrap';
      panel.classList.remove('hidden');
    } else {
      btn.className = 'bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-xs sm:text-sm font-semibold px-4 py-2 rounded-lg border transition whitespace-nowrap';
      panel.classList.add('hidden');
    }
  });
  document.getElementById('guide-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function handleServiceClick(index) {
  const srv = SERVICES[index];
  if (!srv) return;
  const userLv = ROLE_LEVEL[state.currentRole] || 1;
  if (userLv < srv.minRole) {
    const minRoleName = Object.keys(ROLE_LEVEL).find(k => ROLE_LEVEL[k] === srv.minRole);
    alert(`[접근 제한] '${srv.title}' 메뉴는 [${minRoleName}] 등급 이상 로그인 후 이용하실 수 있습니다.`);
    return;
  }
  if (srv.actionKey === 'openBulletinModal') { openBulletinModal(); return; }
  if (srv.guideTab) { switchGuideTab(srv.guideTab); return; }
  if (srv.url && srv.url.startsWith('http')) { window.open(srv.url, '_blank'); return; }
  if (srv.url && srv.url.startsWith('#') && srv.url.length > 1) {
    document.querySelector(srv.url)?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  await openSheetServiceModal(srv);
}

function toggleFavorite(title, ev) {
  if (ev) ev.stopPropagation();
  if (ROLE_LEVEL[state.currentRole] < 2) {
    alert('Quick 즐겨찾기(★) 저장은 성도(2. 다산교회) 이상 로그인 후 이용하실 수 있습니다.');
    return;
  }
  const idx = state.favoriteIds.indexOf(title);
  if (idx >= 0) state.favoriteIds.splice(idx, 1);
  else state.favoriteIds.push(title);
  saveFavorites();
  renderQuickHub();
  renderServices();
}

function renderPersonalizedCard() {
  const card = document.getElementById('personalized-card');
  if (!card) return;
  if (state.currentRole === '외부인') {
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-bold text-navy dark:text-gold bg-skyBg dark:bg-slate-800 px-2.5 py-1 rounded-md">오시는 길 &amp; 새가족 안내</span>
          <span class="text-xs text-gray-400 dark:text-slate-500">환영합니다</span>
        </div>
        <h3 class="font-bold text-base text-gray-900 dark:text-white mb-1">다산교회 방문을 환영합니다</h3>
        <p class="text-xs text-gray-600 dark:text-slate-300 leading-relaxed mb-3">
          주소: 경기도 남양주시 진건읍 고재로 197<br/>
          성도님께서는 상단 <strong>Google 로그인</strong> 후 출석·달란트·본인 헌금조회를 이용하실 수 있습니다.
        </p>
      </div>
      <div class="pt-3 border-t border-gray-100 dark:border-slate-800 flex gap-2">
        <a href="https://map.naver.com/p/search/경기도 남양주시 진건읍 고재로 197" target="_blank" class="flex-1 text-center bg-skyBg dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-navy dark:text-slate-200 text-xs font-bold py-2.5 rounded-lg transition">
          🗺️ 네이버 지도
        </a>
        <button onclick="handleAuthClick()" class="flex-1 bg-navy dark:bg-gold hover:opacity-90 text-white dark:text-navyDark text-xs font-bold py-2.5 rounded-lg transition">
          성도 로그인
        </button>
      </div>`;
  } else {
    const profile = state.currentUserProfile;
    const isRealAuth = Boolean(state.currentIdToken) && Boolean(profile);
    const talentDisplay = isRealAuth && profile.talent !== undefined ? `${profile.talent} P` : '미리보기';
    const groupDisplay = isRealAuth ? (profile.groupName || profile['소속반'] || profile.groupNo || '미배정') : '소속반';
    const attDisplay = isRealAuth && profile.attendanceRate ? profile.attendanceRate : '로그인 후 확인';
    const offeringIdx = SERVICES.findIndex(s => s.title === '헌금내역 조회');
    const talentIdx = SERVICES.findIndex(s => s.title === '달란트 관리');

    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-bold text-amber-900 dark:text-gold bg-goldLight dark:bg-amber-900/40 px-2.5 py-1 rounded-md">나의 신앙 대시보드 (${state.currentRole})</span>
          <span class="text-xs ${isRealAuth ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} font-semibold">
            ${isRealAuth ? '● 실계정 인증됨' : '◐ 미리보기 모드'}
          </span>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center my-2">
          <div class="bg-skyBg dark:bg-slate-800 p-2.5 rounded-xl">
            <div class="text-[11px] text-gray-500 dark:text-slate-400">누적 달란트</div>
            <div class="text-sm font-bold text-navy dark:text-gold">${talentDisplay}</div>
          </div>
          <div class="bg-skyBg dark:bg-slate-800 p-2.5 rounded-xl">
            <div class="text-[11px] text-gray-500 dark:text-slate-400">소그룹반</div>
            <div class="text-sm font-bold text-navy dark:text-white">${groupDisplay}</div>
          </div>
          <div class="bg-skyBg dark:bg-slate-800 p-2.5 rounded-xl">
            <div class="text-[11px] text-gray-500 dark:text-slate-400">금월 출석</div>
            <div class="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-400">${attDisplay}</div>
          </div>
        </div>
      </div>
      <div class="pt-3 border-t border-gray-100 dark:border-slate-800 flex gap-2">
        <button onclick="handleServiceClick(${offeringIdx})" class="flex-1 text-center bg-navy dark:bg-gold text-white dark:text-navyDark text-xs font-bold py-2.5 rounded-lg hover:opacity-90 transition">
          🔒 본인 헌금조회
        </button>
        <button onclick="handleServiceClick(${talentIdx})" class="flex-1 text-center bg-skyBg dark:bg-slate-800 text-navy dark:text-slate-200 text-xs font-bold py-2.5 rounded-lg hover:opacity-90 transition">
          🏆 달란트 적립
        </button>
      </div>`;
  }
}

function renderServices() {
  const grid = document.getElementById('services-grid');
  if (!grid) return;
  const userLv = ROLE_LEVEL[state.currentRole] || 1;
  const filtered = state.currentCategory === 'ALL' ? SERVICES : SERVICES.filter(s => s.cat === state.currentCategory);

  grid.innerHTML = filtered.map(srv => {
    const srvIdx = SERVICES.indexOf(srv);
    const unlocked = userLv >= srv.minRole;
    const isFav = state.favoriteIds.includes(srv.title);
    const roleTag = srv.minRole === 1 ? '전체' : srv.minRole === 2 ? '성도+' : srv.minRole === 3 ? '직원+' : '관리자';
    return `
      <div onclick="handleServiceClick(${srvIdx})"
           class="cursor-pointer rounded-xl p-3.5 border transition flex flex-col justify-between ${
             unlocked
               ? 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-navy dark:hover:border-gold hover:shadow-md'
               : 'bg-gray-100/80 dark:bg-slate-900/40 border-gray-200 dark:border-slate-800/60 opacity-60'
           }">
        <div class="flex items-start justify-between gap-1 mb-2">
          <span class="text-xl">${srv.icon}</span>
          <div class="flex items-center gap-1">
            ${unlocked && userLv >= 2
              ? `<button type="button" onclick="toggleFavorite('${srv.title}', event)" aria-label="즐겨찾기 토글"
                  class="text-xs px-1 rounded ${isFav ? 'text-amber-500' : 'text-gray-300 dark:text-slate-600 hover:text-amber-400'}">★</button>`
              : ''}
            <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              unlocked
                ? 'bg-skyBg dark:bg-slate-800 text-navy dark:text-gold'
                : 'bg-gray-200 dark:bg-slate-800 text-gray-500 dark:text-slate-500'
            }">
              ${unlocked ? roleTag : '🔒 ' + roleTag}
            </span>
          </div>
        </div>
        <div>
          <div class="font-bold text-xs sm:text-sm text-gray-900 dark:text-slate-100 leading-snug">${srv.title}</div>
          <div class="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 line-clamp-1">${srv.desc}</div>
        </div>
      </div>`;
  }).join('');
}

function filterServices(cat) {
  state.currentCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(btn => {
    const active = btn.getAttribute('data-cat') === cat;
    btn.className = active
      ? 'cat-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-navy text-white dark:bg-gold dark:text-navyDark'
      : 'cat-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700';
  });
  renderServices();
}

function changePreviewRole(role) {
  state.currentRole = role;
  const badge = document.getElementById('user-badge');
  const authBtn = document.getElementById('auth-btn');
  if (role === '외부인') {
    if (badge) {
      badge.textContent = '1. 외부인';
      badge.className = 'hidden sm:inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300';
    }
    if (authBtn) authBtn.textContent = 'Google 로그인';
  } else {
    const displayName = state.currentIdToken && state.currentUserProfile
      ? sanitizeMemberName(state.currentUserProfile.name)
      : `${role} (미리보기)`;
    if (badge) {
      badge.textContent = `${ROLE_LEVEL[role]}. ${displayName}`;
      badge.className = 'hidden sm:inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-goldLight dark:bg-amber-900/50 text-amber-900 dark:text-gold';
    }
    if (authBtn) authBtn.textContent = '로그아웃';
  }
  renderPersonalizedCard();
  mountAllModules();
  renderServices();
}

function handleAuthClick() {
  if (state.currentRole !== '외부인' || state.currentIdToken) {
    state.currentIdToken = '';
    state.currentUserProfile = null;
    const roleEl = document.getElementById('role-preview');
    if (roleEl) roleEl.value = '외부인';
    changePreviewRole('외부인');
    return;
  }

  if (CONFIG.GOOGLE_CLIENT_ID && window.google?.accounts?.id) {
    window.google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: async (response) => {
        state.currentIdToken = response.credential;
        const res = await callApi('getSessionProfile');
        if (res && res.ok && res.user) {
          state.currentUserProfile = res.user;
          await loadSmallGroupMaster();
          const resolvedRole = res.user.role || '외부인';
          const roleEl = document.getElementById('role-preview');
          if (roleEl) roleEl.value = resolvedRole;
          changePreviewRole(resolvedRole);
          alert(`${sanitizeMemberName(res.user.name)}님 환영합니다! (${resolvedRole} 등급으로 로그인되었습니다)`);
        } else {
          alert((res && res.error) || '로그인 검증에 실패했습니다.');
        }
      }
    });
    window.google.accounts.id.prompt();
  } else {
    const roleEl = document.getElementById('role-preview');
    if (roleEl) roleEl.value = '다산교회';
    changePreviewRole('다산교회');
  }
}

// Form Submit Handlers
async function handleDarakbangSubmit(e) {
  e.preventDefault();
  if (!state.currentIdToken) {
    alert('다락방 ID 신청 및 비밀번호 초기화 저장은 Google 계정 로그인 후 이용하실 수 있습니다.');
    return;
  }
  const record = Object.fromEntries(new FormData(e.target).entries());
  const res = await callApi('insertRow', { sheetName: 'Darakbang_Requests', record });
  if (res && res.ok) {
    alert('✅ 다락방 신청이 정상 접수되었습니다.');
    await openSheetServiceModal(SERVICES.find(s => s.title === '다락방 ID·매뉴얼'));
  } else {
    alert('신청 오류: ' + ((res && res.error) || '권한 또는 입력값을 확인해 주세요.'));
  }
}

async function handleBookRequestSubmit(e) {
  e.preventDefault();
  if (!state.currentIdToken) {
    alert('서적 신청 저장은 Google 계정 로그인 후 이용하실 수 있습니다.');
    return;
  }
  const record = Object.fromEntries(new FormData(e.target).entries());
  record['수량'] = Number(record['수량'] || 1);
  const res = await callApi('insertRow', { sheetName: 'Book_Requests', record });
  if (res && res.ok) {
    alert('✅ 서적 신청이 정상 등록되었습니다.');
    await openSheetServiceModal(SERVICES.find(s => s.title === '서적신청조회'));
  } else {
    alert('신청 오류: ' + ((res && res.error) || '권한 또는 입력값을 확인해 주세요.'));
  }
}

async function handleAttendanceSubmit(e) {
  e.preventDefault();
  if (!state.currentIdToken) {
    alert('출석 체크 저장은 Google 계정 로그인 후 이용하실 수 있습니다.');
    return;
  }
  const formData = Object.fromEntries(new FormData(e.target).entries());
  const serviceDate = formData['예배일자'] || new Date().toISOString().slice(0, 10);
  const serviceType = formData['예배구분(화/금/안)'] || getDefaultWorshipByDate(serviceDate);

  const check = validateAttendanceDateAndService(serviceDate, serviceType);
  if (!check.valid) {
    if (check.hardBlock) {
      alert(check.message);
      return;
    }
    if (!confirm(check.message)) return;
  }

  const actorName = (state.currentUserProfile && state.currentUserProfile.name) || '성도';
  const actorUserId = (state.currentUserProfile && (state.currentUserProfile.userId || state.currentUserProfile.id || state.currentUserProfile.email)) || '';
  const canProxyRegister = ROLE_LEVEL[state.currentRole] >= 3;
  const proxyTargetName = canProxyRegister ? String(formData['대상성명'] || '').trim() : '';
  const proxyTargetUserId = canProxyRegister ? String(formData['대상User_ID'] || '').trim() : '';

  const targetMemberName = proxyTargetName || actorName;
  const matched = await resolveGroupByMemberName(targetMemberName, proxyTargetName ? proxyTargetUserId : actorUserId);
  const targetUserId = proxyTargetName ? (proxyTargetUserId || matched.userId) : (actorUserId || matched.userId);
  const matchedGroup = matched.groupName || '';
  const recordId = 'ATT-' + Date.now();

  const record = {
    Record_ID: recordId,
    recordId,
    '예배일자': serviceDate,
    '예배구분(화/금/안)': serviceType,
    '예배구분': serviceType,
    User_ID: targetUserId,
    userId: targetUserId,
    '성명': targetMemberName,
    '소속반': matchedGroup,
    '소그룹반': matchedGroup,
    '출석상태': formData['출석상태'] || '출석',
    '입력자': actorName
  };

  const res = await callApi('insertRow', { sheetName: 'Attendance_Log', record });
  if (res && res.ok) {
    alert(proxyTargetName
      ? `✅ ${targetMemberName}님(${matchedGroup || '자동매칭'}) 대리 출석이 정상 등록되었습니다. (입력자: ${actorName})`
      : `✅ ${targetMemberName}님(${matchedGroup || '자동매칭'}) 출석이 정상 등록되었습니다.`);
    await openSheetServiceModal(SERVICES.find(s => s.title === '출석현황 (화/금/안)'));
  } else {
    alert('등록 오류: ' + ((res && res.error) || '권한 또는 입력값을 확인해 주세요.'));
  }
}

async function handleUserGroupChange(userKey, colName, newGroup) {
  if (!state.currentIdToken) return;
  if (state.currentUserProfile && (
    state.currentUserProfile.userId === userKey ||
    state.currentUserProfile.email === userKey ||
    state.currentUserProfile.name === userKey
  )) {
    state.currentUserProfile.groupName = newGroup;
    state.currentUserProfile['소속반'] = newGroup;
  }
  try {
    const res = await callApi('updateUserGroup', { userKey, columnName: colName, groupName: newGroup });
    if (res && res.ok) {
      alert(`✅ 소속반이 '${newGroup || '미배정'}'(으)로 반영되었습니다.`);
    }
  } catch (e) {
    console.warn('updateUserGroup 호출 참고:', e);
  }
}

async function submitServiceForm(e, sheetName) {
  e.preventDefault();
  if (!state.currentIdToken) {
    alert('실제 Google 계정으로 로그인한 상태에서만 DB 시트에 저장할 수 있습니다.');
    return;
  }
  const record = Object.fromEntries(new FormData(e.target).entries());
  const res = await callApi('insertRow', { sheetName, record });
  if (res && res.ok) {
    alert('✅ 다산교회 통합 DB에 정상 등록되었습니다!');
    closeServiceModal();
  } else {
    alert('등록 오류: ' + ((res && res.error) || '권한을 확인해 주세요.'));
  }
}

function syncWorshipTypeByDate(dateStr) {
  const sel = document.getElementById('att-service-select');
  if (sel) sel.innerHTML = renderWorshipOptionsHtml(dateStr);
}

function updateWorshipCountdown() {
  const now = new Date();
  const schedules = [
    { name: '화요예배', day: 2, hour: 19, min: 30 },
    { name: '금요저녁예배', day: 5, hour: 19, min: 30 },
    { name: '안식일예배', day: 6, hour: 10, min: 0 }
  ];
  let nearest = null;
  let minDiff = Infinity;
  schedules.forEach(s => {
    const target = new Date(now);
    const dayDiff = (s.day - now.getDay() + 7) % 7;
    target.setDate(now.getDate() + dayDiff);
    target.setHours(s.hour, s.min, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 7);
    const diff = target - now;
    if (diff < minDiff) { minDiff = diff; nearest = { name: s.name, diff }; }
  });
  if (!nearest) return;
  const days = Math.floor(nearest.diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((nearest.diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((nearest.diff / (1000 * 60)) % 60);
  const secs = Math.floor((nearest.diff / 1000) % 60);
  const lbl = document.getElementById('next-worship-label');
  const cd = document.getElementById('worship-countdown');
  if (lbl) lbl.textContent = `다음 ${nearest.name}까지`;
  if (cd) cd.textContent = `${days > 0 ? days + '일 ' : ''}${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function shareKakaoDevotion() {
  const verseEl = document.getElementById('daily-verse-text');
  const verse = verseEl ? verseEl.textContent.trim() : '"너희는 세상의 빛이라 산 위에 있는 동네가 숨겨지지 못할 것이요" (마태복음 5:14)';
  const text = `[다산교회 오늘의 말씀과 묵상]\n${verse}\n\n▶ 온라인예배 및 묵상 보기: https://www.youtube.com/@sda5239`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      alert('오늘의 말씀 묵상 카드가 클립보드에 복사되었습니다.\n카카오톡방에 붙여넣기하여 바로 나누실 수 있습니다!');
    });
  } else {
    alert(text);
  }
}

// HTML 인라인 이벤트 호환 브리지 등록
Object.assign(window, {
  toggleTheme,
  changePreviewRole,
  handleAuthClick,
  shareKakaoDevotion,
  openBulletinModal,
  switchGuideTab,
  filterServices,
  closeServiceModal,
  handleServiceClick,
  toggleFavorite,
  handleDarakbangSubmit,
  handleBookRequestSubmit,
  handleAttendanceSubmit,
  filterAttendanceRecords,
  resetAttendanceSearch,
  syncWorshipTypeByDate,
  handleUserGroupChange,
  submitServiceForm
});

// 포털 초기화
function initPortalApp() {
  initTheme();
  loadFavorites();
  updateWorshipCountdown();
  setInterval(updateWorshipCountdown, 1000);
  renderPersonalizedCard();
  renderQuickHub();
  mountAllModules();
  renderServices();
  loadPublicHubData();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPortalApp);
} else {
  initPortalApp();
}

window.addEventListener('resize', () => {
  try { mountAllModules(); } catch (e) { console.error(e); }
});
