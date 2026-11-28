// 다산교회(dsc.or.kr) 포털 환경 설정 v4.0 — 5단계 권한 & 전체 업무 클래스화
const HOSTNAME = typeof window !== 'undefined' ? window.location.hostname : '';
export const IS_PROD = HOSTNAME === 'dsc.or.kr' || HOSTNAME === 'www.dsc.or.kr';
export const APP_ENV = IS_PROD ? 'PROD' : 'DEV';

const PROD_API_URL = 'https://script.google.com/macros/s/AKfycbyeYkLPvjdToxRf8TUnOSPi3qN2osTse-GMi0ZviPebfnNbRcyJLTP9CNky3l3gV0L8/exec';
const DEV_API_URL = PROD_API_URL;

export const ROLE_DEFS = [
  { level: 1, key: '외부인', code: 'GUEST',  label: '1. 외부인 (GUEST / 비로그인)' },
  { level: 2, key: '성도',   code: 'MEMBER', label: '2. 성도 (MEMBER / 일반)' },
  { level: 3, key: '제직',   code: 'LEADER', label: '3. 제직 (LEADER / 집사·반장)' },
  { level: 4, key: '직원',   code: 'STAFF',  label: '4. 직원 (STAFF / 장로·부서장)' },
  { level: 5, key: '관리자', code: 'ADMIN',  label: '5. 관리자 (ADMIN / 목회자·행정)' }
];

// Users_Master 영문 권한등급(ADMIN, STAFF, LEADER, MEMBER, GUEST) 및 기존 한글 값 통합 매핑
export const ROLE_LEVEL = {
  '외부인': 1,
  'GUEST': 1,
  '성도': 2,
  '다산교회': 2,
  'MEMBER': 2,
  '제직': 3,
  'LEADER': 3,
  '직원': 4,
  'STAFF': 4,
  '관리자': 5,
  'ADMIN': 5
};

const ROLE_ALIAS_MAP = {
  'GUEST': '외부인',
  '외부인': '외부인',
  'MEMBER': '성도',
  '성도': '성도',
  '다산교회': '성도',
  'LEADER': '제직',
  '제직': '제직',
  'STAFF': '직원',
  '직원': '직원',
  'ADMIN': '관리자',
  '관리자': '관리자'
};

export function normalizeRoleName(rawRole) {
  const val = String(rawRole || '').trim();
  if (!val) return '외부인';
  if (ROLE_ALIAS_MAP[val]) return ROLE_ALIAS_MAP[val];
  const upper = val.toUpperCase();
  if (ROLE_ALIAS_MAP[upper]) return ROLE_ALIAS_MAP[upper];
  return '외부인';
}

export function getRoleNameByLevel(lv) {
  const found = ROLE_DEFS.find(r => r.level === Number(lv));
  return found ? found.key : '외부인';
}

export const CONFIG = {
  ENV: APP_ENV,
  IS_PROD,
  API_URL: IS_PROD ? PROD_API_URL : DEV_API_URL,
  GOOGLE_CLIENT_ID: '214036144218-7rk41ek615sa24odk1hgn9cohv1a9nae.apps.googleusercontent.com',
  ROLE_LEVEL,
  FOLDERS: {
    BULLETIN: 'https://drive.google.com/drive/folders/196A3OSAfcPn_EtvQ98f5mLwDrtjoxmnt',
    GALLERY: 'https://drive.google.com/drive/folders/1m99CZXmlIA1SV2rRrxCWoTaLoXA1P6ud',
    MANUAL: 'https://drive.google.com/drive/folders/1tGIMhnbMR20R7ArNArzhVk0f4AdKcDjC',
    VOUCHER_RECEIPT: 'https://drive.google.com/drive/folders/1VtsX-g1p8UKwk_L540vwlvjjujXhF4iw'
  },
  DEFAULT_SMALL_GROUPS: [
    { code: 'GRP-01', name: '겸손반', leader: '', location: '본당', active: true },
    { code: 'GRP-02', name: '사랑반', leader: '', location: '본당', active: true },
    { code: 'GRP-03', name: '온유반', leader: '', location: '교육관', active: true },
    { code: 'GRP-04', name: '믿음반', leader: '', location: '교육관', active: true },
    { code: 'GRP-05', name: '소망반', leader: '', location: '교육관', active: true },
    { code: 'GRP-06', name: '기쁨반', leader: '', location: '소그룹실', active: true },
    { code: 'GRP-07', name: '평화반', leader: '', location: '소그룹실', active: true },
    { code: 'GRP-08', name: '은혜반', leader: '', location: '소그룹실', active: true },
    { code: 'GRP-09', name: '진리반', leader: '', location: '소그룹실', active: true }
  ]
};

