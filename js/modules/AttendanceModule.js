import { ROLE_LEVEL } from '../core/config.js';
import { state, sanitizeMemberName, getViewMode, renderWorshipOptionsHtml } from '../core/state.js';
import { callApi } from '../core/api.js';
import { BaseModule } from '../core/BaseModule.js';

// 출석 날짜 정규화(yyyy-mm-dd), yyyy-mm-dd(요일), 현재월 기간 및 요일별 음영 헬퍼
    // =========================================================
    export function getCurrentMonthRange() {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      return {
        from: `${y}-${m}-01`,
        to: `${y}-${m}-${d}`
      };
    }

    export function normalizeDateYMD(rawDate) {
      const str = String(rawDate || '').trim();
      if (!str || str === '-') return '';
      const ymdOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
      if (ymdOnly) {
        return `${ymdOnly[1]}-${ymdOnly[2]}-${ymdOnly[3]}`;
      }
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      return str.slice(0, 10);
    }

    export function formatAttendanceDateWithDay(rawDate) {
      const ymd = normalizeDateYMD(rawDate);
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
      if (!match) return ymd || '-';
      const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      return `${ymd}(${dayNames[dt.getDay()]})`;
    }

    export function getAttendanceRowShadeClass(rawDate) {
      const ymd = normalizeDateYMD(rawDate);
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
      if (!match) return '';
      const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getDay();
      if (day === 2) {
        // 화요일: 연한 노란색 음영
        return 'bg-yellow-50/90 dark:bg-yellow-950/30';
      }
      if (day === 5) {
        // 금요일: 연한 회색 음영
        return 'bg-gray-100/90 dark:bg-slate-800/75';
      }
      if (day === 6) {
        // 토요일: 연한 황금색 음영
        return 'bg-[#f6ecc9]/60 dark:bg-amber-900/25';
      }
      return '';
    }

    window._attendanceAllRecords = [];
    window._attendanceIsLive = false;

    export function computeAttendanceStats(records) {
      const list = records || [];
      const total = list.length;
      const satCount = list.filter(r => String(r.service).includes('안식일')).length;
      const tueCount = list.filter(r => String(r.service).includes('화요')).length;
      const friCount = list.filter(r => String(r.service).includes('금요')).length;
      return { total, satCount, tueCount, friCount };
    }

    export function applyAttendanceFilterValues(records, fromVal = '', toVal = '', serviceVal = '', nameVal = '') {
      const cleanName = String(nameVal || '').trim().toLowerCase();
      return (records || []).filter(r => {
        const ymd = normalizeDateYMD(r.date);
        if (fromVal && ymd && ymd < fromVal) return false;
        if (toVal && ymd && ymd > toVal) return false;
        if (serviceVal && !String(r.service || '').includes(serviceVal)) return false;
        if (cleanName && !String(r.member || '').toLowerCase().includes(cleanName)) return false;
        return true;
      });
    }

    export function renderAttendanceSummaryHtml(stats) {
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
        </div>
      `;
    }

    export function renderAttendanceRecordsListHtml(records, isMobile) {
      const list = records || [];
      if (!list.length) {
        return `<div class="p-6 text-center text-xs text-gray-500 dark:text-slate-400 border border-dashed border-gray-200 dark:border-slate-700 rounded-xl">
          검색 조건에 일치하는 출석 기록이 없습니다.
        </div>`;
      }
      if (isMobile) {
        return `
          <div class="space-y-2">
            ${list.map(r => `
              <div class="p-3 rounded-xl border border-gray-200 dark:border-slate-700 flex items-center justify-between text-xs ${getAttendanceRowShadeClass(r.date)}">
                <div>
                  <div class="font-bold text-navy dark:text-gold">${r.service} · ${r.member}</div>
                  <div class="text-[11px] text-gray-500 dark:text-slate-400">${formatAttendanceDateWithDay(r.date)} (${r.groupNo})</div>
                </div>
                <span class="px-2 py-0.5 rounded bg-white/85 dark:bg-slate-900/85 border border-gray-200/70 dark:border-slate-700 font-semibold">${r.status}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
      return `
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
              ${list.map(r => `
                <tr class="border-b border-gray-100 dark:border-slate-800 ${getAttendanceRowShadeClass(r.date)}">
                  <td class="p-2 whitespace-nowrap font-mono text-[11px] sm:text-xs">${formatAttendanceDateWithDay(r.date)}</td>
                  <td class="p-2 font-semibold text-navy dark:text-gold whitespace-nowrap">${r.service}</td>
                  <td class="p-2 whitespace-nowrap">${r.member}</td>
                  <td class="p-2 text-center whitespace-nowrap">${r.groupNo}</td>
                  <td class="p-2 text-center whitespace-nowrap"><span class="px-2 py-0.5 rounded bg-white/85 dark:bg-slate-900/85 border border-gray-200/70 dark:border-slate-700 font-semibold">${r.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    export function filterAttendanceRecords() {
      const fromVal = (document.getElementById('att-search-from')?.value || '').trim();
      const toVal = (document.getElementById('att-search-to')?.value || '').trim();
      const serviceVal = (document.getElementById('att-search-service')?.value || '').trim();
      const nameVal = (document.getElementById('att-search-name')?.value || '').trim();

      const filtered = applyAttendanceFilterValues(
        window._attendanceAllRecords || [],
        fromVal,
        toVal,
        serviceVal,
        nameVal
      );

      const stats = computeAttendanceStats(filtered);
      const summaryEl = document.getElementById('att-summary-container');
      const listEl = document.getElementById('att-records-container');
      if (summaryEl) summaryEl.innerHTML = renderAttendanceSummaryHtml(stats);
      if (listEl) listEl.innerHTML = renderAttendanceRecordsListHtml(filtered, getViewMode() === 'MOBILE_COMPACT');
    }

    export function resetAttendanceSearch() {
      const { from, to } = getCurrentMonthRange();
      const fromEl = document.getElementById('att-search-from');
      const toEl = document.getElementById('att-search-to');
      const srvEl = document.getElementById('att-search-service');
      const nameEl = document.getElementById('att-search-name');
      if (fromEl) fromEl.value = from;
      if (toEl) toEl.value = to;
      if (srvEl) srvEl.value = '';
      if (nameEl) nameEl.value = '';
      filterAttendanceRecords();
    }

    // 출석현황(화/금/안) 모듈 — 모바일 출석체크, 예배구분 필터 및 실시간 DB 연동
    export class AttendanceModule extends BaseModule {
      constructor(opts = {}) {
        super({
          menuId: opts.menuId || 'ATTENDANCE_LOG',
          title: opts.title || '출석현황 (화/금/안)',
          minRole: opts.minRole || 2,
          viewMode: opts.viewMode || getViewMode(),
          container: opts.container || null
        });
      }

      async fetchData() {
        const sampleRecords = [
          { date: '2026-11-21', service: '안식일예배', member: '성도A', groupNo: '1반', status: '출석' },
          { date: '2026-11-21', service: '안식일예배', member: '성도B', groupNo: '2반', status: '출석' },
          { date: '2026-11-24', service: '화요예배', member: '성도C', groupNo: '3반', status: '출석' },
          { date: '2026-11-20', service: '금요저녁예배', member: '성도D', groupNo: '4반', status: '온라인' }
        ];
        if (!state.currentIdToken) {
          window._attendanceAllRecords = sampleRecords;
          window._attendanceIsLive = false;
          return { records: sampleRecords, isLive: false };
        }
        try {
          const res = await callApi('querySheet', { sheetName: 'Attendance_Log' });
          if (res && res.ok && Array.isArray(res.rows) && res.rows.length) {
            const mapped = res.rows.map(r => ({
              recordId: r['Record_ID'] || r['recordId'] || '-',
              date: r['예배일자'] || r['일자'] || r['출석일'] || r['date'] || '-',
              service: r['예배구분(화/금/안)'] || r['예배구분'] || r['service'] || '안식일예배',
              userId: r['User_ID'] || r['userId'] || '-',
              member: sanitizeMemberName(r['성명'] || r['이름'] || r['member'] || '성도'),
              groupNo: r['소속반'] || r['소그룹반'] || r['반'] || r['groupNo'] || '-',
              status: r['출석상태'] || r['status'] || '출석',
              enteredBy: r['입력자'] || r['enteredBy'] || '-'
            }));
            window._attendanceAllRecords = mapped;
            window._attendanceIsLive = true;
            return { records: mapped, isLive: true };
          }
        } catch (err) {
          console.error('AttendanceModule fetchData error:', err);
        }
        window._attendanceAllRecords = sampleRecords;
        window._attendanceIsLive = false;
        return { records: sampleRecords, isLive: false };
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
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
              <div class="sm:col-span-4">
                <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1 whitespace-nowrap">예배일자</label>
                <input id="att-date-input" type="date" name="예배일자" value="${todayStr}" required
                  onchange="syncWorshipTypeByDate(this.value)"
                  class="w-full h-[34px] px-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs" />
              </div>
              <div class="sm:col-span-5">
                <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1 whitespace-nowrap truncate" title="예배구분 (요일 자동선택 · 특별집회 가능)">예배구분 (요일 자동·특별집회)</label>
                <select id="att-service-select" name="예배구분(화/금/안)" required
                  class="w-full h-[34px] px-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs">
                  ${renderWorshipOptionsHtml(todayStr)}
                </select>
              </div>
              <div class="sm:col-span-3">
                <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1 whitespace-nowrap">참석형태</label>
                <select name="출석상태" class="w-full h-[34px] px-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs">
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
                  <label class="block text-[11px] font-bold text-amber-900 dark:text-gold mb-1">
                    대리 대상 User_ID (선택)
                  </label>
                  <input type="text" name="대상User_ID" placeholder="미입력 시 공란 처리 (입력자 기록 유지)"
                    class="w-full px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs" />
                </div>
              </div>
            ` : ''}
            <button type="submit" class="bg-navy dark:bg-gold text-white dark:text-navyDark font-bold text-xs px-4 py-2 rounded-lg hover:opacity-90 transition">
              출석 체크 등록하기
            </button>
          </form>
        `;
      }

      renderSearchFilterHtml() {
        const { from, to } = getCurrentMonthRange();
        return `
          <div class="p-3 rounded-xl bg-gray-50 dark:bg-slate-800/70 border border-gray-200 dark:border-slate-700 space-y-2">
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div class="sm:col-span-5">
                <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1">기간 (From ~ To)</label>
                <div class="flex items-center gap-1">
                  <input id="att-search-from" type="date" value="${from}" aria-label="시작일"
                    class="w-full h-[32px] px-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-[11px]" />
                  <span class="text-gray-400 text-xs">~</span>
                  <input id="att-search-to" type="date" value="${to}" aria-label="종료일"
                    class="w-full h-[32px] px-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-[11px]" />
                </div>
              </div>
              <div class="sm:col-span-3">
                <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1">예배구분</label>
                <select id="att-search-service"
                  class="w-full h-[32px] px-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs">
                  <option value="">전체 예배</option>
                  <option value="안식일예배">안식일예배</option>
                  <option value="화요예배">화요예배</option>
                  <option value="금요저녁예배">금요저녁예배</option>
                  <option value="특별집회">특별집회</option>
                </select>
              </div>
              <div class="sm:col-span-2">
                <label class="block text-[11px] font-semibold text-gray-600 dark:text-slate-300 mb-1">성명</label>
                <input id="att-search-name" type="text" placeholder="성명 입력"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();filterAttendanceRecords();}"
                  class="w-full h-[32px] px-2.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs" />
              </div>
              <div class="sm:col-span-2 flex gap-1">
                <button type="button" onclick="filterAttendanceRecords()"
                  class="flex-1 h-[32px] bg-navy dark:bg-gold text-white dark:text-navyDark font-bold text-xs px-2.5 rounded-lg hover:opacity-90 transition whitespace-nowrap">
                  🔍 검색
                </button>
                <button type="button" onclick="resetAttendanceSearch()" title="현재월 1일~오늘로 초기화"
                  class="h-[32px] bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 border border-gray-300 dark:border-slate-600 font-semibold text-[11px] px-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition whitespace-nowrap">
                  초기화
                </button>
              </div>
            </div>
          </div>
        `;
      }

      renderDesktop(data) {
        const { from, to } = getCurrentMonthRange();
        const filteredRecords = applyAttendanceFilterValues(data.records || [], from, to, '', '');
        const stats = computeAttendanceStats(filteredRecords);
        return `
          <div class="space-y-4">
            ${this.renderCheckFormHtml()}
            <div id="att-summary-container">
              ${renderAttendanceSummaryHtml(stats)}
            </div>
            <div class="space-y-2.5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h4 class="font-bold text-xs text-navy dark:text-white">📊 최근 예배별 출석 기록 (화·금·안)</h4>
                <div class="flex items-center gap-2 text-[10px] text-gray-500 dark:text-slate-400">
                  <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-yellow-100 border border-yellow-300 inline-block"></span>화요</span>
                  <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-gray-200 border border-gray-300 inline-block"></span>금요</span>
                  <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-sm bg-[#f6ecc9] border border-amber-300 inline-block"></span>토요</span>
                  <span>· ${data.isLive ? '실시간 DB 연동' : '안내 샘플'}</span>
                </div>
              </div>
              ${this.renderSearchFilterHtml()}
            </div>
            <div id="att-records-container">
              ${renderAttendanceRecordsListHtml(filteredRecords, false)}
            </div>
          </div>
        `;
      }

      renderMobile(data) {
        const { from, to } = getCurrentMonthRange();
        const filteredRecords = applyAttendanceFilterValues(data.records || [], from, to, '', '');
        const stats = computeAttendanceStats(filteredRecords);
        return `
          <div class="space-y-3">
            ${this.renderCheckFormHtml()}
            <div id="att-summary-container">
              ${renderAttendanceSummaryHtml(stats)}
            </div>
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <h4 class="font-bold text-xs text-navy dark:text-white">📊 최근 예배별 출석 기록 (화·금·안)</h4>
                <span class="text-[11px] text-gray-500 dark:text-slate-400">${data.isLive ? '실시간 연동' : '샘플'}</span>
              </div>
              ${this.renderSearchFilterHtml()}
            </div>
            <div id="att-records-container">
              ${renderAttendanceRecordsListHtml(filteredRecords, true)}
            </div>
          </div>
        `;
      }
    }

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
      const expectedDayMap = {
        '화요예배': 2,
        '금요저녁예배': 5,
        '안식일예배': 6
      };

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
