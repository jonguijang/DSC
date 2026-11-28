# 다산교회(dsc.or.kr) 프론트엔드 모듈화 패키지

기존 단일 `index.html`을 **ES Modules(`type="module"`) 기반 독립 클래스 아키텍처**로 분리한 패키지입니다.

## 폴더 구성
- `index.html`: 메인 레이아웃 뼈대 및 모달 틀 (`<script type="module" src="./js/app.js"></script>`)
- `js/core/config.js`: API URL, Google OAuth 클라이언트 ID, 드라이브 폴더, 9개 소그룹반 기본값, 30대 서비스 정의
- `js/core/state.js`: 전역 상태(`state`), 테마 제어, 즐겨찾기, 실명 차단 헬퍼, 소그룹·예배 요일 유틸
- `js/core/api.js`: Apps Script `callApi`, `loadSmallGroupMaster`, `resolveGroupByMemberName`, `fetchPublicHubData`
- `js/core/BaseModule.js`: `BaseModule` 부모 클래스 (`PC_DETAIL` / `MOBILE_COMPACT` 듀얼 뷰)
- `js/modules/WeeklyDutyModule.js`: 이번 주 / 다음 주 담당표 모듈
- `js/modules/DarakbangModule.js`: 다락방 ID 발급·비번초기화 신청 및 매뉴얼 모듈
- `js/modules/OfferingsModule.js`: 본인 전용 헌금내역 조회 모듈
- `js/modules/BookRequestModule.js`: 서적신청조회 모듈
- `js/modules/AttendanceModule.js`: 출석현황(화/금/안) 모듈
- `js/app.js`: 모듈 레지스트리(`MODULE_REGISTRY`), UI 렌더링, 모달 및 이벤트 브리지, 초기화

## 배포 및 테스트 안내
1. 압축을 풀어 저장소(`jonguijang/DSC`) 루트에 `index.html`과 `js/` 폴더를 덮어쓰기하세요.
2. ES Module 특성상 `file://` 직접 열기 대신 GitHub Pages(`https://dsc.or.kr`) 또는 로컬 웹서버(예: `npx serve .`, VS Code Live Server)로 실행하세요.
