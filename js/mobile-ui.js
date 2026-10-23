// ================================================================
// Mobile UI
// - 手機 / 中小型平板採用 App 介面
// - 底部導覽、操作面板、可見視窗 / 軟鍵盤處理
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

const MobileUiMixin = {
  data() {
    return {
      mobileCompact: false,
      mobileKeyboardOpen: false
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
    },

    showModal(open) {
      if (open && this.mobileCompact) {
        this.mobileCloseMenus();
      }
    }
  },

  mounted() {
    this.mobileInitViewport();
  },

  beforeUnmount() {
    this.mobileDisposeViewport();
  },

  methods: {
    mobileCloseMenus(keepKey = null) {
      for (const key of MOBILE_UI_MENU_KEYS) {
        if (key !== keepKey) this[key] = false;
      }
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
      }

      this.currentView = key;
    },

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