// 시스템 환경 설정 및 30대 서비스·공유 드라이브 매핑
export const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyeYkLPvjdToxRf8TUnOSPi3qN2osTse-GMi0ZviPebfnNbRcyJLTP9CNky3l3gV0L8/exec',
  GOOGLE_CLIENT_ID: '214036144218-7rk41ek615sa24odk1hgn9cohv1a9nae.apps.googleusercontent.com',
  ROLE_LEVEL: { '외부인': 1, '다산교회': 2, '직원': 3, '관리자': 4 },
  FOLDERS: {
    BULLETIN: 'https://drive.google.com/drive/folders/1m99CZXmlIA1SV2rRrxCWoTaLoXA1P6ud',
    GALLERY: 'https://drive.google.com/drive/folders/1m99CZXmlIA1SV2rRrxCWoTaLoXA1P6ud',
    MANUAL: 'https://drive.google.com/drive/folders/1m99CZXmlIA1SV2rRrxCWoTaLoXA1P6ud',
    VOUCHER_RECEIPT: 'https://drive.google.com/drive/folders/1m99CZXmlIA1SV2rRrxCWoTaLoXA1P6ud'
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
  ],
  QUICK_HUB_LINKS: [
    { title: '전자결재_지불결의서', desc: '02_결재_지불결의서 기안·결재', minRole: 3, icon: '🧾', url: 'https://drive.google.com' },
    { title: '전자신청_기부금영수증', desc: '03_신청_기부금영수증 신청', minRole: 2, icon: '📄', url: 'https://drive.google.com' },
    { title: '전자신청_제안함', desc: '04_신청_제안함 접수·건의', minRole: 2, icon: '💡', url: 'https://drive.google.com' },
    { title: '전자투표_직원회안건', desc: '05_투표_직원회안건 직원 투표', minRole: 3, icon: '🗳️', url: 'https://drive.google.com' }
  ]
};

export const ROLE_LEVEL = CONFIG.ROLE_LEVEL;

