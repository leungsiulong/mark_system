// ================================================================
// Mobile UI (v2)
// - 手機 / 中小型平板採用 App 介面
// - 底部導覽、操作面板、可見視窗 / 軟鍵盤處理
// - ★ v2:
//   1) 底部導覽改用 mobileTabClick：切換頁面後才打開班別抽屜，
//      解決「按成績輸入有時不會彈出側邊欄」的競態問題
//   2) 抽屜打開後短時間內忽略遮罩點擊（避免觸控幽靈點擊立即關閉）
//   3) 成績表顯示比例：雙指縮放（手機）、Ctrl + 滾輪 / 觸控板（桌面）、按鈕調整
// - 不修改計分公式及資料結構
// ================================================================

const MOBILE_UI_MENU_KEYS = [
  'gradesCPMenuOpen',
  'gradesCustomMenuOpen',
  'gradesExportMenuOpen',
  'scoringCopyMenuOpen',
  'scoringExportMenuOpen',
  'scoringApplyMenuOpen',
  'profileMenuOpen'
];

// 需要先選擇班別的頁面：手機版以抽屜顯示「學年班別」
const MOBILE_DRAWER_VIEWS = ['grades', 'scoring', 'analysis'];

// 抽屜打開後，忽略此時間內的遮罩點擊
const MOBILE_DRAWER_GUARD_MS = 350;

// 等待頁面切換完成的最長時間（逾時則放棄自動打開抽屜）
const MOBILE_DRAWER_PENDING_MS = 1500;

// 成績表顯示比例
const GRADES_ZOOM_MIN = 0.5;
const GRADES_ZOOM_MAX = 2;
const GRADES_ZOOM_STORAGE_KEY = 'gradesTableZoom';

function clampGradesZoom(z) {
  const n = Number(z);
  if (!Number.isFinite(n)) return 1;
  const c = Math.min(GRADES_ZOOM_MAX, Math.max(GRADES_ZOOM_MIN, n));
  return Math.round(c * 1000) / 1000;
}

