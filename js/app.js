import {
  CONFIG,
  ROLE_DEFS,
  ROLE_LEVEL,
  SERVICES,
  normalizeRoleName,
  getRoleNameByLevel
} from './core/config.js';
import {
  state,
  getViewMode,
  sanitizeMemberName,
  initTheme,
  toggleTheme,
  getSmallGroupNames,
  getDefaultWorshipByDate,
  renderWorshipOptionsHtml
} from './core/state.js';
import {
  callApi,
  loadSmallGroupMaster,
  resolveGroupByMemberName,
  fetchPublicHubData
} from './core/api.js';
import { WeeklyDutyModule } from './modules/WeeklyDutyModule.js';
import { DarakbangModule } from './modules/DarakbangModule.js';
import { OfferingsModule } from './modules/OfferingsModule.js';
import { BookRequestModule } from './modules/BookRequestModule.js';
import { AttendanceModule, validateAttendanceDateAndService } from './modules/AttendanceModule.js';

const SESSION_KEY = 'dsc_portal_session_v4';
const QUICK_FAV_KEY = 'dsc_quick_favorites_v1';
const ALBUM_BGM_VIDEO_ID = 'aWzWjHUfpvU';
const SESSION_MS = 10 * 60 * 1000;
let sessionTimerHandle = null;

// 5단계 RBAC 표준 코드 매핑 (제직 != 리더 분리)
const RBAC_RANK = {
  GUEST: 1, '외부인': 1,
  MEMBER: 2, '성도': 2, '다산교회': 2, '제직': 2,
  LEADER: 3, '리더': 3, '리더(반장)': 3, '리더·반장': 3,
  STAFF: 4, '직원': 4, '운영자': 4, '직원(운영자)': 4, '직원·운영자': 4,
  ADMIN: 5, '관리자': 5, '최고관리자': 5
};

const RBAC_LABEL_KO = {
  GUEST: '외부인',
  MEMBER: '성도',
  LEADER: '리더 (반장)',
  STAFF: '직원 (운영자)',
  ADMIN: '관리자'
};

// 직분 보조 필터 대상 (권사·안수집사 제외)
const OFFICER_POSITIONS = ['담임목사', '부목사', '장로', '집사'];

const CATEGORY_ORDER = [
  { key: '공통·프레임', icon: '⚙️', desc: '계정·권한·시스템 관리' },
  { key: '예배·출석·예약', icon: '⛪', desc: '예배 예약·출석·주보·캘린더' },
  { key: '신앙·소그룹·편의', icon: '🌱', desc: '달란트·헌금·소그룹·기도·교과책' },
  { key: '전자신청(모듈탑재)', icon: '📝', desc: '기부금영수증·지불결의서·투표·제직' },
  { key: '대외·소통·안내', icon: '📢', desc: '활동사진·온라인예배·교회안내' },
  { key: '예배·봉사운영', icon: '📋', desc: '현장 체크리스트·예배순서자 매뉴얼' },
  { key: '행정·재정·지식', icon: '🏛️', desc: '부서예산·회의록·사업과제·Wiki' }
];

