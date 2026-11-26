import { BaseModule } from '../core/BaseModule.js';

export class TalentModule extends BaseModule {
  constructor(options = {}) {
    super({
      id: 'talent',
      title: '신앙 달란트 적립·승인 센터',
      sheetName: 'Talent_Ledger',
      ...options
    });
    this.records = [];
    this.activityPresets = [
      { label: '갓모닝 새벽묵상 완주 (주간)', points: 10 },
      { label: '성경 1독 / 지정 말씀 통독', points: 30 },
      { label: '안식일학교 교과 예습 및 나눔', points: 10 },
      { label: '새가족·이웃 전도 초청 동행', points: 50 },
      { label: '교회 환경·식사·안내 봉사 참여', points: 15 }
    ];
  }

  async render(container) {
    this.container = container;
    await this.loadRecords();
    this.updateView();
  }

  async loadRecords() {
    try {
      const res = await this.api.querySheet(this.sheetName, { limit: 150 });
      this.records = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
    } catch (err) {
      console.warn('[TalentModule] 시트 조회 실패:', err);
      this.records = [];
    }
  }

  updateView() {
    if (!this.container) return;
    const roleLevel = Number(this.state?.get?.('roleLevel') || 1);
    const user = this.state?.get?.('user') || {};
    const isApprover = roleLevel >= 3; // 3단계(직원) 이상 승인 권한

    const myRecords = this.records.filter(r =>
      (user.email && (r.user_email === user.email || r.이메일 === user.email)) ||
      (user.name && (r.user_name === user.name || r.성명 === user.name))
    );

    const myApprovedPoints = myRecords
      .filter(r => (r.status || r.승인상태) === '승인완료')
      .reduce((sum, r) => sum + Number(r.points || r.달란트 || 0), 0);

    const pendingCount = this.records.filter(r => (r.status || r.승인상태) === '승인대기').length;

    const listToShow = isApprover ? this.records : myRecords;

    const rowsHtml = listToShow.length === 0
      ? `<div class="p-8 text-center text-sm text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
           ${roleLevel < 2 ? '상단 Google 로그인 후 나의 달란트 적립 내역을 확인하실 수 있습니다.' : '등록된 달란트 내역이 없습니다. 위 폼에서 신앙활동을 등록해 보세요!'}
         </div>`
      : listToShow.map((item, idx) => {
          const id = item.talent_id || item.id || `row-${idx}`;
          const date = item.activity_date || item.일자 || '-';
          const name = item.user_name || item.성명 || '-';
          const activity = item.activity_type || item.활동내역 || '-';
          const pts = Number(item.points || item.달란트 || 0);
          const status = item.status || item.승인상태 || '승인대기';
          const isApproved = status === '승인완료';

          return `
            <div class="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div class="space-y-0.5">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-slate-400">${date}</span>
                  <span class="text-sm font-bold text-slate-900 dark:text-white">${name}</span>
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold ${
                    isApproved
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                  }">${status}</span>
                </div>
                <p class="text-xs text-slate-600 dark:text-slate-300">${activity}</p>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-sm font-extrabold text-amber-600 dark:text-amber-400">+${pts} T</span>
                ${isApprover && !isApproved ? `
                  <button type="button" data-approve-id="${id}"
                    class="btn-approve-talent px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition">
                    승인
                  </button>` : ''}
              </div>
            </div>`;
        }).join('');

    this.container.innerHTML = `
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="p-4 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-sm">
            <div class="text-xs opacity-90">나의 누적 승인 달란트</div>
            <div class="text-2xl font-extrabold mt-1">${myApprovedPoints.toLocaleString()} T</div>
          </div>
          <div class="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <div class="text-xs text-slate-500">나의 신청 건수</div>
            <div class="text-xl font-bold text-slate-900 dark:text-white mt-1">${myRecords.length}건</div>
          </div>
          <div class="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <div class="text-xs text-slate-500">${isApprover ? '전체 승인 대기 건수' : '적립 안내'}</div>
            <div class="text-xl font-bold text-slate-900 dark:text-white mt-1">
              ${isApprover ? `${pendingCount}건 대기` : '담당자 확인 후 반영'}
            </div>
          </div>
        </div>

        ${roleLevel >= 2 ? `
          <form id="talent-apply-form" class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
            <div class="text-xs font-bold text-slate-700 dark:text-slate-200">✨ 신앙활동 달란트 적립 신청</div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="sm:col-span-2">
                <label class="block text-xs font-semibold mb-1">활동 항목 선택 *</label>
                <select id="talent-preset" name="activity_type" required
                  class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm">
                  ${this.activityPresets.map(p => `<option value="${p.label}" data-pts="${p.points}">${p.label} (+${p.points}T)</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold mb-1">활동 일자 *</label>
                <input type="date" name="activity_date" required value="${new Date().toISOString().slice(0, 10)}"
                  class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm" />
              </div>
            </div>
            <div class="flex justify-end">
              <button type="submit" class="px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition">
                달란트 적립 신청하기
              </button>
            </div>
          </form>` : ''}

        <div class="space-y-2">
          <div class="text-xs font-bold text-slate-500">
            ${isApprover ? '전체 성도 달란트 신청·승인 내역 (관리자/직원 뷰)' : '나의 달란트 적립 내역'}
          </div>
          ${rowsHtml}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const form = this.container.querySelector('#talent-apply-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const select = form.querySelector('#talent-preset');
        const pts = Number(select?.selectedOptions?.[0]?.dataset?.pts || 10);
        const user = this.state?.get?.('user') || {};

        const payload = {
          talent_id: 'TL-' + Date.now(),
          activity_date: fd.get('activity_date'),
          user_name: user.name || '성도',
          user_email: user.email || '',
          activity_type: fd.get('activity_type'),
          points: pts,
          status: '승인대기',
          created_at: new Date().toISOString()
        };

        try {
          await this.api.insertRow(this.sheetName, payload);
          alert(`달란트 적립(+${pts}T) 신청이 접수되었습니다.`);
          await this.loadRecords();
          this.updateView();
        } catch (err) {
          alert('달란트 신청 중 오류가 발생했습니다: ' + err.message);
        }
      });
    }

    this.container.querySelectorAll('.btn-approve-talent').forEach(btn => {
      btn.addEventListener('click', async () => {
        const talentId = btn.dataset.approveId;
        if (!confirm('해당 달란트 적립 건을 [승인완료] 처리하시겠습니까?')) return;

        try {
          if (typeof this.api.updateRow === 'function') {
            await this.api.updateRow(this.sheetName, {
              keyField: 'talent_id',
              keyValue: talentId,
              updates: { status: '승인완료', approved_at: new Date().toISOString() }
            });
          } else {
            await this.api.post('updateRow', {
              sheetName: this.sheetName,
              keyField: 'talent_id',
              keyValue: talentId,
              updates: { status: '승인완료', approved_at: new Date().toISOString() }
            });
          }
          alert('달란트 승인이 완료되었습니다.');
          await this.loadRecords();
          this.updateView();
        } catch (err) {
          alert('승인 처리 중 오류가 발생했습니다: ' + err.message);
        }
      });
    });
  }
}