const MobileUiMixin = {
  data() {
    return {
      mobileCompact: false,
      mobileKeyboardOpen: false,
      // ★ v2: 成績表顯示比例（1 = 100%）
      gradesZoom: 1
    };
  },

  computed: {
    mobileHeaderTitle() {
      if (this.currentView === 'home') {
        return this.settings.schoolName || '成績管理系統';
      }

      if (this.currentView === 'settings' && this.settingsNav.length) {
        return this.settingsNav[this.settingsNav.length - 1].label;
      }

      const tab = this.allTabs.find(t => t.key === this.currentView);
      return tab ? tab.label : '成績管理系統';
    },

    mobileHeaderSubtitle() {
      if (this.currentView === 'home') {
        const name = this.currentProfile?.name || this.settings.teacherName;
        return name ? name + '，您好' : '管理班別、學生與學習進度';
      }

      if (this.currentView === 'settings') {
        return this.settings.schoolName || '帳戶設定與資料管理';
      }

      if (
        this.currentView === 'analysis' &&
        this.analysisSubTab === 'crossYear'
      ) {
        return '追蹤學生的跨學年學習表現';
      }

      if (!this.currentClass) {
        return '輕觸左上方選擇學年及班別';
      }

      return [
        this.currentAcademicYear?.name,
        this.currentClass.className,
        this.currentClass.subject
      ].filter(Boolean).join(' · ');
    },

    mobileMenusOpen() {
      return this.mobileCompact && MOBILE_UI_MENU_KEYS.some(
        key => key !== 'profileMenuOpen' && this[key]
      );
    },

    // ★ v2: 成績表縮放
    gradesZoomPercent() {
      return Math.round((this.gradesZoom || 1) * 100);
    },

    gradesTableZoomStyle() {
      return { zoom: String(this.gradesZoom || 1) };
    }
  },

  watch: {
    // 手機同一時間只開一個操作選單。
    ...Object.fromEntries(
      MOBILE_UI_MENU_KEYS.map(key => [
        key,
        function (open) {
          if (open && this.mobileCompact) {
            this.mobileCloseMenus(key);
          }
        }
      ])
    ),

    currentView() {
      if (!this.mobileCompact) return;

      this.mobileCloseMenus();
      this.leftPanelOpen = false;

      // ★ v2: 切換完成後，如底部導覽要求打開抽屜，才在下一個 tick 打開
      this.$nextTick(() => this.mobileApplyPendingDrawer());
    },

    showModal(open) {
      if (open && this.mobileCompact) {
        this.mobileCloseMenus();
      }
    }
  },

  mounted() {
    this.mobileInitViewport();
    this.gradesLoadZoom();
  },

  beforeUnmount() {
    this.mobileDisposeViewport();
    if (this._gradesPinch && this._gradesPinch.raf) {
      cancelAnimationFrame(this._gradesPinch.raf);
    }
    this._gradesPinch = null;
  },

  methods: {
    mobileCloseMenus(keepKey = null) {
      for (const key of MOBILE_UI_MENU_KEYS) {
        if (key !== keepKey) this[key] = false;
      }
    },

    // ---------- ★ v2: 班別抽屜 ----------
    mobileShouldAutoOpenDrawer(key) {
      if (key === 'grades') return true;
      if (key === 'scoring') return !this.currentClass;
      if (key === 'analysis') {
        return !this.currentClass && this.analysisSubTab !== 'crossYear';
      }
      return false;
    },

    mobileSetDrawer(open) {
      this.leftPanelOpen = !!open;
      if (open) this._mobileDrawerOpenedAt = Date.now();
    },

    mobileOverlayClose() {
      const t = this._mobileDrawerOpenedAt || 0;
      if (Date.now() - t < MOBILE_DRAWER_GUARD_MS) return;
      this.leftPanelOpen = false;
    },

    mobileApplyPendingDrawer() {
      const pending = this._mobilePendingDrawer;
      if (!pending) return;

      if (Date.now() - pending.at > MOBILE_DRAWER_PENDING_MS) {
        this._mobilePendingDrawer = null;
        return;
      }

      // 頁面仍未切換（例如 switchToTab 為非同步），保留待 currentView watcher 處理
      if (this.currentView !== pending.view) return;

      this._mobilePendingDrawer = null;
      if (this.mobileCompact) this.mobileSetDrawer(true);
    },

    _mobileBlurActiveInput() {
      const el = document.activeElement;
      if (
        el &&
        typeof el.blur === 'function' &&
        (
          el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable
        )
      ) {
        el.blur();
      }
    },

    // ★ v2: 底部 / 頂部導覽按鈕入口
    mobileTabClick(key) {
      if (!this.mobileCompact) {
        this.switchToTab(key);
        return;
      }

      // 已在同一個需選班別的頁面：再按一次 = 開關班別抽屜
      if (key === this.currentView && MOBILE_DRAWER_VIEWS.includes(key)) {
        this.mobileCloseMenus();
        this.mobileSetDrawer(!this.leftPanelOpen);
        return;
      }

      if (this.currentView === 'grades' && key !== 'grades') {
        this.gradesResetFocus();
      }

      this.mobileCloseMenus();
      this._mobileBlurActiveInput();

      this._mobilePendingDrawer = this.mobileShouldAutoOpenDrawer(key)
        ? { view: key, at: Date.now() }
        : null;

      this.switchToTab(key);

      this.$nextTick(() => this.mobileApplyPendingDrawer());
    },

    mobileNavigate(key) {
      if (!this.allTabs.some(t => t.key === key)) return;

      // 在切換頁面前，先提交正在編輯的成績格。
      if (this.currentView === 'grades' && key !== 'grades') {
        this.gradesResetFocus();
      }

      this.mobileCloseMenus();
      this.calendarEventPopover = null;
      this.calendarMoreEventsModal = null;
      this.scoringTooltip = null;
      this.hideMatchTooltip();

      if (key === 'settings') {
        this.settingsNav = [];
      }

      if (this.mobileCompact) {
        this.leftPanelOpen = false;
        this._mobileBlurActiveInput();

        this._mobilePendingDrawer = this.mobileShouldAutoOpenDrawer(key)
          ? { view: key, at: Date.now() }
          : null;
      }

      this.currentView = key;

      this.$nextTick(() => this.mobileApplyPendingDrawer());
    },

    // ---------- ★ v2: 成績表顯示比例 ----------
    gradesLoadZoom() {
      try {
        const v = parseFloat(window.localStorage.getItem(GRADES_ZOOM_STORAGE_KEY));
        if (Number.isFinite(v)) this.gradesZoom = clampGradesZoom(v);
      } catch (e) { /* ignore */ }
    },

    _gradesPersistZoom() {
      try {
        window.localStorage.setItem(GRADES_ZOOM_STORAGE_KEY, String(this.gradesZoom));
      } catch (e) { /* ignore */ }
    },

    _gradesZoomAnchor(wrapper, zoom, anchor) {
      const rect = wrapper.getBoundingClientRect();
      const ax = anchor ? anchor.x - rect.left : rect.width / 2;
      const ay = anchor ? anchor.y - rect.top : rect.height / 2;
      return {
        ax,
        ay,
        cx: (wrapper.scrollLeft + ax) / zoom,
        cy: (wrapper.scrollTop + ay) / zoom
      };
    },

    gradesSetZoom(value, anchor) {
      const next = clampGradesZoom(value);
      const prev = this.gradesZoom || 1;
      if (Math.abs(next - prev) < 0.0005) return;

      const wrapper = this.$refs.gradesWrapper;
      const keep = wrapper ? this._gradesZoomAnchor(wrapper, prev, anchor) : null;

      this.gradesZoom = next;
      this._gradesPersistZoom();

      if (!wrapper || !keep) return;

      // 維持錨點（手指 / 滑鼠 / 畫面中心）下的內容位置不變
      this.$nextTick(() => {
        wrapper.scrollLeft = keep.cx * next - keep.ax;
        wrapper.scrollTop = keep.cy * next - keep.ay;
      });
    },

    gradesZoomIn() {
      const base = Math.floor((this.gradesZoom || 1) * 10 + 1e-6) / 10;
      this.gradesSetZoom(base + 0.1);
    },

    gradesZoomOut() {
      const base = Math.ceil((this.gradesZoom || 1) * 10 - 1e-6) / 10;
      this.gradesSetZoom(base - 0.1);
    },

    gradesZoomReset() {
      this.gradesSetZoom(1);
    },

    // 桌面：Ctrl / ⌘ + 滾輪（觸控板雙指縮放亦會觸發 ctrlKey 滾輪事件）
    gradesOnTableWheel(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.01);
      this.gradesSetZoom((this.gradesZoom || 1) * factor, { x: e.clientX, y: e.clientY });
    },

    // 手機：雙指縮放（同時可雙指拖動）
    _gradesTouchMid(t1, t2, rect) {
      return {
        x: (t1.clientX + t2.clientX) / 2 - rect.left,
        y: (t1.clientY + t2.clientY) / 2 - rect.top
      };
    },

    gradesOnTableTouchStart(e) {
      if (!e.touches || e.touches.length !== 2) return;
      const wrapper = this.$refs.gradesWrapper;
      if (!wrapper) return;

      const [t1, t2] = e.touches;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      if (dist < 10) return;

      const rect = wrapper.getBoundingClientRect();
      const mid = this._gradesTouchMid(t1, t2, rect);
      const z = this.gradesZoom || 1;

      this._gradesPinch = {
        startDist: dist,
        startZoom: z,
        current: z,
        mx: mid.x,
        my: mid.y,
        cx: (wrapper.scrollLeft + mid.x) / z,
        cy: (wrapper.scrollTop + mid.y) / z,
        raf: 0
      };
    },

    gradesOnTableTouchMove(e) {
      const p = this._gradesPinch;
      if (!p || !e.touches || e.touches.length !== 2) return;

      // 阻止瀏覽器原生整頁縮放
      if (e.cancelable) e.preventDefault();

      const wrapper = this.$refs.gradesWrapper;
      if (!wrapper) return;

      const [t1, t2] = e.touches;
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const rect = wrapper.getBoundingClientRect();
      const mid = this._gradesTouchMid(t1, t2, rect);

      p.current = clampGradesZoom(p.startZoom * (dist / p.startDist));
      p.mx = mid.x;
      p.my = mid.y;

      if (!p.raf) {
        p.raf = requestAnimationFrame(() => {
          p.raf = 0;
          this._gradesApplyPinch(p);
        });
      }
    },

    // 縮放過程中直接更新 DOM，避免每次手指移動都重新渲染整個 App
    _gradesApplyPinch(p) {
      const wrapper = this.$refs.gradesWrapper;
      if (!wrapper) return;
      const table = wrapper.querySelector('table.grades-table');
      if (!table) return;

      table.style.zoom = String(p.current);
      wrapper.scrollLeft = p.cx * p.current - p.mx;
      wrapper.scrollTop = p.cy * p.current - p.my;
    },

    gradesOnTableTouchEnd(e) {
      const p = this._gradesPinch;
      if (!p) return;
      if (e && e.touches && e.touches.length >= 2) return;

      if (p.raf) {
        cancelAnimationFrame(p.raf);
        p.raf = 0;
        this._gradesApplyPinch(p);
      }

      this._gradesPinch = null;
      this._gradesPinchEndedAt = Date.now();

      // 提交最終比例至響應式狀態
      this.gradesZoom = p.current;
      this._gradesPersistZoom();
    },

    // ---------- 可見視窗 / 軟鍵盤 ----------
    mobileInitViewport() {
      this.mobileDisposeViewport();

      const root = document.documentElement;
      const viewport = window.visualViewport || null;

      const state = {
        raf: 0,
        width: 0,
        baselineHeight: 0,
        lastHeight: 0,
        viewport,
        schedule: null,
        clearVariables: null
      };

      const clearVariables = () => {
        [
          '--mobile-vh',
          '--mobile-vv-top',
          '--mobile-safe-bottom'
        ].forEach(key => root.style.removeProperty(key));
      };

      state.clearVariables = clearVariables;

      const sync = () => {
        const compact = window.matchMedia(
          '(max-width: 1023px)'
        ).matches;

        const wasCompact = this.mobileCompact;
        this.mobileCompact = compact;

        if (!compact) {
          this.mobileKeyboardOpen = false;
          state.baselineHeight = 0;
          state.width = 0;
          state.lastHeight = 0;
          clearVariables();
          return;
        }

        // 不因使用者雙指放大而重新縮放整個 App 版面。
        if (viewport && Math.abs(viewport.scale - 1) > 0.05) {
          return;
        }

        const width = window.innerWidth;
        const height = viewport
          ? viewport.height
          : window.innerHeight;

        const top = viewport
          ? Math.max(0, viewport.offsetTop)
          : 0;

        if (
          !state.width ||
          Math.abs(width - state.width) > 40
        ) {
          state.baselineHeight = height;
        } else {
          state.baselineHeight = Math.max(
            state.baselineHeight,
            height
          );
        }

        state.width = width;

        const active = document.activeElement;

        const editable = !!(
          active &&
          (
            active.isContentEditable ||
            active.tagName === 'TEXTAREA' ||
            (
              active.tagName === 'INPUT' &&
              !/^(checkbox|radio|range|button|submit|reset|file|color|hidden)$/i
                .test(active.type)
            )
          )
        );

        const keyboardOpen =
          state.baselineHeight - height > 120 &&
          (editable || this.mobileKeyboardOpen);

        const heightChanged =
          Math.abs(state.lastHeight - height) > 1;

        state.lastHeight = height;

        root.style.setProperty('--mobile-vh', height + 'px');
        root.style.setProperty('--mobile-vv-top', top + 'px');

        root.style.setProperty(
          '--mobile-safe-bottom',
          keyboardOpen
            ? '0px'
            : 'env(safe-area-inset-bottom, 0px)'
        );

        this.mobileKeyboardOpen = !!keyboardOpen;

        if (!wasCompact) {
          this.leftPanelOpen = false;
        }

        if (
          heightChanged &&
          this.currentView === 'grades' &&
          !this.showModal
        ) {
          this.$nextTick(() => {
            this.gradesScrollFocusedIntoView();
          });
        }
      };

      state.schedule = () => {
        if (state.raf) return;

        state.raf = requestAnimationFrame(() => {
          state.raf = 0;
          sync();
        });
      };

      this._mobileViewportState = state;

      window.addEventListener('resize', state.schedule);
      document.addEventListener('focusin', state.schedule, true);
      document.addEventListener('focusout', state.schedule, true);

      if (viewport) {
        viewport.addEventListener('resize', state.schedule);
        viewport.addEventListener('scroll', state.schedule);
      }

      sync();
    },

    mobileDisposeViewport() {
      const state = this._mobileViewportState;
      if (!state) return;

      if (state.raf) cancelAnimationFrame(state.raf);

      window.removeEventListener('resize', state.schedule);
      document.removeEventListener('focusin', state.schedule, true);
      document.removeEventListener('focusout', state.schedule, true);

      if (state.viewport) {
        state.viewport.removeEventListener('resize', state.schedule);
        state.viewport.removeEventListener('scroll', state.schedule);
      }

      state.clearVariables();
      this._mobileViewportState = null;
    }
  }
};