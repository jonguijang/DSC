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
import { AttendanceModule, validateAttendanceDateAndService } from './modules/AttendanceModule.js';

const SESSION_KEY = 'dsc_portal_session_v4';
const QUICK_FAV_KEY = 'dsc_quick_favorites_v1';
const HUB_CACHE_KEY = 'dsc_public_hub_cache_v1';
const HUB_CACHE_TTL_MS = 10 * 60 * 1000;
const ALBUM_BGM_VIDEO_ID = 'aWzWjHUfpvU';
const SESSION_MS = 10 * 60 * 1000;
let sessionTimerHandle = null;

function saveSession(role, profile = null, idToken = '') {
  if (!role || role === '외부인') { localStorage.removeItem(SESSION_KEY); return; }
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    role, profile, idToken, expiresAt: Date.now() + SESSION_MS
  }));
}

function loadSession() {
  try {
    const d = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!d || Date.now() >= d.expiresAt) { localStorage.removeItem(SESSION_KEY); return null; }
    return d;
  } catch (e) { return null; }
}

function extendSession() {
  const d = loadSession();
  if (!d) return false;
  d.expiresAt = Date.now() + SESSION_MS;
  localStorage.setItem(SESSION_KEY, JSON.stringify(d));
  return true;
}

function startSessionLoop(onTick, onExpire) {
  if (sessionTimerHandle) clearInterval(sessionTimerHandle);
  const tick = () => {
    const d = loadSession();
    if (!d) { clearInterval(sessionTimerHandle); onExpire(); return; }
    const sec = Math.max(0, Math.floor((d.expiresAt - Date.now()) / 1000));
    onTick(`${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`);
    if (sec <= 0) { clearInterval(sessionTimerHandle); onExpire(); }
  };
  tick();
  sessionTimerHandle = setInterval(tick, 1000);
}

function showToast(msg) {
  const el = document.getElementById('portal-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(window.__dscToast);
  window.__dscToast = setTimeout(() => el.classList.add('hidden'), 2500);
}

function readCachedHub() {
  try {
    const raw = localStorage.getItem(HUB_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.data || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > HUB_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch (e) {
    return null;
  }
}

function writeCachedHub(data) {
  try {
    localStorage.setItem(HUB_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      data
    }));
  } catch (e) {}
}

// 즐겨찾기(Quick 메뉴) 관리
function getQuickFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(QUICK_FAV_KEY) || 'null');
    if (Array.isArray(saved) && saved.length) return saved;
  } catch (e) {}
  return SERVICES.filter(s => s.active).slice(0, 6).map(s => s.id);
}

function toggleQuickFavorite(serviceId) {
  const current = getQuickFavorites();
  const exists = current.includes(serviceId);
  const next = exists ? current.filter(id => id !== serviceId) : [...current, serviceId];
  localStorage.setItem(QUICK_FAV_KEY, JSON.stringify(next));
  showToast(exists ? '즐겨찾기에서 해제했습니다.' : '⭐ Quick 메뉴에 추가했습니다.');
  if (state.currentTab === 'my') renderMyTab();
}

function makeSlideSvg(title, sub, c1, c2) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs>
    <rect width='800' height='600' fill='url(#g)'/>
    <circle cx='680' cy='110' r='140' fill='rgba(212,175,55,0.16)'/>
    <text x='50%' y='46%' text-anchor='middle' fill='#d4af37' font-size='44' font-family='sans-serif' font-weight='bold'>${title}</text>
    <text x='50%' y='57%' text-anchor='middle' fill='#ffffff' font-size='22' font-family='sans-serif' opacity='0.9'>${sub}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

const DEFAULT_SLIDES = [
  { thumb: makeSlideSvg('다산교회 안식일예배', '매주 토요일 오전 10:00 · 본당', '#1a252f', '#2c3e50'), title: '안식일학교 및 대예배', sub: '매주 토요일 09:30 / 10:00 · 다산교회 본당' },
  { thumb: makeSlideSvg('화요 · 금요 저녁예배', '말씀과 중보기도로 세워가는 공동체', '#1d3557', '#1a252f'), title: '화요 · 금요 저녁예배', sub: '매주 화·금 저녁 19:30 · 함께 기도해요' },
  { thumb: makeSlideSvg('함께 섬기는 다산교회', '소그룹 · 패스파인더 · 어드벤처러', '#263849', '#141d26'), title: '다산교회 활동앨범', sub: '이어지는 상하 슬라이드로 둘러보는 교회 소식' }
];

function isValidImageSrc(url) {
  const s = String(url || '').trim();
  return s.startsWith('https://') || s.startsWith('http://') || s.startsWith('data:image/');
}

