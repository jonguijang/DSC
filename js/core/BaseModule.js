import { ROLE_LEVEL } from './config.js';
import { state, getViewMode } from './state.js';

export class BaseModule {
  constructor({ menuId, title, minRole = 1, viewMode = null, container = null }) {
    this.menuId = menuId;
    this.title = title;
    this.minRole = minRole;
    this.viewMode = viewMode || getViewMode();
    this.container = typeof container === 'string' ? document.querySelector(container) : container;
  }

  async fetchData() {
    return {};
  }

  renderDesktop(data) {
    return '';
  }

  renderMobile(data) {
    return this.renderDesktop(data);
  }

  renderBlocked() {
    return `<div class="p-4 rounded-xl bg-gray-50 dark:bg-slate-800/70 border border-gray-200 dark:border-slate-700 text-xs text-gray-500 dark:text-slate-400">
      🔒 [${this.title}] 메뉴는 로그인 후 열람 가능합니다.
    </div>`;
  }

  async renderHtml() {
    this.viewMode = getViewMode();
    if (ROLE_LEVEL[state.currentRole] < this.minRole) {
      return this.renderBlocked();
    }
    const data = await this.fetchData();
    return this.viewMode === 'MOBILE_COMPACT'
      ? this.renderMobile(data)
      : this.renderDesktop(data);
  }

  async mount() {
    if (!this.container) return;
    this.container.innerHTML = await this.renderHtml();
  }
}
