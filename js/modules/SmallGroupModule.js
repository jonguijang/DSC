import { CONFIG } from '../core/config.js';
import { state, getSmallGroupNames } from '../core/state.js';
import { callApi } from '../core/api.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTodayYmdLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export class SmallGroupModule {
  constructor(options = {}) {
    this.id = 'small-group';
    this.title = '안식일학교 9개반 소그룹 포털';
    this.sheetName = 'SmallGroup_Reports';
    this.viewMode = options.viewMode || 'PC_DETAIL';
    this.selectedGroup = '전체';
    const masterGroups = (state.hubCache && Array.isArray(state.hubCache.smallGroups) && state.hubCache.smallGroups.length)
      ? state.hubCache.smallGroups.filter(g => g.active !== false)
      : (CONFIG.DEFAULT_SMALL_GROUPS || []).filter(g => g.active !== false);
    this.groupMeta = masterGroups;
    this.groups = ['전체', ...this.groupMeta.map(g => g.name)];
    this.reports = [];
  }

  async loadReports() {
    if (!state.currentIdToken) {
      this.reports = [];
      return;
    }
    try {
      const res = await callApi('querySheet', { sheetName: this.sheetName });
      if (res && res.ok && Array.isArray(res.rows)) {
        this.reports = res.rows;
      } else if (Array.isArray(res?.data)) {
        this.reports = res.data;
      } else {
        this.reports = [];
      }
    } catch (err) {
      console.warn('[SmallGroupModule] 시트 조회 실패:', err);
      this.reports = [];
    }
  }

  getFilteredReports() {
    if (this.selectedGroup === '전체') return this.reports;
    return this.reports.filter(r => {
      const grp = String(r.group_name || r['소속반'] || r['소그룹반'] || r['반명'] || '').trim();
      return grp === this.selectedGroup;
    });
  }

  buildMarkup() {
    const roleLv = Number((CONFIG.ROLE_LEVEL && CONFIG.ROLE_LEVEL[state.currentRole]) || 1);
    const canWrite = Boolean(state.currentIdToken) && roleLv >= 2;
    const filtered = this.getFilteredReports();

    const tabsHtml = this.groups.map(g => {
      const active = this.selectedGroup === g;
      return `
        <button type="button" data-sg-group="${escapeHtml(g)}"
          class="sg-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            active
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
          }">
          ${escapeHtml(g)}
        </button>`;
    }).join('');

    const rowsHtml = filtered.length === 0
      ? `<div class="p-6 text-center text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
           ${!state.currentIdToken
             ? '💡 현재 [미리보기 권한 체험 모드]입니다. Google 로그인 후 실제 소그룹 보고서 조회 및 작성이 가능합니다.'
             : `선택한 반(${escapeHtml(this.selectedGroup)})에 등록된 소그룹 보고서가 없습니다.`}
         </div>`
      : filtered.map(item => {
          const date = escapeHtml(item.report_date || item['보고일자'] || item['일자'] || '-');
          const group = escapeHtml(item.group_name || item['소속반'] || item['소그룹반'] || item['반명'] || '-');
          const leader = escapeHtml(item.leader_name || item['반장'] || item['작성자'] || '-');
          const attend = escapeHtml(item.attendance_count || item['참석인원'] || '-');
          const summary = escapeHtml(item.lesson_summary || item['교과요약'] || item['활동내용'] || '');
          const prayer = escapeHtml(item.prayer_request || item['기도제목'] || '');

          return `
            <div class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
              <div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div class="flex items-center gap-2">
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">${group}</span>
                  <span class="text-xs font-semibold text-slate-500">${date}</span>
                </div>
                <div class="text-xs text-slate-600 dark:text-slate-400">
                  반장/작성: <strong>${leader}</strong> · 참석: <strong class="text-amber-700 dark:text-amber-300">${attend}명</strong>
                </div>
              </div>
              <p class="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed mb-2">${summary || '(교과·활동 요약 미입력)'}</p>
              ${prayer ? `
                <div class="text-xs bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300">
                  <span class="font-semibold text-amber-700 dark:text-amber-400">🙏 중보기도 제목:</span> ${prayer}
                </div>` : ''}
            </div>`;
        }).join('');

    return `
      <div id="small-group-module-root" class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-white">안식일학교 9개반 교과·소그룹 보고서</h3>
            <p class="text-xs text-slate-500">반명 기준(${escapeHtml(getSmallGroupNames().join(', '))}) 교과 토의 및 중보기도를 공유합니다.</p>
          </div>
          ${canWrite ? `
            <button type="button" id="btn-toggle-sg-form"
              class="px-3.5 py-2 rounded-lg bg-slate-900 text-white dark:bg-amber-600 text-xs font-bold hover:opacity-90 transition">
              + 소그룹 보고서 작성
            </button>` : `
            <span class="text-xs px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">로그인 후 보고서 작성 가능</span>`}
        </div>

        <form id="sg-report-form" class="hidden p-4 rounded-xl bg-amber-50/70 dark:bg-slate-800 border border-amber-200 dark:border-slate-700 space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-semibold mb-1">소속반 선택 *</label>
              <select name="group_name" required class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs sm:text-sm">
                ${this.groupMeta.map(g => `<option value="${escapeHtml(g.name)}">${escapeHtml(g.name)}${g.location ? ` (${escapeHtml(g.location)})` : ''}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1">보고 일자 *</label>
              <input type="date" name="report_date" required value="${getTodayYmdLocal()}"
                class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs sm:text-sm" />
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1">참석 인원(명) *</label>
              <input type="number" name="attendance_count" min="1" max="100" required placeholder="예: 8"
                class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs sm:text-sm" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold mb-1">금주 교과 토의 요약 및 선교·봉사 활동 *</label>
            <textarea name="lesson_summary" rows="2" required placeholder="이번 안식일 교과 핵심 나눔 및 반원 안부·봉사 내용을 간략히 기록해 주세요."
              class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs sm:text-sm"></textarea>
          </div>
          <div>
            <label class="block text-xs font-semibold mb-1">반별 중보기도 제목</label>
            <input type="text" name="prayer_request" placeholder="환우, 가정, 전도 대상자 등 함께 기도할 제목"
              class="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs sm:text-sm" />
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" id="btn-cancel-sg-form" class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold">취소</button>
            <button type="submit" id="btn-submit-sg-form" class="px-4 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 disabled:opacity-50">시트에 저장하기</button>
          </div>
        </form>

        <div class="flex flex-wrap gap-1.5">${tabsHtml}</div>
        <div id="sg-reports-list" class="space-y-2.5">${rowsHtml}</div>
      </div>
    `;
  }

  bindEvents(containerEl) {
    const root = containerEl || document.getElementById('modal-body');
    if (!root) return;

    const moduleRoot = root.querySelector('#small-group-module-root');
    if (!moduleRoot || moduleRoot.dataset.bound === '1') return;
    moduleRoot.dataset.bound = '1';

    root.querySelectorAll('.sg-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedGroup = btn.dataset.sgGroup;
        this.refreshInModal(root);
      });
    });

    const toggleBtn = root.querySelector('#btn-toggle-sg-form');
    const cancelBtn = root.querySelector('#btn-cancel-sg-form');
    const form = root.querySelector('#sg-report-form');

    if (toggleBtn && form) {
      toggleBtn.addEventListener('click', () => form.classList.toggle('hidden'));
    }
    if (cancelBtn && form) {
      cancelBtn.addEventListener('click', () => form.classList.add('hidden'));
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('#btn-submit-sg-form');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = '저장 중...';
        }
        const fd = new FormData(form);
        const user = state.currentUserProfile || {};
        const payload = {
          report_id: 'SG-' + Date.now(),
          report_date: fd.get('report_date'),
          group_name: fd.get('group_name'),
          leader_name: user.name || user.email || '작성자',
          leader_email: user.email || '',
          attendance_count: Number(fd.get('attendance_count') || 0),
          lesson_summary: fd.get('lesson_summary'),
          prayer_request: fd.get('prayer_request') || '',
          created_at: new Date().toISOString()
        };

        try {
          const res = await callApi('insertRow', { sheetName: this.sheetName, record: payload });
          if (res && res.ok === false) {
            throw new Error(res.error || '저장 실패');
          }
          alert(`${payload.group_name} 소그룹 보고서가 정상 등록되었습니다.`);
          await this.loadReports();
          this.refreshInModal(root);
        } catch (err) {
          alert('보고서 저장 중 오류가 발생했습니다: ' + err.message);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '시트에 저장하기';
          }
        }
      });
    }
  }

  refreshInModal(root) {
    root.innerHTML = this.buildMarkup();
    this.bindEvents(root);
  }

  async renderHtml() {
    await this.loadReports();
    setTimeout(() => this.bindEvents(document.getElementById('modal-body')), 0);
    return this.buildMarkup();
  }
}