// 한 장이 한쪽으로 흘러가며 다른 쪽에서 다음 사진이 이어져 나오는 상하 슬라이더
const smoothVerticalSlider = {
  items: DEFAULT_SLIDES.slice(),
  index: 0,
  direction: 1, // 1: 아래로 흐르며 다음 사진 진입, -1: 위로 흐르며 다음 사진 진입, 0: 정지
  rafId: null,
  lastTick: 0,
  intervalMs: 4200,
  transitioning: false,
  activeSlot: 'a',

  getSlots() {
    const a = document.getElementById('hero-gallery-img-a');
    const b = document.getElementById('hero-gallery-img-b');
    if (!a || !b) return null;
    return this.activeSlot === 'a' ? { curr: a, next: b } : { curr: b, next: a };
  },

  setItems(albums) {
    const flat = [];
    (albums || []).forEach(alb => (alb.photos || []).forEach(p => {
      const candidate = p && (p.thumb || p.url || p.src);
      if (isValidImageSrc(candidate)) {
        flat.push({
          thumb: candidate.trim(),
          title: alb.title || '다산교회 활동사진',
          sub: p.name || '함께 예배하고 섬기는 다산교회 공동체'
        });
      }
    }));
    this.items = flat.length ? flat.slice(0, 20) : DEFAULT_SLIDES.slice();
    this.index = 0;
    this.renderImmediate();
    this.startLoop();
  },

  preloadImage(src) {
    return new Promise(resolve => {
      const probe = new Image();
      probe.decoding = 'async';
      probe.onload = () => resolve(true);
      probe.onerror = () => resolve(false);
      probe.src = src;
    });
  },

  async step(delta) {
    if (!this.items.length || this.transitioning) return;
    const slots = this.getSlots();
    if (!slots) return;

    this.transitioning = true;
    try {
      const dirSign = delta >= 0 ? 1 : -1;
      const nextIdx = (this.index + delta + this.items.length) % this.items.length;
      const candidate = this.items[nextIdx] || DEFAULT_SLIDES[0];
      const loaded = await this.preloadImage(candidate.thumb);
      const targetItem = loaded ? candidate : DEFAULT_SLIDES[nextIdx % DEFAULT_SLIDES.length];

      const { curr, next } = slots;
      const ease = 'transform 0.72s cubic-bezier(0.22, 1, 0.36, 1)';

      // dirSign === 1: 현재 사진이 아래(+100%)로 흘러가고 다음 사진이 위(-100%)에서 내려와 이어짐
      // dirSign === -1: 현재 사진이 위(-100%)로 흘러가고 다음 사진이 아래(+100%)에서 올라와 이어짐
      next.style.transition = 'none';
      next.src = targetItem.thumb;
      next.style.transform = `translateY(${dirSign > 0 ? '-100%' : '100%'})`;

      curr.style.transition = 'none';
      curr.style.transform = 'translateY(0%)';

      void next.offsetHeight;

      curr.style.transition = ease;
      next.style.transition = ease;
      curr.style.transform = `translateY(${dirSign > 0 ? '100%' : '-100%'})`;
      next.style.transform = 'translateY(0%)';

      const cap = document.getElementById('hero-gallery-caption');
      const sub = document.getElementById('hero-gallery-sub');
      const cnt = document.getElementById('hero-gallery-counter');
      if (cap) cap.textContent = targetItem.title;
      if (sub) sub.textContent = targetItem.sub || '';
      if (cnt) cnt.textContent = `${nextIdx + 1} / ${this.items.length}`;

      await new Promise(r => setTimeout(r, 740));

      this.index = nextIdx;
      this.activeSlot = this.activeSlot === 'a' ? 'b' : 'a';
    } finally {
      this.transitioning = false;
    }
  },

  setDirection(dir) {
    this.direction = dir;
    this.lastTick = performance.now();
    this.updateBtns();
    this.startLoop();
  },

  updateBtns() {
    const active = 'px-2 py-1 rounded-md text-[11px] font-bold bg-navy text-white dark:bg-gold dark:text-navyDark transition';
    const idle = 'px-2 py-1 rounded-md text-[11px] font-bold text-gray-600 dark:text-slate-300 transition';
    const r = document.getElementById('btn-dir-rev');
    const p = document.getElementById('btn-dir-pause');
    const f = document.getElementById('btn-dir-fwd');
    if (r) r.className = this.direction === -1 ? active : idle;
    if (p) p.className = this.direction === 0 ? active : idle;
    if (f) f.className = this.direction === 1 ? active : idle;
  },

  startLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.lastTick = performance.now();
    const loop = now => {
      if (this.direction !== 0 && this.items.length > 1 && !this.transitioning) {
        if (now - this.lastTick >= this.intervalMs) {
          this.lastTick = now;
          this.step(this.direction);
        }
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  },

  renderImmediate() {
    const a = document.getElementById('hero-gallery-img-a');
    const b = document.getElementById('hero-gallery-img-b');
    const item = this.items[this.index] || DEFAULT_SLIDES[0];
    this.activeSlot = 'a';
    if (a) {
      a.onerror = () => {
        a.onerror = null;
        a.src = DEFAULT_SLIDES[0].thumb;
      };
      a.style.transition = 'none';
      a.src = item.thumb;
      a.style.transform = 'translateY(0%)';
    }
    if (b) {
      b.style.transition = 'none';
      b.style.transform = 'translateY(100%)';
    }
    const cap = document.getElementById('hero-gallery-caption');
    const sub = document.getElementById('hero-gallery-sub');
    const cnt = document.getElementById('hero-gallery-counter');
    if (cap) cap.textContent = item.title;
    if (sub) sub.textContent = item.sub || '';
    if (cnt) cnt.textContent = `${this.index + 1} / ${this.items.length}`;
    this.updateBtns();
  }
};

// 앨범 배경음악(BGM) 토글
let bgmPlaying = false;
function toggleAlbumBgm() {
  const bar = document.getElementById('album-bgm-player');
  const wrap = document.getElementById('bgm-iframe-wrap');
  const label = document.getElementById('bgm-label');
  bgmPlaying = !bgmPlaying;

  if (bar) bar.classList.toggle('hidden', !bgmPlaying);
  if (label) label.textContent = bgmPlaying ? 'BGM 정지' : 'BGM 재생';

  if (wrap) {
    wrap.innerHTML = bgmPlaying
      ? `<iframe width="120" height="68" src="https://www.youtube.com/embed/${ALBUM_BGM_VIDEO_ID}?autoplay=1&loop=1&playlist=${ALBUM_BGM_VIDEO_ID}" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"></iframe>`
      : '';
  }
  showToast(bgmPlaying ? '♪ 앨범 배경음악을 재생합니다.' : '♪ 앨범 배경음악을 정지했습니다.');
}

function getUpcomingWorshipSlots() {
  const now = new Date();
  return [
    { name: '화요예배', day: 2, hour: 19, min: 30 },
    { name: '금요저녁예배', day: 5, hour: 19, min: 30 },
    { name: '안식일예배', day: 6, hour: 10, min: 0 }
  ].map(s => {
    const target = new Date(now);
    const diffDays = (s.day - now.getDay() + 7) % 7;
    target.setDate(now.getDate() + diffDays);
    target.setHours(s.hour, s.min, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 7);
    const openAt = new Date(target.getTime() - 24 * 3600 * 1000);
    const closeAt = new Date(target.getTime() - 3 * 3600 * 1000);
    const dateStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    return { ...s, target, openAt, closeAt, dateStr, isOpen: now >= openAt && now <= closeAt, isClosed: now > closeAt };
  }).sort((a, b) => a.target - b.target);
}

// 나의 대시보드 (앨범 위에 배치)
function renderPersonalizedCard() {
  const card = document.getElementById('personalized-card');
  if (!card) return;
  const userLv = ROLE_LEVEL[state.currentRole] || 1;
  const p = state.currentUserProfile;
  const real = Boolean(state.currentIdToken) && Boolean(p);

  if (userLv < 2) {
    card.innerHTML = `
      <div class="bg-white dark:bg-slate-900 rounded-2xl px-3.5 py-2.5 shadow-sm border border-gray-200/80 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
        <span class="font-bold text-navy dark:text-white">나의 대시보드</span>
        <button type="button" onclick="switchBottomTab('my')" class="text-gold font-bold hover:underline">
          ⭐ Quick 메뉴 보기 →
        </button>
      </div>`;
    return;
  }

  card.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-2xl px-3.5 py-2.5 shadow-sm border border-gray-200/80 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
      <div class="flex items-center gap-2 min-w-0">
        <span class="font-bold text-navy dark:text-gold shrink-0">Lv.${userLv} ${state.currentRole}</span>
        <span class="truncate text-gray-600 dark:text-slate-300">${real ? sanitizeMemberName(p.name) : '시연 모드'} · ${real ? (p.groupName || '미배정') : '겸손반'}</span>
      </div>
      <span class="font-bold text-emerald-700 dark:text-emerald-400 shrink-0">${real ? `${Number(p.talent || 0)}T` : '120T'}</span>
    </div>`;
}

// 3단 고정 네비게이션 전환: [전체메뉴] [예배출석및예약] [나의메뉴]
function switchBottomTab(tab) {
  state.currentTab = tab;
  ['all', 'worship', 'my'].forEach(t => {
    const el = document.getElementById('tab-view-' + t);
    if (el) el.classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
    const active = btn.getAttribute('data-tab') === tab;
    btn.className = active
      ? 'bottom-nav-btn flex flex-col items-center justify-center gap-0.5 text-navy dark:text-gold font-bold transition'
      : 'bottom-nav-btn flex flex-col items-center justify-center gap-0.5 text-gray-500 dark:text-slate-400 font-medium transition';
  });
  if (tab === 'worship') renderWorshipTab();
  if (tab === 'my') renderMyTab();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openFullMenuDrawer() {
  const userLv = ROLE_LEVEL[state.currentRole] || 1;
  const modal = document.getElementById('service-modal');
  document.getElementById('modal-icon').textContent = '☰';
  document.getElementById('modal-title').textContent = '전체 업무 메뉴';
  document.getElementById('modal-subtitle').textContent = `현재 권한: Lv.${userLv} ${state.currentRole}`;
  document.getElementById('modal-body').innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      ${SERVICES.filter(s => s.active || userLv >= 5).map(s => {
        const ok = userLv >= s.minRole && s.active;
        return `<button type="button" onclick="closeServiceModal(); openServiceById('${s.id}');"
          class="p-3 rounded-xl border text-left transition ${ok ? 'bg-skyBg/70 dark:bg-slate-800 border-gray-200 dark:border-slate-700' : 'opacity-50 border-gray-200 dark:border-slate-800'}">
          <div class="text-base">${ok ? s.icon : '🔒'}</div>
          <div class="font-bold text-xs text-navy dark:text-white mt-1">${s.title}</div>
          <div class="text-[10px] text-gray-500 truncate">${s.desc}</div>
        </button>`;
      }).join('')}
    </div>`;
  modal.classList.remove('hidden');
}

function renderWorshipTab() {
  const el = document.getElementById('tab-view-worship');
  if (!el) return;
  const slots = getUpcomingWorshipSlots();
  el.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800 space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="font-bold text-sm text-navy dark:text-white">📅 예배참석예약 및 출석</h2>
        <span class="text-[11px] font-bold text-amber-700 dark:text-gold">예약출석 달란트 1.5배</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" onclick="openWorshipReserveForm()"
          class="p-3 rounded-xl bg-navy dark:bg-gold text-white dark:text-navyDark font-bold text-xs text-left">
          🎟️ 예배참석예약<div class="text-[10px] font-normal opacity-85 mt-0.5">24h~3h 전 예약</div>
        </button>
        <button type="button" onclick="openServiceById('PGM_WOR_ATT')"
          class="p-3 rounded-xl bg-skyBg dark:bg-slate-800 text-navy dark:text-white font-bold text-xs text-left border border-gray-200 dark:border-slate-700">
          ✅ 예배 출석체크<div class="text-[10px] font-normal text-gray-500 mt-0.5">화/금/안 출석 등록</div>
        </button>
      </div>
      <div class="space-y-1.5 pt-1">
        ${slots.map(s => `<div class="flex justify-between items-center p-2.5 rounded-xl bg-skyBg/60 dark:bg-slate-800 text-xs">
          <span class="font-bold">${s.name} (${s.dateStr})</span>
          <span class="text-[11px] font-bold ${s.isOpen ? 'text-blue-600' : 'text-gray-500'}">${s.isOpen ? '예약가능' : s.isClosed ? '마감' : '오픈전'}</span>
        </div>`).join('')}
      </div>
    </div>`;
}

// [나의메뉴] = Quick 메뉴(즐겨찾기)
function renderMyTab() {
  const el = document.getElementById('tab-view-my');
  if (!el) return;
  const userLv = ROLE_LEVEL[state.currentRole] || 1;
  const favIds = getQuickFavorites();
  const favServices = SERVICES.filter(s => favIds.includes(s.id) && (s.active || userLv >= 5));

  el.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800 space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="font-bold text-sm text-navy dark:text-white">⭐ Quick 메뉴 (즐겨찾기)</h2>
          <p class="text-[11px] text-gray-500 dark:text-slate-400">자주 쓰는 메뉴를 빠르게 실행하세요</p>
        </div>
        <button type="button" onclick="handleAuthClick()" class="bg-navy dark:bg-gold text-white dark:text-navyDark text-xs font-bold px-3 py-1.5 rounded-xl">
          ${userLv >= 2 ? '로그아웃' : '로그인'}
        </button>
      </div>

      ${favServices.length ? `
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          ${favServices.map(s => {
            const ok = userLv >= s.minRole && s.active;
            return `
              <div class="relative p-3 rounded-xl border bg-skyBg/70 dark:bg-slate-800 border-gray-200 dark:border-slate-700 flex flex-col justify-between gap-2">
                <button type="button" onclick="openServiceById('${s.id}')" class="text-left ${ok ? '' : 'opacity-60'}">
                  <div class="text-base">${ok ? s.icon : '🔒'}</div>
                  <div class="font-bold text-xs text-navy dark:text-white mt-1">${s.title}</div>
                  <div class="text-[10px] text-gray-500 truncate">${s.desc}</div>
                </button>
                <button type="button" onclick="toggleQuickFavorite('${s.id}')"
                  class="self-end text-[10px] font-bold text-amber-600 dark:text-gold hover:underline">
                  ★ 즐겨찾기 해제
                </button>
              </div>`;
          }).join('')}
        </div>` : `<div class="text-center py-4 text-xs text-gray-500">등록된 Quick 메뉴가 없습니다. 아래에서 추가해 주세요.</div>`}
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800 space-y-2">
      <div class="font-bold text-xs text-navy dark:text-white">➕ 즐겨찾기 편집</div>
      <div class="flex flex-wrap gap-1.5">
        ${SERVICES.filter(s => s.active || userLv >= 5).map(s => {
          const isFav = favIds.includes(s.id);
          return `<button type="button" onclick="toggleQuickFavorite('${s.id}')"
            class="px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition ${isFav ? 'bg-gold/20 border-gold text-navy dark:text-gold' : 'bg-skyBg/60 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300'}">
            ${isFav ? '★' : '☆'} ${s.title}
          </button>`;
        }).join('')}
      </div>
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800 space-y-2">
      <div class="font-bold text-xs text-navy dark:text-white">🎭 5단계 권한 시연 (현재: Lv.${userLv} ${state.currentRole})</div>
      <div class="grid grid-cols-1 gap-1.5">
        ${ROLE_DEFS.map(r => `<button type="button" onclick="changePreviewRole('${r.key}')"
          class="flex justify-between px-3 py-2 rounded-xl border text-xs font-bold ${state.currentRole === r.key ? 'bg-navy text-white border-navy dark:bg-gold dark:text-navyDark' : 'bg-skyBg/60 dark:bg-slate-800 border-gray-200 dark:border-slate-700'}">
          <span>${r.label}</span><span>${state.currentRole === r.key ? '● 현재' : '전환'}</span>
        </button>`).join('')}
      </div>
    </div>`;
}

function openWorshipReserveForm() {
  const slots = getUpcomingWorshipSlots();
  const modal = document.getElementById('service-modal');
  document.getElementById('modal-icon').textContent = '🎟️';
  document.getElementById('modal-title').textContent = '예배참석 사전예약';
  document.getElementById('modal-subtitle').textContent = '예약 후 출석 시 달란트 1.5배 적립';
  document.getElementById('modal-body').innerHTML = `
    <form onsubmit="handleWorshipReserveSubmit(event)" class="space-y-3 text-xs">
      <div>
        <label class="block font-bold mb-1">대상 예배</label>
        <select name="예배선택" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700">
          ${slots.map(s => `<option value="${s.dateStr}|${s.name}">${s.name} (${s.dateStr}) ${s.isOpen ? '· 예약가능' : ''}</option>`).join('')}
        </select>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block font-bold mb-1">참석 구분</label>
          <select name="참석유형" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700">
            <option value="대면">대면</option><option value="온라인">온라인</option>
          </select>
        </div>
        <div>
          <label class="block font-bold mb-1">동반 인원</label>
          <input type="number" name="동반인원" min="0" max="10" value="0" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700" />
        </div>
      </div>
      <button type="submit" class="w-full py-2.5 rounded-xl bg-navy dark:bg-gold text-white dark:text-navyDark font-bold">예약 신청하기</button>
    </form>`;
  modal.classList.remove('hidden');
}

async function handleWorshipReserveSubmit(e) {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target).entries());
  const [dateStr, serviceName] = String(fd['예배선택'] || '').split('|');
  if (!state.currentIdToken) {
    showToast(`✅ [시연] ${serviceName}(${dateStr}) 예약 완료`);
    closeServiceModal();
    return;
  }
  const res = await callApi('insertRow', {
    sheetName: 'Worship_Reservations',
    record: { '예배일자': dateStr, '예배구분': serviceName, '참석유형': fd['참석유형'], '동반인원': Number(fd['동반인원'] || 0), '달란트배율': 1.5, '상태': '예약완료' }
  });
  if (res && res.ok) { showToast('✅ 예배참석예약이 등록되었습니다.'); closeServiceModal(); }
  else alert('오류: ' + ((res && res.error) || '권한 확인 필요'));
}

