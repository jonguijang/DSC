import { CONFIG } from '../core/config.js';
import { state } from '../core/state.js';
import { callApi, updateRow } from '../core/api.js';

export class TalentModule {
  constructor(options = {}) {
    this.id = 'talent';
    this.title = '신앙 달란트 적립·승인 센터';
    this.sheetName = 'Talent_Ledger';
    this.masterSheetName = 'Talent_Master';
    this.viewMode = options.viewMode || 'PC_DETAIL';
    this.selectedPart = '전체';
    this.records = [];
    this.masterSourceStatus = 'default'; // 'sheet' | 'default'

    this.defaultPresets = [
      { code: 'TL-SS-01', part: '안식일학교', label: '안식일학교 정각출석', points: 10, payType: '고정', accountSubject: '2503 안식일학교', deptName: '안식일학교' },
      { code: 'TL-SS-02', part: '안식일학교', label: '기억절 암송 완료', points: 10, payType: '고정', accountSubject: '2503 안식일학교', deptName: '안식일학교' },
      { code: 'TL-MS-01', part: '선교회', label: '화요일 저녁예배 참석', points: 10, payType: '고정', accountSubject: '2502 선교회', deptName: '선교회' },
      { code: 'TL-MS-02', part: '선교회', label: '금요일 저녁예배 참석', points: 10, payType: '고정', accountSubject: '2502 선교회', deptName: '선교회' },
      { code: 'TL-SG-01', part: '제안함·운영회', label: '제안함 아이디어 제출', points: 10, payType: '고정', accountSubject: '교회운영개선비', deptName: '교회운영회' },
      { code: 'TL-SG-02', part: '제안함·운영회', label: '제안함 제안 채택', points: 30, payType: '변동가능', accountSubject: '교회운영개선비', deptName: '교회운영회' },
      { code: 'TL-DR-01', part: '도르가회', label: '도르가회 선행 추천', points: 20, payType: '변동가능', accountSubject: '3401 도르가구호금', deptName: '도르가회' },
      { code: 'TL-WM-01', part: '여집사회', label: '식사·설거지 당번 봉사', points: 15, payType: '고정', accountSubject: '2804 점심식사비', deptName: '여집사회' },
      { code: 'TL-MM-01', part: '남집사회', label: '차량 운행·주차 봉사', points: 15, payType: '고정', accountSubject: '2809 기타일반운영비', deptName: '남집사회' },
      { code: 'TL-DC-01', part: '시무집사회', label: '시무집사 봉사(참여율 차등)', points: 20, payType: '차등지급', accountSubject: '교회운영개선비', deptName: '시무집사회' },
      { code: 'TL-WP-01', part: '예배·찬양', label: '악기 봉사 참여', points: 10, payType: '고정', accountSubject: '2516 찬양대', deptName: '찬양대' },
      { code: 'TL-WP-02', part: '예배·찬양', label: '찬양·특송 봉사 참여', points: 10, payType: '고정', accountSubject: '2516 찬양대', deptName: '찬양대' },
      { code: 'TL-CH-01', part: '어린이·청소년', label: '어린이 설교·말씀 인도', points: 20, payType: '고정', accountSubject: '2506 어린이부', deptName: '어린이부' }
    ];
    this.activityPresets = this.defaultPresets.slice();
  }

