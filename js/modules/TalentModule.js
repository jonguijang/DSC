import { ROLE_LEVEL } from '../core/config.js';
import { state, sanitizeMemberName, getViewMode } from '../core/state.js';
import { callApi } from '../core/api.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTodayYmdKst() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function getNowDateTimeKst() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('T', ' ').slice(0, 19);
}

export function getTalentCurrentMonthRange() {
  const today = getTodayYmdKst();
  const [y, m] = today.split('-');
  return {
    from: `${y}-${m}-01`,
    to: today
  };
}

export function normalizeTalentDateYMD(rawDate, fallbackMemo = '') {
  const str = String(rawDate || '').trim();
  if (str && str !== '-') {
    const ymdOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
    if (ymdOnly) {
      if (str.includes('T') && str.endsWith('Z')) {
        const d = new Date(str);
        if (!Number.isNaN(d.getTime())) {
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.toISOString().slice(0, 10);
        }
      }
      return `${ymdOnly[1]}-${ymdOnly[2]}-${ymdOnly[3]}`;
    }
    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      const kst = new Date(parsed.getTime() + 9 * 60 * 60 * 1000);
      return kst.toISOString().slice(0, 10);
    }
    return str.slice(0, 10);
  }
  const memoMatch = String(fallbackMemo || '').match(/(\d{4}-\d{2}-\d{2})/);
  return memoMatch ? memoMatch[1] : '';
}