async function renderSheetHistory(sheetName, targetId) {
  const box = document.getElementById(targetId);
  if (!box) return;
  if (!state.currentIdToken) {
    box.innerHTML = `<div class="p-3 rounded-xl bg-gray-50 dark:bg-slate-800 text-gray-500">💡 로그인하면 실제 시트(${sheetName}) 내역이 표시됩니다.</div>`;
    return;
  }
  const res = await callApi('querySheet', { sheetName });
  if (!res || !res.ok) {
    box.innerHTML = `<div class="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300">${(res && res.error) || '조회 실패'}</div>`;
    return;
  }
  const rows = (res.rows || []).slice().reverse().slice(0, 8);
  if (!rows.length) {
    box.innerHTML = `<div class="p-3 rounded-xl bg-gray-50 dark:bg-slate-800 text-gray-500">등록된 내역이 없습니다.</div>`;
    return;
  }

  if (sheetName === 'Talent_Ledger') {
    box.innerHTML = `<div class="font-bold text-navy dark:text-white">최근 달란트 내역</div>` + rows.map(r => `
      <div class="p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="font-bold truncate">${r['활동구분'] || '활동'} · ${Number(r['신청달란트'] || 0)}T</div>
          <div class="text-[11px] text-gray-500 truncate">${r['성명'] || ''} · ${r['증빙메모'] || ''}</div>
        </div>
        <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-gold shrink-0">
          ${r['승인여부'] || '승인대기'}
        </span>
      </div>`).join('');
    return;
  }

  box.innerHTML = `<div class="font-bold text-navy dark:text-white">최근 중보기도 제목</div>` + rows.map(r => `
    <div class="p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-1">
      <div class="flex items-center justify-between text-[11px]">
        <span class="font-bold text-navy dark:text-gold">${r['기도구분'] || '중보기도'} · ${r['성명'] || ''}</span>
        <span class="text-gray-400">${r['공개범위'] || '전체'}</span>
      </div>
      <div class="text-xs text-gray-700 dark:text-slate-200 whitespace-pre-line">${r['기도제목'] || ''}</div>
    </div>`).join('');
}