  async loadActivityPresets() {
    if (!state.currentIdToken) {
      this.activityPresets = this.defaultPresets.slice();
      this.masterSourceStatus = 'default';
      return;
    }
    try {
      const res = await callApi('querySheet', { sheetName: this.masterSheetName });
      const rows = res && res.ok && Array.isArray(res.rows)
        ? res.rows
        : (Array.isArray(res?.data) ? res.data : []);

      const parsed = rows
        .map((r, idx) => {
          const label = String(
            r['활동구분'] || r['활동명'] || r['항목명'] || r['activity_type'] || r['label'] || ''
          ).trim();
          const rawActive = String(
            r['사용여부'] ?? r['활성여부'] ?? r['active'] ?? 'Y'
          ).trim().toUpperCase();
          const active = !['N', 'NO', 'FALSE', '0', '비활성', '미사용', '삭제'].includes(rawActive);
          const code = String(r['항목코드'] || r['code'] || `TL-${idx + 1}`).trim();
          const part = String(r['파트(주관)'] || r['파트'] || r['구분'] || r['part'] || '기타').trim();
          const points = Number(r['기본달란트'] ?? r['달란트'] ?? r['점수'] ?? r['points'] ?? 10);
          const payType = String(r['정산방식'] || r['지급기준'] || '고정').trim();
          const accountSubject = String(r['권장 계정과목'] || r['계정과목'] || r['비용계정'] || '').trim();
          const deptName = String(r['담당부서'] || r['부서명'] || r['dept_name'] || part).trim();
          const order = Number(r['정렬순서'] ?? r['순서'] ?? r['order'] ?? idx + 1);

          return {
            code,
            part,
            label,
            points: Number.isFinite(points) ? points : 10,
            payType,
            accountSubject,
            deptName,
            active,
            order
          };
        })
        .filter(item => item.label && item.active)
        .sort((a, b) => a.order - b.order);

      if (parsed.length) {
        this.activityPresets = parsed;
        this.masterSourceStatus = 'sheet';
      } else {
        this.activityPresets = this.defaultPresets.slice();
        this.masterSourceStatus = 'default';
      }
    } catch (err) {
      console.warn('[TalentModule] Talent_Master 조회 fallback:', err);
      this.activityPresets = this.defaultPresets.slice();
      this.masterSourceStatus = 'default';
    }
  }

  async loadRecords() {
    if (!state.currentIdToken) {
      this.records = [];
      return;
    }
    try {
      const res = await callApi('querySheet', { sheetName: this.sheetName });
      if (res && res.ok && Array.isArray(res.rows)) {
        this.records = res.rows;
      } else if (Array.isArray(res?.data)) {
        this.records = res.data;
      } else {
        this.records = [];
      }
    } catch (err) {
      console.warn('[TalentModule] 시트 조회 실패:', err);
      this.records = [];
    }
  }

  getParts() {
    const uniqueParts = Array.from(new Set(this.activityPresets.map(p => p.part).filter(Boolean)));
    return ['전체', ...uniqueParts];
  }

  getVisiblePresets() {
    if (this.selectedPart === '전체') return this.activityPresets;
    return this.activityPresets.filter(p => p.part === this.selectedPart);
  }