// V2 마스터(33개) 기본 폴백 목록 (Portal_Programs 시트 조회 전/실패 시 사용)
const V2_PROGRAMS_FALLBACK = [
  { order: 10, id: 'PGM_MAIN_SHELL', category: '공통·프레임', name: '심플 메인화면·세션(10분)·바로가기·하단네비', desc: '메인 쉘 및 세션 관리', moduleKey: '', sheet: '', url: '', icon: '🏠', active: true, minRole: 'GUEST', perms: { GUEST: 'R', MEMBER: 'R', LEADER: 'R', STAFF: 'R', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 20, id: 'PGM_PROG_AUTH', category: '공통·프레임', name: '프로그램 목록·5단계 RBAC 권한관리(사용여부)', desc: '프로그램별 사용여부 및 5단계 권한 제어', moduleKey: '', sheet: 'Portal_Programs', url: '', icon: '🔐', active: true, minRole: 'ADMIN', perms: { GUEST: 'N', MEMBER: 'N', LEADER: 'N', STAFF: 'N', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 30, id: 'PGM_USER_ADMIN', category: '공통·프레임', name: '회원 가입승인·RBAC 등급·직분·소속반 관리', desc: '사용자 등급·직분·소속반 관리', moduleKey: '', sheet: 'Users_Master', url: '', icon: '👥', active: true, minRole: 'ADMIN', perms: { GUEST: 'N', MEMBER: 'N', LEADER: 'N', STAFF: 'N', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 40, id: 'PGM_SYS_LOGS', category: '공통·프레임', name: '시스템 설정 및 감사로그 조회', desc: '시스템 설정 및 감사로그 조회', moduleKey: '', sheet: 'System_Logs', url: '', icon: '📜', active: true, minRole: 'ADMIN', perms: { GUEST: 'N', MEMBER: 'N', LEADER: 'N', STAFF: 'N', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: false },
  { order: 50, id: 'PGM_ACCOUNT_REQ', category: '공통·프레임', name: '아이디 신청 / 비밀번호 초기화 (다락방)', desc: '신규 계정 발급 요청 및 초기화', moduleKey: 'darakbang', sheet: 'Darakbang_Requests', url: '', icon: '🔑', active: true, minRole: 'GUEST', perms: { GUEST: 'W', MEMBER: 'W', LEADER: 'W', STAFF: 'W', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },

  { order: 110, id: 'PGM_WORSHIP_RES', category: '예배·출석·예약', name: '예배참석예약 (1일전~3시간전 / 달란트 1.5배)', desc: '하루전~3시간전 예약 · 출석시 달란트 1.5배', moduleKey: '', sheet: 'Worship_Reservations', url: '', icon: '🎟️', active: true, minRole: 'MEMBER', perms: { GUEST: 'N', MEMBER: 'W', LEADER: 'W', STAFF: 'W', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 120, id: 'PGM_FORECAST', category: '예배·출석·예약', name: '참석예상인원 현황 (예배별·소속반별)', desc: '예배별·소속반별 사전예약 집계', moduleKey: '', sheet: 'Worship_Reservations', url: '', icon: '📊', active: true, minRole: 'LEADER', perms: { GUEST: 'N', MEMBER: 'N', LEADER: 'R', STAFF: 'R', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 130, id: 'PGM_ATTENDANCE', category: '예배·출석·예약', name: '출석현황 (화/금/안·대리출석·검색)', desc: '모바일 출석체크 및 통계', moduleKey: 'attendance', sheet: 'Attendance_Log', url: '', icon: '✅', active: true, minRole: 'MEMBER', perms: { GUEST: 'N', MEMBER: 'R', LEADER: 'W', STAFF: 'A', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 140, id: 'PGM_WEEKLY_DUTY', category: '예배·출석·예약', name: '이번 주 / 다음 주 담당표 (예배·식사·주차)', desc: '주간 사역일정·당번·공지 관리', moduleKey: 'weeklyDuty', sheet: 'Weekly_Duties', url: '', icon: '🗓️', active: true, minRole: 'MEMBER', perms: { GUEST: 'N', MEMBER: 'R', LEADER: 'W', STAFF: 'W', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 150, id: 'PGM_BULLETIN', category: '예배·출석·예약', name: '예배주보 PDF 뷰어 & 아카이브', desc: '최신 주보 자동 뷰어 및 과거 주보 검색', moduleKey: '', sheet: '', url: '', icon: '📰', active: true, minRole: 'GUEST', perms: { GUEST: 'R', MEMBER: 'R', LEADER: 'R', STAFF: 'W', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 160, id: 'PGM_CALENDAR', category: '예배·출석·예약', name: '다산교회 통합 캘린더', desc: '공용 캘린더 일정 조회', moduleKey: '', sheet: '', url: '', icon: '📅', active: true, minRole: 'GUEST', perms: { GUEST: 'R', MEMBER: 'R', LEADER: 'R', STAFF: 'W', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },

  { order: 210, id: 'PGM_MY_DASHBOARD', category: '신앙·소그룹·편의', name: '나의 신앙 대시보드 (로그인 확장뷰)', desc: '누적달란트·금월출석·예배예약·즐겨찾기', moduleKey: '', sheet: 'Users_Master', url: '', icon: '🪪', active: true, minRole: 'MEMBER', perms: { GUEST: 'N', MEMBER: 'R', LEADER: 'R', STAFF: 'R', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 220, id: 'PGM_TALENT', category: '신앙·소그룹·편의', name: '달란트 관리 (신청·승인/반려·검색·현황)', desc: '봉사·출석·활동 달란트 신청 및 승인/반려', moduleKey: '', sheet: 'Talent_Ledger', url: '', icon: '🪙', active: true, minRole: 'MEMBER', perms: { GUEST: 'N', MEMBER: 'W', LEADER: 'W', STAFF: 'A', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 230, id: 'PGM_OFFERINGS', category: '신앙·소그룹·편의', name: '헌금내역 조회 (본인 전용 격리)', desc: '본인 Google_Email 일치 헌금내역 격리 조회', moduleKey: 'offerings', sheet: 'Offerings_Log', url: '', icon: '🧾', active: true, minRole: 'MEMBER', perms: { GUEST: 'N', MEMBER: 'R', LEADER: 'R', STAFF: 'R', ADMIN: 'R' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 240, id: 'PGM_BOOK_REQ', category: '신앙·소그룹·편의', name: '서적·교과책 신청조회', desc: '신앙도서·교재 신청 및 지급 상태', moduleKey: 'bookRequest', sheet: 'Book_Requests', url: '', icon: '📚', active: true, minRole: 'MEMBER', perms: { GUEST: 'N', MEMBER: 'W', LEADER: 'W', STAFF: 'A', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 250, id: 'PGM_SMALLGROUP', category: '신앙·소그룹·편의', name: '안식일학교 9개반 소그룹 대시보드', desc: '소그룹 대시보드 및 리더(반장) 보고서 작성', moduleKey: '', sheet: 'SmallGroup_Reports', url: '', icon: '🌱', active: true, minRole: 'MEMBER', perms: { GUEST: 'N', MEMBER: 'R', LEADER: 'W', STAFF: 'A', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 260, id: 'PGM_PRAYER', category: '신앙·소그룹·편의', name: '중보기도신청 (전체/교역자 비공개)', desc: '기도제목 등록 및 전체/교역자 비공개 필터링', moduleKey: '', sheet: 'Prayer_Requests', url: '', icon: '🙏', active: true, minRole: 'MEMBER', perms: { GUEST: 'N', MEMBER: 'W', LEADER: 'W', STAFF: 'W', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },

  { order: 310, id: 'PGM_E_RECEIPT', category: '전자신청(모듈탑재)', name: '전자신청_기부금영수증', desc: '기부금영수증 신청 및 발급 처리', moduleKey: '', sheet: 'Donation_Receipts', url: '', icon: '📄', active: true, minRole: 'MEMBER', perms: { GUEST: 'N', MEMBER: 'W', LEADER: 'W', STAFF: 'A', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 320, id: 'PGM_E_VOUCHER', category: '전자신청(모듈탑재)', name: '전자결재_지불결의서', desc: '지불결의서 기안/부서조회 및 결재', moduleKey: '', sheet: 'Payment_Vouchers', url: '', icon: '💳', active: true, minRole: 'STAFF', perms: { GUEST: 'N', MEMBER: 'N', LEADER: 'N', STAFF: 'W', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 330, id: 'PGM_E_SUGGEST', category: '전자신청(모듈탑재)', name: '전자신청_제안함 및 제안관리', desc: '제안함 신청 및 관리 (2027-Q1 순차)', moduleKey: '', sheet: 'Suggestions', url: '', icon: '💡', active: false, minRole: 'MEMBER', perms: { GUEST: 'N', MEMBER: 'W', LEADER: 'W', STAFF: 'A', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 340, id: 'PGM_E_VOTE', category: '전자신청(모듈탑재)', name: '전자투표_직원회안건', desc: '직원회 전용 온라인 투표 (2027-Q1 순차)', moduleKey: '', sheet: 'Staff_Votes', url: '', icon: '🗳️', active: false, minRole: 'STAFF', perms: { GUEST: 'N', MEMBER: 'N', LEADER: 'N', STAFF: 'W', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 350, id: 'PGM_OFFICER_HUB', category: '전자신청(모듈탑재)', name: '전체 제직 공지·수련회 자료·제직투표', desc: '직분 보조필터 대상 제직 공지·자료·투표', moduleKey: '', sheet: 'Site_Contents', url: '', icon: '📌', active: false, minRole: 'MEMBER', perms: { GUEST: 'N', MEMBER: 'R*', LEADER: 'R*', STAFF: 'W', ADMIN: 'A' }, officerFilter: 'OFFICER_ONLY', showPc: true, showMobile: true },

  { order: 410, id: 'PGM_GALLERY', category: '대외·소통·안내', name: '활동사진 갤러리 (정방향/역방향 슬라이드)', desc: '구글 드라이브 연동 활동사진 앨범', moduleKey: '', sheet: '', url: 'https://drive.google.com/drive/folders/1cLRT8O-o6085G3H9J0u6_3W_Z8Y2X1V0', icon: '🖼️', active: true, minRole: 'GUEST', perms: { GUEST: 'R', MEMBER: 'R', LEADER: 'R', STAFF: 'W', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 420, id: 'PGM_MEDIA_QT', category: '대외·소통·안내', name: '온라인예배·갓모닝 새벽묵상 & 카톡공유', desc: '유튜브 온라인예배 및 새벽묵상 공유', moduleKey: '', sheet: 'Site_Contents', url: 'https://www.youtube.com/@sda5239', icon: '🎥', active: true, minRole: 'GUEST', perms: { GUEST: 'R', MEMBER: 'R', LEADER: 'R', STAFF: 'R', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 430, id: 'PGM_CHURCH_INFO', category: '대외·소통·안내', name: '교회소개·예배안내·오시는 길·7대 헌금설명', desc: '교회 안내 및 예배·헌금 정보', moduleKey: '', sheet: 'Site_Contents', url: '', icon: '⛪', active: true, minRole: 'GUEST', perms: { GUEST: 'R', MEMBER: 'R', LEADER: 'R', STAFF: 'R', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 440, id: 'PGM_MISSION_CLUB', category: '대외·소통·안내', name: '패스파인더·어드벤처러·OneVoice27/Light27', desc: '선교 캠페인 및 클럽 안내 (2027-Q1)', moduleKey: '', sheet: 'Site_Contents', url: '', icon: '⛺', active: false, minRole: 'GUEST', perms: { GUEST: 'R', MEMBER: 'W', LEADER: 'W', STAFF: 'W', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },

  { order: 510, id: 'PGM_CHECKLIST4', category: '예배·봉사운영', name: '4대 현장 체크리스트 (장로·집사·식사·안전)', desc: '모바일 현장 점검 체크리스트 (2027-Q1)', moduleKey: '', sheet: 'Checklists_Log', url: '', icon: '📋', active: false, minRole: 'LEADER', perms: { GUEST: 'N', MEMBER: 'N', LEADER: 'W', STAFF: 'A', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 520, id: 'PGM_WORSHIP_GUIDE', category: '예배·봉사운영', name: '예배순서자 매뉴얼 (사회·기도·설교자)', desc: '예배 진행 흐름 및 표준 가이드 (2027-Q1)', moduleKey: '', sheet: '', url: '', icon: '📘', active: false, minRole: 'MEMBER', perms: { GUEST: 'N', MEMBER: 'R', LEADER: 'R', STAFF: 'W', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },

  { order: 610, id: 'PGM_DEPT_BUDGET', category: '행정·재정·지식', name: '부서별 지출·예산 관리 조회', desc: '소속 부서 예산·지출 조회 (2027-Q1)', moduleKey: '', sheet: 'Dept_Budgets', url: '', icon: '💼', active: false, minRole: 'STAFF', perms: { GUEST: 'N', MEMBER: 'N', LEADER: 'N', STAFF: 'R', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: false },
  { order: 620, id: 'PGM_MINUTES', category: '행정·재정·지식', name: '직원회 회의록 보안 아카이브', desc: '직원회 의결 회의록 보안 열람 (2027-Q1)', moduleKey: '', sheet: 'Minutes_Archive', url: '', icon: '🗂️', active: false, minRole: 'STAFF', perms: { GUEST: 'N', MEMBER: 'N', LEADER: 'N', STAFF: 'R', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true },
  { order: 630, id: 'PGM_PROJECTS27', category: '행정·재정·지식', name: '2027 주요사업과제 관리', desc: '2027 핵심 사업 진척률 관리 (2027-순차)', moduleKey: '', sheet: 'Key_Projects', url: '', icon: '🎯', active: false, minRole: 'STAFF', perms: { GUEST: 'N', MEMBER: 'N', LEADER: 'N', STAFF: 'W', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: false },
  { order: 640, id: 'PGM_CONTRACTS', category: '행정·재정·지식', name: '보험계약·자동이체 통합 관리', desc: '보험 만기 및 자동이체 관리 (2027-순차)', moduleKey: '', sheet: 'Contracts_Admin', url: '', icon: '🛡️', active: false, minRole: 'STAFF', perms: { GUEST: 'N', MEMBER: 'N', LEADER: 'N', STAFF: 'R', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: false },
  { order: 650, id: 'PGM_WIKI', category: '행정·재정·지식', name: '다산교회 Wiki (내규·절기매뉴얼·장비)', desc: '내규·절기매뉴얼·장비 문서 (2027-순차)', moduleKey: '', sheet: '', url: '', icon: '📖', active: false, minRole: 'MEMBER', perms: { GUEST: 'N', MEMBER: 'R', LEADER: 'R', STAFF: 'W', ADMIN: 'A' }, officerFilter: 'N', showPc: true, showMobile: true }
];

let activeProgramList = V2_PROGRAMS_FALLBACK.slice();

function toRbacCode(raw) {
  const s = String(raw || '').trim();
  const upper = s.toUpperCase();
  if (['GUEST', 'MEMBER', 'LEADER', 'STAFF', 'ADMIN'].includes(upper)) return upper;
  if (s === '관리자' || s === '최고관리자') return 'ADMIN';
  if (s === '직원' || s === '운영자' || s === '직원(운영자)' || s === '직원·운영자') return 'STAFF';
  if (s === '리더' || s === '반장' || s === '리더(반장)' || s === '리더·반장') return 'LEADER';
  if (s === '성도' || s === '다산교회' || s === '제직') return 'MEMBER';
  return 'GUEST';
}

function getCurrentRbacCode() {
  return toRbacCode(state.currentRole || 'GUEST');
}

function getCurrentUserPosition() {
  return String(state.currentUserProfile?.position || '').trim();
}

function hasOfficerPosition(position) {
  return OFFICER_POSITIONS.includes(String(position || '').trim());
}

function normalizeProgramRow(raw, idx = 0) {
  const id = String(raw.Program_ID || raw.id || raw['프로그램ID'] || '').trim();
  const fallback = V2_PROGRAMS_FALLBACK.find(p => p.id === id) || {};
  const moduleClass = String(raw.모듈클래스명 || raw.moduleClass || fallback.moduleClass || '').trim();

  let moduleKey = fallback.moduleKey || '';
  if (!moduleKey) {
    if (moduleClass === 'AttendanceModule') moduleKey = 'attendance';
    else if (moduleClass === 'WeeklyDutyModule') moduleKey = 'weeklyDuty';
    else if (moduleClass === 'DarakbangModule') moduleKey = 'darakbang';
    else if (moduleClass === 'OfferingsModule') moduleKey = 'offerings';
    else if (moduleClass === 'BookRequestModule') moduleKey = 'bookRequest';
  }

  const refSource = String(raw.연동시트_및_참조소스 || raw.sheet || fallback.sheet || '').trim();
  let sheet = fallback.sheet || '';
  let url = fallback.url || '';
  if (refSource.startsWith('http')) {
    url = refSource;
  } else if (refSource) {
    const firstToken = refSource.split('/')[0].trim();
    if (/^[A-Za-z0-9_]+$/.test(firstToken)) sheet = firstToken;
  }

  const activeRaw = raw.사용여부 !== undefined ? raw.사용여부 : raw.active;
  const active = activeRaw !== undefined
    ? (activeRaw === true || String(activeRaw).trim().toUpperCase() === 'Y')
    : (fallback.active !== undefined ? fallback.active : true);

  const pcRaw = raw.PC노출 !== undefined ? raw.PC노출 : raw.showPc;
  const mobRaw = raw.모바일노출 !== undefined ? raw.모바일노출 : raw.showMobile;

  return {
    order: Number(raw.정렬순서 ?? raw.order ?? fallback.order ?? (idx + 1) * 10) || 999,
    id: id || `PGM_${idx + 1}`,
    category: String(raw.기능분류 || raw.category || fallback.category || '공통·프레임').trim(),
    name: String(raw.프로그램명 || raw.name || fallback.name || id).trim(),
    desc: String(raw.권한_보안_및_개발비고 || raw.desc || fallback.desc || refSource || '').trim(),
    moduleKey,
    sheet,
    url,
    icon: fallback.icon || '📌',
    active,
    minRole: toRbacCode(raw.최소권한코드 || raw.minRole || fallback.minRole || 'GUEST'),
    perms: {
      GUEST: String(raw['Lv0_GUEST(외부인)'] || raw.perms?.GUEST || fallback.perms?.GUEST || 'N').trim(),
      MEMBER: String(raw['Lv1_MEMBER(성도)'] || raw.perms?.MEMBER || fallback.perms?.MEMBER || 'N').trim(),
      LEADER: String(raw['Lv2_LEADER(리더·반장)'] || raw.perms?.LEADER || fallback.perms?.LEADER || 'N').trim(),
      STAFF: String(raw['Lv3_STAFF(직원·운영자)'] || raw.perms?.STAFF || fallback.perms?.STAFF || 'N').trim(),
      ADMIN: String(raw['Lv4_ADMIN(관리자)'] || raw.perms?.ADMIN || fallback.perms?.ADMIN || 'A').trim()
    },
    officerFilter: String(raw.직분보조필터 || raw.officerFilter || fallback.officerFilter || 'N').trim(),
    showPc: pcRaw !== undefined ? (pcRaw === true || String(pcRaw).trim().toUpperCase() === 'Y') : (fallback.showPc ?? true),
    showMobile: mobRaw !== undefined ? (mobRaw === true || String(mobRaw).trim().toUpperCase() === 'Y') : (fallback.showMobile ?? true)
  };
}

function canAccessProgram(pgm, roleCode, position, isMobile = false) {
  const userLv = RBAC_RANK[roleCode] || 1;
  const adminLv = RBAC_RANK.ADMIN;

  if (!pgm.active && userLv < adminLv) return false;
  if (isMobile && pgm.showMobile === false) return false;
  if (!isMobile && pgm.showPc === false) return false;

  const perm = pgm.perms?.[roleCode] || 'N';
  if (perm === 'N') return false;

  if (pgm.officerFilter === 'OFFICER_ONLY' && perm === 'R*') {
    return userLv >= RBAC_RANK.STAFF || hasOfficerPosition(position);
  }
  return true;
}

function saveSession(role, profile = null, idToken = '') {
  const code = toRbacCode(role);
  if (!code || code === 'GUEST') { localStorage.removeItem(SESSION_KEY); return; }
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    role: code, profile, idToken, expiresAt: Date.now() + SESSION_MS
  }));
}

function loadSession() {
  try {
    const d = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!d || Date.now() >= d.expiresAt) { localStorage.removeItem(SESSION_KEY); return null; }
    d.role = toRbacCode(d.role);
    return d;
  } catch (e) { return null; }
}

function extendSession() {
  const d = loadSession();
  if (!d) return false;
  d.expiresAt = Date.now() + SESSION_MS;
  localStorage.setItem(SESSION_KEY, JSON.stringify(d));
  return true;
}

function startSessionLoop(onTick, onExpire) {
  if (sessionTimerHandle) clearInterval(sessionTimerHandle);
  const tick = () => {
    const d = loadSession();
    if (!d) { clearInterval(sessionTimerHandle); onExpire(); return; }
    const sec = Math.max(0, Math.floor((d.expiresAt - Date.now()) / 1000));
    onTick(`${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`);
    if (sec <= 0) { clearInterval(sessionTimerHandle); onExpire(); }
  };
  tick();
  sessionTimerHandle = setInterval(tick, 1000);
}

function showToast(msg) {
  const el = document.getElementById('portal-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(window.__dscToast);
  window.__dscToast = setTimeout(() => el.classList.add('hidden'), 2500);
}

// 즐겨찾기(Quick 메뉴) 관리
function getQuickFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(QUICK_FAV_KEY) || 'null');
    if (Array.isArray(saved) && saved.length) return saved;
  } catch (e) {}
  return activeProgramList.filter(p => p.active && p.id !== 'PGM_MAIN_SHELL').slice(0, 6).map(p => p.id);
}

function toggleQuickFavorite(serviceId) {
  const current = getQuickFavorites();
  const exists = current.includes(serviceId);
  const next = exists ? current.filter(id => id !== serviceId) : [...current, serviceId];
  localStorage.setItem(QUICK_FAV_KEY, JSON.stringify(next));
  showToast(exists ? '즐겨찾기에서 해제했습니다.' : '⭐ 즐겨찾기메뉴에 추가했습니다.');
  if (state.currentTab === 'my') renderMyTab();
}

function makeSlideSvg(title, sub, c1, c2) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 600'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs>
    <rect width='800' height='600' fill='url(#g)'/>
    <circle cx='680' cy='110' r='140' fill='rgba(212,175,55,0.16)'/>
    <text x='50%' y='46%' text-anchor='middle' fill='#d4af37' font-size='44' font-family='sans-serif' font-weight='bold'>${title}</text>
    <text x='50%' y='57%' text-anchor='middle' fill='#ffffff' font-size='22' font-family='sans-serif' opacity='0.9'>${sub}</text>
  </svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

const DEFAULT_SLIDES = [
  { thumb: makeSlideSvg('다산교회 안식일예배', '매주 토요일 오전 10:00 · 본당', '#1a252f', '#2c3e50'), title: '안식일학교 및 대예배', sub: '매주 토요일 09:30 / 10:00 · 다산교회 본당' },
  { thumb: makeSlideSvg('화요 · 금요 저녁예배', '말씀과 중보기도로 세워가는 공동체', '#1d3557', '#1a252f'), title: '화요 · 금요 저녁예배', sub: '매주 화·금 저녁 19:30 · 함께 기도해요' },
  { thumb: makeSlideSvg('함께 섬기는 다산교회', '소그룹 · 패스파인더 · 어드벤처러', '#263849', '#141d26'), title: '다산교회 활동앨범', sub: '정방향 · 역방향 · 정지 제어 가능' }
];

const smoothVerticalSlider = {
  items: DEFAULT_SLIDES.slice(),
  index: 0,
  direction: 1,
  rafId: null,
  lastTick: 0,
  intervalMs: 4200,
  slideMs: 650,
  transitioning: false,

  setItems(albums) {
    const flat = [];
    (albums || []).forEach(alb => (alb.photos || []).forEach(p => {
      if (p && p.thumb) flat.push({ thumb: p.thumb, title: alb.title || '다산교회 활동사진', sub: p.name || '' });
    }));
    this.items = flat.length ? flat.slice(0, 20) : DEFAULT_SLIDES.slice();
    this.index = 0;
    this.renderImmediate();
    this.startLoop();
  },

  step(delta) {
    if (!this.items.length || this.transitioning) return;
    const img = document.getElementById('hero-gallery-img');
    if (!img) {
      this.index = (this.index + delta + this.items.length) % this.items.length;
      this.renderImmediate();
      return;
    }
    this.transitioning = true;
    const dirSign = delta >= 0 ? 1 : -1;
    const nextIdx = (this.index + delta + this.items.length) % this.items.length;
    const nextItem = this.items[nextIdx];

    img.style.transition = `transform ${this.slideMs * 0.45}ms ease-in, opacity ${this.slideMs * 0.45}ms ease-in`;
    img.style.transform = `translateY(${dirSign * -28}px)`;
    img.style.opacity = '0.15';

    setTimeout(() => {
      this.index = nextIdx;
      img.src = nextItem.thumb;
      img.style.transition = 'none';
      img.style.transform = `translateY(${dirSign * 28}px)`;
      img.style.opacity = '0.15';

      const cap = document.getElementById('hero-gallery-caption');
      const sub = document.getElementById('hero-gallery-sub');
      const cnt = document.getElementById('hero-gallery-counter');
      if (cap) cap.textContent = nextItem.title;
      if (sub) sub.textContent = nextItem.sub || '';
      if (cnt) cnt.textContent = `${this.index + 1} / ${this.items.length}`;

      void img.offsetHeight;
      img.style.transition = `transform ${this.slideMs * 0.55}ms ease-out, opacity ${this.slideMs * 0.55}ms ease-out`;
      img.style.transform = 'translateY(0)';
      img.style.opacity = '1';

      setTimeout(() => {
        img.style.transition = '';
        img.style.transform = '';
        this.transitioning = false;
      }, this.slideMs * 0.55 + 30);
    }, this.slideMs * 0.45);
  },

  setDirection(dir) {
    this.direction = dir;
    this.lastTick = performance.now();
    this.updateBtns();
    this.startLoop();
  },

  updateBtns() {
    const active = 'px-2 py-1 rounded-md text-[11px] font-bold bg-navy text-white dark:bg-gold dark:text-navyDark transition';
    const idle = 'px-2 py-1 rounded-md text-[11px] font-bold text-gray-600 dark:text-slate-300 transition';
    const f = document.getElementById('btn-dir-fwd');
    const p = document.getElementById('btn-dir-pause');
    const r = document.getElementById('btn-dir-rev');
    if (f) f.className = this.direction === 1 ? active : idle;
    if (p) p.className = this.direction === 0 ? active : idle;
    if (r) r.className = this.direction === -1 ? active : idle;
  },

  startLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.lastTick = performance.now();
    const loop = now => {
      if (this.direction !== 0 && this.items.length > 1 && !this.transitioning) {
        if (now - this.lastTick >= this.intervalMs) {
          this.lastTick = now;
          this.step(this.direction);
        }
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  },

  renderImmediate() {
    const img = document.getElementById('hero-gallery-img');
    const cap = document.getElementById('hero-gallery-caption');
    const sub = document.getElementById('hero-gallery-sub');
    const cnt = document.getElementById('hero-gallery-counter');
    const item = this.items[this.index] || DEFAULT_SLIDES[0];
    if (img) { img.src = item.thumb; img.style.opacity = '1'; img.style.transform = 'translateY(0)'; }
    if (cap) cap.textContent = item.title;
    if (sub) sub.textContent = item.sub || '';
    if (cnt) cnt.textContent = `${this.index + 1} / ${this.items.length}`;
    this.updateBtns();
  }
};

let bgmPlaying = false;
function toggleAlbumBgm() {
  const bar = document.getElementById('album-bgm-player');
  const wrap = document.getElementById('bgm-iframe-wrap');
  const label = document.getElementById('bgm-label');
  bgmPlaying = !bgmPlaying;

  if (bar) bar.classList.toggle('hidden', !bgmPlaying);
  if (label) label.textContent = bgmPlaying ? 'BGM 정지' : 'BGM 재생';

  if (wrap) {
    wrap.innerHTML = bgmPlaying
      ? `<iframe width="120" height="68" src="https://www.youtube.com/embed/${ALBUM_BGM_VIDEO_ID}?autoplay=1&loop=1&playlist=${ALBUM_BGM_VIDEO_ID}" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin"></iframe>`
      : '';
  }
  showToast(bgmPlaying ? '♪ 앨범 배경음악을 재생합니다.' : '♪ 앨범 배경음악을 정지했습니다.');
}

function getUpcomingWorshipSlots() {
  const now = new Date();
  return [
    { name: '화요예배', day: 2, hour: 19, min: 30 },
    { name: '금요저녁예배', day: 5, hour: 19, min: 30 },
    { name: '안식일예배', day: 6, hour: 10, min: 0 }
  ].map(s => {
    const target = new Date(now);
    const diffDays = (s.day - now.getDay() + 7) % 7;
    target.setDate(now.getDate() + diffDays);
    target.setHours(s.hour, s.min, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 7);
    const openAt = new Date(target.getTime() - 24 * 3600 * 1000);
    const closeAt = new Date(target.getTime() - 3 * 3600 * 1000);
    const dateStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    return { ...s, target, openAt, closeAt, dateStr, isOpen: now >= openAt && now <= closeAt, isClosed: now > closeAt };
  }).sort((a, b) => a.target - b.target);
}

// 나의 신앙 대시보드
function renderPersonalizedCard() {
  const card = document.getElementById('personalized-card');
  if (!card) return;
  const roleCode = getCurrentRbacCode();
  const userLv = RBAC_RANK[roleCode] || 1;
  const roleKo = RBAC_LABEL_KO[roleCode] || '외부인';
  const p = state.currentUserProfile;
  const position = getCurrentUserPosition();
  const real = Boolean(state.currentIdToken) && Boolean(p);

  if (userLv < 2) {
    card.innerHTML = `
      <div class="bg-white dark:bg-slate-900 rounded-2xl px-3.5 py-2.5 shadow-sm border border-gray-200/80 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
        <span class="font-bold text-navy dark:text-white">나의 신앙 대시보드</span>
        <span class="text-[11px] text-gray-500 dark:text-slate-400">Lv.1 외부인</span>
      </div>`;
    return;
  }

  card.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-2xl px-3.5 py-2.5 shadow-sm border border-gray-200/80 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
      <div class="flex items-center gap-2 min-w-0">
        <span class="font-bold text-navy dark:text-gold shrink-0">Lv.${userLv} ${roleKo}</span>
        ${position ? `<span class="px-1.5 py-0.5 rounded bg-amber-100/80 dark:bg-amber-900/30 text-[10px] font-bold text-amber-900 dark:text-gold shrink-0">${position}</span>` : ''}
        <span class="truncate text-gray-600 dark:text-slate-300">${real ? sanitizeMemberName(p.name) : '시연 모드'} · ${real ? (p.groupName || '미배정') : '겸손반'}</span>
      </div>
      <span class="font-bold text-emerald-700 dark:text-emerald-400 shrink-0">${real ? `${Number(p.talent || 0)}T` : '120T'}</span>
    </div>`;
}

// 기능분류별 전체 메뉴 렌더링
function renderAllBusinessMenu() {
  const grid = document.getElementById('all-business-menu-grid');
  const badge = document.getElementById('all-menu-role-badge');
  const roleCode = getCurrentRbacCode();
  const userLv = RBAC_RANK[roleCode] || 1;
  const roleKo = RBAC_LABEL_KO[roleCode] || '외부인';
  const position = getCurrentUserPosition();
  const isMobile = window.innerWidth < 768;
  const favIds = getQuickFavorites();

  if (badge) {
    badge.textContent = `Lv.${userLv} ${roleKo}${position ? ` · ${position}` : ''}`;
  }
  if (!grid) return;

  const candidates = activeProgramList
    .slice()
    .sort((a, b) => a.order - b.order)
    .filter(p => p.id !== 'PGM_MAIN_SHELL' && (p.active || userLv >= RBAC_RANK.ADMIN));

  const grouped = new Map();
  CATEGORY_ORDER.forEach(catMeta => grouped.set(catMeta.key, []));
  candidates.forEach(pgm => {
    const cat = pgm.category || '공통·프레임';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat).push(pgm);
  });

  grid.className = 'space-y-3.5';
  grid.innerHTML = CATEGORY_ORDER
    .map(catMeta => {
      const items = grouped.get(catMeta.key) || [];
      if (!items.length) return '';

      return `
        <div class="space-y-2">
          <div class="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-1">
            <div class="flex items-center gap-1.5 min-w-0">
              <span>${catMeta.icon}</span>
              <h3 class="text-xs font-extrabold text-navy dark:text-gold truncate">${catMeta.key}</h3>
              <span class="text-[10px] text-gray-400 hidden sm:inline truncate">· ${catMeta.desc}</span>
            </div>
            <span class="text-[10px] font-semibold text-gray-400 shrink-0">${items.length}개</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            ${items.map(pgm => {
              const ok = pgm.active && canAccessProgram(pgm, roleCode, position, isMobile);
              const isFav = favIds.includes(pgm.id);
              const perm = pgm.perms?.[roleCode] || 'N';
              return `
                <div class="p-3 rounded-xl border transition flex flex-col justify-between gap-2 ${ok
                  ? 'bg-skyBg/70 hover:bg-skyBg dark:bg-slate-800 dark:hover:bg-slate-700/80 border-gray-200 dark:border-slate-700'
                  : 'opacity-60 bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-800'}">
                  <button type="button" onclick="openServiceById('${pgm.id}')" class="text-left">
                    <div class="flex items-center justify-between gap-1">
                      <span class="text-base">${ok ? pgm.icon : '🔒'}</span>
                      <div class="flex items-center gap-1">
                        ${!pgm.active ? '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">준비중</span>' : ''}
                        <span class="text-[10px] font-semibold text-gray-400">${pgm.minRole}${perm === 'A' ? '·관리' : ''}</span>
                      </div>
                    </div>
                    <div class="font-bold text-xs text-navy dark:text-white mt-1 line-clamp-1">${pgm.name}</div>
                    <div class="text-[10px] text-gray-500 dark:text-slate-400 line-clamp-1 mt-0.5">${pgm.desc}</div>
                  </button>
                  <div class="flex items-center justify-between pt-0.5">
                    <span class="text-[10px] text-gray-400 font-mono">${pgm.id}</span>
                    <button type="button" onclick="toggleQuickFavorite('${pgm.id}')"
                      class="text-[11px] font-bold ${isFav ? 'text-amber-500 dark:text-gold' : 'text-gray-400 hover:text-amber-500'}">
                      ${isFav ? '★ 즐겨찾기' : '☆ 즐겨찾기'}
                    </button>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    })
    .filter(Boolean)
    .join('');
}

// 3단 고정 네비게이션 전환: [전체메뉴] [예배출석및예약] [즐겨찾기메뉴]
function switchBottomTab(tab) {
  state.currentTab = tab;
  ['all', 'worship', 'my'].forEach(t => {
    const el = document.getElementById('tab-view-' + t);
    if (el) el.classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
    const active = btn.getAttribute('data-tab') === tab;
    btn.className = active
      ? 'bottom-nav-btn flex flex-col items-center justify-center gap-0.5 text-navy dark:text-gold font-bold transition'
      : 'bottom-nav-btn flex flex-col items-center justify-center gap-0.5 text-gray-500 dark:text-slate-400 font-medium transition';
  });
  if (tab === 'all') renderAllBusinessMenu();
  if (tab === 'worship') renderWorshipTab();
  if (tab === 'my') renderMyTab();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderWorshipTab() {
  const el = document.getElementById('tab-view-worship');
  if (!el) return;
  const slots = getUpcomingWorshipSlots();
  el.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800 space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="font-bold text-sm text-navy dark:text-white">📅 예배참석예약 및 출석</h2>
        <span class="text-[11px] font-bold text-amber-700 dark:text-gold">예약출석 달란트 1.5배</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" onclick="openWorshipReserveForm()"
          class="p-3 rounded-xl bg-navy dark:bg-gold text-white dark:text-navyDark font-bold text-xs text-left">
          🎟️ 예배참석예약<div class="text-[10px] font-normal opacity-85 mt-0.5">24h~3h 전 예약</div>
        </button>
        <button type="button" onclick="openServiceById('PGM_ATTENDANCE')"
          class="p-3 rounded-xl bg-skyBg dark:bg-slate-800 text-navy dark:text-white font-bold text-xs text-left border border-gray-200 dark:border-slate-700">
          ✅ 예배 출석체크<div class="text-[10px] font-normal text-gray-500 mt-0.5">화/금/안 출석 등록</div>
        </button>
      </div>
      <div class="space-y-1.5 pt-1">
        ${slots.map(s => `<div class="flex justify-between items-center p-2.5 rounded-xl bg-skyBg/60 dark:bg-slate-800 text-xs">
          <span class="font-bold">${s.name} (${s.dateStr})</span>
          <span class="text-[11px] font-bold ${s.isOpen ? 'text-blue-600' : 'text-gray-500'}">${s.isOpen ? '예약가능' : s.isClosed ? '마감' : '오픈전'}</span>
        </div>`).join('')}
      </div>
    </div>`;
}

// [즐겨찾기메뉴]
function renderMyTab() {
  const el = document.getElementById('tab-view-my');
  if (!el) return;
  const roleCode = getCurrentRbacCode();
  const userLv = RBAC_RANK[roleCode] || 1;
  const position = getCurrentUserPosition();
  const isMobile = window.innerWidth < 768;
  const favIds = getQuickFavorites();
  const favServices = activeProgramList.filter(p => favIds.includes(p.id) && (p.active || userLv >= RBAC_RANK.ADMIN));

  el.innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800 space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="font-bold text-sm text-navy dark:text-white">⭐ 즐겨찾기메뉴</h2>
          <p class="text-[11px] text-gray-500 dark:text-slate-400">자주 쓰는 메뉴를 빠르게 실행하세요</p>
        </div>
        <button type="button" onclick="handleAuthClick()" class="bg-navy dark:bg-gold text-white dark:text-navyDark text-xs font-bold px-3 py-1.5 rounded-xl">
          ${userLv >= 2 ? '로그아웃' : '로그인'}
        </button>
      </div>

      ${favServices.length ? `
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          ${favServices.map(s => {
            const ok = s.active && canAccessProgram(s, roleCode, position, isMobile);
            return `
              <div class="relative p-3 rounded-xl border bg-skyBg/70 dark:bg-slate-800 border-gray-200 dark:border-slate-700 flex flex-col justify-between gap-2">
                <button type="button" onclick="openServiceById('${s.id}')" class="text-left ${ok ? '' : 'opacity-60'}">
                  <div class="text-base">${ok ? s.icon : '🔒'}</div>
                  <div class="font-bold text-xs text-navy dark:text-white mt-1">${s.name}</div>
                  <div class="text-[10px] text-gray-500 truncate">${s.desc}</div>
                </button>
                <button type="button" onclick="toggleQuickFavorite('${s.id}')"
                  class="self-end text-[10px] font-bold text-amber-600 dark:text-gold hover:underline">
                  ★ 즐겨찾기 해제
                </button>
              </div>`;
          }).join('')}
        </div>` : `<div class="text-center py-4 text-xs text-gray-500">등록된 즐겨찾기 메뉴가 없습니다. 아래에서 추가해 주세요.</div>`}
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800 space-y-2">
      <div class="font-bold text-xs text-navy dark:text-white">➕ 즐겨찾기 편집</div>
      <div class="flex flex-wrap gap-1.5">
        ${activeProgramList.filter(p => p.id !== 'PGM_MAIN_SHELL' && (p.active || userLv >= RBAC_RANK.ADMIN)).map(s => {
          const isFav = favIds.includes(s.id);
          return `<button type="button" onclick="toggleQuickFavorite('${s.id}')"
            class="px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition ${isFav ? 'bg-gold/20 border-gold text-navy dark:text-gold' : 'bg-skyBg/60 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300'}">
            ${isFav ? '★' : '☆'} ${s.name}
          </button>`;
        }).join('')}
      </div>
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200/80 dark:border-slate-800 space-y-2">
      <div class="font-bold text-xs text-navy dark:text-white">🎭 5단계 권한 시연 (현재: Lv.${userLv} ${RBAC_LABEL_KO[roleCode]})</div>
      <div class="grid grid-cols-1 gap-1.5">
        ${['GUEST', 'MEMBER', 'LEADER', 'STAFF', 'ADMIN'].map(code => `<button type="button" onclick="changePreviewRole('${code}')"
          class="flex justify-between px-3 py-2 rounded-xl border text-xs font-bold ${roleCode === code ? 'bg-navy text-white border-navy dark:bg-gold dark:text-navyDark' : 'bg-skyBg/60 dark:bg-slate-800 border-gray-200 dark:border-slate-700'}">
          <span>Lv.${RBAC_RANK[code]} ${RBAC_LABEL_KO[code]} (${code})</span><span>${roleCode === code ? '● 현재' : '전환'}</span>
        </button>`).join('')}
      </div>
    </div>`;
}

function openWorshipReserveForm() {
  const slots = getUpcomingWorshipSlots();
  const modal = document.getElementById('service-modal');
  document.getElementById('modal-icon').textContent = '🎟️';
  document.getElementById('modal-title').textContent = '예배참석 사전예약';
  document.getElementById('modal-subtitle').textContent = '예약 후 출석 시 달란트 1.5배 적립';
  document.getElementById('modal-body').innerHTML = `
    <form onsubmit="handleWorshipReserveSubmit(event)" class="space-y-3 text-xs">
      <div>
        <label class="block font-bold mb-1">대상 예배</label>
        <select name="예배선택" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700">
          ${slots.map(s => `<option value="${s.dateStr}|${s.name}">${s.name} (${s.dateStr}) ${s.isOpen ? '· 예약가능' : ''}</option>`).join('')}
        </select>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block font-bold mb-1">참석 구분</label>
          <select name="참석유형" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700">
            <option value="대면">대면</option><option value="온라인">온라인</option>
          </select>
        </div>
        <div>
          <label class="block font-bold mb-1">동반 인원</label>
          <input type="number" name="동반인원" min="0" max="10" value="0" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700" />
        </div>
      </div>
      <button type="submit" class="w-full py-2.5 rounded-xl bg-navy dark:bg-gold text-white dark:text-navyDark font-bold">예약 신청하기</button>
    </form>`;
  modal.classList.remove('hidden');
}

async function handleWorshipReserveSubmit(e) {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target).entries());
  const [dateStr, serviceName] = String(fd['예배선택'] || '').split('|');
  if (!state.currentIdToken) {
    showToast(`✅ [시연] ${serviceName}(${dateStr}) 예약 완료`);
    closeServiceModal();
    return;
  }
  const res = await callApi('insertRow', {
    sheetName: 'Worship_Reservations',
    record: { '예배일자': dateStr, '예배구분': serviceName, '참석유형': fd['참석유형'], '동반인원': Number(fd['동반인원'] || 0), '달란트배율': 1.5, '상태': '예약완료' }
  });
  if (res && res.ok) { showToast('✅ 예배참석예약이 등록되었습니다.'); closeServiceModal(); }
  else alert('오류: ' + ((res && res.error) || '권한 확인 필요'));
}

async function renderSheetHistory(sheetName, targetId) {
  const box = document.getElementById(targetId);
  if (!box) return;
  if (!state.currentIdToken) {
    box.innerHTML = `<div class="p-3 rounded-xl bg-gray-50 dark:bg-slate-800 text-gray-500">💡 로그인하면 실제 시트(${sheetName}) 내역이 표시됩니다.</div>`;
    return;
  }
  const res = await callApi('querySheet', { sheetName });
  if (!res || !res.ok) {
    box.innerHTML = `<div class="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300">${(res && res.error) || '조회 실패'}</div>`;
    return;
  }
  const rows = (res.rows || []).slice().reverse().slice(0, 8);
  if (!rows.length) {
    box.innerHTML = `<div class="p-3 rounded-xl bg-gray-50 dark:bg-slate-800 text-gray-500">등록된 내역이 없습니다.</div>`;
    return;
  }

  if (sheetName === 'Talent_Ledger') {
    box.innerHTML = `<div class="font-bold text-navy dark:text-white">최근 달란트 내역</div>` + rows.map(r => `
      <div class="p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="font-bold truncate">${r['활동구분'] || '활동'} · ${Number(r['신청달란트'] || 0)}T</div>
          <div class="text-[11px] text-gray-500 truncate">${r['성명'] || ''} · ${r['증빙메모'] || ''}</div>
        </div>
        <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-gold shrink-0">
          ${r['승인여부'] || '승인대기'}
        </span>
      </div>`).join('');
    return;
  }

  box.innerHTML = `<div class="font-bold text-navy dark:text-white">최근 중보기도 제목</div>` + rows.map(r => `
    <div class="p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-1">
      <div class="flex items-center justify-between text-[11px]">
        <span class="font-bold text-navy dark:text-gold">${r['기도구분'] || '중보기도'} · ${r['성명'] || ''}</span>
        <span class="text-gray-400">${r['공개범위'] || '전체'}</span>
      </div>
      <div class="text-xs text-gray-700 dark:text-slate-200 whitespace-pre-line">${r['기도제목'] || ''}</div>
    </div>`).join('');
}

async function handleTalentSubmit(e) {
  e.preventDefault();
  if (!state.currentIdToken) {
    showToast('✅ [시연] 달란트 신청이 접수되었습니다.');
    closeServiceModal();
    return;
  }
  const fd = Object.fromEntries(new FormData(e.target).entries());
  const res = await callApi('insertRow', {
    sheetName: 'Talent_Ledger',
    record: {
      '활동구분': String(fd['활동구분'] || '').trim(),
      '신청달란트': Number(fd['신청달란트'] || 0),
      '증빙메모': String(fd['증빙메모'] || '').trim(),
      '승인여부': '승인대기'
    }
  });
  if (res && res.ok) {
    showToast('✅ 달란트 신청이 등록되었습니다.');
    await renderSheetHistory('Talent_Ledger', 'talent-history-box');
    e.target.reset();
  } else {
    alert('오류: ' + ((res && res.error) || '달란트 등록에 실패했습니다.'));
  }
}

async function handlePrayerSubmit(e) {
  e.preventDefault();
  if (!state.currentIdToken) {
    showToast('✅ [시연] 중보기도가 등록되었습니다.');
    closeServiceModal();
    return;
  }
  const fd = Object.fromEntries(new FormData(e.target).entries());
  const res = await callApi('insertRow', {
    sheetName: 'Prayer_Requests',
    record: {
      '기도구분': String(fd['기도구분'] || '중보기도').trim(),
      '공개범위': String(fd['공개범위'] || '전체').trim(),
      '기도제목': String(fd['기도제목'] || '').trim()
    }
  });
  if (res && res.ok) {
    showToast('✅ 중보기도 제목이 등록되었습니다.');
    await renderSheetHistory('Prayer_Requests', 'prayer-history-box');
    e.target.reset();
  } else {
    alert('오류: ' + ((res && res.error) || '중보기도 등록에 실패했습니다.'));
  }
}

async function openServiceById(id) {
  const srv = activeProgramList.find(p => p.id === id) || SERVICES.find(s => s.id === id);
  if (!srv) return;

  if (!srv.active && (RBAC_RANK[getCurrentRbacCode()] || 1) < RBAC_RANK.ADMIN) {
    alert('해당 메뉴는 순차 오픈 준비 중입니다.');
    return;
  }

  const roleCode = getCurrentRbacCode();
  const position = getCurrentUserPosition();
  const isMobile = window.innerWidth < 768;

  if (!canAccessProgram(srv, roleCode, position, isMobile)) {
    const reqLabel = RBAC_LABEL_KO[srv.minRole] || srv.minRole;
    alert(`[${reqLabel}] 권한 이상 이용 가능합니다.`);
    return;
  }

  if (srv.id === 'PGM_WORSHIP_RES') {
    openWorshipReserveForm();
    return;
  }
  if (srv.id === 'PGM_ACCOUNT_REQ') {
    openIdPasswordModal();
    return;
  }
  if (srv.url && srv.url.startsWith('http')) {
    window.open(srv.url, '_blank');
    return;
  }

  const modMap = {
    weeklyDuty: WeeklyDutyModule,
    darakbang: DarakbangModule,
    offerings: OfferingsModule,
    bookRequest: BookRequestModule,
    attendance: AttendanceModule
  };
  const modal = document.getElementById('service-modal');
  const body = document.getElementById('modal-body');
  document.getElementById('modal-icon').textContent = srv.icon || '📌';
  document.getElementById('modal-title').textContent = srv.name || srv.title;
  document.getElementById('modal-subtitle').textContent = `${srv.category || ''} · ${srv.desc || ''}`;

  if (srv.moduleKey && modMap[srv.moduleKey]) {
    const Mod = modMap[srv.moduleKey];
    const mod = new Mod({ viewMode: getViewMode() });
    body.innerHTML = `<div class="py-8 text-center text-xs text-gray-500">⏳ 불러오는 중...</div>`;
    modal.classList.remove('hidden');
    if (typeof mod.renderHtml === 'function') { body.innerHTML = await mod.renderHtml(); if (mod.bindEvents) mod.bindEvents(body); }
    else if (typeof mod.mount === 'function') { body.innerHTML = `<div id="mod-slot"></div>`; mod.container = '#mod-slot'; mod.mount(); }
    return;
  }

  if (srv.sheet === 'Talent_Ledger') {
    body.innerHTML = `
      <form onsubmit="handleTalentSubmit(event)" class="space-y-3 text-xs bg-skyBg/60 dark:bg-slate-800/70 p-3.5 rounded-xl border border-gray-200 dark:border-slate-700">
        <div class="font-bold text-navy dark:text-gold">🪙 달란트 적립 신청</div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-bold mb-1">활동구분</label>
            <input name="활동구분" required placeholder="예: 예배섬김, 소그룹모임"
              class="w-full px-3 py-2 rounded-xl border dark:bg-slate-900 dark:border-slate-700" />
          </div>
          <div>
            <label class="block font-bold mb-1">신청달란트</label>
            <input type="number" name="신청달란트" min="1" max="500" required value="10"
              class="w-full px-3 py-2 rounded-xl border dark:bg-slate-900 dark:border-slate-700" />
          </div>
        </div>
        <div>
          <label class="block font-bold mb-1">증빙메모</label>
          <input name="증빙메모" required placeholder="활동 일자 및 세부 내용"
            class="w-full px-3 py-2 rounded-xl border dark:bg-slate-900 dark:border-slate-700" />
        </div>
        <button type="submit" class="w-full py-2.5 rounded-xl bg-navy dark:bg-gold text-white dark:text-navyDark font-bold">
          달란트 신청 등록
        </button>
      </form>
      <div id="talent-history-box" class="space-y-2 text-xs">
        <div class="text-gray-500">⏳ 달란트 내역을 불러오는 중...</div>
      </div>`;
    modal.classList.remove('hidden');
    await renderSheetHistory('Talent_Ledger', 'talent-history-box');
    return;
  }

  if (srv.sheet === 'Prayer_Requests') {
    body.innerHTML = `
      <form onsubmit="handlePrayerSubmit(event)" class="space-y-3 text-xs bg-skyBg/60 dark:bg-slate-800/70 p-3.5 rounded-xl border border-gray-200 dark:border-slate-700">
        <div class="font-bold text-navy dark:text-gold">🙏 중보기도 제목 신청</div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-bold mb-1">기도구분</label>
            <select name="기도구분" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-900 dark:border-slate-700">
              <option value="건강·치유">건강·치유</option>
              <option value="가정·자녀">가정·자녀</option>
              <option value="신앙·사명">신앙·사명</option>
              <option value="교회·선교">교회·선교</option>
            </select>
          </div>
          <div>
            <label class="block font-bold mb-1">공개범위</label>
            <select name="공개범위" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-900 dark:border-slate-700">
              <option value="전체">전체</option>
              <option value="비공개">비공개</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block font-bold mb-1">기도제목</label>
          <textarea name="기도제목" rows="3" required placeholder="함께 나누고 기도할 제목을 적어주세요."
            class="w-full px-3 py-2 rounded-xl border dark:bg-slate-900 dark:border-slate-700"></textarea>
        </div>
        <button type="submit" class="w-full py-2.5 rounded-xl bg-navy dark:bg-gold text-white dark:text-navyDark font-bold">
          중보기도 신청하기
        </button>
      </form>
      <div id="prayer-history-box" class="space-y-2 text-xs">
        <div class="text-gray-500">⏳ 기도요청 목록을 불러오는 중...</div>
      </div>`;
    modal.classList.remove('hidden');
    await renderSheetHistory('Prayer_Requests', 'prayer-history-box');
    return;
  }

  body.innerHTML = `<div class="py-6 text-center text-xs text-gray-500">${state.currentIdToken ? '⏳ 조회 중...' : '💡 로그인 후 실제 시트 데이터를 조회합니다.'}</div>`;
  modal.classList.remove('hidden');
  if (state.currentIdToken && srv.sheet) {
    const res = await callApi('querySheet', { sheetName: srv.sheet });
    body.innerHTML = (res && res.ok && res.rows?.length)
      ? `<pre class="text-[11px] bg-gray-100 dark:bg-slate-800 p-3 rounded-xl overflow-x-auto">${JSON.stringify(res.rows.slice(0, 10), null, 2)}</pre>`
      : `<div class="text-center text-xs text-gray-500">${(res && res.error) || '데이터가 없습니다.'}</div>`;
  }
}

function closeServiceModal() { document.getElementById('service-modal')?.classList.add('hidden'); }

function openIdPasswordModal() {
  const modal = document.getElementById('service-modal');
  document.getElementById('modal-icon').textContent = '🔑';
  document.getElementById('modal-title').textContent = '아이디 신청 / 비밀번호 초기화';
  document.getElementById('modal-subtitle').textContent = '비로그인 접수 가능';
  document.getElementById('modal-body').innerHTML = `
    <form onsubmit="handlePublicIdResetSubmit(event)" class="space-y-3 text-xs">
      <select name="요청구분(신규발급/비번초기화)" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700">
        <option value="아이디 신규신청">아이디 신규 신청</option><option value="비밀번호 초기화">비밀번호 초기화</option>
      </select>
      <input name="성명" required placeholder="성명" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700" />
      <input name="연락처" required placeholder="연락처 (010-0000-0000)" class="w-full px-3 py-2 rounded-xl border dark:bg-slate-800 dark:border-slate-700" />
      <button type="submit" class="w-full py-2.5 rounded-xl bg-navy dark:bg-gold text-white dark:text-navyDark font-bold">접수하기</button>
    </form>`;
  modal.classList.remove('hidden');
}

async function handlePublicIdResetSubmit(e) {
  e.preventDefault();
  const record = Object.fromEntries(new FormData(e.target).entries());
  const res = await callApi('submitPublicDarakbang', { record });
  if (res && res.ok) { showToast('✅ 접수되었습니다.'); closeServiceModal(); }
  else alert('접수 오류: ' + ((res && res.error) || '다시 시도해 주세요.'));
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });
async function triggerInstallShortcut() {
  if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; return; }
  showToast('브라우저 메뉴에서 [홈 화면에 추가]를 선택하세요.');
}

function openRoleDemoModal() {
  const modal = document.getElementById('service-modal');
  const currentCode = getCurrentRbacCode();
  document.getElementById('modal-icon').textContent = '🎭';
  document.getElementById('modal-title').textContent = '5단계 권한 시연';
  document.getElementById('modal-subtitle').textContent = '10분 세션 유지 (GUEST ~ ADMIN)';
  document.getElementById('modal-body').innerHTML = `<div class="space-y-2">${['GUEST', 'MEMBER', 'LEADER', 'STAFF', 'ADMIN'].map(code =>
    `<button type="button" onclick="changePreviewRole('${code}'); closeServiceModal();" class="w-full text-left px-3.5 py-2.5 rounded-xl border text-xs font-bold ${currentCode === code ? 'bg-navy text-white dark:bg-gold dark:text-navyDark' : 'bg-skyBg dark:bg-slate-800'}">Lv.${RBAC_RANK[code]} ${RBAC_LABEL_KO[code]} (${code})</button>`
  ).join('')}</div>`;
  modal.classList.remove('hidden');
}

function syncSessionUI() {
  const box = document.getElementById('session-timer-box');
  const btn = document.getElementById('auth-btn');
  const lv = RBAC_RANK[getCurrentRbacCode()] || 1;
  if (lv >= 2) {
    box?.classList.remove('hidden'); box?.classList.add('flex');
    if (btn) btn.textContent = '로그아웃';
    startSessionLoop(mmss => { const c = document.getElementById('session-countdown'); if (c) c.textContent = mmss; }, () => performLogout(true));
  } else {
    if (sessionTimerHandle) clearInterval(sessionTimerHandle);
    box?.classList.add('hidden'); box?.classList.remove('flex');
    if (btn) btn.textContent = '로그인';
  }
}

function performLogout(expired = false) {
  localStorage.removeItem(SESSION_KEY);
  state.currentIdToken = '';
  state.currentUserProfile = null;
  state.currentRole = 'GUEST';
  syncSessionUI();
  renderPersonalizedCard();
  if (state.currentTab === 'all') renderAllBusinessMenu();
  if (state.currentTab === 'my') renderMyTab();
  showToast(expired ? '⏱ 세션이 만료되어 로그아웃되었습니다.' : '로그아웃되었습니다.');
}

function handleExtendSession() {
  if (extendSession()) { syncSessionUI(); showToast('✅ 10분 연장되었습니다.'); }
}

function changePreviewRole(raw) {
  const code = toRbacCode(raw);
  state.currentRole = code;
  saveSession(code, state.currentUserProfile, state.currentIdToken);
  syncSessionUI();
  renderPersonalizedCard();
  if (state.currentTab === 'all') renderAllBusinessMenu();
  if (state.currentTab === 'my') renderMyTab();
}

function handleAuthClick() {
  if ((RBAC_RANK[getCurrentRbacCode()] || 1) >= 2 || state.currentIdToken) { performLogout(false); return; }
  if (CONFIG.GOOGLE_CLIENT_ID && window.google?.accounts?.id) {
    window.google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: async resp => {
        state.currentIdToken = resp.credential;
        const res = await callApi('getSessionProfile');
        if (res && res.ok && res.user) {
          state.currentUserProfile = res.user;
          await loadSmallGroupMaster();
          const code = toRbacCode(res.user.role || 'GUEST');
          state.currentRole = code;
          saveSession(code, res.user, state.currentIdToken);
          syncSessionUI();
          renderPersonalizedCard();
          if (state.currentTab === 'all') renderAllBusinessMenu();
          showToast(`✅ ${res.user.name}님 환영합니다 (${RBAC_LABEL_KO[code]})`);
        } else { performLogout(false); alert((res && res.error) || '로그인 실패'); }
      }
    });
    window.google.accounts.id.prompt();
  } else { changePreviewRole('MEMBER'); }
}

async function handleAttendanceSubmit(e) {
  e.preventDefault();
  if (!state.currentIdToken) { alert('로그인 후 출석 저장이 가능합니다.'); return; }
  const fd = Object.fromEntries(new FormData(e.target).entries());
  const serviceDate = fd['예배일자'];
  const serviceType = fd['예배구분(화/금/안)'] || getDefaultWorshipByDate(serviceDate);
  const check = validateAttendanceDateAndService(serviceDate, serviceType);
  if (!check.valid && check.hardBlock) { alert(check.message); return; }
  const actorName = state.currentUserProfile?.name || '성도';
  const matched = await resolveGroupByMemberName(fd['대상성명'] || actorName, state.currentUserProfile?.userId || '');
  const res = await callApi('insertRow', {
    sheetName: 'Attendance_Log',
    record: {
      Record_ID: 'ATT-' + Date.now(), '예배일자': serviceDate, '예배구분(화/금/안)': serviceType,
      User_ID: matched.userId, '성명': fd['대상성명'] || actorName, '소속반': matched.groupName,
      '출석상태': fd['출석상태'] || '출석', '입력자': actorName
    }
  });
  if (res && res.ok) { alert(`✅ 출석이 등록되었습니다.${res.bonusTalent ? ` (달란트 1.5배 ${res.bonusTalent}T 적립!)` : ''}`); closeServiceModal(); }
  else alert('오류: ' + ((res && res.error) || '권한 확인 필요'));
}

async function loadProgramMasterFromApi() {
  if (!CONFIG.APPS_SCRIPT_URL) return;
  try {
    const res = await callApi('getPortalPrograms');
    if (res && res.ok && Array.isArray(res.data) && res.data.length) {
      activeProgramList = res.data.map((row, idx) => normalizeProgramRow(row, idx));
      if (state.currentTab === 'all') renderAllBusinessMenu();
      if (state.currentTab === 'my') renderMyTab();
    }
  } catch (e) {
    // API 미연결 시 V2_PROGRAMS_FALLBACK 유지
  }
}

async function loadHub() {
  const dot = document.getElementById('api-status-dot');
  const r = await fetchPublicHubData();
  state.hubCache = r.data;
  if (dot) {
    dot.innerHTML = r.status === 'live' ? '🟢 실시간 연동됨' : '🟡 연동 준비중';
    dot.className = r.status === 'live'
      ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 whitespace-nowrap'
      : 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 whitespace-nowrap';
  }
  smoothVerticalSlider.setItems(state.hubCache.galleries);
  await loadProgramMasterFromApi();
}

function updateCountdown() {
  const s = getUpcomingWorshipSlots()[0];
  if (!s) return;
  const diff = Math.max(0, s.target - new Date());
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff / 3600000) % 24);
  const m = Math.floor((diff / 60000) % 60);
  const sec = Math.floor((diff / 1000) % 60);
  const lbl = document.getElementById('next-worship-label');
  const cd = document.getElementById('worship-countdown');
  if (lbl) lbl.textContent = `다음 ${s.name}까지`;
  if (cd) cd.textContent = `${d > 0 ? d + '일 ' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function bindVerticalSwipe() {
  const stage = document.getElementById('gallery-slider-stage');
  if (!stage) return;
  let startY = 0;
  stage.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dy) > 35) smoothVerticalSlider.step(dy < 0 ? 1 : -1);
  }, { passive: true });
}

Object.assign(window, {
  toggleTheme,
  switchBottomTab,
  toggleQuickFavorite,
  toggleAlbumBgm,
  openWorshipReserveForm,
  handleWorshipReserveSubmit,
  handleTalentSubmit,
  handlePrayerSubmit,
  openServiceById,
  closeServiceModal,
  openIdPasswordModal,
  handlePublicIdResetSubmit,
  triggerInstallShortcut,
  openRoleDemoModal,
  changePreviewRole,
  handleAuthClick,
  handleExtendSession,
  handleAttendanceSubmit,
  stepGallerySlide: d => smoothVerticalSlider.step(d),
  setGalleryDirection: d => smoothVerticalSlider.setDirection(d),
  syncWorshipTypeByDate: dateStr => {
    const sel = document.getElementById('att-service-select');
    if (sel) sel.innerHTML = renderWorshipOptionsHtml(dateStr);
  }
});

function init() {
  initTheme();
  smoothVerticalSlider.renderImmediate();
  smoothVerticalSlider.startLoop();
  bindVerticalSwipe();
  const saved = loadSession();
  if (saved) {
    state.currentIdToken = saved.idToken || '';
    state.currentUserProfile = saved.profile || null;
    state.currentRole = toRbacCode(saved.role || 'GUEST');
  } else {
    state.currentRole = 'GUEST';
  }
  syncSessionUI();
  renderPersonalizedCard();
  if (state.currentTab === 'all') renderAllBusinessMenu();
  updateCountdown();
  setInterval(updateCountdown, 1000);
  loadHub();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();