async function handleTalentSubmit(e) {
  e.preventDefault();
  if (!state.currentIdToken) {
    showToast('✅ [시연] 달란트 신청이 접수되었습니다.');
    closeServiceModal();
    return;
  }
  const fd = Object.fromEntries(new FormData(e.target).entries());
  const res = await callApi('insertRow', {
    sheetName: 'Talent_Ledger',
    record: {
      '활동구분': String(fd['활동구분'] || '').trim(),
      '신청달란트': Number(fd['신청달란트'] || 0),
      '증빙메모': String(fd['증빙메모'] || '').trim(),
      '승인여부': '승인대기'
    }
  });
  if (res && res.ok) {
    showToast('✅ 달란트 신청이 등록되었습니다.');
    await renderSheetHistory('Talent_Ledger', 'talent-history-box');
    e.target.reset();
  } else {
    alert('오류: ' + ((res && res.error) || '달란트 등록에 실패했습니다.'));
  }
}

async function handlePrayerSubmit(e) {
  e.preventDefault();
  if (!state.currentIdToken) {
    showToast('✅ [시연] 중보기도가 등록되었습니다.');
    closeServiceModal();
    return;
  }
  const fd = Object.fromEntries(new FormData(e.target).entries());
  const res = await callApi('insertRow', {
    sheetName: 'Prayer_Requests',
    record: {
      '기도구분': String(fd['기도구분'] || '중보기도').trim(),
      '공개범위': String(fd['공개범위'] || '전체').trim(),
      '기도제목': String(fd['기도제목'] || '').trim()
    }
  });
  if (res && res.ok) {
    showToast('✅ 중보기도 제목이 등록되었습니다.');
    await renderSheetHistory('Prayer_Requests', 'prayer-history-box');
    e.target.reset();
  } else {
    alert('오류: ' + ((res && res.error) || '중보기도 등록에 실패했습니다.'));
  }
}

