import { ROLE_LEVEL } from '../core/config.js';
import { state, sanitizeMemberName, renderWorshipOptionsHtml } from '../core/state.js';
import { callApi } from '../core/api.js';
import { BaseModule } from '../core/BaseModule.js';

export function validateAttendanceDateAndService(dateStr, serviceName) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!match) {
    return { valid: false, hardBlock: true, message: '예배일자 형식이 올바르지 않습니다. (YYYY-MM-DD)' };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const selectedDate = new Date(year, month - 1, day);
  if (
    selectedDate.getFullYear() !== year ||
    selectedDate.getMonth() !== month - 1 ||
    selectedDate.getDate() !== day
  ) {
    return { valid: false, hardBlock: true, message: '존재하지 않는 날짜입니다. 예배일자를 다시 확인해 주세요.' };
  }

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (selectedDate > todayMidnight) {
    return {
      valid: false,
      hardBlock: false,
      message: `선택한 예배일자(${dateStr})가 오늘(${todayMidnight.toISOString().slice(0, 10)}) 이후 미래 날짜입니다. 계속 등록하시겠습니까?`
    };
  }

  if (serviceName === '특별집회') {
    return { valid: true, hardBlock: false, message: '' };
  }

  const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const actualDay = selectedDate.getDay();
  const expectedDayMap = { '화요예배': 2, '금요저녁예배': 5, '안식일예배': 6 };

  if (Object.prototype.hasOwnProperty.call(expectedDayMap, serviceName)) {
    const expectedDay = expectedDayMap[serviceName];
    if (actualDay !== expectedDay) {
      return {
        valid: false,
        hardBlock: false,
        message: `선택한 예배일자(${dateStr})는 ${dayNames[actualDay]}입니다.\n'${serviceName}'는 일반적으로 ${dayNames[expectedDay]}에 진행됩니다.\n특별집회·수련회 등 예외 일정이 맞다면 [확인]을 눌러 계속 등록하세요.`
      };
    }
  }
  return { valid: true, hardBlock: false, message: '' };
}

export class AttendanceModule extends BaseModule {
  constructor(opts = {}) {
    super({
      menuId: opts.menuId || 'ATTENDANCE_LOG',
      title: opts.title || '출석현황 (화/금/안)',
      minRole: opts.minRole ?? 2,
      viewMode: opts.viewMode,
      container: opts.container
    });
  }

  async fetchData() {
    const sampleRecords = [
      { date: '2026-11-21', service: '안식일예배', member: '성도A', groupNo: '겸손반', status: '출석' },
      { date: '2026-11-21', service: '안식일예배', member: '성도B', groupNo: '사랑반', status: '출석' },
      { date: '2026-11-24', service: '화요예배', member: '성도C', groupNo: '온유반', status: '출석' },
      { date: '2026-11-20', service: '금요저녁예배', member: '성도D', groupNo: '믿음반', status: '온라인' }
    ];
    if (!state.currentIdToken) {
      return { records: sampleRecords, isLive: false };
    }
    try {
      const res = await callApi('querySheet', { sheetName: 'Attendance_Log' });
      if (res && res.ok && Array.isArray(res.rows) && res.rows.length) {
        return {
          records: res.rows.slice(0, 30).map(r => ({
            recordId: r['Record_ID'] || r['recordId'] || '-',
            date: r['예배일자'] || r['일자'] || r['출석일'] || r['date'] || '-',
            service: r['예배구분(화/금/안)'] || r['예배구분'] || r['service'] || '안식일예배',
            userId: r['User_ID'] || r['userId'] || '-',
            member: sanitizeMemberName(r['성명'] || r['이름'] || r['member'] || '성도'),
            groupNo: r['소속반'] || r['소그룹반'] || r['반'] || r['groupNo'] || '-',
            status: r['출석상태'] || r['status'] || '출석',
            enteredBy: r['입력자'] || r['enteredBy'] || '-'
          })),
          isLive: true
        };
      }
    } catch (err) {
      console.error('AttendanceModule fetchData error:', err);
    }
    return { records: sampleRecords, isLive: false };
  }

  computeStats(records) {
    const list = records || [];
    return {
      total: list.length,
      satCount: list.filter(r => String(r.service).includes('안식일')).length,
      tueCount: list.filter(r => String(r.service).includes('화요')).length,
      friCount: list.filter(r => String(r.service).includes('금요')).length
    };
  }