// 전체 업무 클래스 마스터 (12월 필수 P1 / 27년 순차 P2·P3 / 사용여부 active)
export const SERVICES = [
  // 1) 예배·신앙 (P1 핵심)
  { id: 'PGM_WOR_RESV', cat: '예배·신앙', priority: 'P1', target: '26-12', active: true, minRole: 2, icon: '🎟️', title: '예배참석예약', desc: '하루전~3시간전 예약·출석시 달란트 1.5배', sheet: 'Worship_Reservations', moduleKey: 'worshipReserve' },
  { id: 'PGM_WOR_STAT', cat: '예배·신앙', priority: 'P1', target: '26-12', active: true, minRole: 3, icon: '👥', title: '참석예상인원 현황', desc: '예배별·소그룹반별 사전예약 집계', sheet: 'Worship_Reservations', moduleKey: 'expectedAttendance' },
  { id: 'PGM_WOR_ATT',  cat: '예배·신앙', priority: 'P1', target: '26-12', active: true, minRole: 2, icon: '✅', title: '출석현황 (화/금/안)', desc: '모바일 출석체크 및 통계', sheet: 'Attendance_Log', moduleKey: 'attendance' },
  { id: 'PGM_FAI_TAL',  cat: '예배·신앙', priority: 'P1', target: '26-12', active: true, minRole: 2, icon: '🏆', title: '달란트 관리', desc: '신앙활동 등록·승인 및 현황판', sheet: 'Talent_Ledger', moduleKey: 'talent' },
  { id: 'PGM_FAI_GRP',  cat: '예배·신앙', priority: 'P2', target: '27-Q1', active: true, minRole: 2, icon: '🤝', title: '소그룹반 (9개반)', desc: '반별 교과토의·기도제목', sheet: 'SmallGroup_Reports', moduleKey: 'smallGroup' },

  // 2) 성도·편의
  { id: 'PGM_FAI_OFF',  cat: '성도·편의', priority: 'P1', target: '26-12', active: true, minRole: 2, icon: '🔒', title: '헌금내역 조회', desc: '본인 전용 헌금 납부 조회', sheet: 'Offerings_Log', moduleKey: 'offerings' },
  { id: 'PGM_FAI_BOOK', cat: '성도·편의', priority: 'P1', target: '26-12', active: true, minRole: 2, icon: '📚', title: '서적신청조회', desc: '교과책·신앙서적 공동구매', sheet: 'Book_Requests', moduleKey: 'bookRequest' },
  { id: 'PGM_FAI_DRK',  cat: '성도·편의', priority: 'P1', target: '26-12', active: true, minRole: 1, icon: '🔑', title: '다락방 ID·매뉴얼', desc: '아이디 신청·비밀번호 초기화', sheet: 'Darakbang_Requests', moduleKey: 'darakbang' },
  { id: 'PGM_FAI_PRY',  cat: '성도·편의', priority: 'P2', target: '27-Q1', active: true, minRole: 2, icon: '🙏', title: '중보기도신청', desc: '공동체 및 비공개 기도요청', sheet: 'Prayer_Requests', formFields: ['공개범위(전체/교역자전용)', '기도제목'] },

  // 3) 전자신청 (업무 모듈 통합 편입 — 기존 소스 참조 순차 고도화)
  { id: 'PGM_ELEC_RCP', cat: '전자신청', priority: 'P1', target: '26-12', active: true, minRole: 2, icon: '🧾', title: '전자신청_기부금영수증', desc: '연말정산 기부금영수증 발급 신청', sheet: 'Donation_Receipts', formFields: ['신청인성명', '연락처', '발급연도', '수령방법(이메일/방문)'] },
  { id: 'PGM_ELEC_VCH', cat: '전자신청', priority: 'P1', target: '26-12', active: true, minRole: 3, icon: '💳', title: '전자결재_지불결의서', desc: '부서 지출결의서 기안 및 결재', sheet: 'Payment_Vouchers', formFields: ['부서명', '지출항목', '청구금액', '적요'] },
  { id: 'PGM_ELEC_SUG', cat: '전자신청', priority: 'P2', target: '27-Q1', active: true, minRole: 2, icon: '📮', title: '전자신청_제안함', desc: '교회 발전 및 시설 개선 건의', sheet: 'Suggestions', formFields: ['공개여부', '제목', '내용'] },
  { id: 'PGM_ELEC_VOT', cat: '전자신청', priority: 'P2', target: '27-Q1', active: true, minRole: 4, icon: '🗳️', title: '전자투표_직원회안건', desc: '정기·임시 직원회 안건 온라인 투표', sheet: 'Staff_Votes', formFields: ['안건명', '찬반의견(찬성/반대/기권)', '비고'] },

  // 4) 예배·봉사
  { id: 'PGM_SVC_DUTY', cat: '예배·봉사', priority: 'P1', target: '26-12', active: true, minRole: 1, icon: '📋', title: '주간 예배담당표', desc: '안식일·화요·금요 순서자 안내', moduleKey: 'weeklyDuty' },
  { id: 'PGM_SVC_MEAL', cat: '예배·봉사', priority: 'P2', target: '27-Q1', active: true, minRole: 3, icon: '🍽️', title: '식사당번 체크리스트', desc: '안식일 애찬 당번 및 점검', sheet: 'Checklists_Log', formFields: ['예배/집회구분', '특이사항'] },
  { id: 'PGM_SVC_DEA',  cat: '예배·봉사', priority: 'P2', target: '27-Q1', active: true, minRole: 3, icon: '🛡️', title: '시무집사 체크리스트', desc: '본당·헌금·안내·시건 점검', sheet: 'Checklists_Log', formFields: ['예배/집회구분', '특이사항'] },
  { id: 'PGM_SVC_SAFE', cat: '예배·봉사', priority: 'P2', target: '27-Q1', active: true, minRole: 3, icon: '🧯', title: '교회안전관리 점검', desc: '소방·전기·가스 안전기록', sheet: 'Checklists_Log', formFields: ['예배/집회구분', '특이사항'] },
  { id: 'PGM_SVC_ELD',  cat: '예배·봉사', priority: 'P2', target: '27-Q1', active: true, minRole: 4, icon: '👔', title: '시무장로 체크리스트', desc: '강단·성찬·영접 현장 점검', sheet: 'Checklists_Log', formFields: ['예배/집회구분', '특이사항'] },
  { id: 'PGM_SVC_MAN',  cat: '예배·봉사', priority: 'P3', target: '27-Q2', active: true, minRole: 2, icon: '🎤', title: '예배순서자 매뉴얼', desc: '사회·대표기도·설교자 가이드', url: CONFIG.FOLDERS.MANUAL },

  // 5) 대외·안내 (기존 메인 정적 영역을 업무 클래스로 분리)
  { id: 'PGM_PUB_BUL',  cat: '대외·안내', priority: 'P1', target: '26-12', active: true, minRole: 1, icon: '📄', title: '예배주보 (Drive)', desc: '금주 주보 PDF 즉시 열람', actionKey: 'openBulletinModal' },
  { id: 'PGM_PUB_GUI',  cat: '대외·안내', priority: 'P1', target: '26-12', active: true, minRole: 1, icon: '⛪', title: '교회소개·오시는 길', desc: '예배시간·위치·담임목사 안내', moduleKey: 'publicGuide', guideTab: 'intro' },
  { id: 'PGM_PUB_OFF',  cat: '대외·안내', priority: 'P1', target: '26-12', active: true, minRole: 1, icon: '💛', title: '헌금설명 (7대 헌금)', desc: '십일조·월정·도르가 등 안내', moduleKey: 'publicGuide', guideTab: 'offerings' },
  { id: 'PGM_PUB_PF',   cat: '대외·안내', priority: 'P1', target: '26-12', active: true, minRole: 1, icon: '🏕️', title: '패스파인더 / 어드벤처러', desc: '청소년·어린이 신앙 탐험 클럽', moduleKey: 'publicGuide', guideTab: 'clubs' },
  { id: 'PGM_PUB_MED',  cat: '대외·안내', priority: 'P1', target: '26-12', active: true, minRole: 1, icon: '🎬', title: '말씀묵상·유튜브', desc: '@sda5239 온라인예배 및 갓모닝', url: 'https://www.youtube.com/@sda5239' },

  // 6) 행정·시스템 (직원 Lv.4 / 관리자 Lv.5)
  { id: 'PGM_ADM_BUD',  cat: '행정·시스템', priority: 'P2', target: '27-Q1', active: true,  minRole: 4, icon: '📊', title: '부서별 지출관리', desc: '연간 예산 대비 집행률 조회', sheet: 'Dept_Budgets' },
  { id: 'PGM_ADM_MIN',  cat: '행정·시스템', priority: 'P2', target: '27-Q1', active: true,  minRole: 4, icon: '🗂️', title: '직원회 회의록 조회', desc: '직원 전용 의결 회의록 열람', sheet: 'Minutes_Archive' },
  { id: 'PGM_ADM_PRJ',  cat: '행정·시스템', priority: 'P3', target: '27-Q2', active: false, minRole: 4, icon: '🎯', title: '2027 주요사업과제', desc: '부서별 사업계획 진척·리스크', sheet: 'Key_Projects' },
  { id: 'PGM_ADM_CON',  cat: '행정·시스템', priority: 'P3', target: '27-Q2', active: false, minRole: 4, icon: '📑', title: '보험·자동이체 관리', desc: '화재·차량·정기이체 현황', sheet: 'Contracts_Admin' },
  { id: 'PGM_ADM_WIK',  cat: '행정·시스템', priority: 'P3', target: '27-Q2', active: false, minRole: 2, icon: '📖', title: '다산교회 Wiki', desc: '행정 내규·장비 운영 백과', url: CONFIG.FOLDERS.MANUAL },
  { id: 'PGM_SYS_AUTH', cat: '행정·시스템', priority: 'P1', target: '26-12', active: true,  minRole: 5, icon: '🛡️', title: '프로그램 권한관리', desc: '프로그램별 5단계 권한·사용여부 제어', sheet: 'Portal_Menus', moduleKey: 'programAuth' },
  { id: 'PGM_SYS_USER', cat: '행정·시스템', priority: 'P1', target: '26-12', active: true,  minRole: 5, icon: '⚙️', title: '회원·등급·소속반 관리', desc: '회원 승인 및 5단계 권한 부여', sheet: 'Users_Master' }
];
```[cite: 27]