async function openServiceById(id) {
  const srv = SERVICES.find(s => s.id === id);
  if (!srv) return;
  const userLv = ROLE_LEVEL[state.currentRole] || 1;
  if (userLv < srv.minRole) { alert(`[${getRoleNameByLevel(srv.minRole)}] 등급(Lv.${srv.minRole}) 이상 이용 가능합니다.`); return; }
  if (srv.url && srv.url.startsWith('http')) { window.open(srv.url, '_blank'); return; }

  const modMap = {
    weeklyDuty: WeeklyDutyModule,
    darakbang: DarakbangModule,
    offerings: OfferingsModule,
    bookRequest: BookRequestModule,
    attendance: AttendanceModule
  };
  const modal = document.getElementById('service-modal');
  const body = document.getElementById('modal-body');
  document.getElementById('modal-icon').textContent = srv.icon;
  document.getElementById('modal-title').textContent = srv.title;
  document.getElementById('modal-subtitle').textContent = srv.desc;

  if (srv.moduleKey && modMap[srv.moduleKey]) {
    const Mod = modMap[srv.moduleKey];
    const mod = new Mod({ viewMode: getViewMode() });
    body.innerHTML = `<div class="py-8 text-center text-xs text-gray-500">⏳ 불러오는 중...</div>`;
    modal.classList.remove('hidden');
    if (typeof mod.renderHtml === 'function') { body.innerHTML = await mod.renderHtml(); if (mod.bindEvents) mod.bindEvents(body); }
    else if (typeof mod.mount === 'function') { body.innerHTML = `<div id="mod-slot"></div>`; mod.container = '#mod-slot'; mod.mount(); }
    return;
  }

  if (srv.sheet === 'Talent_Ledger') {
    body.innerHTML = `
      <form onsubmit="handleTalentSubmit(event)" class="space-y-3 text-xs bg-skyBg/60 dark:bg-slate-800/70 p-3.5 rounded-xl border border-gray-200 dark:border-slate-700">
        <div class="font-bold text-navy dark:text-gold">🪙 달란트 적립 신청</div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-bold mb-1">활동구분</label>
            <input name="활동구분" required placeholder="예: 예배섬김, 소그룹모임"
              class="w-full px-3 py-2 rounded-xl border dark:bg-slate-900 dark:border-slate-700" />
          </div>
          <div>
            <label class="block font-bold mb-1">신청달란트</label>
            <input type="number" name="신청달란트" min="1" max="500" required value="10"
              class="w-full px-3 py-2 rounded-xl border dark:bg-slate-900 dark:border-slate-700" />
          </div>
        </div>
        <div>
          <label class="block font-bold mb-1">증빙메모</label>
          <input name="증빙메모" required placeholder="활동 일자 및 세부 내용"
            class="w-full px-3 py-2 rounded-xl border dark:bg-slate-900 dark:border-slate-700" />
        </div>
        <button type="submit" class="w-full py-2.5 rounded-xl bg-navy dark:bg-gold text-white dark:text-navyDark font-bold">
          달란트 신청 등록
        </button>
      </form>
      <div id="talent-history-box" class="space-y-2 text-xs">
        <div class="text-gray-500">⏳ 달란트 내역을 불러오는 중...</div>
      </div>`;
    modal.classList.remove('hidden');
    await renderSheetHistory('Talent_Ledger', 'talent-history-box');
    return;
  }

  if (srv.sheet === 'Prayer_Requests') {
    body.innerHTML = `
      <form onsubmit="handlePrayerSubmit(event)" class="space-y-3 text-xs bg-skyBg/60 dark:bg-slate-800/70 p-3.5 rounded-xl border border-gray-200 dark:border-slate-700">
        <div class="font-bold text-navy dark:text-gold">🙏 중보기도 제목 신청</div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-bold mb-1">기도구분</label>
            <select name="기도구분" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-900 dark:border-slate-700">
              <option value="건강·치유">건강·치유</option>
              <option value="가정·자녀">가정·자녀</option>
              <option value="신앙·사명">신앙·사명</option>
              <option value="교회·선교">교회·선교</option>
            </select>
          </div>
          <div>
            <label class="block font-bold mb-1">공개범위</label>
            <select name="공개범위" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-900 dark:border-slate-700">
              <option value="전체">전체</option>
              <option value="비공개">비공개</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block font-bold mb-1">기도제목</label>
          <textarea name="기도제목" rows="3" required placeholder="함께 나누고 기도할 제목을 적어주세요."
            class="w-full px-3 py-2 rounded-xl border dark:bg-slate-900 dark:border-slate-700"></textarea>
        </div>
        <button type="submit" class="w-full py-2.5 rounded-xl bg-navy dark:bg-gold text-white dark:text-navyDark font-bold">
          중보기도 신청하기
        </button>
      </form>
      <div id="prayer-history-box" class="space-y-2 text-xs">
        <div class="text-gray-500">⏳ 기도요청 목록을 불러오는 중...</div>
      </div>`;
    modal.classList.remove('hidden');
    await renderSheetHistory('Prayer_Requests', 'prayer-history-box');
    return;
  }

  body.innerHTML = `<div class="py-6 text-center text-xs text-gray-500">${state.currentIdToken ? '⏳ 조회 중...' : '💡 로그인 후 실제 시트 데이터를 조회합니다.'}</div>`;
  modal.classList.remove('hidden');
  if (state.currentIdToken && srv.sheet) {
    const res = await callApi('querySheet', { sheetName: srv.sheet });
    body.innerHTML = (res && res.ok && res.rows?.length)
      ? `<pre class="text-[11px] bg-gray-100 dark:bg-slate-800 p-3 rounded-xl overflow-x-auto">${JSON.stringify(res.rows.slice(0, 10), null, 2)}</pre>`
      : `<div class="text-center text-xs text-gray-500">${(res && res.error) || '데이터가 없습니다.'}</div>`;
  }
}