  buildMarkup() {
    const roleLv = Number((CONFIG.ROLE_LEVEL && CONFIG.ROLE_LEVEL[state.currentRole]) || 1);
    const user = state.currentUserProfile || {};
    const isPreviewOnly = !state.currentIdToken;
    const canApply = roleLv >= 2;
    const isApprover = roleLv >= 3;

    const myRecords = this.records.filter(r =>
      (user.email && (r.user_email === user.email || r['이메일'] === user.email)) ||
      (user.name && (r.user_name === user.name || r['성명'] === user.name))
    );

    const myApprovedPoints = myRecords
      .filter(r => (r.status || r['승인상태']) === '승인완료')
      .reduce((sum, r) => sum + Number(r.points || r['달란트'] || r['신청달란트'] || 0), 0);

    const pendingCount = this.records.filter(r => (r.status || r['승인상태']) === '승인대기').length;
    const listToShow = isApprover ? this.records : myRecords;

    const parts = this.getParts();
    const partTabsHtml = parts.map(pt => {
      const active = this.selectedPart === pt;
      return `
        <button type="button" data-talent-part="${pt}"
          class="tl-part-tab px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
            active
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
          }">
          ${pt}
        </button>`;
    }).join('');

    const visiblePresets = this.getVisiblePresets();
    const firstPreset = visiblePresets[0] || this.activityPresets[0] || { points: 10, accountSubject: '', deptName: '' };

    const rowsHtml = listToShow.length === 0
      ? `<div class="p-6 text-center text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
           ${isPreviewOnly
             ? '💡 현재 운영진 미리보기 모드입니다. 상단에서 역할(다산교회/직원/관리자)을 바꾸어 화면과 신청 폼을 시연해 보실 수 있으며, 실제 Google 로그인 시 Talent_Ledger 시트와 실시간 연동됩니다.'
             : '등록된 달란트 내역이 없습니다. 위 폼에서 신앙활동을 등록해 보세요!'}
         </div>`
      : listToShow.map((item, idx) => {
          const id = item.talent_id || item.id || `row-${idx}`;
          const date = item.activity_date || item['일자'] || '-';
          const name = item.user_name || item['성명'] || '-';
          const part = item.part_name || item['파트'] || '';
          const activity = item.activity_type || item['활동내역'] || item['활동구분'] || '-';
          const accountSubject = item.account_subject || item['계정과목'] || '';
          const pts = Number(item.points || item['달란트'] || item['신청달란트'] || 0);
          const status = item.status || item['승인상태'] || '승인대기';
          const isApproved = status === '승인완료';

          return `
            <div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div class="space-y-0.5">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-xs font-semibold text-slate-400">${date}</span>
                  <span class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">${name}</span>
                  ${part ? `<span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300">${part}</span>` : ''}
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold ${
                    isApproved
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
                  }">${status}</span>
                </div>
                <p class="text-xs text-slate-600 dark:text-slate-300">${activity}</p>
                ${accountSubject ? `<p class="text-[11px] text-slate-400">비용계정: ${accountSubject}</p>` : ''}
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs sm:text-sm font-extrabold text-amber-600 dark:text-amber-400">+${pts} T</span>
                ${isApprover && !isApproved ? `
                  <button type="button" data-approve-id="${id}"
                    class="btn-approve-talent px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition">
                    승인
                  </button>` : ''}
              </div>
            </div>`;
        }).join('');

    return `
      <div id="talent-module-root" class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 text-amber-900 dark:text-amber-200">
          <span>
            ${this.masterSourceStatus === 'sheet'
              ? '✅ Google Sheets [Talent_Master] 마스터 기준 적용 중'
              : '📌 파트별 기본 마스터(안식일학교·선교회·운영회·도르가회·여집사회·남집사회·시무집사회·예배·어린이) 적용 중'}
          </span>
          <span class="font-semibold">계정과목·점수는 시트에서 변경 가능</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div class="p-3.5 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-sm">
            <div class="text-xs opacity-90">나의 누적 승인 달란트</div>
            <div class="text-xl font-extrabold mt-0.5">${myApprovedPoints.toLocaleString()} T</div>
          </div>
          <div class="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <div class="text-xs text-slate-500">나의 신청 건수</div>
            <div class="text-lg font-bold text-slate-900 dark:text-white mt-0.5">${myRecords.length}건</div>
          </div>
          <div class="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <div class="text-xs text-slate-500">${isApprover ? '전체 승인 대기 건수' : '적립 안내'}</div>
            <div class="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
              ${isApprover ? `${pendingCount}건 대기` : '담당자 확인 후 반영'}
            </div>
          </div>
        </div>

        ${canApply ? `
          <form id="talent-apply-form" class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="text-xs font-bold text-slate-700 dark:text-slate-200">✨ 파트별 달란트 적립 신청</div>
              <div class="flex flex-wrap gap-1">${partTabsHtml}</div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div class="sm:col-span-2">
                <label class="block text-xs font-semibold mb-1">활동 항목 선택 *</label>
                <select id="talent-preset" name="activity_type" required
                  class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs sm:text-sm">
                  ${visiblePresets.map((p, i) => `
                    <option value="${p.label}" data-idx="${i}" data-pts="${p.points}" data-part="${p.part}" data-account="${p.accountSubject || ''}" data-dept="${p.deptName || ''}">
                      [${p.part}] ${p.label} (+${p.points}T)${p.accountSubject ? ` · ${p.accountSubject}` : ''}
                    </option>
                  `).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold mb-1">신청 달란트(T) *</label>
                <input id="talent-points-input" type="number" name="points" min="1" max="500" required value="${firstPreset.points}"
                  class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs sm:text-sm" />
              </div>
              <div>
                <label class="block text-xs font-semibold mb-1">활동 일자 *</label>
                <input type="date" name="activity_date" required value="${new Date().toISOString().slice(0, 10)}"
                  class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs sm:text-sm" />
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1">추천인 / 비고·증빙 메모 (제안함·도르가회 추천·시무집사 참여율 등)</label>
              <input type="text" name="memo" placeholder="예: 도르가회 추천, 시무집사 월간 봉사 참여율 90%, 제안함 채택 건 등"
                class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs sm:text-sm" />
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
  }

  bindEvents(containerEl) {
    const root = containerEl || document.getElementById('modal-body');
    if (!root) return;

    root.querySelectorAll('.tl-part-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedPart = btn.dataset.talentPart;
        this.refreshInModal(root);
      });
    });

    const select = root.querySelector('#talent-preset');
    const ptsInput = root.querySelector('#talent-points-input');
    if (select && ptsInput) {
      select.addEventListener('change', () => {
        const defaultPts = Number(select.selectedOptions?.[0]?.dataset?.pts || 10);
        ptsInput.value = defaultPts;
      });
    }

    const form = root.querySelector('#talent-apply-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!state.currentIdToken) {
          alert('현재 운영진 미리보기 상태입니다. 실제 Google Sheets [Talent_Ledger] 저장을 원하시면 상단에서 Google 로그인을 진행해 주세요.');
          return;
        }

        const fd = new FormData(form);
        const opt = select?.selectedOptions?.[0];
        const pts = Number(fd.get('points') || opt?.dataset?.pts || 10);
        const partName = opt?.dataset?.part || this.selectedPart || '';
        const accountSubject = opt?.dataset?.account || '';
        const deptName = opt?.dataset?.dept || partName;
        const user = state.currentUserProfile || {};

        const txId = 'TL-' + Date.now();
        const activityDate = fd.get('activity_date') || new Date().toISOString().slice(0, 10);
        const rawMemo = String(fd.get('memo') || '').trim();
        const memoText = rawMemo ? `${rawMemo} (${activityDate})` : activityDate;

        const payload = {
          Tx_ID: txId,
          User_ID: user.userId || user.id || '',
          '성명': user.name || '성도',
          '활동구분': fd.get('activity_type'),
          '증빙메모': memoText,
          '신청달란트': pts,
          '승인여부': '승인대기',
          '승인자': '',

          talent_id: txId,
          activity_date: activityDate,
          user_name: user.name || '성도',
          user_email: user.email || '',
          part_name: partName,
          dept_name: deptName,
          account_subject: accountSubject,
          activity_type: fd.get('activity_type'),
          memo: memoText,
          points: pts,
          status: '승인대기',
          created_at: new Date().toISOString()
        };

        try {
          const res = await callApi('insertRow', { sheetName: this.sheetName, record: payload });
          if (res && res.ok === false) {
            throw new Error(res.error || '신청 실패');
          }
          alert(`달란트 적립(+${pts}T) 신청이 접수되었습니다.`);
          await this.loadRecords();
          this.refreshInModal(root);
        } catch (err) {
          alert('달란트 신청 중 오류가 발생했습니다: ' + err.message);
        }
      });
    }

    root.querySelectorAll('.btn-approve-talent').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!state.currentIdToken) {
          alert('현재 운영진 미리보기 상태입니다. 실제 승인 반영은 Google 로그인 후 직원/관리자 권한으로 진행됩니다.');
          return;
        }
        const talentId = btn.dataset.approveId;
        if (!confirm('해당 달란트 적립 건을 [승인완료] 처리하시겠습니까?')) return;

        try {
          const res = await updateRow(this.sheetName, {
              keyField: 'Tx_ID',
              keyValue: talentId,
              updates: {
                '승인여부': '승인완료',
                status: '승인완료',
                approved_at: new Date().toISOString()
              }
            });
          if (res && res.ok === false) {
            throw new Error(res.error || '승인 실패');
          }
          alert('달란트 승인이 완료되었습니다.');
          await this.loadRecords();
          this.refreshInModal(root);
        } catch (err) {
          alert('승인 처리 중 오류가 발생했습니다: ' + err.message);
        }
      });
    });
  }

  refreshInModal(root) {
    root.innerHTML = this.buildMarkup();
    this.bindEvents(root);
  }

  async renderHtml() {
    await Promise.all([this.loadActivityPresets(), this.loadRecords()]);
    setTimeout(() => this.bindEvents(document.getElementById('modal-body')), 0);
    return this.buildMarkup();
  }
}