export class TalentModule {
  constructor(options = {}) {
    this.id = 'talent';
    this.title = '신앙 달란트 적립·승인 센터';
    this.sheetName = 'Talent_Ledger';
    this.masterSheetName = 'Talent_Master';
    this.viewMode = options.viewMode || getViewMode();
    this.selectedPart = '전체';
    this.records = [];
    this.masterSourceStatus = 'default';

    const { from, to } = getTalentCurrentMonthRange();
    this.filters = {
      from,
      to,
      status: '',
      name: ''
    };

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

  getStatus(r) {
    return String(r['승인여부'] || r.status || r['승인상태'] || '승인대기').trim();
  }

  getFilteredRecords(baseList) {
    const { from, to, status, name } = this.filters;
    const cleanName = String(name || '').trim().toLowerCase();
    return (baseList || []).filter(item => {
      const memo = String(item['증빙메모'] || item.memo || '').trim();
      const rawDate = item.activity_date || item['활동일자'] || item['신청일시'] || item['일자'] || '';
      const ymd = normalizeTalentDateYMD(rawDate, memo);
      if (from && ymd && ymd < from) return false;
      if (to && ymd && ymd > to) return false;
      if (status && this.getStatus(item) !== status) return false;
      if (cleanName) {
        const memberName = String(item['성명'] || item.user_name || '').toLowerCase();
        const activityText = String(item['활동구분'] || item.activity_type || '').toLowerCase();
        if (!memberName.includes(cleanName) && !activityText.includes(cleanName)) return false;
      }
      return true;
    });
  }

  renderSearchFilterHtml() {
    return `
      <div class="p-3 rounded-xl bg-gray-50 dark:bg-slate-800/70 border border-gray-200 dark:border-slate-700 space-y-2">
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
          <div class="sm:col-span-5">
            <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1">기간 (From ~ To)</label>
            <div class="flex items-center gap-1">
              <input id="tl-search-from" type="date" value="${escapeHtml(this.filters.from)}" aria-label="시작일"
                class="w-full h-[32px] px-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-[11px]" />
              <span class="text-gray-400 text-xs">~</span>
              <input id="tl-search-to" type="date" value="${escapeHtml(this.filters.to)}" aria-label="종료일"
                class="w-full h-[32px] px-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-[11px]" />
            </div>
          </div>
          <div class="sm:col-span-3">
            <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1">승인상태</label>
            <select id="tl-search-status"
              class="w-full h-[32px] px-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs">
              <option value="" ${this.filters.status === '' ? 'selected' : ''}>전체 상태</option>
              <option value="승인대기" ${this.filters.status === '승인대기' ? 'selected' : ''}>승인대기</option>
              <option value="승인완료" ${this.filters.status === '승인완료' ? 'selected' : ''}>승인완료</option>
              <option value="반려" ${this.filters.status === '반려' ? 'selected' : ''}>반려</option>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1">성명/항목</label>
            <input id="tl-search-name" type="text" value="${escapeHtml(this.filters.name)}" placeholder="성명 또는 활동"
              class="w-full h-[32px] px-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs" />
          </div>
          <div class="sm:col-span-2 flex gap-1">
            <button type="button" id="tl-btn-search"
              class="flex-1 h-[32px] bg-amber-600 text-white font-bold text-xs px-2.5 rounded-lg hover:bg-amber-700 transition whitespace-nowrap">
              🔍 검색
            </button>
            <button type="button" id="tl-btn-reset" title="현재월 1일~오늘로 초기화"
              class="h-[32px] bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-slate-600 font-semibold text-[11px] px-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition whitespace-nowrap">
              초기화
            </button>
          </div>
        </div>
      </div>
    `;
  }

  buildMarkup() {
    const roleLv = Number((ROLE_LEVEL && ROLE_LEVEL[state.currentRole]) || 1);
    const user = state.currentUserProfile || {};
    const isPreviewOnly = !state.currentIdToken;
    const canApply = roleLv >= 2;
    const isApprover = roleLv >= 3;

    const uId = String(user.userId || '').trim();
    const uEmail = String(user.email || '').toLowerCase().trim();
    const uName = String(user.name || '').trim();

    const myRecords = this.records.filter(r => {
      const rUid = String(r.User_ID || r.user_id || '').trim();
      const rEmail = String(r.Google_Email || r.user_email || r['이메일'] || '').toLowerCase().trim();
      const rName = String(r['성명'] || r.user_name || '').trim();
      return (uId && rUid === uId) || (uEmail && rEmail === uEmail) || (uName && rName === uName);
    });

    const myApprovedPoints = myRecords
      .filter(r => this.getStatus(r) === '승인완료')
      .reduce((sum, r) => sum + (Number(r['신청달란트'] ?? r.points ?? r['달란트'] ?? 0) || 0), 0);

    const baseList = isApprover ? this.records : myRecords;
    const visibleRecords = this.getFilteredRecords(baseList);

    const filteredCount = visibleRecords.length;
    const filteredApprovedPts = visibleRecords
      .filter(r => this.getStatus(r) === '승인완료')
      .reduce((sum, r) => sum + (Number(r['신청달란트'] ?? r.points ?? r['달란트'] ?? 0) || 0), 0);
    const filteredPendingCount = visibleRecords.filter(r => this.getStatus(r) === '승인대기').length;
    const filteredRejectedCount = visibleRecords.filter(r => this.getStatus(r) === '반려').length;

    const parts = this.getParts();
    const partTabsHtml = parts.map(pt => {
      const active = this.selectedPart === pt;
      return `
        <button type="button" data-talent-part="${escapeHtml(pt)}"
          class="tl-part-tab px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
            active
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
          }">
          ${escapeHtml(pt)}
        </button>`;
    }).join('');

    const visiblePresets = this.getVisiblePresets();
    const firstPreset = visiblePresets[0] || this.activityPresets[0] || { points: 10, accountSubject: '', deptName: '' };

    const rowsHtml = visibleRecords.length === 0
      ? `<div class="p-6 text-center text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
           ${isPreviewOnly
             ? '💡 현재 운영진 미리보기 모드입니다. 상단에서 역할(다산교회/직원/관리자)을 바꾸어 화면과 신청 폼을 시연해 보실 수 있으며, 실제 Google 로그인 시 Talent_Ledger 시트와 실시간 연동됩니다.'
             : '검색 조건에 일치하는 달란트 내역이 없습니다. 기간·상태·검색어를 조정하거나 [초기화]를 눌러 보세요.'}
         </div>`
      : visibleRecords.map((item, idx) => {
          const txId = String(item.Tx_ID || item.tx_id || item.talent_id || item.id || '').trim();
          const rowNumber = Number(item._rowNumber || (idx + 2));
          const memo = String(item['증빙메모'] || item.memo || '').trim();
          const date = normalizeTalentDateYMD(
            item.activity_date || item['활동일자'] || item['신청일시'] || item['일자'] || '',
            memo
          ) || '-';
          const appliedAt = String(item['신청일시'] || '').trim();
          const name = sanitizeMemberName(String(item['성명'] || item.user_name || '-').trim());
          const part = String(item.part_name || item['파트'] || '').trim();
          const activity = String(item['활동구분'] || item.activity_type || item['활동내역'] || '-').trim();
          const accountSubject = String(item.account_subject || item['계정과목'] || '').trim();
          const approver = String(item['승인자'] || '').trim();
          const approvedDate = String(item['승인일자'] || '').trim();
          const rejectedDate = String(item['반려일자'] || '').trim();
          const rejectReason = String(item['반려사유'] || '').trim();
          const pts = Number(item['신청달란트'] ?? item.points ?? item['달란트'] ?? 0) || 0;
          const status = this.getStatus(item);
          const isApproved = status === '승인완료';
          const isRejected = status === '반려';
          const canDecide = isApprover && !isApproved && !isRejected;

          const badgeClass = isApproved
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
            : isRejected
              ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200';

          return `
            <div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div class="space-y-0.5">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-xs font-semibold text-slate-400">${escapeHtml(date)}</span>
                  <span class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">${escapeHtml(name)}</span>
                  ${part ? `<span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300">${escapeHtml(part)}</span>` : ''}
                  <span class="px-2 py-0.5 rounded-full text-xs font-bold ${badgeClass}">${escapeHtml(status)}</span>
                  ${isApproved && approver ? `<span class="text-[11px] text-slate-400">(승인: ${escapeHtml(approver)}${approvedDate ? ` · ${escapeHtml(approvedDate)}` : ''})</span>` : ''}
                  ${isRejected ? `<span class="text-[11px] text-rose-500">(반려${approver ? `: ${escapeHtml(approver)}` : ''}${rejectedDate ? ` · ${escapeHtml(rejectedDate)}` : ''})</span>` : ''}
                </div>
                <p class="text-xs text-slate-600 dark:text-slate-300">${escapeHtml(activity)}</p>
                ${memo ? `<p class="text-[11px] text-slate-500 dark:text-slate-400">메모: ${escapeHtml(memo)}</p>` : ''}
                ${appliedAt ? `<p class="text-[11px] text-slate-400">신청일시: ${escapeHtml(appliedAt)}</p>` : ''}
                ${accountSubject ? `<p class="text-[11px] text-slate-400">비용계정: ${escapeHtml(accountSubject)}</p>` : ''}
                ${isRejected && rejectReason ? `<p class="text-[11px] font-semibold text-rose-600 dark:text-rose-400">반려사유: ${escapeHtml(rejectReason)}</p>` : ''}
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs sm:text-sm font-extrabold text-amber-600 dark:text-amber-400">+${pts.toLocaleString()} T</span>
                ${canDecide ? `
                  <button type="button" data-approve-id="${escapeHtml(txId)}" data-row-number="${rowNumber}"
                    class="btn-approve-talent px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition">
                    승인
                  </button>
                  <button type="button" data-reject-id="${escapeHtml(txId)}" data-row-number="${rowNumber}"
                    class="btn-reject-talent px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50 transition">
                    반려
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

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div class="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-sm">
            <div class="text-[11px] opacity-90">나의 누적 승인 달란트</div>
            <div class="text-base font-extrabold mt-0.5">${myApprovedPoints.toLocaleString()} T</div>
          </div>
          <div class="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <div class="text-[11px] text-slate-500">조회 건수 / 승인합계</div>
            <div class="text-sm font-bold text-slate-900 dark:text-white mt-0.5">${filteredCount}건 · +${filteredApprovedPts.toLocaleString()}T</div>
          </div>
          <div class="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <div class="text-[11px] text-slate-500">조회 승인대기</div>
            <div class="text-sm font-bold text-amber-700 dark:text-amber-400 mt-0.5">${filteredPendingCount}건</div>
          </div>
          <div class="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <div class="text-[11px] text-slate-500">조회 반려건수</div>
            <div class="text-sm font-bold text-rose-700 dark:text-rose-400 mt-0.5">${filteredRejectedCount}건</div>
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
                    <option value="${escapeHtml(p.label)}" data-idx="${i}" data-pts="${p.points}" data-part="${escapeHtml(p.part)}" data-account="${escapeHtml(p.accountSubject || '')}" data-dept="${escapeHtml(p.deptName || '')}">
                      [${escapeHtml(p.part)}] ${escapeHtml(p.label)} (+${p.points}T)${p.accountSubject ? ` · ${escapeHtml(p.accountSubject)}` : ''}
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
                <input type="date" name="activity_date" required value="${getTodayYmdKst()}"
                  class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs sm:text-sm" />
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1">추천인 / 비고·증빙 메모 (제안함·도르가회 추천·시무집사 참여율 등)</label>
              <input type="text" name="memo" placeholder="예: 도르가회 추천, 시무집사 월간 봉사 참여율 90%, 제안함 채택 건 등"
                class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs sm:text-sm" />
            </div>
            <div class="flex justify-end">
              <button type="submit" id="btn-submit-talent" class="px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 disabled:opacity-50 transition">
                달란트 적립 신청하기
              </button>
            </div>
          </form>` : ''}

        <div class="space-y-2.5">
          <div class="text-xs font-bold text-slate-500">
            ${isApprover ? '전체 성도 달란트 신청·승인·반려 내역 (관리자/직원 뷰)' : '나의 달란트 적립 내역'}
          </div>
          ${this.renderSearchFilterHtml()}
          <div class="space-y-2">
            ${rowsHtml}
          </div>
        </div>
      </div>
    `;
  }

  bindEvents(containerEl) {
    const root = containerEl || document.getElementById('modal-body');
    if (!root) return;

    const moduleRoot = root.querySelector('#talent-module-root');
    if (!moduleRoot || moduleRoot.dataset.bound === '1') return;
    moduleRoot.dataset.bound = '1';

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

    const applySearchFilters = () => {
      this.filters = {
        from: (root.querySelector('#tl-search-from')?.value || '').trim(),
        to: (root.querySelector('#tl-search-to')?.value || '').trim(),
        status: (root.querySelector('#tl-search-status')?.value || '').trim(),
        name: (root.querySelector('#tl-search-name')?.value || '').trim()
      };
      this.refreshInModal(root);
    };

    root.querySelector('#tl-btn-search')?.addEventListener('click', applySearchFilters);
    root.querySelector('#tl-btn-reset')?.addEventListener('click', () => {
      const { from, to } = getTalentCurrentMonthRange();
      this.filters = { from, to, status: '', name: '' };
      this.refreshInModal(root);
    });
    root.querySelector('#tl-search-name')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applySearchFilters();
      }
    });

    const form = root.querySelector('#talent-apply-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!state.currentIdToken) {
          alert('현재 운영진 미리보기 상태입니다. 실제 Google Sheets [Talent_Ledger] 저장을 원하시면 상단에서 Google 로그인을 진행해 주세요.');
          return;
        }

        const submitBtn = form.querySelector('#btn-submit-talent');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = '접수 중...';
        }

        try {
          const fd = new FormData(form);
          const opt = select?.selectedOptions?.[0];
          const pts = Number(fd.get('points') || opt?.dataset?.pts || 10);
          const partName = opt?.dataset?.part || this.selectedPart || '';
          const accountSubject = opt?.dataset?.account || '';
          const deptName = opt?.dataset?.dept || partName;
          const user = state.currentUserProfile || {};

          const txId = 'TL-' + Date.now();
          const appliedAt = getNowDateTimeKst();
          const activityDate = String(fd.get('activity_date') || getTodayYmdKst());
          const activityType = String(fd.get('activity_type') || '');
          const rawMemo = String(fd.get('memo') || '').trim();
          const memoText = rawMemo ? `${rawMemo} (${activityDate})` : activityDate;

          const payload = {
            Tx_ID: txId,
            '신청일시': appliedAt,
            User_ID: user.userId || user.id || '',
            Google_Email: user.email || '',
            '성명': user.name || '성도',
            '활동구분': activityType,
            '증빙메모': memoText,
            '신청달란트': pts,
            '승인여부': '승인대기',
            '승인자': '',
            '승인일자': '',
            '반려일자': '',
            '반려사유': '',
            '활동일자': activityDate,
            '파트': partName,
            '계정과목': accountSubject,

            talent_id: txId,
            activity_date: activityDate,
            user_name: user.name || '성도',
            user_email: user.email || '',
            part_name: partName,
            dept_name: deptName,
            account_subject: accountSubject,
            activity_type: activityType,
            memo: memoText,
            points: pts,
            status: '승인대기',
            created_at: appliedAt
          };

          const res = await callApi('insertRow', { sheetName: this.sheetName, record: payload });
          if (!res || res.ok === false) {
            throw new Error((res && res.error) || '신청 실패');
          }
          alert(`달란트 적립(+${pts}T) 신청이 접수되었습니다.`);
          await this.loadRecords();
          this.refreshInModal(root);
        } catch (err) {
          alert('달란트 신청 중 오류가 발생했습니다: ' + err.message);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '달란트 적립 신청하기';
          }
        }
      });
    }

    root.querySelectorAll('.btn-approve-talent').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!state.currentIdToken) {
          alert('현재 운영진 미리보기 상태입니다. 실제 승인 반영은 Google 로그인 후 직원/관리자 권한으로 진행됩니다.');
          return;
        }
        const talentId = String(btn.dataset.approveId || '').trim();
        const rowNumber = Number(btn.dataset.rowNumber || 0);
        if (!confirm('해당 달란트 적립 건을 [승인완료] 처리하시겠습니까?')) return;

        const approverName = state.currentUserProfile?.name || '';
        const todayYmd = getTodayYmdKst();
        const nowDt = getNowDateTimeKst();

        btn.disabled = true;
        btn.textContent = '처리중...';

        try {
          const res = await callApi('updateRow', {
            sheetName: this.sheetName,
            keyField: 'Tx_ID',
            keyValue: talentId,
            rowNumber,
            updates: {
              '승인여부': '승인완료',
              '승인자': approverName,
              '승인일자': todayYmd,
              '반려일자': '',
              '반려사유': '',
              status: '승인완료',
              approved_at: nowDt
            }
          });
          if (!res || res.ok === false) {
            throw new Error((res && res.error) || '승인 실패');
          }
          alert('달란트 승인이 완료되었습니다.');
          await this.loadRecords();
          this.refreshInModal(root);
        } catch (err) {
          alert('승인 처리 중 오류가 발생했습니다: ' + err.message);
          btn.disabled = false;
          btn.textContent = '승인';
        }
      });
    });

    root.querySelectorAll('.btn-reject-talent').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!state.currentIdToken) {
          alert('현재 운영진 미리보기 상태입니다. 실제 반려 반영은 Google 로그인 후 직원/관리자 권한으로 진행됩니다.');
          return;
        }
        const talentId = String(btn.dataset.rejectId || '').trim();
        const rowNumber = Number(btn.dataset.rowNumber || 0);
        const reasonInput = prompt('반려 사유를 입력해 주세요. (필수)');
        if (reasonInput === null) return;
        const rejectReason = String(reasonInput).trim();
        if (!rejectReason) {
          alert('반려 사유를 입력해야 반려 처리할 수 있습니다.');
          return;
        }

        const approverName = state.currentUserProfile?.name || '';
        const todayYmd = getTodayYmdKst();
        const nowDt = getNowDateTimeKst();

        btn.disabled = true;
        btn.textContent = '처리중...';

        try {
          const res = await callApi('updateRow', {
            sheetName: this.sheetName,
            keyField: 'Tx_ID',
            keyValue: talentId,
            rowNumber,
            updates: {
              '승인여부': '반려',
              '승인자': approverName,
              '승인일자': '',
              '반려일자': todayYmd,
              '반려사유': rejectReason,
              status: '반려',
              rejected_at: nowDt
            }
          });
          if (!res || res.ok === false) {
            throw new Error((res && res.error) || '반려 실패');
          }
          alert('달란트 반려 처리가 완료되었습니다.');
          await this.loadRecords();
          this.refreshInModal(root);
        } catch (err) {
          alert('반려 처리 중 오류가 발생했습니다: ' + err.message);
          btn.disabled = false;
          btn.textContent = '반려';
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