function closeServiceModal() { document.getElementById('service-modal')?.classList.add('hidden'); }

function openIdPasswordModal() {
  const modal = document.getElementById('service-modal');
  document.getElementById('modal-icon').textContent = '🔑';
  document.getElementById('modal-title').textContent = '아이디 신청 / 비밀번호 초기화';
  document.getElementById('modal-subtitle').textContent = '비로그인 접수 가능';
  document.getElementById('modal-body').innerHTML = `
    <form onsubmit="handlePublicIdResetSubmit(event)" class="space-y-3 text-xs">
      <select name="요청구분(신규발급/비번초기화)" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700">
        <option value="아이디 신규신청">아이디 신규 신청</option><option value="비밀번호 초기화">비밀번호 초기화</option>
      </select>
      <input name="성명" required placeholder="성명" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700" />
      <input name="연락처" required placeholder="연락처 (010-0000-0000)" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700" />
      <button type="submit" class="w-full py-2.5 rounded-xl bg-navy dark:bg-gold text-white dark:text-navyDark font-bold">접수하기</button>
    </form>`;
  modal.classList.remove('hidden');
}

async function handlePublicIdResetSubmit(e) {
  e.preventDefault();
  const record = Object.fromEntries(new FormData(e.target).entries());
  const res = await callApi('submitPublicDarakbang', { record });
  if (res && res.ok) { showToast('✅ 접수되었습니다.'); closeServiceModal(); }
  else alert('접수 오류: ' + ((res && res.error) || '다시 시도해 주세요.'));
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });
async function triggerInstallShortcut() {
  if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; return; }
  showToast('브라우저 메뉴에서 [홈 화면에 추가]를 선택하세요.');
}