export const SERVICES = [
  // 대외·선교 (9종)
  { cat: '대외·선교', title: '교회소개·오시는 길', desc: '비전·담임목사 인사·위치', minRole: 1, icon: '⛪', url: '#guide-section' },
  { cat: '대외·선교', title: '다산교회 캘린더', desc: '예배·행사·당번 일정', minRole: 1, icon: '📅', url: '#dashboard-widgets' },
  { cat: '대외·선교', title: '예배주보 (Drive)', desc: '금주 주보 PDF 즉시 열람', minRole: 1, icon: '📄', actionKey: 'openBulletinModal' },
  { cat: '대외·선교', title: '활동사진 갤러리', desc: '행사별 앨범 자동 동기화', minRole: 1, icon: '📸', url: CONFIG.FOLDERS.GALLERY },
  { cat: '대외·선교', title: '말씀묵상·유튜브', desc: '@sda5239 및 카톡 공유', minRole: 1, icon: '🎬', url: 'https://www.youtube.com/@sda5239' },
  { cat: '대외·선교', title: 'OneVoice27 & Light27', desc: '선교 실천 서약 및 달성률', minRole: 1, icon: '🕯️', sheet: 'Key_Projects' },
  { cat: '대외·선교', title: '헌금설명 (7대 헌금)', desc: '십일조·월정·도르가 등 안내', minRole: 1, icon: '💛', guideTab: 'offerings' },
  { cat: '대외·선교', title: '패스파인더 설명', desc: '청소년 신앙·탐험 클럽', minRole: 1, icon: '🏕️', guideTab: 'pathfinder' },
  { cat: '대외·선교', title: '어드벤처러 설명', desc: '어린이·가족 신앙 프로그램', minRole: 1, icon: '🌱', guideTab: 'adventurer' },

  // 신앙·편의 (8종)
  { cat: '신앙·편의', title: '소그룹반 (9개반)', desc: '반별 교과토의·기도제목', minRole: 2, icon: '👥', sheet: 'SmallGroup_Reports', moduleKey: 'smallGroup' },
  { cat: '신앙·편의', title: '출석현황 (화/금/안)', desc: '모바일 출석체크 및 통계', minRole: 2, icon: '✅', sheet: 'Attendance_Log', moduleKey: 'attendance' },
  { cat: '신앙·편의', title: '달란트 관리', desc: '신앙활동 등록 및 현황판', minRole: 2, icon: '🏆', sheet: 'Talent_Ledger', moduleKey: 'talent', formFields: ['활동구분', '증빙메모', '신청달란트'] },
  { cat: '신앙·편의', title: '다락방 ID·매뉴얼', desc: '신규발급·초기화·사용법', minRole: 2, icon: '🔑', sheet: 'Darakbang_Requests', moduleKey: 'darakbang', formFields: ['연락처', '요청구분(신규발급/비번초기화)'] },
  { cat: '신앙·편의', title: '헌금내역 조회', desc: '본인 전용 헌금 납부 조회', minRole: 2, icon: '🔒', sheet: 'Offerings_Log', moduleKey: 'offerings' },
  { cat: '신앙·편의', title: '서적신청조회', desc: '교과책·신앙서적 공동구매', minRole: 2, icon: '📚', sheet: 'Book_Requests', moduleKey: 'bookRequest', formFields: ['도서명/교과구분', '수량'] },
  { cat: '신앙·편의', title: '제안함 관리', desc: '교회 발전 건의 및 답변', minRole: 2, icon: '💡', sheet: 'Suggestions', formFields: ['공개여부', '제목', '내용'] },
  { cat: '신앙·편의', title: '중보기도신청', desc: '공동체 및 비공개 기도요청', minRole: 2, icon: '🙏', sheet: 'Prayer_Requests', formFields: ['공개범위(전체/교역자전용)', '기도제목'] },

  // 예배·봉사 (5종)
  { cat: '예배·봉사', title: '식사당번 체크리스트', desc: '안식일 애찬 당번 및 점검', minRole: 2, icon: '🍽️', sheet: 'Checklists_Log', formFields: ['예배/집회구분', '특이사항'] },
  { cat: '예배·봉사', title: '예배순서자 매뉴얼', desc: '사회·대표기도·설교자 가이드', minRole: 2, icon: '🎤', url: CONFIG.FOLDERS.MANUAL },
  { cat: '예배·봉사', title: '시무장로 체크리스트', desc: '강단·성찬·영접 현장 점검', minRole: 3, icon: '📋', sheet: 'Checklists_Log', formFields: ['예배/집회구분', '특이사항'] },
  { cat: '예배·봉사', title: '시무집사 체크리스트', desc: '본당·헌금·안내·시건 점검', minRole: 3, icon: '🛡️', sheet: 'Checklists_Log', formFields: ['예배/집회구분', '특이사항'] },
  { cat: '예배·봉사', title: '교회안전관리 점검', desc: '소방·전기·가스 안전기록', minRole: 3, icon: '🧯', sheet: 'Checklists_Log', formFields: ['예배/집회구분', '특이사항'] },

  // 행정·재정·Wiki (8종)
  { cat: '행정·재정', title: '다산교회 Wiki', desc: '행정 내규·장비 운영 백과', minRole: 2, icon: '📖', url: CONFIG.FOLDERS.MANUAL },
  { cat: '행정·재정', title: '지불결의서 현황', desc: '온라인 기안 및 결재 추적', minRole: 3, icon: '🧾', sheet: 'Payment_Vouchers', formFields: ['부서명', '지출항목', '청구금액'] },
  { cat: '행정·재정', title: '부서별 지출관리', desc: '연간 예산 대비 집행률 조회', minRole: 3, icon: '📊', sheet: 'Dept_Budgets' },
  { cat: '행정·재정', title: '주요사업과제 관리', desc: '2027 사업계획 진척·리스크', minRole: 3, icon: '🎯', sheet: 'Key_Projects' },
  { cat: '행정·재정', title: '직원회 회의록 조회', desc: '직원 전용 의결 회의록 열람', minRole: 3, icon: '🗂️', sheet: 'Minutes_Archive' },
  { cat: '행정·재정', title: '보험계약관리', desc: '화재·차량·행사 보험 만기관리', minRole: 3, icon: '📑', sheet: 'Contracts_Admin' },
  { cat: '행정·재정', title: '자동이체관리', desc: '공과금·렌탈 정기이체 현황', minRole: 3, icon: '💳', sheet: 'Contracts_Admin' },
  { cat: '행정·재정', title: '권한관리 콘솔', desc: '회원 승인 및 4단계 등급 부여', minRole: 4, icon: '⚙️', sheet: 'Users_Master' }
];