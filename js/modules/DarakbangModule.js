import { CONFIG } from '../core/config.js';
import { state } from '../core/state.js';
import { callApi } from '../core/api.js';
import { BaseModule } from '../core/BaseModule.js';

export class DarakbangModule extends BaseModule {
  constructor(opts = {}) {
    super({
      menuId: opts.menuId || 'DARAKBANG_ID',
      title: opts.title || '다락방 ID·매뉴얼',
      minRole: opts.minRole ?? 2,
      viewMode: opts.viewMode,
      container: opts.container
    });
  }

  async fetchData() {
    const defaultRequests = [
      { date: '2026-11-20', type: '신규발급', contact: '010-****-1234', status: '발급완료' },
      { date: '2026-11-23', type: '비번초기화', contact: '010-****-5678', status: '처리중' }
    ];
    if (!state.currentIdToken) {
      return { requests: defaultRequests, manualUrl: CONFIG.FOLDERS.MANUAL, isLive: false };
    }
    try {
      const res = await callApi('querySheet', { sheetName: 'Darakbang_Requests' });
      if (res && res.ok && Array.isArray(res.rows) && res.rows.length) {
        return {
          requests: res.rows.slice(0, 10).map(r => ({
            date: r['요청일'] || r['일자'] || r['date'] || '2026-11-26',
            type: r['요청구분(신규발급/비번초기화)'] || r['요청구분'] || r['type'] || '신규발급',
            contact: r['연락처'] || r['contact'] || '인증됨',
            status: r['처리상태'] || r['status'] || '접수완료'
          })),
          manualUrl: CONFIG.FOLDERS.MANUAL,
          isLive: true
        };
      }
    } catch (err) {
      console.error('DarakbangModule fetchData error:', err);
    }
    return { requests: defaultRequests, manualUrl: CONFIG.FOLDERS.MANUAL, isLive: false };
  }

  renderFormHtml() {
    return `
      <form onsubmit="handleDarakbangSubmit(event)" class="p-4 rounded-xl bg-skyBg/70 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 space-y-3">
        <div class="flex items-center justify-between">
          <span class="font-bold text-navy dark:text-gold text-xs">🔑 다락방 신규 ID 발급 / 비밀번호 초기화 신청</span>
          <a href="${CONFIG.FOLDERS.MANUAL}" target="_blank" class="text-[11px] font-bold text-navy dark:text-gold underline">
            📘 다락방 사용 매뉴얼 열람
          </a>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1">요청구분</label>
            <select name="요청구분(신규발급/비번초기화)" required class="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs">
              <option value="신규발급">신규발급</option>
              <option value="비번초기화">비번초기화</option>
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1">연락처 (휴대폰)</label>
            <input name="연락처" required placeholder="예: 010-1234-5678" class="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs" />
          </div>
        </div>
        <button type="submit" class="bg-navy dark:bg-gold text-white dark:text-navyDark font-bold text-xs px-4 py-2 rounded-lg hover:opacity-90 transition">
          다락방 신청 제출하기
        </button>
      </form>`;
  }

  renderDesktop(data) {
    const rows = data.requests || [];
    return `
      <div class="space-y-4">
        ${this.renderFormHtml()}
        <div class="flex items-center justify-between">
          <h4 class="font-bold text-xs text-navy dark:text-white">📌 최근 다락방 신청 처리 현황</h4>
          <span class="text-[11px] text-gray-500 dark:text-slate-400">${data.isLive ? '실시간 DB 연동' : '안내 샘플 / 로그인 시 본인 내역 연동'}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                <th class="p-2 text-left font-bold">신청일</th>
                <th class="p-2 text-left font-bold">구분</th>
                <th class="p-2 text-left font-bold">연락처</th>
                <th class="p-2 text-left font-bold">처리상태</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr class="border-b border-gray-100 dark:border-slate-800">
                  <td class="p-2">${r.date}</td>
                  <td class="p-2 font-semibold text-navy dark:text-gold">${r.type}</td>
                  <td class="p-2">${r.contact}</td>
                  <td class="p-2"><span class="px-2 py-0.5 rounded bg-skyBg dark:bg-slate-800 font-semibold">${r.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  renderMobile(data) {
    const rows = (data.requests || []).slice(0, 2);
    return `
      <div class="space-y-3">
        ${this.renderFormHtml()}
        <div class="space-y-2">
          ${rows.map(r => `
            <div class="p-3 rounded-xl bg-skyBg/60 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex items-center justify-between text-xs">
              <div>
                <span class="font-bold text-navy dark:text-gold">${r.type}</span>
                <span class="text-gray-500 dark:text-slate-400 ml-1.5">${r.date}</span>
              </div>
              <span class="font-semibold px-2 py-0.5 rounded bg-white dark:bg-slate-900">${r.status}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }
}