function openRoleDemoModal() {
  const modal = document.getElementById('service-modal');
  document.getElementById('modal-icon').textContent = '🎭';
  document.getElementById('modal-title').textContent = '5단계 권한 시연';
  document.getElementById('modal-subtitle').textContent = '10분 세션 유지';
  document.getElementById('modal-body').innerHTML = `<div class="space-y-2">${ROLE_DEFS.map(r =>
    `<button type="button" onclick="changePreviewRole('${r.key}'); closeServiceModal();" class="w-full text-left px-3.5 py-2.5 rounded-xl border text-xs font-bold ${state.currentRole === r.key ? 'bg-navy text-white dark:bg-gold dark:text-navyDark' : 'bg-skyBg dark:bg-slate-800'}">${r.label}</button>`
  ).join('')}</div>`;
  modal.classList.remove('hidden');
}

function syncSessionUI() {
  const box = document.getElementById('session-timer-box');
  const btn = document.getElementById('auth-btn');
  const lv = ROLE_LEVEL[state.currentRole] || 1;
  if (lv >= 2) {
    box?.classList.remove('hidden'); box?.classList.add('flex');
    if (btn) btn.textContent = '로그아웃';
    startSessionLoop(mmss => { const c = document.getElementById('session-countdown'); if (c) c.textContent = mmss; }, () => performLogout(true));
  } else {
    if (sessionTimerHandle) clearInterval(sessionTimerHandle);
    box?.classList.add('hidden'); box?.classList.remove('flex');
    if (btn) btn.textContent = '로그인';
  }
}

function performLogout(expired = false) {
  localStorage.removeItem(SESSION_KEY);
  state.currentIdToken = ''; state.currentUserProfile = null; state.currentRole = '외부인';
  syncSessionUI(); renderPersonalizedCard();
  if (state.currentTab === 'my') renderMyTab();
  showToast(expired ? '⏱ 세션이 만료되어 로그아웃되었습니다.' : '로그아웃되었습니다.');
}

function handleExtendSession() {
  if (extendSession()) { syncSessionUI(); showToast('✅ 10분 연장되었습니다.'); }
}

function changePreviewRole(raw) {
  const role = normalizeRoleName(raw);
  state.currentRole = role;
  saveSession(role, state.currentUserProfile, state.currentIdToken);
  syncSessionUI(); renderPersonalizedCard();
  if (state.currentTab === 'my') renderMyTab();
}