  renderCheckFormHtml() {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const canProxyRegister = ROLE_LEVEL[state.currentRole] >= 3;
    const selfName = sanitizeMemberName((state.currentUserProfile && state.currentUserProfile.name) || '성도');

    return `
      <form onsubmit="handleAttendanceSubmit(event)" class="p-4 rounded-xl bg-skyBg/70 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-bold text-navy dark:text-gold text-xs">✅ 화요·금요·안식일 모바일 출석체크</span>
          <span class="text-[11px] text-gray-500 dark:text-slate-400">
            ${canProxyRegister ? '직원+ 권한: 성명 기준 소속반 자동매칭·대리 출석 지원' : '성명 기준 소속반 자동매칭 (Attendance_Log 연동)'}
          </span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div>
            <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1">예배일자</label>
            <input id="att-date-input" type="date" name="예배일자" value="${todayStr}" required
              onchange="syncWorshipTypeByDate(this.value)"
              class="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs" />
          </div>
          <div>
            <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1">예배구분 (요일 자동선택 · 특별집회 가능)</label>
            <select id="att-service-select" name="예배구분(화/금/안)" required
              class="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs">
              ${renderWorshipOptionsHtml(todayStr)}
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1">참석형태</label>
            <select name="출석상태" class="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs">
              <option value="출석">현장 출석</option>
              <option value="온라인">온라인 참여</option>
            </select>
          </div>
        </div>
        ${canProxyRegister ? `
          <div class="p-3 rounded-lg bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label class="block text-[11px] font-bold text-amber-900 dark:text-gold mb-1">
                👵 대리 등록 대상 성명 (입력 시 소속반 자동매칭)
              </label>
              <input id="att-proxy-name" type="text" name="대상성명" placeholder="비워두면 본인(${selfName})으로 등록"
                class="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs" />
            </div>
            <div>
              <label class="block text-[11px] font-bold text-amber-900 dark:text-gold mb-1">대리 대상 User_ID (선택)</label>
              <input type="text" name="대상User_ID" placeholder="미입력 시 공란 처리 (입력자 기록 유지)"
                class="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs" />
            </div>
          </div>
        ` : ''}
        <button type="submit" class="bg-navy dark:bg-gold text-white dark:text-navyDark font-bold text-xs px-4 py-2 rounded-lg hover:opacity-90 transition">
          출석 체크 등록하기
        </button>
      </form>`;
  }

  renderSummaryCards(stats) {
    return `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <div class="p-2.5 rounded-xl bg-skyBg dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
          <div class="text-[11px] text-gray-500 dark:text-slate-400">조회 건수</div>
          <div class="text-sm font-bold text-navy dark:text-gold">${stats.total}건</div>
        </div>
        <div class="p-2.5 rounded-xl bg-skyBg dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
          <div class="text-[11px] text-gray-500 dark:text-slate-400">안식일예배</div>
          <div class="text-sm font-bold text-navy dark:text-white">${stats.satCount}건</div>
        </div>
        <div class="p-2.5 rounded-xl bg-skyBg dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
          <div class="text-[11px] text-gray-500 dark:text-slate-400">화요예배</div>
          <div class="text-sm font-bold text-navy dark:text-white">${stats.tueCount}건</div>
        </div>
        <div class="p-2.5 rounded-xl bg-skyBg dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
          <div class="text-[11px] text-gray-500 dark:text-slate-400">금요저녁예배</div>
          <div class="text-sm font-bold text-navy dark:text-white">${stats.friCount}건</div>
        </div>
      </div>`;
  }

  renderDesktop(data) {
    const records = data.records || [];
    const stats = this.computeStats(records);
    return `
      <div class="space-y-4">
        ${this.renderCheckFormHtml()}
        ${this.renderSummaryCards(stats)}
        <div class="flex items-center justify-between">
          <h4 class="font-bold text-xs text-navy dark:text-white">📊 최근 예배별 출석 기록 (화·금·안)</h4>
          <span class="text-[11px] text-gray-500 dark:text-slate-400">${data.isLive ? '실시간 DB 연동' : '안내 샘플 / OAuth 로그인 시 실데이터 조회'}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs border-collapse">
            <thead>
              <tr class="bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                <th class="p-2 text-left font-bold">일자</th>
                <th class="p-2 text-left font-bold">예배구분</th>
                <th class="p-2 text-left font-bold">성명</th>
                <th class="p-2 text-center font-bold">소그룹반</th>
                <th class="p-2 text-center font-bold">상태</th>
              </tr>
            </thead>
            <tbody>
              ${records.map(r => `
                <tr class="border-b border-gray-100 dark:border-slate-800">
                  <td class="p-2">${r.date}</td>
                  <td class="p-2 font-semibold text-navy dark:text-gold">${r.service}</td>
                  <td class="p-2">${r.member}</td>
                  <td class="p-2 text-center">${r.groupNo}</td>
                  <td class="p-2 text-center"><span class="px-2 py-0.5 rounded bg-skyBg dark:bg-slate-800 font-semibold">${r.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  renderMobile(data) {
    const records = (data.records || []).slice(0, 4);
    const stats = this.computeStats(data.records || []);
    return `
      <div class="space-y-3">
        ${this.renderCheckFormHtml()}
        ${this.renderSummaryCards(stats)}
        <div class="space-y-2">
          ${records.map(r => `
            <div class="p-3 rounded-xl border border-gray-200 dark:border-slate-700 flex items-center justify-between text-xs">
              <div>
                <div class="font-bold text-navy dark:text-gold">${r.service} · ${r.member}</div>
                <div class="text-[11px] text-gray-500 dark:text-slate-400">${r.date} (${r.groupNo})</div>
              </div>
              <span class="px-2 py-0.5 rounded bg-skyBg dark:bg-slate-800 font-semibold">${r.status}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }
}
