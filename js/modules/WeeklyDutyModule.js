import { ROLE_LEVEL } from '../core/config.js';
import { state, sanitizeMemberName } from '../core/state.js';
import { BaseModule } from '../core/BaseModule.js';

export class WeeklyDutyModule extends BaseModule {
  constructor(opts = {}) {
    super({
      menuId: opts.menuId || 'WEEKLY_DUTY',
      title: opts.title || '이번 주 / 다음 주 담당표',
      minRole: opts.minRole ?? 2,
      viewMode: opts.viewMode,
      container: opts.container
    });
  }

  async fetchData() {
    const sampleDuties = [
      { period: '이번 주', role: '대예배 사회·기도·설교', member: '안식일 순서자' },
      { period: '이번 주', role: '시무장로 · 시무집사', member: '당번 장로·집사' },
      { period: '이번 주', role: '식사당번 · 설거지 · 주차', member: '애찬·주차 봉사조' },
      { period: '다음 주', role: '대예배 사회·기도·설교', member: '차주 순서자' },
      { period: '다음 주', role: '시무장로 · 시무집사', member: '차주 장로·집사' },
      { period: '다음 주', role: '식사당번 · 설거지 · 주차', member: '차주 봉사조' }
    ];
    const rows = (state.hubCache.duties && state.hubCache.duties.length)
      ? state.hubCache.duties
      : sampleDuties;

    return rows.map(r => ({
      period: r.period || '이번 주',
      role: r.role || '담당 영역',
      member: sanitizeMemberName(r.member)
    }));
  }

  renderBlocked() {
    return `
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-bold text-base text-navy dark:text-white">📋 이번 주 / 다음 주 담당표</h2>
        <span class="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
          실명 보호 차단중
        </span>
      </div>
      <div class="p-4 rounded-xl bg-skyBg/70 dark:bg-slate-800/70 border border-gray-200 dark:border-slate-700 space-y-2">
        <p class="text-xs sm:text-sm font-semibold text-navy dark:text-gold">
          외부인(비로그인) 접근 시 성도 실명 노출이 원천 차단됩니다.
        </p>
        <p class="text-xs text-gray-600 dark:text-slate-300">
          예배·시무·식사·설거지·주차 담당표 상세 열람은 다산교회 성도 계정 로그인 후 이용하실 수 있습니다.
        </p>
      </div>`;
  }

  renderDesktop(rows) {
    const hasVerifiedSession = Boolean(state.currentIdToken) && ROLE_LEVEL[state.currentRole] >= 2;
    return `
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-bold text-base text-navy dark:text-white">📋 이번 주 / 다음 주 담당표 (PC_DETAIL)</h2>
        <span class="text-[11px] px-2 py-0.5 rounded ${hasVerifiedSession ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'} font-semibold">
          ${hasVerifiedSession ? '실명 열람 인증됨' : '미인증: 성명 마스킹 적용'}
        </span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs border-collapse">
          <thead>
            <tr class="bg-skyBg dark:bg-slate-800 text-navy dark:text-slate-200 border-b border-gray-200 dark:border-slate-700">
              <th class="p-2.5 text-left font-bold">구분</th>
              <th class="p-2.5 text-left font-bold">담당 영역 (예배·시무·식사·설거지·주차)</th>
              <th class="p-2.5 text-left font-bold">담당자</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr class="border-b border-gray-100 dark:border-slate-800 last:border-none">
                <td class="p-2.5 font-semibold text-navy dark:text-gold whitespace-nowrap">${r.period}</td>
                <td class="p-2.5 text-gray-700 dark:text-slate-300">${r.role}</td>
                <td class="p-2.5 font-medium text-gray-900 dark:text-slate-100">${r.member}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  renderMobile(rows) {
    const thisWeek = rows.filter(r => r.period === '이번 주').slice(0, 3);
    return `
      <div class="flex items-center justify-between mb-3">
        <h2 class="font-bold text-sm text-navy dark:text-white">📋 금주 핵심 담당 요약 (MOBILE_COMPACT)</h2>
        <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-skyBg dark:bg-slate-800 text-navy dark:text-gold">간략뷰</span>
      </div>
      <div class="space-y-2">
        ${thisWeek.map(r => `
          <div class="p-3 rounded-xl bg-skyBg/70 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex items-center justify-between gap-2">
            <div class="text-xs font-bold text-navy dark:text-slate-100">${r.role}</div>
            <div class="text-xs text-gray-600 dark:text-slate-300 shrink-0">${r.member}</div>
          </div>
        `).join('')}
      </div>`;
  }
}
