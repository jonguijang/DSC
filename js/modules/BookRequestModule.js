import { state } from '../core/state.js';
import { callApi } from '../core/api.js';
import { BaseModule } from '../core/BaseModule.js';

export class BookRequestModule extends BaseModule {
  constructor(opts = {}) {
    super({
      menuId: opts.menuId || 'BOOK_REQUEST',
      title: opts.title || '서적신청조회',
      minRole: opts.minRole ?? 2,
      viewMode: opts.viewMode,
      container: opts.container
    });
  }

  async fetchData() {
    const sampleBooks = [
      { book: '2027년 1기 안식일학교 교과(장년용)', qty: 1, payStatus: '입금확인', deliveryStatus: '배부대기' },
      { book: '소망의 빛(큰글씨판)', qty: 2, payStatus: '입금대기', deliveryStatus: '접수완료' }
    ];
    if (!state.currentIdToken) {
      return { books: sampleBooks, isLive: false };
    }
    try {
      const res = await callApi('querySheet', { sheetName: 'Book_Requests' });
      if (res && res.ok && Array.isArray(res.rows) && res.rows.length) {
        return {
          books: res.rows.slice(0, 12).map(r => ({
            book: r['도서명/교과구분'] || r['도서명'] || r['book'] || '신청 도서',
            qty: Number(r['수량'] || r['qty'] || 1),
            payStatus: r['입금상태'] || r['payStatus'] || '확인중',
            deliveryStatus: r['배부상태'] || r['deliveryStatus'] || '접수완료'
          })),
          isLive: true
        };
      }
    } catch (err) {
      console.error('BookRequestModule fetchData error:', err);
    }
    return { books: sampleBooks, isLive: false };
  }

  renderFormHtml() {
    return `
      <form onsubmit="handleBookRequestSubmit(event)" class="p-4 rounded-xl bg-skyBg/70 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 space-y-3">
        <div class="font-bold text-navy dark:text-gold text-xs">📚 교과책 및 신앙서적 공동구매 신청</div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div class="sm:col-span-2">
            <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1">도서명 / 교과구분</label>
            <input name="도서명/교과구분" required placeholder="예: 2027년 1기 안식일학교 교과" class="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs" />
          </div>
          <div>
            <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1">수량</label>
            <input type="number" name="수량" min="1" value="1" required class="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs" />
          </div>
        </div>
        <button type="submit" class="bg-navy dark:bg-gold text-white dark:text-navyDark font-bold text-xs px-4 py-2 rounded-lg hover:opacity-90 transition">
          서적 신청 등록하기
        </button>
      </form>`;
  }

  renderDesktop(data) {
    const books = data.books || [];
    return `
      <div class="space-y-4">
        ${this.renderFormHtml()}
        <div class="flex items-center justify-between">
          <h4 class="font-bold text-xs text-navy dark:text-white">📦 서적 신청 및 입금·배부 현황</h4>
          <span class="text-[11px] text-gray-500 dark:text-slate-400">${data.isLive ? '실시간 DB 연동' : '예시 현황 / 로그인 시 실시간 조회'}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                <th class="p-2 text-left font-bold">도서명 / 교과구분</th>
                <th class="p-2 text-center font-bold">수량</th>
                <th class="p-2 text-center font-bold">입금상태</th>
                <th class="p-2 text-center font-bold">배부상태</th>
              </tr>
            </thead>
            <tbody>
              ${books.map(b => `
                <tr class="border-b border-gray-100 dark:border-slate-800">
                  <td class="p-2 font-semibold text-navy dark:text-white">${b.book}</td>
                  <td class="p-2 text-center">${b.qty}권</td>
                  <td class="p-2 text-center"><span class="px-2 py-0.5 rounded bg-skyBg dark:bg-slate-800 font-semibold">${b.payStatus}</span></td>
                  <td class="p-2 text-center"><span class="px-2 py-0.5 rounded bg-goldLight/70 dark:bg-amber-900/40 text-amber-900 dark:text-gold font-semibold">${b.deliveryStatus}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  renderMobile(data) {
    const books = (data.books || []).slice(0, 3);
    return `
      <div class="space-y-3">
        ${this.renderFormHtml()}
        <div class="space-y-2">
          ${books.map(b => `
            <div class="p-3 rounded-xl border border-gray-200 dark:border-slate-700 space-y-1 text-xs">
              <div class="font-bold text-navy dark:text-white">${b.book} (${b.qty}권)</div>
              <div class="flex items-center gap-2 text-[11px]">
                <span class="px-2 py-0.5 rounded bg-skyBg dark:bg-slate-800">입금: ${b.payStatus}</span>
                <span class="px-2 py-0.5 rounded bg-goldLight/70 dark:bg-amber-900/40 text-amber-900 dark:text-gold">배부: ${b.deliveryStatus}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
  }
}
