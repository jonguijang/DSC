import {
  CONFIG,
  ROLE_DEFS,
  ROLE_LEVEL,
  SERVICES,
  normalizeRoleName,
  getRoleNameByLevel
} from './core/config.js';
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
  saveSession,
  loadSession,
  extendSession,
  clearSession,
  startSessionTimer,
  stopSessionTimer
} from './core/session.js';
import {
  callApi,
  loadSmallGroupMaster,
  resolveGroupByMemberName,
  fetchPublicHubData
} from './core/api.js';

// 기존 구현 완료 모듈
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

// =========================================================================
// 1. 공통 유틸리티 (토스트 · 기본 활동사진 · 예배시간 계산)
// =========================================================================
function showToast(msg) {
  const el = document.getElementById('portal-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(window.__dscToastTimer);
  window.__dscToastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

function makeDefaultSlideSvg(title, subtitle, c1, c2) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs>
    <rect width='800' height='500' fill='url(#g)'/>
    <circle cx='690' cy='90' r='130' fill='rgba(212,175,55,0.14)'/>
    <circle cx='120' cy='420' r='170' fill='rgba(255,255,255,0.06)'/>
    <text x='50%' y='46%' text-anchor='middle' fill='#d4af37' font-size='44' font-family='sans-serif' font-weight='bold'>${title}</text>
    <text x='50%' y='58%' text-anchor='middle' fill='#ffffff' font-size='22' font-family='sans-serif' opacity='0.9'>${subtitle}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

const DEFAULT_GALLERY_SLIDES = [
  {
    thumb: makeDefaultSlideSvg('다산교회 안식일예배', '매주 토요일 오전 10:00 · 본당', '#1a252f', '#2c3e50'),
    title: '안식일학교 및 대예배',
    sub: '매주 토요일 09:30 / 10:00 · 다산교회 본당'
  },
  {
    thumb: makeDefaultSlideSvg('말씀과 기도의 공동체', '화요예배(19:30) · 금요저녁예배(19:30)', '#1e3a5f', '#1a252f'),
    title: '화요 · 금요 저녁예배',
    sub: '주중 말씀과 중보기도로 세워가는 공동체'
  },
  {
    thumb: makeDefaultSlideSvg('함께 섬기는 다산교회', '소그룹(9개반) · 패스파인더 · 어드벤처러', '#28364a', '#16202a'),
    title: '다산교회 사역 및 활동앨범',
    sub: '공유 드라이브 [02_활동사진_갤러리] 자동 연동'
  }
];

function getUpcomingWorshipSlots() {
  const now = new Date();
  const defs = [
    { name: '화요예배', day: 2, hour: 19, min: 30 },
    { name: '금요저녁예배', day: 5, hour: 19, min: 30 },
    { name: '안식일예배', day: 6, hour: 10, min: 0 }
  ];
  return defs.map(s => {
    const target = new Date(now);
    const diffDays = (s.day - now.getDay() + 7) % 7;
    target.setDate(now.getDate() + diffDays);
    target.setHours(s.hour, s.min, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 7);

    const openAt = new Date(target.getTime() - 24 * 60 * 60 * 1000); // 24시간 전
    const closeAt = new Date(target.getTime() - 3 * 60 * 60 * 1000); // 3시간 전
    const dateStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    const isOpen = now >= openAt && now <= closeAt;
    const isClosed = now > closeAt;
    return { ...s, target, openAt, closeAt, dateStr, isOpen, isClosed };
  }).sort((a, b) => a.target - b.target);
}

// =========================================================================
// 2. 활동사진 정방향 / 역방향 심플 슬라이더
// =========================================================================
const gallerySlider = {
  items: DEFAULT_GALLERY_SLIDES.slice(),
  index: 0,
  direction: 1, // 1: 정방향, -1: 역방향, 0: 정지
  timer: null,
  setItems(albums) {
    const flat = [];
    (albums || []).forEach(alb => {
      (alb.photos || []).forEach(p => {
        if (p && p.thumb) {
          flat.push({ thumb: p.thumb, title: alb.title || '활동사진', sub: p.name || '다산교회 갤러리' });
        }
      });
    });
    this.items = flat.length ? flat.slice(0, 20) : DEFAULT_GALLERY_SLIDES.slice();
    this.index = 0;
    this.render();
    this.restart();
  },
  step(delta) {
    if (!this.items.length) return;
    this.index = (this.index + delta + this.items.length) % this.items.length;
    this.render();
  },
  setDirection(dir) {
    this.direction = dir;
    this.updateButtons();
    this.restart();
  },
  updateButtons() {
    const activeCls = 'px-2.5 py-1 rounded-md text-[11px] font-bold bg-navy text-white dark:bg-gold dark:text-navyDark transition';
    const idleCls = 'px-2.5 py-1 rounded-md text-[11px] font-bold text-gray-600 dark:text-slate-300 transition';
    const rev = document.getElementById('btn-dir-rev');
    const pause = document.getElementById('btn-dir-pause');
    const fwd = document.getElementById('btn-dir-fwd');
    if (rev) rev.className = this.direction === -1 ? activeCls : idleCls;
    if (pause) pause.className = this.direction === 0 ? activeCls : idleCls;
    if (fwd) fwd.className = this.direction === 1 ? activeCls : idleCls;
  },
  restart() {
    if (this.timer) clearInterval(this.timer);
    if (this.direction !== 0 && this.items.length > 1) {
      this.timer = setInterval(() => this.step(this.direction), 3800);
    }
  },
  render() {
    const item = this.items[this.index] || DEFAULT_GALLERY_SLIDES[0];
    const img = document.getElementById('hero-gallery-img');
    const cap = document.getElementById('hero-gallery-caption');
    const sub = document.getElementById('hero-gallery-sub');
    const cnt = document.getElementById('hero-gallery-counter');
    if (img) img.src = item.thumb;
    if (cap) cap.textContent = item.title;
    if (sub) sub.textContent = item.sub || '';
    if (cnt) cnt.textContent = `${this.index + 1} / ${this.items.length}`;
    this.updateButtons();
  }
};

// =========================================================================
// 3. v4.0 신규 업무 클래스 (예배참석예약 · 참석예상인원 · 대외안내 · 권한관리)
// =========================================================================
class WorshipReserveModule {
  async renderHtml() {
    const slots = getUpcomingWorshipSlots();
    const myGroup = (state.currentUserProfile && (state.currentUserProfile.groupName || state.currentUserProfile['소속반'])) || '겸손반';
    let myResvs = [];
    if (state.currentIdToken) {
      const res = await callApi('querySheet', { sheetName: 'Worship_Reservations' });
      if (res && res.ok && Array.isArray(res.rows)) myResvs = res.rows;
    }

    const fmtTime = d => `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    return `
      <div class="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 text-xs space-y-1">
        <div class="font-bold text-amber-900 dark:text-gold">🎟️ 예배참석 사전예약 혜택 안내</div>
        <p class="text-amber-800 dark:text-slate-300">
          예배 <strong>하루 전(24시간 전) ~ 3시간 전</strong>까지 사전 예약하고 실제 출석하시면 <strong>달란트 1.5배</strong>가 적립됩니다.
        </p>
      </div>

      <div class="space-y-2.5">
        ${slots.map((s, idx) => {
          const already = myResvs.find(r =>
            String(r['예배일자'] || '').slice(0, 10) === s.dateStr &&
            String(r['예배구분'] || r['예배구분(화/금/안)'] || '') === s.name &&
            String(r['상태'] || '예약완료') === '예약완료'
          );
          const statusBadge = already
            ? `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-[10px] font-bold">예약완료</span>`
            : s.isOpen
              ? `<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-[10px] font-bold">예약 가능</span>`
              : s.isClosed
                ? `<span class="px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold">예약 마감</span>`
                : `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">오픈 예정</span>`;

          return `
            <div class="p-3.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 space-y-2.5">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <div class="font-bold text-sm text-navy dark:text-white">${s.name} <span class="text-xs font-normal text-gray-500">(${s.dateStr})</span></div>
                  <div class="text-[11px] text-gray-500 dark:text-slate-400">예약 가능: ${fmtTime(s.openAt)} ~ ${fmtTime(s.closeAt)}</div>
                </div>
                ${statusBadge}
              </div>

              ${!already ? `
                <form onsubmit="handleWorshipReserveSubmit(event, '${s.dateStr}', '${s.name}', ${s.isOpen})" class="grid grid-cols-3 gap-2 items-end">
                  <div>
                    <label class="block text-[10px] text-gray-500 mb-0.5">참석유형</label>
                    <select name="참석유형" class="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs">
                      <option value="대면">대면(현장)</option>
                      <option value="온라인">온라인</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-[10px] text-gray-500 mb-0.5">동반인원</label>
                    <input type="number" name="동반인원" min="0" max="10" value="0"
                      class="w-full px-2 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs" />
                  </div>
                  <button type="submit" ${(!s.isOpen && state.currentIdToken) ? 'disabled' : ''}
                    class="py-1.5 px-2.5 rounded-lg text-xs font-bold transition ${
                      s.isOpen || !state.currentIdToken
                        ? 'bg-navy dark:bg-gold text-white dark:text-navyDark hover:opacity-90'
                        : 'bg-gray-200 dark:bg-slate-700 text-gray-400 cursor-not-allowed'
                    }">
                    ${s.isOpen ? '예약하기' : (!state.currentIdToken ? '시연 예약' : '시간 외')}
                  </button>
                  <input type="hidden" name="소속반" value="${myGroup}" />
                </form>
              ` : `
                <div class="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                  ✅ 예약 완료 (${already['참석유형'] || '대면'} · 동반 ${already['동반인원'] || 0}명) — 출석 시 달란트 1.5배 자동 적용
                </div>
              `}
            </div>`;
        }).join('')}
      </div>
    `;
  }
}

class ExpectedAttendanceModule {
  async renderHtml() {
    const slots = getUpcomingWorshipSlots();
    const targetSlot = slots[0];
    let rows = [];
    if (state.currentIdToken) {
      const res = await callApi('querySheet', { sheetName: 'Worship_Reservations' });
      if (res && res.ok && Array.isArray(res.rows)) rows = res.rows;
    } else {
      // 시연용 샘플 집계
      rows = [
        { 예배일자: targetSlot.dateStr, 예배구분: targetSlot.name, 성명: '김성도', 소속반: '겸손반', 참석유형: '대면', 동반인원: 1, 상태: '예약완료' },
        { 예배일자: targetSlot.dateStr, 예배구분: targetSlot.name, 성명: '이집사', 소속반: '사랑반', 참석유형: '대면', 동반인원: 2, 상태: '예약완료' },
        { 예배일자: targetSlot.dateStr, 예배구분: targetSlot.name, 성명: '박장로', 소속반: '믿음반', 참석유형: '대면', 동반인원: 0, 상태: '예약완료' },
        { 예배일자: targetSlot.dateStr, 예배구분: targetSlot.name, 성명: '최성도', 소속반: '은혜반', 참석유형: '온라인', 동반인원: 0, 상태: '예약완료' }
      ];
    }

    const activeRows = rows.filter(r => String(r['상태'] || '예약완료') === '예약완료');
    const inPersonHeadcount = activeRows
      .filter(r => String(r['참석유형'] || '대면') === '대면')
      .reduce((sum, r) => sum + 1 + (Number(r['동반인원'] || 0) || 0), 0);
    const onlineHeadcount = activeRows
      .filter(r => String(r['참석유형'] || '') === '온라인')
      .reduce((sum, r) => sum + 1 + (Number(r['동반인원'] || 0) || 0), 0);

    const byGroup = {};
    getSmallGroupNames().forEach(g => { byGroup[g] = 0; });
    activeRows.forEach(r => {
      const g = String(r['소속반'] || '미배정').trim();
      byGroup[g] = (byGroup[g] || 0) + 1 + (Number(r['동반인원'] || 0) || 0);
    });

    return `
      ${!state.currentIdToken ? `<div class="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-[11px] text-amber-800 dark:text-amber-300">💡 권한 시연 모드 샘플 집계입니다. 실제 로그인 시 Worship_Reservations 시트가 실시간 집계됩니다.</div>` : ''}
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="p-3 rounded-xl bg-skyBg dark:bg-slate-800">
          <div class="text-[11px] text-gray-500">총 예상인원</div>
          <div class="text-lg font-bold text-navy dark:text-gold">${inPersonHeadcount + onlineHeadcount}명</div>
        </div>
        <div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
          <div class="text-[11px] text-emerald-700 dark:text-emerald-300">대면(애찬준비)</div>
          <div class="text-lg font-bold text-emerald-700 dark:text-emerald-300">${inPersonHeadcount}명</div>
        </div>
        <div class="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
          <div class="text-[11px] text-blue-700 dark:text-blue-300">온라인 참석</div>
          <div class="text-lg font-bold text-blue-700 dark:text-blue-300">${onlineHeadcount}명</div>
        </div>
      </div>

      <div>
        <div class="font-bold text-xs text-navy dark:text-white mb-2">소그룹반별 참석 예상 인원</div>
        <div class="grid grid-cols-3 gap-2">
          ${Object.entries(byGroup).map(([g, cnt]) => `
            <div class="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs">
              <span class="font-semibold">${g}</span>
              <span class="font-bold text-navy dark:text-gold">${cnt}명</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}

class PublicGuideModule {
  constructor(opts = {}) {
    this.tab = opts.guideTab || 'intro';
  }
  async renderHtml() {
    if (this.tab === 'offerings') {
      const items = [
        ['1. 십일조', '소득의 10분의 1을 하나님께 드리는 성별된 헌금으로 복음 전파와 교역자 사역을 지원합니다.'],
        ['2. 월정헌금', '매월 정성을 다해 드리는 헌금으로 교회 예배·교육·선교 사역의 기반이 됩니다.'],
        ['3. 도르가헌금', '어려운 이웃과 취약계층을 돕는 구제·사랑 실천 사역에 사용됩니다.'],
        ['4. 교회감사헌금', '일상과 신앙의 은혜에 감사하며 교회 공동체 사역을 섬기는 헌금입니다.'],
        ['5. 투자헌금', '하나님과 동역하는 마음으로 작정·실천하는 선교 투자 헌금입니다.'],
        ['6. 생일감사헌금', '생명의 은혜와 한 해를 인도하신 하나님께 감사하며 드리는 헌금입니다.'],
        ['7. 교회특별헌금', '전도집회, 시설 정비, 특별 선교 및 지역사회 섬김을 위한 목적 헌금입니다.']
      ];
      return `<div class="space-y-2.5">${items.map(([t, d]) => `
        <div class="p-3 rounded-xl bg-skyBg dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
          <div class="font-bold text-navy dark:text-gold text-xs">${t}</div>
          <p class="text-xs text-gray-600 dark:text-slate-300 mt-0.5">${d}</p>
        </div>`).join('')}</div>`;
    }
    if (this.tab === 'clubs') {
      return `
        <div class="space-y-3">
          <div class="p-3.5 rounded-xl bg-skyBg dark:bg-slate-800 border border-gray-200 dark:border-slate-700 space-y-1.5">
            <span class="inline-block px-2 py-0.5 rounded-full bg-navy text-white text-[10px] font-bold">초5 ~ 고등</span>
            <h4 class="font-bold text-sm text-navy dark:text-white">🏕️ 다산 패스파인더 (Pathfinder)</h4>
            <p class="text-xs text-gray-600 dark:text-slate-300">성경 탐구, 자연 캠핑·하이킹, 기능장(Honor) 배지 취득, 지역사회 봉사를 통해 균형 잡힌 청소년 리더로 성장합니다.</p>
          </div>
          <div class="p-3.5 rounded-xl bg-skyBg dark:bg-slate-800 border border-gray-200 dark:border-slate-700 space-y-1.5">
            <span class="inline-block px-2 py-0.5 rounded-full bg-gold text-navyDark text-[10px] font-bold">유치부 ~ 초4</span>
            <h4 class="font-bold text-sm text-navy dark:text-white">🌱 다산 어드벤처러 (Adventurer)</h4>
            <p class="text-xs text-gray-600 dark:text-slate-300">어린이들이 부모님과 함께 예수님을 닮아가는 기쁨을 배우는 체험형 신앙·인성 클럽입니다.</p>
          </div>
        </div>`;
    }
    return `
      <div class="space-y-3">
        <div class="p-3.5 rounded-xl bg-skyBg dark:bg-slate-800 space-y-1">
          <div class="font-bold text-sm text-navy dark:text-gold">다산교회 안내</div>
          <p class="text-xs text-gray-700 dark:text-slate-300">담임목사: 임영운</p>
          <p class="text-xs text-gray-700 dark:text-slate-300">주소: 경기도 남양주시 진건읍 고재로 197</p>
        </div>
        <div class="p-3.5 rounded-xl border border-gray-200 dark:border-slate-700 space-y-1.5 text-xs">
          <div class="font-bold text-navy dark:text-white">정기 예배 시간</div>
          <div class="flex justify-between"><span>안식일학교 / 대예배</span><span class="font-bold">토 09:30 / 10:00</span></div>
          <div class="flex justify-between"><span>화요기도·말씀예배</span><span class="font-bold">화 19:30</span></div>
          <div class="flex justify-between"><span>금요저녁예배</span><span class="font-bold">금 19:30</span></div>
        </div>
        <a href="https://map.naver.com/p/search/경기도 남양주시 진건읍 고재로 197" target="_blank"
          class="block text-center bg-navy dark:bg-gold text-white dark:text-navyDark font-bold text-xs py-2.5 rounded-xl">
          🗺️ 네이버 지도로 오시는 길 보기
        </a>
      </div>`;
  }
}

class ProgramAuthModule {
  async renderHtml() {
    return `
      <div class="p-3 rounded-xl bg-skyBg dark:bg-slate-800 text-xs text-gray-600 dark:text-slate-300">
        관리자(Lv.5)는 프로그램별 <strong>최소 권한(1~5단계)</strong>과 <strong>사용여부(ON/OFF)</strong>를 실시간으로 제어할 수 있습니다. (dev2가 <code>Portal_Menus</code> 시트와 영구 저장 연동)
      </div>
      <div class="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
        ${SERVICES.map((s, idx) => `
          <div class="p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs">
            <div class="min-w-0">
              <div class="font-bold text-navy dark:text-white truncate">${s.icon} ${s.title}</div>
              <div class="text-[10px] text-gray-500">${s.id} · ${s.priority} (${s.target})</div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <select onchange="handleProgramRoleToggle(${idx}, this.value)"
                class="px-1.5 py-1 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-[11px]">
                ${ROLE_DEFS.map(r => `<option value="${r.level}"${r.level === s.minRole ? ' selected' : ''}>Lv.${r.level} ${r.key}</option>`).join('')}
              </select>
              <button type="button" onclick="handleProgramActiveToggle(${idx})"
                class="px-2 py-1 rounded-lg text-[10px] font-bold ${s.active ? 'bg-emerald-600 text-white' : 'bg-gray-300 dark:bg-slate-700 text-gray-600 dark:text-slate-300'}">
                ${s.active ? '사용' : '중지'}
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

const MODULE_REGISTRY = {
  worshipReserve: WorshipReserveModule,
  expectedAttendance: ExpectedAttendanceModule,
  publicGuide: PublicGuideModule,
  programAuth: ProgramAuthModule,
  weeklyDuty: WeeklyDutyModule,
  darakbang: DarakbangModule,
  offerings: OfferingsModule,
  bookRequest: BookRequestModule,
  attendance: AttendanceModule,
  smallGroup: SmallGroupModule,
  talent: TalentModule
};

// =========================================================================
// 4. PWA 바탕화면 바로가기 설치 처리
// =========================================================================
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

async function triggerInstallShortcut() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (choice && choice.outcome === 'accepted') {
      showToast('✅ 바탕화면에 다산교회 바로가기가 추가되었습니다.');
    }
    return;
  }

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const modal = document.getElementById('service-modal');
  document.getElementById('modal-icon').textContent = '📲';
  document.getElementById('modal-title').textContent = '바탕화면에 바로가기 만들기';
  document.getElementById('modal-subtitle').textContent = '앱처럼 홈 화면에서 한 번에 접속하세요';
  document.getElementById('modal-body').innerHTML = isIos
    ? `<div class="space-y-2.5 text-xs leading-relaxed">
         <div class="p-3.5 rounded-xl bg-skyBg dark:bg-slate-800 space-y-2">
           <div class="font-bold text-navy dark:text-gold">iPhone / iPad (Safari) 설치 방법</div>
           <p>1. 화면 하단의 <strong>공유 버튼(□↑)</strong>을 눌러 주세요.</p>
           <p>2. 메뉴를 위로 올려 <strong>[홈 화면에 추가]</strong>를 선택합니다.</p>
           <p>3. 우측 상단 <strong>[추가]</strong>를 누르면 다산교회 아이콘이 생성됩니다.</p>
         </div>
       </div>`
    : `<div class="space-y-2.5 text-xs leading-relaxed">
         <div class="p-3.5 rounded-xl bg-skyBg dark:bg-slate-800 space-y-2">
           <div class="font-bold text-navy dark:text-gold">Android / PC 브라우저 설치 방법</div>
           <p>1. 브라우저 우측 상단 메뉴(<strong>⋮</strong>)를 눌러 주세요.</p>
           <p>2. <strong>[홈 화면에 추가]</strong> 또는 <strong>[앱 설치]</strong>를 선택합니다.</p>
           <p>3. 확인을 누르면 바탕화면에 다산교회 바로가기가 생성됩니다.</p>
         </div>
       </div>`;
  modal.classList.remove('hidden');
}

// =========================================================================
// 5. 상단 바 [아이디 신청 / 비밀번호초기화] 모달 (비로그인 가능)
// =========================================================================
async function openIdPasswordModal() {
  if (state.currentIdToken && (ROLE_LEVEL[state.currentRole] || 1) >= 2) {
    const srv = SERVICES.find(s => s.id === 'PGM_FAI_DRK');
    if (srv) { await openServiceModal(srv); return; }
  }
  const modal = document.getElementById('service-modal');
  document.getElementById('modal-icon').textContent = '🔑';
  document.getElementById('modal-title').textContent = '아이디 신청 / 비밀번호 초기화';
  document.getElementById('modal-subtitle').textContent = '비로그인 상태에서도 바로 접수 가능합니다';
  document.getElementById('modal-body').innerHTML = `
    <form onsubmit="handlePublicIdResetSubmit(event)" class="space-y-3">
      <div class="p-3 rounded-xl bg-skyBg dark:bg-slate-800 text-xs text-gray-600 dark:text-slate-300">
        다산교회 Google 계정(<code>@dsc.or.kr</code>) 또는 다락방 아이디 신규 신청·비밀번호 초기화를 접수합니다.
      </div>
      <div>
        <label class="block text-xs font-bold mb-1">요청 구분</label>
        <select name="요청구분(신규발급/비번초기화)" class="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs">
          <option value="아이디 신규신청">아이디 신규 신청</option>
          <option value="비밀번호 초기화">비밀번호 초기화</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-xs font-bold mb-1">성명</label>
          <input name="성명" required placeholder="홍길동" class="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs" />
        </div>
        <div>
          <label class="block text-xs font-bold mb-1">연락처</label>
          <input name="연락처" required placeholder="010-0000-0000" class="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs" />
        </div>
      </div>
      <div>
        <label class="block text-xs font-bold mb-1">요청 사유 / 메모 (선택)</label>
        <input name="비고" placeholder="예: 비밀번호 분실로 초기화 요청" class="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs" />
      </div>
      <button type="submit" class="w-full bg-navy dark:bg-gold text-white dark:text-navyDark font-bold text-xs py-2.5 rounded-xl hover:opacity-90">
        신청 접수하기
      </button>
    </form>`;
  modal.classList.remove('hidden');
}

async function handlePublicIdResetSubmit(e) {
  e.preventDefault();
  const record = Object.fromEntries(new FormData(e.target).entries());
  const res = await callApi('submitPublicDarakbang', { record });
  if (res && res.ok) {
    showToast('✅ 아이디/비밀번호 요청이 정상 접수되었습니다.');
    closeServiceModal();
  } else {
    alert('접수 오류: ' + ((res && res.error) || '잠시 후 다시 시도해 주세요.'));
  }
}

// =========================================================================
// 6. 홈 화면 확장 영역 (외부인: 최소 안내 / 성도 Lv.2+: 나의 신앙 대시보드)
// =========================================================================
function renderPersonalizedCard() {
  const card = document.getElementById('personalized-card');
  if (!card) return;
  const userLv = ROLE_LEVEL[state.currentRole] || 1;

  // 외부인 (비로그인): 화면을 복잡하게 만들지 않는 초간결 1카드
  if (userLv < 2) {
    card.innerHTML = `
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="font-bold text-sm text-navy dark:text-white">성도 로그인</div>
          <p class="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">로그인하면 나의 신앙 대시보드·예배예약이 열립니다.</p>
        </div>
        <button type="button" onclick="handleAuthClick()"
          class="bg-navy dark:bg-gold text-white dark:text-navyDark text-xs font-bold px-3.5 py-2 rounded-xl shrink-0 hover:opacity-90 transition">
          Google 로그인
        </button>
      </div>`;
    return;
  }

  // 성도(Lv.2) 이상: 나의 신앙 대시보드 확장 표시
  const profile = state.currentUserProfile;
  const isRealAuth = Boolean(state.currentIdToken) && Boolean(profile);
  const userName = isRealAuth ? sanitizeMemberName(profile.name) : `${state.currentRole} (시연)`;
  const talentDisplay = isRealAuth ? `${Number(profile.talent || 0).toLocaleString()} T` : '120 T';
  const groupDisplay = isRealAuth ? (profile.groupName || profile['소속반'] || '미배정') : '겸손반';
  const attDisplay = isRealAuth ? (profile.attendanceRate || '0회 출석') : '3회 출석';

  card.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800 space-y-3.5">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5">
          <span class="text-sm font-bold text-navy dark:text-white">🌟 나의 신앙 대시보드</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-goldLight dark:bg-amber-900/40 text-amber-900 dark:text-gold">
            Lv.${userLv} ${state.currentRole}
          </span>
        </div>
        <span class="text-[11px] font-semibold ${isRealAuth ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">
          ${userName}
        </span>
      </div>

      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="bg-skyBg dark:bg-slate-800 p-2.5 rounded-xl">
          <div class="text-[10px] text-gray-500 dark:text-slate-400">누적 달란트</div>
          <div class="text-sm font-bold text-navy dark:text-gold mt-0.5">${talentDisplay}</div>
        </div>
        <div class="bg-skyBg dark:bg-slate-800 p-2.5 rounded-xl">
          <div class="text-[10px] text-gray-500 dark:text-slate-400">소그룹반</div>
          <div class="text-sm font-bold text-navy dark:text-white mt-0.5">${groupDisplay}</div>
        </div>
        <div class="bg-skyBg dark:bg-slate-800 p-2.5 rounded-xl">
          <div class="text-[10px] text-gray-500 dark:text-slate-400">금월 출석</div>
          <div class="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">${attDisplay}</div>
        </div>
      </div>

      <div class="grid grid-cols-4 gap-1.5 pt-1">
        <button type="button" onclick="openServiceById('PGM_WOR_RESV')"
          class="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/80 dark:border-amber-700/40 text-amber-900 dark:text-gold text-[11px] font-bold">
          <span>🎟️</span><span>예배예약</span>
        </button>
        <button type="button" onclick="openServiceById('PGM_WOR_ATT')"
          class="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-skyBg dark:bg-slate-800 text-navy dark:text-slate-100 text-[11px] font-bold">
          <span>✅</span><span>출석체크</span>
        </button>
        <button type="button" onclick="openServiceById('PGM_FAI_TAL')"
          class="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-skyBg dark:bg-slate-800 text-navy dark:text-slate-100 text-[11px] font-bold">
          <span>🏆</span><span>달란트</span>
        </button>
        <button type="button" onclick="openServiceById('PGM_FAI_OFF')"
          class="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-skyBg dark:bg-slate-800 text-navy dark:text-slate-100 text-[11px] font-bold">
          <span>🔒</span><span>헌금조회</span>
        </button>
      </div>

      ${userLv >= 3 ? `
        <button type="button" onclick="openServiceById('PGM_WOR_STAT')"
          class="w-full py-2 rounded-xl bg-navy/5 dark:bg-slate-800 border border-navy/15 dark:border-slate-700 text-navy dark:text-gold text-xs font-bold hover:opacity-90 transition">
          👥 [제직+] 금주 예배 참석예상인원 현황 보기 →
        </button>
      ` : ''}
    </div>`;
}

// =========================================================================
// 7. 하단 고정 네비게이션 탭 전환 & 서브 뷰 렌더링
// =========================================================================
function switchBottomTab(tab) {
  state.currentTab = tab;
  ['home', 'worship', 'work', 'bulletin', 'my'].forEach(t => {
    const view = document.getElementById('tab-view-' + t);
    if (view) view.classList.toggle('hidden', t !== tab);
  });

  document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
    const active = btn.getAttribute('data-tab') === tab;
    btn.className = active
      ? 'bottom-nav-btn flex flex-col items-center justify-center gap-0.5 text-navy dark:text-gold font-bold transition'
      : 'bottom-nav-btn flex flex-col items-center justify-center gap-0.5 text-gray-500 dark:text-slate-400 font-medium transition';
  });

  if (tab === 'worship') renderWorshipTab();
  if (tab === 'work') renderWorkTab();
  if (tab === 'bulletin') renderBulletinTab();
  if (tab === 'my') renderMyTab();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderWorshipTab() {
  const el = document.getElementById('tab-view-worship');
  if (!el) return;
  const userLv = ROLE_LEVEL[state.currentRole] || 1;
  const slots = getUpcomingWorshipSlots();
  el.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800 space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="font-bold text-base text-navy dark:text-white">📅 예배참석예약 · 현황</h2>
        <span class="text-[11px] font-bold text-amber-700 dark:text-gold">예약출석 달란트 1.5배</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button type="button" onclick="openServiceById('PGM_WOR_RESV')"
          class="p-3.5 rounded-xl bg-navy dark:bg-gold text-white dark:text-navyDark text-left space-y-1 shadow-sm">
          <div class="font-bold text-sm">🎟️ 예배참석예약하기</div>
          <div class="text-[11px] opacity-85">하루전 ~ 3시간전 예약 (성도 Lv.2+)</div>
        </button>
        <button type="button" onclick="openServiceById('PGM_WOR_STAT')"
          class="p-3.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-skyBg dark:bg-slate-800 text-left space-y-1 ${userLv < 3 ? 'opacity-60' : ''}">
          <div class="font-bold text-sm text-navy dark:text-white">${userLv < 3 ? '🔒 ' : ''}👥 참석예상인원 현황</div>
          <div class="text-[11px] text-gray-500 dark:text-slate-400">예배별·소그룹반별 예상인원 (제직 Lv.3+)</div>
        </button>
      </div>
      <div class="pt-2 border-t border-gray-100 dark:border-slate-800 space-y-2">
        <div class="text-xs font-bold text-gray-600 dark:text-slate-300">다가오는 정기 예배</div>
        ${slots.map(s => `
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-skyBg/70 dark:bg-slate-800 text-xs">
            <span class="font-bold text-navy dark:text-white">${s.name} (${s.dateStr})</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${s.isOpen ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300'}">
              ${s.isOpen ? '예약 진행중' : s.isClosed ? '마감' : '오픈 예정'}
            </span>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800">
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-bold text-sm text-navy dark:text-white">📋 주간 예배담당표</h3>
        <button type="button" onclick="openServiceById('PGM_SVC_DUTY')" class="text-xs font-bold text-navy dark:text-gold hover:underline">크게 보기 →</button>
      </div>
      <div id="worship-duty-inline"></div>
    </div>`;
  try {
    new WeeklyDutyModule({ container: '#worship-duty-inline' }).mount();
  } catch (e) {}
}

function renderWorkTab() {
  const el = document.getElementById('tab-view-work');
  if (!el) return;
  const userLv = ROLE_LEVEL[state.currentRole] || 1;
  const categories = ['ALL', '예배·신앙', '성도·편의', '전자신청', '예배·봉사', '대외·안내', '행정·시스템'];
  const visibleList = SERVICES.filter(s => {
    if (!s.active && userLv < 5) return false;
    if (state.currentCategory !== 'ALL' && s.cat !== state.currentCategory) return false;
    return true;
  });

  el.innerHTML = `
    <div class="flex items-center justify-between">
      <div>
        <h2 class="font-bold text-base text-navy dark:text-white">🧩 전체 업무 클래스</h2>
        <p class="text-[11px] text-gray-500 dark:text-slate-400">현재 권한: Lv.${userLv} ${state.currentRole}</p>
      </div>
    </div>
    <div class="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
      ${categories.map(c => `
        <button type="button" onclick="filterWorkCategory('${c}')"
          class="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
            state.currentCategory === c
              ? 'bg-navy text-white border-navy dark:bg-gold dark:text-navyDark dark:border-gold'
              : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 border-gray-200 dark:border-slate-700'
          }">
          ${c === 'ALL' ? '전체' : c}
        </button>
      `).join('')}
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      ${visibleList.map(srv => {
        const unlocked = userLv >= srv.minRole && srv.active;
        const reqRole = getRoleNameByLevel(srv.minRole);
        return `
          <button type="button" onclick="openServiceById('${srv.id}')"
            class="text-left rounded-2xl p-3.5 border transition flex flex-col justify-between gap-2 ${
              unlocked
                ? 'bg-white dark:bg-slate-900 border-gray-200/80 dark:border-slate-800 hover:border-navy dark:hover:border-gold shadow-sm'
                : 'bg-gray-100/80 dark:bg-slate-900/40 border-gray-200 dark:border-slate-800 opacity-60'
            }">
            <div class="flex items-center justify-between w-full">
              <span class="text-xl">${srv.icon}</span>
              <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${
                !srv.active
                  ? 'bg-gray-200 text-gray-500'
                  : unlocked
                    ? 'bg-skyBg dark:bg-slate-800 text-navy dark:text-gold'
                    : 'bg-gray-200 dark:bg-slate-800 text-gray-500'
              }">
                ${!srv.active ? '27년 예정' : (unlocked ? reqRole + '+' : '🔒 ' + reqRole + '+')}
              </span>
            </div>
            <div>
              <div class="font-bold text-xs text-gray-900 dark:text-white leading-snug">${srv.title}</div>
              <div class="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5 line-clamp-1">${srv.desc}</div>
            </div>
          </button>`;
      }).join('')}
    </div>`;
}

function renderBulletinTab() {
  const el = document.getElementById('tab-view-bulletin');
  if (!el) return;
  const bulletins = state.hubCache.bulletins || [];
  const events = state.hubCache.events || [];
  el.innerHTML = `
    <div class="bg-navyDark text-white rounded-2xl p-4 space-y-2 shadow-sm">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-gold">📖 오늘의 말씀 · 갓모닝</span>
        <button type="button" onclick="shareKakaoDevotion()" class="text-[11px] font-bold bg-gold text-navyDark px-2.5 py-1 rounded-lg">
          💬 카톡 공유 복사
        </button>
      </div>
      <p id="daily-verse-text" class="text-xs sm:text-sm leading-relaxed">
        "너희는 세상의 빛이라 산 위에 있는 동네가 숨겨지지 못할 것이요" (마태복음 5:14)
      </p>
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800 space-y-2.5">
      <div class="flex items-center justify-between">
        <h3 class="font-bold text-sm text-navy dark:text-white">📄 최근 예배주보 (PDF)</h3>
        <a href="${CONFIG.FOLDERS.BULLETIN}" target="_blank" class="text-xs font-bold text-navy dark:text-gold hover:underline">전체 폴더 →</a>
      </div>
      ${bulletins.length ? bulletins.slice(0, 4).map((b, i) => `
        <a href="${b.url}" target="_blank" class="flex items-center justify-between p-2.5 rounded-xl bg-skyBg/70 dark:bg-slate-800 text-xs hover:opacity-90">
          <span class="font-semibold text-navy dark:text-white truncate">${i === 0 ? '🆕 ' : ''}${b.name}</span>
          <span class="text-[10px] text-gray-500 shrink-0 ml-2">${(b.updated || '').slice(0, 10)}</span>
        </a>
      `).join('') : `<p class="text-xs text-gray-500">주보 폴더에서 최신 주보를 열람할 수 있습니다.</p>`}
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800 space-y-2">
      <h3 class="font-bold text-sm text-navy dark:text-white">🗓️ 다산교회 주요 일정</h3>
      <ul class="space-y-2 text-xs">
        ${(events.length ? events.slice(0, 5) : [
          { title: '안식일학교 및 대예배', location: '본당 · 매주 토 09:30 / 10:00' },
          { title: '화요기도·말씀예배', location: '본당 · 매주 화 19:30' },
          { title: '금요저녁예배', location: '본당 · 매주 금 19:30' }
        ]).map(ev => `
          <li class="flex items-center justify-between pb-1.5 border-b border-gray-100 dark:border-slate-800 last:border-none">
            <span class="font-semibold text-navy dark:text-slate-100">${ev.title}</span>
            <span class="text-[11px] text-gray-500">${ev.location || ''}</span>
          </li>
        `).join('')}
      </ul>
    </div>`;
}

function renderMyTab() {
  const el = document.getElementById('tab-view-my');
  if (!el) return;
  const userLv = ROLE_LEVEL[state.currentRole] || 1;
  el.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800 space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <div class="font-bold text-sm text-navy dark:text-white">
            ${state.currentUserProfile ? sanitizeMemberName(state.currentUserProfile.name) : state.currentRole}
          </div>
          <div class="text-xs text-gray-500 dark:text-slate-400">현재 등급: Lv.${userLv} ${state.currentRole}</div>
        </div>
        <button type="button" onclick="handleAuthClick()"
          class="bg-navy dark:bg-gold text-white dark:text-navyDark text-xs font-bold px-3.5 py-2 rounded-xl">
          ${userLv >= 2 ? '로그아웃' : 'Google 로그인'}
        </button>
      </div>
      ${userLv >= 2 ? `
        <div class="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-xs">
          <span class="font-semibold text-amber-900 dark:text-amber-200">세션 자동 유지 (새로고침 유지 · 10분)</span>
          <button type="button" onclick="handleExtendSession()" class="bg-amber-500 text-white font-bold px-2.5 py-1 rounded-lg">10분 연장</button>
        </div>
      ` : ''}
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800 space-y-2.5">
      <div class="font-bold text-sm text-navy dark:text-white">🎭 5단계 권한 시연 (목회자·직원 미리보기)</div>
      <div class="grid grid-cols-1 gap-1.5">
        ${ROLE_DEFS.map(r => `
          <button type="button" onclick="changePreviewRole('${r.key}')"
            class="flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition ${
              state.currentRole === r.key
                ? 'bg-navy text-white border-navy dark:bg-gold dark:text-navyDark dark:border-gold'
                : 'bg-skyBg/60 dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700'
            }">
            <span>${r.label}</span>
            <span>${state.currentRole === r.key ? '● 선택됨' : '전환'}</span>
          </button>
        `).join('')}
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2.5">
      <button type="button" onclick="triggerInstallShortcut()"
        class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-xs font-bold text-navy dark:text-white">
        📲 바탕화면 바로가기
      </button>
      <button type="button" onclick="openIdPasswordModal()"
        class="p-3 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-xs font-bold text-navy dark:text-white">
        🔑 아이디/비번 초기화
      </button>
    </div>`;
}

// =========================================================================
// 8. 공통 업무 클래스 모달 실행기
// =========================================================================
function closeServiceModal() {
  document.getElementById('service-modal')?.classList.add('hidden');
}

async function openServiceById(id) {
  const srv = SERVICES.find(s => s.id === id);
  if (!srv) return;
  await openServiceModal(srv);
}

async function openServiceModal(srv) {
  const userLv = ROLE_LEVEL[state.currentRole] || 1;
  if (!srv.active && userLv < 5) {
    alert(`[2027년 순차 오픈 예정] '${srv.title}' 업무는 추후 일정에 따라 오픈될 예정입니다.`);
    return;
  }
  if (userLv < srv.minRole) {
    alert(`[접근 제한] '${srv.title}' 업무는 [${getRoleNameByLevel(srv.minRole)}] 등급(Lv.${srv.minRole}) 이상 로그인 후 이용하실 수 있습니다.`);
    return;
  }
  if (srv.actionKey === 'openBulletinModal') { openBulletinModal(); return; }
  if (srv.url && srv.url.startsWith('http')) { window.open(srv.url, '_blank'); return; }

  const modal = document.getElementById('service-modal');
  const body = document.getElementById('modal-body');
  document.getElementById('modal-icon').textContent = srv.icon;
  document.getElementById('modal-title').textContent = srv.title;
  document.getElementById('modal-subtitle').textContent = srv.sheet ? `연동 DB: ${srv.sheet}` : srv.desc;

  if (srv.moduleKey && MODULE_REGISTRY[srv.moduleKey]) {
    const ModClass = MODULE_REGISTRY[srv.moduleKey];
    const mod = new ModClass({ viewMode: getViewMode(), guideTab: srv.guideTab });
    body.innerHTML = `<div class="py-10 text-center text-xs text-gray-500">⏳ 데이터를 불러오는 중입니다...</div>`;
    modal.classList.remove('hidden');
    if (typeof mod.renderHtml === 'function') {
      body.innerHTML = await mod.renderHtml();
      if (typeof mod.bindEvents === 'function') mod.bindEvents(body);
    } else if (typeof mod.mount === 'function') {
      body.innerHTML = `<div id="modal-mount-slot"></div>`;
      mod.container = '#modal-mount-slot';
      mod.mount();
    }
    return;
  }

  // 범용 폼 + 시트 조회 모달
  const formHtml = srv.formFields ? `
    <form onsubmit="submitServiceForm(event, '${srv.sheet}')" class="p-3.5 rounded-xl bg-skyBg dark:bg-slate-800 border border-gray-200 dark:border-slate-700 space-y-2.5">
      <div class="font-bold text-navy dark:text-gold text-xs">✍️ 신규 신청 / 등록</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        ${srv.formFields.map(f => `
          <div>
            <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-0.5">${f}</label>
            <input name="${f}" required class="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs" placeholder="${f} 입력" />
          </div>
        `).join('')}
      </div>
      <button type="submit" class="bg-navy dark:bg-gold text-white dark:text-navyDark font-bold text-xs px-4 py-2 rounded-lg">
        저장하기
      </button>
    </form>` : '';

  body.innerHTML = `${formHtml}<div id="modal-sheet-data" class="text-center py-6 text-xs text-gray-500">${
    state.currentIdToken ? '⏳ 실시간 데이터 조회 중...' : '💡 Google 로그인 후 실제 DB 내역이 조회됩니다.'
  }</div>`;
  modal.classList.remove('hidden');

  if (state.currentIdToken && srv.sheet) {
    if (srv.sheet === 'Users_Master') await loadSmallGroupMaster();
    const res = await callApi('querySheet', { sheetName: srv.sheet });
    const container = document.getElementById('modal-sheet-data');
    if (res && res.ok && res.rows && res.rows.length) {
      const cols = Object.keys(res.rows[0]).filter(k => !k.startsWith('_')).slice(0, 5);
      container.innerHTML = `
        <div class="overflow-x-auto text-left">
          <table class="w-full text-xs border-collapse">
            <thead><tr class="bg-gray-100 dark:bg-slate-800 border-b">${cols.map(c => `<th class="p-2 font-bold">${c}</th>`).join('')}</tr></thead>
            <tbody>${res.rows.slice(0, 15).map(r => `<tr class="border-b border-gray-100 dark:border-slate-800">${cols.map(c => `<td class="p-2">${r[c] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>`;
    } else {
      container.textContent = (res && res.error) || '조회된 내역이 없습니다.';
    }
  }
}

function openBulletinModal() {
  const modal = document.getElementById('service-modal');
  document.getElementById('modal-icon').textContent = '📄';
  document.getElementById('modal-title').textContent = '다산교회 예배주보';
  document.getElementById('modal-subtitle').textContent = 'Google Drive 실시간 동기화';
  const listHtml = (state.hubCache.bulletins || []).map((b, idx) => `
    <div class="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-skyBg/50 dark:bg-slate-800">
      <div class="min-w-0 pr-2">
        <div class="font-bold text-xs text-navy dark:text-white truncate">${idx === 0 ? '🆕 ' : ''}${b.name}</div>
        <div class="text-[10px] text-gray-500">${(b.updated || '').slice(0, 10)}</div>
      </div>
      <a href="${b.url}" target="_blank" class="bg-navy dark:bg-gold text-white dark:text-navyDark text-xs font-bold px-3 py-1.5 rounded-lg shrink-0">열람</a>
    </div>`).join('');
  document.getElementById('modal-body').innerHTML = `<div class="space-y-2.5">${listHtml || '<p class="text-xs text-gray-500">주보 폴더에서 최신 주보를 확인하세요.</p>'}</div>`;
  modal.classList.remove('hidden');
}

function openRoleDemoModal() {
  const modal = document.getElementById('service-modal');
  document.getElementById('modal-icon').textContent = '🎭';
  document.getElementById('modal-title').textContent = '5단계 권한 시연 전환';
  document.getElementById('modal-subtitle').textContent = '권한별 화면 변화를 즉시 확인합니다 (10분 세션 유지)';
  document.getElementById('modal-body').innerHTML = `
    <div class="space-y-2">
      ${ROLE_DEFS.map(r => `
        <button type="button" onclick="changePreviewRole('${r.key}'); closeServiceModal();"
          class="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-bold transition ${
            state.currentRole === r.key
              ? 'bg-navy text-white border-navy dark:bg-gold dark:text-navyDark dark:border-gold'
              : 'bg-skyBg dark:bg-slate-800 text-gray-700 dark:text-slate-200 border-gray-200 dark:border-slate-700'
          }">
          <span>${r.label}</span>
          <span>${state.currentRole === r.key ? '● 현재' : '선택'}</span>
        </button>
      `).join('')}
    </div>`;
  modal.classList.remove('hidden');
}

// =========================================================================
// 9. 세션 타이머 UI 동기화 & 로그인/로그아웃/권한 전환
// =========================================================================
function syncSessionHeaderUI() {
  const timerBox = document.getElementById('session-timer-box');
  const authBtn = document.getElementById('auth-btn');
  const userLv = ROLE_LEVEL[state.currentRole] || 1;

  if (userLv >= 2) {
    if (timerBox) { timerBox.classList.remove('hidden'); timerBox.classList.add('flex'); }
    if (authBtn) authBtn.textContent = '로그아웃';
    startSessionTimer(
      (mmss) => {
        const el = document.getElementById('session-countdown');
        if (el) el.textContent = mmss;
      },
      () => {
        performLogout(true);
      }
    );
  } else {
    stopSessionTimer();
    if (timerBox) { timerBox.classList.add('hidden'); timerBox.classList.remove('flex'); }
    if (authBtn) authBtn.textContent = '로그인';
  }
}

function performLogout(expired = false) {
  clearSession();
  state.currentIdToken = '';
  state.currentUserProfile = null;
  state.currentRole = '외부인';
  syncSessionHeaderUI();
  refreshActiveViews();
  if (expired) {
    showToast('⏱ 10분 세션이 만료되어 자동 로그아웃되었습니다.');
  } else {
    showToast('로그아웃되었습니다.');
  }
}

function handleExtendSession() {
  if (extendSession()) {
    syncSessionHeaderUI();
    showToast('✅ 로그인 세션이 10분 연장되었습니다.');
  }
}

function changePreviewRole(rawRole, skipSave = false) {
  const role = normalizeRoleName(rawRole);
  state.currentRole = role;
  if (!skipSave) {
    if (role === '외부인') {
      clearSession();
    } else {
      saveSession({
        idToken: state.currentIdToken,
        userProfile: state.currentUserProfile,
        role,
        isPreview: !state.currentIdToken
      });
    }
  }
  syncSessionHeaderUI();
  refreshActiveViews();
}

function handleAuthClick() {
  if ((ROLE_LEVEL[state.currentRole] || 1) >= 2 || state.currentIdToken) {
    performLogout(false);
    return;
  }

  if (CONFIG.GOOGLE_CLIENT_ID && window.google?.accounts?.id) {
    window.google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: async (response) => {
        state.currentIdToken = response.credential;
        try {
          const res = await callApi('getSessionProfile');
          if (res && res.ok && res.user) {
            state.currentUserProfile = res.user;
            await loadSmallGroupMaster();
            const resolvedRole = normalizeRoleName(res.user.role || '외부인');
            saveSession({ idToken: state.currentIdToken, userProfile: res.user, role: resolvedRole, isPreview: false });
            changePreviewRole(resolvedRole, true);
            showToast(`✅ ${res.user.name}님 환영합니다 (${resolvedRole})`);
          } else {
            performLogout(false);
            alert((res && res.error) || '로그인 검증에 실패했습니다.');
          }
        } catch (err) {
          performLogout(false);
          alert('로그인 오류: ' + err.message);
        }
      }
    });
    window.google.accounts.id.prompt();
  } else {
    changePreviewRole('성도');
  }
}

function refreshActiveViews() {
  renderPersonalizedCard();
  if (state.currentTab === 'worship') renderWorshipTab();
  if (state.currentTab === 'work') renderWorkTab();
  if (state.currentTab === 'bulletin') renderBulletinTab();
  if (state.currentTab === 'my') renderMyTab();
}

// =========================================================================
// 10. 폼 전송 핸들러 (예배참석예약 · 출석 · 다락방 · 서적 · 범용)
// =========================================================================
async function handleWorshipReserveSubmit(e, dateStr, serviceName, isOpen) {
  e.preventDefault();
  if (!state.currentIdToken) {
    showToast(`✅ [시연] ${serviceName}(${dateStr}) 예약 완료! 출석 시 달란트 1.5배 적용`);
    closeServiceModal();
    return;
  }
  if (!isOpen) {
    alert('예배참석예약은 예배 24시간 전부터 3시간 전까지만 가능합니다.');
    return;
  }
  const fd = Object.fromEntries(new FormData(e.target).entries());
  const record = {
    '예배일자': dateStr,
    '예배구분': serviceName,
    '소속반': fd['소속반'] || '',
    '참석유형': fd['참석유형'] || '대면',
    '동반인원': Number(fd['동반인원'] || 0),
    '달란트배율': 1.5,
    '상태': '예약완료'
  };
  const res = await callApi('insertRow', { sheetName: 'Worship_Reservations', record });
  if (res && res.ok) {
    showToast('✅ 예배참석예약 완료! 출석 시 달란트 1.5배가 적립됩니다.');
    await openServiceById('PGM_WOR_RESV');
  } else {
    alert('예약 오류: ' + ((res && res.error) || '다시 시도해 주세요.'));
  }
}

async function handleDarakbangSubmit(e) {
  e.preventDefault();
  const record = Object.fromEntries(new FormData(e.target).entries());
  const action = state.currentIdToken ? 'insertRow' : 'submitPublicDarakbang';
  const res = await callApi(action, { sheetName: 'Darakbang_Requests', record });
  if (res && res.ok) {
    showToast('✅ 다락방 신청이 접수되었습니다.');
    closeServiceModal();
  } else {
    alert('신청 오류: ' + ((res && res.error) || '확인 후 다시 시도해 주세요.'));
  }
}

async function handleBookRequestSubmit(e) {
  e.preventDefault();
  if (!state.currentIdToken) { alert('Google 로그인 후 이용하실 수 있습니다.'); return; }
  const record = Object.fromEntries(new FormData(e.target).entries());
  record['수량'] = Number(record['수량'] || 1);
  const res = await callApi('insertRow', { sheetName: 'Book_Requests', record });
  if (res && res.ok) { showToast('✅ 서적 신청이 등록되었습니다.'); await openServiceById('PGM_FAI_BOOK'); }
  else alert('오류: ' + ((res && res.error) || '권한 확인 필요'));
}

async function handleAttendanceSubmit(e) {
  e.preventDefault();
  if (!state.currentIdToken) { alert('Google 로그인 후 출석 저장이 가능합니다.'); return; }
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const fd = Object.fromEntries(new FormData(e.target).entries());
  const serviceDate = fd['예배일자'] || localToday;
  const serviceType = fd['예배구분(화/금/안)'] || getDefaultWorshipByDate(serviceDate);
  const check = validateAttendanceDateAndService(serviceDate, serviceType);
  if (!check.valid) {
    if (check.hardBlock) { alert(check.message); return; }
    if (!confirm(check.message)) return;
  }

  const actorName = (state.currentUserProfile && state.currentUserProfile.name) || '성도';
  const actorUserId = (state.currentUserProfile && (state.currentUserProfile.userId || state.currentUserProfile.email)) || '';
  const canProxy = (ROLE_LEVEL[state.currentRole] || 1) >= 3;
  const targetName = (canProxy && String(fd['대상성명'] || '').trim()) || actorName;
  const matched = await resolveGroupByMemberName(targetName, canProxy ? fd['대상User_ID'] : actorUserId);

  const record = {
    Record_ID: 'ATT-' + Date.now(),
    '예배일자': serviceDate,
    '예배구분(화/금/안)': serviceType,
    '예배구분': serviceType,
    User_ID: matched.userId || actorUserId,
    '성명': targetName,
    '소속반': matched.groupName || '',
    '출석상태': fd['출석상태'] || '출석',
    '입력자': actorName
  };

  const res = await callApi('insertRow', { sheetName: 'Attendance_Log', record });
  if (res && res.ok) {
    const bonusMsg = res.bonusTalent ? ` (🎉 사전예약 달란트 1.5배 ${res.bonusTalent}T 자동 적립!)` : '';
    alert(`✅ ${targetName}님 출석이 등록되었습니다.${bonusMsg}`);
    await openServiceById('PGM_WOR_ATT');
  } else {
    alert('등록 오류: ' + ((res && res.error) || '권한을 확인해 주세요.'));
  }
}

async function submitServiceForm(e, sheetName) {
  e.preventDefault();
  if (!state.currentIdToken) { alert('Google 로그인 후 DB 저장이 가능합니다.'); return; }
  const record = Object.fromEntries(new FormData(e.target).entries());
  const res = await callApi('insertRow', { sheetName, record });
  if (res && res.ok) { showToast('✅ 정상 등록되었습니다.'); closeServiceModal(); }
  else alert('등록 오류: ' + ((res && res.error) || '권한을 확인해 주세요.'));
}

// =========================================================================
// 11. 초기 데이터 연동 & 카운트다운 & 이벤트 브리지
// =========================================================================
async function loadPublicHubData() {
  const statusDot = document.getElementById('api-status-dot');
  const result = await fetchPublicHubData();
  state.hubCache = result.data;

  if (statusDot) {
    if (result.status === 'live') {
      statusDot.innerHTML = '🟢 실시간 연동됨';
      statusDot.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 whitespace-nowrap';
    } else {
      statusDot.innerHTML = '🟡 기본 허브 모드';
      statusDot.className = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 whitespace-nowrap';
    }
  }
  gallerySlider.setItems(state.hubCache.galleries);
  if (state.currentTab === 'bulletin') renderBulletinTab();
}

function updateWorshipCountdown() {
  const nearest = getUpcomingWorshipSlots()[0];
  if (!nearest) return;
  const diff = Math.max(0, nearest.target - new Date());
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff / 3600000) % 24);
  const mins = Math.floor((diff / 60000) % 60);
  const secs = Math.floor((diff / 1000) % 60);
  const lbl = document.getElementById('next-worship-label');
  const cd = document.getElementById('worship-countdown');
  if (lbl) lbl.textContent = `다음 ${nearest.name}까지`;
  if (cd) cd.textContent = `${days > 0 ? days + '일 ' : ''}${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function shareKakaoDevotion() {
  const verse = document.getElementById('daily-verse-text')?.textContent.trim() || '"너희는 세상의 빛이라" (마 5:14)';
  const text = `[다산교회 오늘의 말씀]\n${verse}\n▶ 온라인예배: https://www.youtube.com/@sda5239`;
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => showToast('💬 말씀이 복사되었습니다. 카톡에 붙여넣어 주세요!'));
  else alert(text);
}

// 터치 스와이프 지원 (활동사진 슬라이더)
function bindGallerySwipe() {
  const stage = document.getElementById('gallery-slider-stage');
  if (!stage) return;
  let startX = 0;
  stage.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) gallerySlider.step(dx < 0 ? 1 : -1);
  }, { passive: true });
}

Object.assign(window, {
  toggleTheme,
  switchBottomTab,
  triggerInstallShortcut,
  openIdPasswordModal,
  handlePublicIdResetSubmit,
  openRoleDemoModal,
  changePreviewRole,
  handleAuthClick,
  handleExtendSession,
  stepGallerySlide: (d) => gallerySlider.step(d),
  setGalleryDirection: (d) => gallerySlider.setDirection(d),
  filterWorkCategory: (c) => { state.currentCategory = c; renderWorkTab(); },
  openServiceById,
  closeServiceModal,
  openBulletinModal,
  shareKakaoDevotion,
  handleWorshipReserveSubmit,
  handleDarakbangSubmit,
  handleBookRequestSubmit,
  handleAttendanceSubmit,
  filterAttendanceRecords,
  resetAttendanceSearch,
  syncWorshipTypeByDate: (dateStr) => {
    const sel = document.getElementById('att-service-select');
    if (sel) sel.innerHTML = renderWorshipOptionsHtml(dateStr);
  },
  handleProgramRoleToggle: (idx, lv) => { SERVICES[idx].minRole = Number(lv); showToast(`권한 변경: Lv.${lv}`); },
  handleProgramActiveToggle: (idx) => { SERVICES[idx].active = !SERVICES[idx].active; openServiceById('PGM_SYS_AUTH'); },
  submitServiceForm,
  refreshUserDashboard: () => renderPersonalizedCard()
});

function initPortalApp() {
  initTheme();
  loadFavorites();
  gallerySlider.render();
  bindGallerySwipe();

  // 새로고침 시 10분 세션 자동 복원
  const saved = loadSession();
  if (saved) {
    state.currentIdToken = saved.idToken || '';
    state.currentUserProfile = saved.userProfile || null;
    state.currentRole = normalizeRoleName(saved.role || '외부인');
  }
  syncSessionHeaderUI();
  renderPersonalizedCard();

  updateWorshipCountdown();
  setInterval(updateWorshipCountdown, 1000);
  loadPublicHubData();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPortalApp);
else initPortalApp();