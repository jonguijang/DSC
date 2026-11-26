import { state } from '../core/state.js';
import { callApi } from '../core/api.js';
import { BaseModule } from '../core/BaseModule.js';

export class OfferingsModule extends BaseModule {
  constructor(opts = {}) {
    super({
      menuId: opts.menuId || 'OFFERINGS_SELF',
      title: opts.title || '헌금내역 조회',
      minRole: opts.minRole ?? 2,
      viewMode: opts.viewMode,
      container: opts.container
    });
  }

  async fetchData() {
    const sampleItems = [
      { date: '2026-11-07', kind: '십일조', amount: '본인 인증 후 조회', note: '안식일 헌금' },
      { date: '2026-11-07', kind: '월정헌금', amount: '본인 인증 후 조회', note: '11월 정기 헌금' },
      { date: '2026-11-14', kind: '도르가헌금', amount: '본인 인증 후 조회', note: '구제·봉사 헌금' }
    ];
    if (!state.currentIdToken) {
      return { items: sampleItems, totalText: 'OAuth 로그인 필요', isVerifiedSelf: false };
    }
    try {
      const res = await callApi('querySheet', { sheetName: 'Offerings_Log', selfOnly: true });
      if (res && res.ok && Array.isArray(res.rows)) {
        const rows = res.rows.map(r => ({
          date: r['일자'] || r['납부일'] || r['date'] || '-',
          kind: r['헌금종류'] || r['구분'] || r['kind'] || '헌금',
          amount: r['금액'] !== undefined ? `${Number(r['금액'] || 0).toLocaleString()}원` : '-',
          note: r['비고'] || r['적요'] || ''
        }));
        const sumVal = res.rows.reduce((acc, r) => acc + (Number(r['금액']) || 0), 0);
        return {
          items: rows.length ? rows : [],
          totalText: `${sumVal.toLocaleString()}원`,
          isVerifiedSelf: true
        };
      }
    } catch (err) {
      console.error('OfferingsModule fetchData error:', err);
    }
    return { items: sampleItems, totalText: '조회 대기', isVerifiedSelf: false };
  }

  renderDesktop(data) {
    const hasVerifiedSelf = Boolean(state.currentIdToken) && data.isVerifiedSelf;
    return `
      <div class="space-y-4">
        <div class="p-3.5 rounded-xl ${hasVerifiedSelf ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'} border flex flex-wrap items-center justify-between gap-2">
          <div class="text-xs">
            <strong class="text-navy dark:text-white">🔒 본인 전용 헌금내역 격리 정책:</strong>
            <span class="text-gray-600 dark:text-slate-300 ml-1">
              ${hasVerifiedSelf
                ? 'Google OAuth 본인 계정 기준으로 격리 조회된 내역입니다.'
                : '미리보기 모드에서는 실제 헌금 금액이 노출되지 않으며, Google OAuth 실계정 인증 후 본인 내역만 조회됩니다.'}
            </span>
          </div>
          <span class="text-xs font-bold px-2.5 py-1 rounded bg-white dark:bg-slate-900 text-navy dark:text-gold">
            누계: ${data.totalText}
          </span>
        </div>
        ${data.items.length ? `
          <div class="overflow-x-auto">
            <table class="w-full text-xs border-collapse">
              <thead>
                <tr class="bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                  <th class="p-2 text-left font-bold">일자</th>
                  <th class="p-2 text-left font-bold">헌금구분</th>
                  <th class="p-2 text-right font-bold">금액</th>
                  <th class="p-2 text-left font-bold">비고</th>
                </tr>
              </thead>
              <tbody>
                ${data.items.map(it => `
                  <tr class="border-b border-gray-100 dark:border-slate-800">
                    <td class="p-2">${it.date}</td>
                    <td class="p-2 font-semibold text-navy dark:text-gold">${it.kind}</td>
                    <td class="p-2 text-right font-bold">${it.amount}</td>
                    <td class="p-2 text-gray-500 dark:text-slate-400">${it.note}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `<div class="p-4 text-center text-xs text-gray-500 dark:text-slate-400">조회된 본인 헌금 내역이 없습니다.</div>`}
      </div>`;
  }

  renderMobile(data) {
    const items = (data.items || []).slice(0, 3);
    return `
      <div class="space-y-2.5">
        <div class="p-3 rounded-xl bg-skyBg/70 dark:bg-slate-800 flex items-center justify-between text-xs">
          <span class="font-bold text-navy dark:text-white">🔒 본인 헌금 누계</span>
          <span class="font-bold text-navy dark:text-gold">${data.totalText}</span>
        </div>
        ${items.map(it => `
          <div class="p-3 rounded-xl border border-gray-200 dark:border-slate-700 flex items-center justify-between text-xs">
            <div>
              <div class="font-bold text-navy dark:text-gold">${it.kind}</div>
              <div class="text-[11px] text-gray-500 dark:text-slate-400">${it.date}</div>
            </div>
            <div class="font-bold">${it.amount}</div>
          </div>
        `).join('')}
      </div>`;
  }
}