function handleAuthClick() {
  if ((ROLE_LEVEL[state.currentRole] || 1) >= 2 || state.currentIdToken) { performLogout(false); return; }
  if (CONFIG.GOOGLE_CLIENT_ID && window.google?.accounts?.id) {
    window.google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: async resp => {
        state.currentIdToken = resp.credential;
        const res = await callApi('getSessionProfile');
        if (res && res.ok && res.user) {
          state.currentUserProfile = res.user;
          await loadSmallGroupMaster();
          const role = normalizeRoleName(res.user.role || '외부인');
          state.currentRole = role;
          saveSession(role, res.user, state.currentIdToken);
          syncSessionUI(); renderPersonalizedCard();
          showToast(`✅ ${res.user.name}님 환영합니다 (${role})`);
        } else { performLogout(false); alert((res && res.error) || '로그인 실패'); }
      }
    });
    window.google.accounts.id.prompt();
  } else { changePreviewRole('성도'); }
}

async function handleAttendanceSubmit(e) {
  e.preventDefault();
  if (!state.currentIdToken) { alert('로그인 후 출석 저장이 가능합니다.'); return; }
  const fd = Object.fromEntries(new FormData(e.target).entries());
  const serviceDate = fd['예배일자'];
  const serviceType = fd['예배구분(화/금/안)'] || getDefaultWorshipByDate(serviceDate);
  const check = validateAttendanceDateAndService(serviceDate, serviceType);
  if (!check.valid && check.hardBlock) { alert(check.message); return; }
  const actorName = state.currentUserProfile?.name || '성도';
  const matched = await resolveGroupByMemberName(fd['대상성명'] || actorName, state.currentUserProfile?.userId || '');
  const res = await callApi('insertRow', {
    sheetName: 'Attendance_Log',
    record: {
      Record_ID: 'ATT-' + Date.now(), '예배일자': serviceDate, '예배구분(화/금/안)': serviceType,
      User_ID: matched.userId, '성명': fd['대상성명'] || actorName, '소속반': matched.groupName,
      '출석상태': fd['출석상태'] || '출석', '입력자': actorName
    }
  });
  if (res && res.ok) { alert(`✅ 출석이 등록되었습니다.${res.bonusTalent ? ` (달란트 1.5배 ${res.bonusTalent}T 적립!)` : ''}`); closeServiceModal(); }
  else alert('오류: ' + ((res && res.error) || '권한 확인 필요'));
}

async function loadHub() {
  const dot = document.getElementById('api-status-dot');
  const cached = readCachedHub();

  if (cached) {
    state.hubCache = cached;
    smoothVerticalSlider.setItems(cached.galleries);
  }

  const r = await fetchPublicHubData();
  state.hubCache = r.data;
  if (r.status === 'live') {
    writeCachedHub(r.data);
  }

  if (dot) {
    dot.innerHTML = r.status === 'live' ? '🟢 실시간 연동됨' : '🟡 기본 허브 모드';
    dot.className = r.status === 'live'
      ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 whitespace-nowrap'
      : 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 whitespace-nowrap';
  }
  smoothVerticalSlider.setItems(state.hubCache.galleries);
}

function updateCountdown() {
  const s = getUpcomingWorshipSlots()[0];
  if (!s) return;
  const diff = Math.max(0, s.target - new Date());
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff / 3600000) % 24);
  const m = Math.floor((diff / 60000) % 60);
  const sec = Math.floor((diff / 1000) % 60);
  const lbl = document.getElementById('next-worship-label');
  const cd = document.getElementById('worship-countdown');
  if (lbl) lbl.textContent = `다음 ${s.name}까지`;
  if (cd) cd.textContent = `${d > 0 ? d + '일 ' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function bindVerticalSwipe() {
  const stage = document.getElementById('gallery-slider-stage');
  if (!stage) return;
  let startY = 0;
  stage.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dy) > 35) smoothVerticalSlider.step(dy < 0 ? 1 : -1);
  }, { passive: true });
}

Object.assign(window, {
  toggleTheme,
  switchBottomTab,
  openFullMenuDrawer,
  toggleQuickFavorite,
  toggleAlbumBgm,
  openWorshipReserveForm,
  handleWorshipReserveSubmit,
  handleTalentSubmit,
  handlePrayerSubmit,
  openServiceById,
  closeServiceModal,
  openIdPasswordModal,
  handlePublicIdResetSubmit,
  triggerInstallShortcut,
  openRoleDemoModal,
  changePreviewRole,
  handleAuthClick,
  handleExtendSession,
  handleAttendanceSubmit,
  stepGallerySlide: d => smoothVerticalSlider.step(d),
  setGalleryDirection: d => smoothVerticalSlider.setDirection(d),
  syncWorshipTypeByDate: dateStr => {
    const sel = document.getElementById('att-service-select');
    if (sel) sel.innerHTML = renderWorshipOptionsHtml(dateStr);
  }
});

function init() {
  initTheme();
  smoothVerticalSlider.renderImmediate();
  smoothVerticalSlider.startLoop();
  bindVerticalSwipe();
  const saved = loadSession();
  if (saved) {
    state.currentIdToken = saved.idToken || '';
    state.currentUserProfile = saved.profile || null;
    state.currentRole = normalizeRoleName(saved.role || '외부인');
  }
  syncSessionUI();
  renderPersonalizedCard();
  updateCountdown();
  setInterval(updateCountdown, 1000);
  loadHub();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();