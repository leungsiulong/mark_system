// ================================================================
// Main Application (v25 — 
//   req1) frozen column z-index + highlight bg fix (cell selection no longer covers frozen cols)
//   req2) new-student match badge has no hover tooltip
//   req3) match status only shown in subject/elective classes (not regular)
//   req4) desktop calendar taller cells + prettier event pills (calMonthEventLimit)
//   req5) cross-year analysis: tree-based year→class→student selection
//   req6) clicking cross-year tab resets back to search/select page)
// ================================================================
const { createApp } = Vue;

createApp({
  data() {
    return {
      loading: true, loadingText: '正在載入數據...', loadingProgress: 0,
      yearLoading: false, yearLoadingText: '',
      error: null, academicYears: [], globalStudents: [],
      settings: { schoolName:'', teacherName:'', defaultFullMark:100, termDates:{}, templates:[] },
      currentView: 'home', currentAcademicYearId: null, currentClassId: null,
      leftPanelOpen: true, expandedYears: {},

      calendarDate: new Date(),
      calendarWeekDate: new Date(),
      calendarView: 'month',
      calendarFilter: 'all',
      calendarTypeFilter: { assignment: true, quiz: true, unified_test: true, exam: true },
      calendarEventPopover: null,
      calendarMoreEventsModal: null,
      // ★ req4: 桌面大屏每格顯示更多項目（month view）
      calMonthEventLimit: 2,

      dayNames: ['日','一','二','三','四','五','六'],
      allTabs: ALL_TABS,
      tabOrder: ['home','grades','scoring','analysis','settings'],
      currentTheme: 'blue', colorThemes: COLOR_THEMES,
      quickNavAllItems: QUICK_NAV_ITEMS,
      activeQuickNavKeys: ['grades','scoring','analysis','yearMgmt'],
      settingsNav: [],
      settingsYearTab: 'classes',
      settingsSaveStatus: '',
      showModal: false, modalType: null, modalData: {},
      toasts: [], toastCounter: 0,
      studentSortKey: 'studentNumber', studentSortAsc: true,

      gradesTermId: null, gradesFocusRow: -1, gradesFocusCol: -1,
      gradesEditing: false, gradesEditValue: '', gradesOriginalValue: '', gradesCellOriginalValue: '',
      gradesSaveTimers: {}, gradesSavingCells: {},
      gradesHeaderMenu: null, gradesDetailPanel: null, gradesHighlightCol: -1,
      gradesCPMenuOpen: false, gradesCustomMenuOpen: false, gradesUndoStack: [],
      gradesSelStart: null, gradesSelEnd: null,
      gradesHighlightUnenteredCol: -1,
      gradesShowFailHighlight: true, gradesFailPercent: null,
      gradesHoverRow: -1,
      gradesIsDragging: false,
      gradesDragStartCell: null,
      gradesDetailEditFullMark: '',
      gradesDisplayMode: 'raw',
      gradesIsTouchDevice: false,
      gradesActivelyEditing: false,
      gradesExportMenuOpen: false,
      gradesStatRows: [
        { key:'avg', label:'平均' }, { key:'max', label:'最高' }, { key:'min', label:'最低' },
        { key:'median', label:'中位數' }, { key:'stddev', label:'標準差' }, { key:'count', label:'已輸入' }
      ],

      scoringSubTab: 'settings',
      scoringAccordion: { attribution: false, ut: false, exam: false, yearly: false },
      scoringSaveStatus: '',
      scoringTooltip: null,
      scoringCopyMenuOpen: false,
      scoringExportMenuOpen: false,
      scoringApplyMenuOpen: false,
      scoringCopyColumns: { a3: true, a1: false, a2: false, examTotal: true },
      scoringReportSortKey: 'className',
      scoringReportSortAsc: true,
      scoringReportHighlight: null,
      scoringWeightsLocal: {
        ut: { assignment:20, quiz:20, unifiedTest:40, classPerformance:20, customCategories: {} },
        exam: { a1Ratio:30, a2Ratio:70, a1Weights:{ assignment:6, quiz:6, unifiedTest:12, classPerformance:6, customCategories: {} } },
        yearly: { t1Weight:40, t2Weight:60 }
      },

      customCatColors: CUSTOM_CAT_COLORS,

      analysisSubTab: 'class',
      analysisStudentId: null,
      analysisDistributionKey: null,
      analysisTrendSelectedStudents: [],
      analysisCrossYearSearchQuery: '',
      analysisCrossYearStudent: null,
      // ★ req5: 跨學年樹狀選擇展開狀態
      analysisCrossYearExpandedYears: {},
      analysisCrossYearExpandedClasses: {},
      analysisOverviewSortKey: null,
      analysisOverviewSortAsc: true,
      analysisRankingSortKey: 'yearlyRank',
      analysisRankingSortAsc: true,
      analysisStudentSortKey: 'diff',
      analysisStudentSortAsc: false,
      analysisOverviewAssignmentCollapsed: true,

      editMatchSearchQuery: '',

      // ★ v25: 自訂匹配狀態 tooltip
      matchTooltip: null,
      matchTooltipTimer: null,
      matchTooltipDelay: 0    };
  },

  computed: {
    themeColors() { return this.colorThemes.find(t => t.key === this.currentTheme) || this.colorThemes[0]; },
    headerStyle() { return { background:'linear-gradient(135deg, var(--theme-gradient-from), var(--theme-primary), var(--theme-secondary))' }; },
    bannerStyle() { return { background:'radial-gradient(circle at 85% 10%, rgba(255,255,255,0.25), transparent 18rem), linear-gradient(135deg, var(--theme-gradient-from), var(--theme-primary) 55%, var(--theme-secondary))' }; },
    activeTabStyle() { return { background:'linear-gradient(135deg, var(--theme-primary), var(--theme-secondary))', color:'#fff', borderColor:'transparent', borderRadius:'999px', boxShadow:'0 10px 24px rgba(var(--theme-primary-rgb),0.22)' }; },
    treeActiveStyle() { return { backgroundColor:'rgba(var(--theme-primary-rgb),0.10)', color:'var(--theme-text)', boxShadow:'inset 0 0 0 1px rgba(var(--theme-primary-rgb),0.28)' }; },
    orderedTabs() { return this.tabOrder.map(key => this.allTabs.find(t => t.key === key)).filter(Boolean); },
    standardThemes() { return this.colorThemes.filter(t => t.group === 'standard'); },
    earthThemes() { return this.colorThemes.filter(t => t.group === 'earth'); },
    softThemes() { return this.colorThemes.filter(t => t.group === 'soft'); },
    currentDateDisplay() { const now=new Date(); const dl=['星期日','星期一','星期二','星期三','星期四','星期五','星期六']; return now.getFullYear()+'年'+(now.getMonth()+1)+'月'+now.getDate()+'日 '+dl[now.getDay()]; },
    activeQuickNavItems() { return this.activeQuickNavKeys.map(key => this.quickNavAllItems.find(i => i.key === key)).filter(Boolean); },
    inactiveQuickNavItems() { return this.quickNavAllItems.filter(i => !this.activeQuickNavKeys.includes(i.key)); },
    isLeftPanelVisible() { return this.currentView !== 'home' && this.currentView !== 'settings' && this.leftPanelOpen; },
    settingsCurrentView() { if (this.settingsNav.length===0) return 'root'; return this.settingsNav[this.settingsNav.length-1].key; },
    settingsCurrentYearId() { for (let i=this.settingsNav.length-1;i>=0;i--) { if (this.settingsNav[i].yearId) return this.settingsNav[i].yearId; } return null; },
    settingsCurrentClassId() { for (let i=this.settingsNav.length-1;i>=0;i--) { if (this.settingsNav[i].classId) return this.settingsNav[i].classId; } return null; },
    settingsYear() { if (!this.settingsCurrentYearId) return null; return this.academicYears.find(y => y.id === this.settingsCurrentYearId) || null; },
    settingsClassesForYear() { return this.settingsYear ? this.settingsYear.classes : []; },
    regularClassesForYear() {
      if (!this.settingsYear) return [];
      return this.settingsYear.classes.filter(c => c.classType === 'regular').slice().sort((a, b) => a.className.localeCompare(b.className));
    },
    subjectClassesForYear() {
      if (!this.settingsYear) return [];
      return this.settingsYear.classes.filter(c => c.classType === 'subject' || c.classType === 'elective').slice().sort((a, b) => {
        if (a.classType !== b.classType) return a.classType === 'subject' ? -1 : 1;
        const cn = a.className.localeCompare(b.className);
        if (cn !== 0) return cn;
        return (a.subject || '').localeCompare(b.subject || '');
      });
    },
    settingsClass() { if (!this.settingsYear||!this.settingsCurrentClassId) return null; return this.settingsYear.classes.find(c => c.id === this.settingsCurrentClassId) || null; },
    settingsStudents() { return this.settingsClass ? this.settingsClass.students : []; },
    isSettingsClassElective() { return this.settingsClass && this.settingsClass.classType === 'elective'; },
    // ★ req3: 匹配狀態僅在「科目 / 選修」班別有意義（一般班別可能連結多個科目，故不顯示）
    isSettingsClassMatchable() {
      return !!(this.settingsClass && (this.settingsClass.classType === 'subject' || this.settingsClass.classType === 'elective'));
    },
    settingsSortedStudents() {
      const arr = [...this.settingsStudents];
      if (this.isSettingsClassElective) {
        arr.sort((a, b) => {
          const ca = this._findStudentOriginClass(this.settingsCurrentYearId, a) || '';
          const cb = this._findStudentOriginClass(this.settingsCurrentYearId, b) || '';
          const cn = ca.localeCompare(cb);
          if (cn !== 0) return cn;
          return (parseInt(a.studentNumber)||0) - (parseInt(b.studentNumber)||0);
        });
        return arr;
      }
      const key = this.studentSortKey;
      const asc = this.studentSortAsc;
      arr.sort((a,b)=>{ let va=a[key],vb=b[key]; if(key==='studentNumber'){va=parseInt(va)||0;vb=parseInt(vb)||0;} if(va<vb)return asc?-1:1; if(va>vb)return asc?1:-1; return 0; });
      return arr;
    },
    currentAcademicYear() { return this.academicYears.find(y => y.id === this.currentAcademicYearId) || null; },
    classesForSelectedYear() { return this.currentAcademicYear ? this.currentAcademicYear.classes : []; },
    currentClass() { if (!this.currentAcademicYear) return null; return this.currentAcademicYear.classes.find(c => c.id === this.currentClassId) || null; },
    currentStudents() { return this.currentClass ? this.currentClass.students : []; },
    isCurrentClassElective() { return this.currentClass && this.currentClass.classType === 'elective'; },
    allClassesFlat() {
      const r = [];
      if (this.currentAcademicYear)
        for (const c of this.currentAcademicYear.classes)
          if (c.classType === 'subject' || c.classType === 'elective') r.push(c);
      return r;
    },

    _yearStudentCountMap() {
      const map = {};
      for (const g of this.globalStudents) {
        const seenSubjectYears = new Set();
        for (const r of (g.records || [])) {
          if (!r.academicYearId || !r.classId) continue;
          if (seenSubjectYears.has(r.academicYearId)) continue;
          const cls = this.getClassObj(r.academicYearId, r.classId);
          if (cls && (cls.classType === 'subject' || cls.classType === 'elective')) {
            seenSubjectYears.add(r.academicYearId);
            map[r.academicYearId] = (map[r.academicYearId] || 0) + 1;
          }
        }
      }
      return map;
    },
    _classStudentCountMap() {
      const map = {};
      for (const g of this.globalStudents) {
        const seen = new Set();
        for (const r of (g.records || [])) {
          if (r.classId && !seen.has(r.classId)) { seen.add(r.classId); map[r.classId] = (map[r.classId] || 0) + 1; }
        }
      }
      return map;
    },

    scoringReportFinalData() {
      const data = (this.scoringReportSortedData || []).map(r => {
        let originClass = '';
        if (this.currentClass) {
          const student = this.currentStudents.find(s => s.id === r.studentId);
          if (student) originClass = this._findStudentOriginClass(this.currentAcademicYearId, student);
        }
        return { ...r, originClass };
      });
      if (this.scoringReportSortKey === 'className') {
        const asc = this.scoringReportSortAsc;
        data.sort((a, b) => {
          const cmp = a.originClass.localeCompare(b.originClass);
          if (cmp !== 0) return asc ? cmp : -cmp;
          return (parseInt(a.studentNumber) || 0) - (parseInt(b.studentNumber) || 0);
        });
      }
      return data;
    },

    modalTitle() {
      const map = {
        addYear:'新增學年', editYear:'編輯學年',
        addClass:(this.modalData.classType==='elective'?'新增選修科':'新增班別'),
        editClass:'編輯班別',
        addSubject:'新增科目',
        addStudent:'新增學生', editStudent:'編輯學生',
        editStudentMatch:'修改學生匹配',
        batchImport:'批量匯入學生',
        deleteConfirm:'確認刪除',
        addAssessment:'新增評估項目', editAssessment:'編輯評估項目',
        calAddAssessment:'從月曆新增項目',
        addCustomCategory:'新增自訂類別',
        addTemplate:'新增計分模板', editTemplate:'編輯計分模板',
        applyTemplateConfirm:'套用計分模板'
      };
      return map[this.modalType]||'';
    },
    getCustomCategoryColor() { return (colorKey) => this.customCatColors.find(c => c.key === colorKey) || this.customCatColors[0]; },

    allSubjects() {
      const set = new Set();
      for (const year of this.academicYears) {
        for (const cls of year.classes) {
          if (cls.subject && cls.subject.trim()) set.add(cls.subject);
        }
      }
      return Array.from(set).sort();
    },

    modalExistingRegular() {
      if (this.modalType !== 'addClass' || (this.modalData.classType || 'regular') !== 'regular') return null;
      const cn = (this.modalData.className || '').trim();
      if (!cn) return null;
      const yearId = this.modalData.yearId || this.currentAcademicYearId;
      const year = this.academicYears.find(y => y.id === yearId);
      if (!year) return null;
      return year.classes.find(c => c.className === cn && c.classType === 'regular') || null;
    },

    modalSiblingSubjects() {
      if (this.modalType !== 'addClass' || (this.modalData.classType || 'regular') !== 'regular') return [];
      const cn = (this.modalData.className || '').trim();
      if (!cn) return [];
      const yearId = this.modalData.yearId || this.currentAcademicYearId;
      const year = this.academicYears.find(y => y.id === yearId);
      if (!year) return [];
      return year.classes.filter(c => c.className === cn && c.classType === 'subject');
    },

    availableBaseClassesInYear() {
      const yearId = this.modalData.yearId || this.currentAcademicYearId;
      const year = this.academicYears.find(y => y.id === yearId);
      if (!year) return [];
      return year.classes.filter(c => c.classType === 'regular').slice().sort((a, b) => a.className.localeCompare(b.className));
    },

    electiveStudentGroups() {
      if (this.modalType !== 'addClass' || this.modalData.classType !== 'elective') return [];
      const yearId = this.modalData.yearId || this.currentAcademicYearId;
      const year = this.academicYears.find(y => y.id === yearId);
      if (!year) return [];
      const groups = {};
      const seenPerGroup = {};
      for (const cls of year.classes) {
        const ct = cls.classType || 'regular';
        if (ct !== 'regular' && ct !== 'subject') continue;
        const key = cls.className;
        if (!groups[key]) { groups[key] = []; seenPerGroup[key] = new Set(); }
        for (const s of cls.students) {
          const dedupeId = s.globalStudentId || s.id;
          if (seenPerGroup[key].has(dedupeId)) continue;
          seenPerGroup[key].add(dedupeId);
          groups[key].push(s);
        }
      }
      const result = [];
      for (const key in groups) {
        groups[key].sort((a, b) => (parseInt(a.studentNumber) || 0) - (parseInt(b.studentNumber) || 0));
        result.push({ className: key, students: groups[key] });
      }
      result.sort((a, b) => a.className.localeCompare(b.className));
      return result;
    },

    modalCurrentMatchedGlobal() {
      if (this.modalType !== 'editStudentMatch') return null;
      const gid = this.modalData.currentGlobalStudentId;
      if (!gid) return null;
      return this.globalStudents.find(g => g.id === gid) || null;
    },

    modalEditMatchSearchResults() {
      if (this.modalType !== 'editStudentMatch') return [];
      const q = (this.editMatchSearchQuery || '').trim().toLowerCase();
      if (q.length < 1) return [];
      const currentGid = this.modalData.currentGlobalStudentId;
      return this.globalStudents
        .filter(g => g.id !== currentGid && (g.name || '').toLowerCase().indexOf(q) >= 0)
        .slice(0, 30);
    },

    ...GradesComputed, ...ScoringComputed, ...CalendarComputed, ...AnalysisComputed, ...SettingsComputed,
  },

  watch: {
    currentTheme() { this.$nextTick(() => this.applyThemeTokens()); },
    currentAcademicYearId(nv, ov) {
      if (nv === ov) return;
      if (this.currentClassId) {
        const year = this.academicYears.find(y => y.id === nv);
        if (!year || !year.classes.find(c => c.id === this.currentClassId)) this.currentClassId = null;
      }
      this.gradesResetFocus();
      if (nv) {
        const yr = this.academicYears.find(y => y.id === nv);
        if (yr && !yr._loaded && !yr._loading) this.ensureYearLoaded(nv);
        if (this._skipYearWatchSave) this._skipYearWatchSave = false;
        else this._saveLastSelectedYear(nv);
      }
    },
    currentClassId() {
      this.gradesResetFocus();
      this.gradesAutoSelectTerm();
      this.initScoringWeights();
      this.gradesFailPercent = null;
      this.scoringReportHighlight = null;
      this.analysisStudentId = null;
      this.analysisTrendSelectedStudents = [];
      this.analysisDistributionKey = null;
      this.analysisOverviewAssignmentCollapsed = true;
      this.$nextTick(() => {
        if (this.currentView === 'analysis') setTimeout(() => this.analysisRenderAllCharts(), 80);
      });
    },
    gradesTermId() {
      this.analysisOverviewAssignmentCollapsed = true;
      this.$nextTick(() => {
        if (this.currentView === 'analysis') setTimeout(() => this.analysisRenderAllCharts(), 80);
      });
    },
    currentView(nv) {
      if (nv==='grades'||nv==='scoring') { this.gradesAutoSelectTerm(); if (nv==='scoring') this.initScoringWeights(); }
      this.scoringReportHighlight = null;
      if (nv !== 'home') {
        this.calendarEventPopover = null;
        this.calendarMoreEventsModal = null;
      }
      if (nv === 'analysis') {
        this.$nextTick(() => setTimeout(() => this.analysisRenderAllCharts(), 120));
      } else {
        this.analysisDestroyAllCharts();
      }
    },
    scoringSubTab() { this.scoringReportHighlight = null; },
    scoringWeightsLocal: {
      handler() { if (this._scoringSkipWatch) return; this.scoringDebouncedAutoSave(); },
      deep: true
    },
    analysisSubTab() {
      this.$nextTick(() => setTimeout(() => this.analysisRenderAllCharts(), 80));
    },
    analysisStudentId() {
      if (this.analysisSubTab === 'student') this.$nextTick(() => setTimeout(() => this.analysisRenderAllCharts(), 80));
    },
    analysisDistributionKey() {
      this.$nextTick(() => this.analysisRenderDistribution());
    },
    analysisTrendSelectedStudents: {
      handler() { this.$nextTick(() => this.analysisRenderTrend()); },
      deep: true
    },
    analysisCrossYearStudent(gs) {
      if (gs) {
        const yearIds = [...new Set((gs.records || []).map(r => r.academicYearId))];
        this.ensureYearsLoaded(yearIds).then(() => {
          this.$nextTick(() => setTimeout(() => this.analysisRenderCrossYearTrend(), 80));
        });
      } else {
        this.$nextTick(() => setTimeout(() => this.analysisRenderCrossYearTrend(), 80));
      }
    }
  },

  methods: {
    ...GradesMethods, ...ScoringMethods, ...CalendarMethods, ...CrudMethods, ...AnalysisMethods, ...ExportMethods, ...SettingsMethods,

    switchToTab(key) {
      if (key === 'settings') this.settingsNav = [];
      this.currentView = key;
    },

    getClassObj(yearId, classId) { const y=this.academicYears.find(y=>y.id===yearId); if(!y)return null; return y.classes.find(c=>c.id===classId)||null; },
    getTabDef(key) { return this.allTabs.find(t => t.key === key) || { label:key, icon:'' }; },
    dateToStr(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); },
    isToday(d) { const t=new Date(); return d.getDate()===t.getDate()&&d.getMonth()===t.getMonth()&&d.getFullYear()===t.getFullYear(); },
    assessmentColor(type) { return {'bg-blue-500':type==='assignment','bg-green-500':type==='quiz','bg-orange-500':type==='unified_test','bg-red-500':type==='exam','bg-purple-500':type==='class_performance','bg-teal-500':type==='custom'}; },
    assessmentDot(type) { return {'bg-blue-500':type==='assignment','bg-green-500':type==='quiz','bg-orange-500':type==='unified_test','bg-red-500':type==='exam','bg-purple-500':type==='class_performance','bg-teal-500':type==='custom'}; },
    assessmentLabel(type) { return {assignment:'課業',quiz:'小測',unified_test:'統測',exam:'考試',class_performance:'課堂表現',custom:'自訂'}[type]||type; },

    // ★ req4: 依視窗寬度決定月曆每格顯示項目數量（桌面更多）
    _updateCalMonthEventLimit() {
      const w = window.innerWidth || document.documentElement.clientWidth;
      if (w >= 1280) this.calMonthEventLimit = 4;
      else if (w >= 1024) this.calMonthEventLimit = 3;
      else this.calMonthEventLimit = 2;
    },

    toggleYear(yearId) { this.expandedYears={...this.expandedYears,[yearId]:!this.expandedYears[yearId]}; },
    async selectFromTree(yearId, classId) {
      if (window.innerWidth < 1024) this.leftPanelOpen = false;
      await this.ensureYearLoaded(yearId);
      this.currentAcademicYearId = yearId;
      this.currentClassId = classId;
    },
    sortStudents(key) { if(this.studentSortKey===key)this.studentSortAsc=!this.studentSortAsc;else{this.studentSortKey=key;this.studentSortAsc=true;} },

    yearStudentCount(y) {
      if (y && y._loaded) {
        const seenGidsWithSubject = new Set();
        for (const c of y.classes) {
          if (c.classType !== 'subject' && c.classType !== 'elective') continue;
          for (const s of (c.students || [])) {
            seenGidsWithSubject.add(s.globalStudentId || s.id);
          }
        }
        return seenGidsWithSubject.size;
      }
      return this._yearStudentCountMap[y.id] || 0;
    },
    yearRegularCount(y) { return y.classes.filter(c => c.classType === 'regular').length; },
    yearSubjectCount(y) { return y.classes.filter(c => c.classType === 'subject' || c.classType === 'elective').length; },

    treeClassStudentCount(y, c) {
      if (y && y._loaded) return (c.students || []).length;
      return this._classStudentCountMap[c.id] || 0;
    },

    classSubjectsCount(cls) {
      if (!this.settingsYear) return 0;
      return this.settingsYear.classes.filter(c => c.classType === 'subject' && c.className === cls.className).length;
    },

    hasSubjectForClass(cls, subjectName) {
      if (!subjectName || subjectName === '__new__') return false;
      const yearId = this.modalData.yearId || this.currentAcademicYearId;
      const year = this.academicYears.find(y => y.id === yearId);
      if (!year) return false;
      return year.classes.some(c => c.classType === 'subject' && c.className === cls.className && c.subject === subjectName);
    },

    globalStudentSubjectRecordsCount(gs) {
      if (!gs || !gs.records) return 0;
      let count = 0;
      const seenYearSubject = new Set();
      for (const r of gs.records) {
        const cls = this.getClassObj(r.academicYearId, r.classId);
        if (!cls) continue;
        if (cls.classType !== 'subject' && cls.classType !== 'elective') continue;
        const key = r.academicYearId + '||' + (cls.subject || '') + '||' + cls.id;
        if (seenYearSubject.has(key)) continue;
        seenYearSubject.add(key);
        count++;
      }
      return count;
    },

    globalStudentHasSubjectRecord(gs) {
      if (!gs || !gs.records) return false;
      for (const r of gs.records) {
        const cls = this.getClassObj(r.academicYearId, r.classId);
        if (cls && (cls.classType === 'subject' || cls.classType === 'elective')) return true;
      }
      return false;
    },

    _findStudentOriginClass(yearId, student) {
      if (!student) return '';
      const year = this.academicYears.find(y => y.id === yearId);
      if (!year) return '';
      const gid = student.globalStudentId;
      if (!gid) return '';
      for (const c of year.classes) {
        if (c.classType !== 'regular') continue;
        if (c.students.find(s => s.globalStudentId === gid)) return c.className;
      }
      return '';
    },

    getStudentOriginClass(student) { return this._findStudentOriginClass(this.currentAcademicYearId, student); },
    getSettingsStudentOriginClass(student) { return this._findStudentOriginClass(this.settingsCurrentYearId, student); },

    // ============================================================
    // Student match status (used in students management table)
    // ============================================================
    getStudentMatchStatus(student) {
      if (!student.globalStudentId) {
        return { type: 'unlinked', label: '未連結', icon: 'fa-unlink', color: 'gray' };
      }
      const gs = this.globalStudents.find(g => g.id === student.globalStudentId);
      if (!gs) {
        return { type: 'unlinked', label: '未連結', icon: 'fa-unlink', color: 'gray' };
      }
      const currentYearId = this.settingsCurrentYearId;
      const seenOtherYears = new Set();
      for (const r of (gs.records || [])) {
        if (r.academicYearId && r.academicYearId !== currentYearId) {
          const cls = this.getClassObj(r.academicYearId, r.classId);
          if (cls && (cls.classType === 'subject' || cls.classType === 'elective')) {
            seenOtherYears.add(r.academicYearId);
          }
        }
      }
      if (seenOtherYears.size === 0) {
        return { type: 'new', label: '新學生', icon: 'fa-star', color: 'blue' };
      }
      return { 
        type: 'matched', 
        label: '已匹配 ' + seenOtherYears.size + ' 個學年',
        icon: 'fa-link',
        color: 'green'
      };
    },

    getMatchStatusBadgeClass(status) {
      switch (status.color) {
        case 'green': return 'bg-green-100 text-green-700 border border-green-200';
        case 'blue':  return 'bg-blue-100 text-blue-700 border border-blue-200';
        case 'gray':
        default:      return 'bg-gray-100 text-gray-600 border border-gray-200';
      }
    },

    // Tooltip text for the match status badge.
    getStudentMatchTooltip(student) {
      if (!student) return '';
      const status = this.getStudentMatchStatus(student);
      if (!student.globalStudentId) {
        return '此學生尚未連結至全域學生記錄\n（沒有跨學年追蹤資料）';
      }
      const gs = this.globalStudents.find(g => g.id === student.globalStudentId);
      if (!gs) {
        return '此學生的連結記錄已遺失，請點擊「修改匹配」重新連結';
      }
      const lines = [];
      lines.push('學生：' + (gs.name || student.studentName));

      const yearMap = {};
      for (const r of (gs.records || [])) {
        if (!r.academicYearId) continue;
        if (!yearMap[r.academicYearId]) yearMap[r.academicYearId] = [];
        yearMap[r.academicYearId].push(r);
      }

      const orderedYearIds = this.academicYears.map(y => y.id).filter(yid => yearMap[yid]);
      for (const yid in yearMap) {
        if (!orderedYearIds.includes(yid)) orderedYearIds.push(yid);
      }

      if (status.type === 'new') {
        lines.push('狀態：新學生（首次出現）');
      } else if (status.type === 'matched') {
        lines.push('狀態：已匹配 ' + (orderedYearIds.length - (yearMap[this.settingsCurrentYearId] ? 1 : 0)) + ' 個其他學年');
      }

      lines.push('───── 跨學年記錄 ─────');
      for (const yid of orderedYearIds) {
        const year = this.academicYears.find(y => y.id === yid);
        const yearName = year ? year.name : '(未知學年)';
        const isCurrent = yid === this.settingsCurrentYearId;
        const prefix = isCurrent ? '▸ ' : '• ';
        const labels = [];
        for (const r of yearMap[yid]) {
          const cls = this.getClassObj(r.academicYearId, r.classId);
          if (!cls) continue;
          let label = cls.className;
          if (cls.subject) label += ' - ' + cls.subject;
          if (cls.classType === 'elective') label += ' ★選修';
          else if (cls.classType === 'regular') label += '（一般）';
          labels.push(label);
        }
        if (labels.length === 0) {
          lines.push(prefix + yearName + ' (無資料)');
        } else {
          lines.push(prefix + yearName + (isCurrent ? '（本學年）' : ''));
          for (const lbl of labels) {
            lines.push('   · ' + lbl);
          }
        }
      }

      return lines.join('\n');
    },

    // ★ req2: 新學生不顯示 hover tooltip（呼叫端已守門，這裡再保險判斷一次）
    showMatchTooltip(student, event) {
      if (this.getStudentMatchStatus(student).type === 'new') return;

      if (this.matchTooltipTimer) {
        clearTimeout(this.matchTooltipTimer);
        this.matchTooltipTimer = null;
      }

      const text = this.getStudentMatchTooltip(student);
      if (!text) return;

      const delay = Number(this.matchTooltipDelay) || 0;

      const show = () => {
        const pos = this._calcMatchTooltipPosition(event);
        this.matchTooltip = {
          text,
          x: pos.x,
          y: pos.y,
          transform: pos.transform
        };
      };

      if (delay > 0) {
        this.matchTooltipTimer = setTimeout(show, delay);
      } else {
        show();
      }
    },

    moveMatchTooltip(event) {
      if (!this.matchTooltip) return;
      const pos = this._calcMatchTooltipPosition(event);
      this.matchTooltip = {
        ...this.matchTooltip,
        x: pos.x,
        y: pos.y,
        transform: pos.transform
      };
    },

    hideMatchTooltip() {
      if (this.matchTooltipTimer) {
        clearTimeout(this.matchTooltipTimer);
        this.matchTooltipTimer = null;
      }
      this.matchTooltip = null;
    },

    _calcMatchTooltipPosition(event) {
      const margin = 12;
      const viewportW = window.innerWidth || document.documentElement.clientWidth;
      const viewportH = window.innerHeight || document.documentElement.clientHeight;

      let x = event.clientX;
      let y = event.clientY - 14;
      let transform = 'translate(-50%, -100%)';

      const halfWidth = 220;
      if (x < halfWidth + margin) {
        x = margin;
        transform = 'translate(0, -100%)';
      } else if (x > viewportW - halfWidth - margin) {
        x = viewportW - margin;
        transform = 'translate(-100%, -100%)';
      }

      if (y < 120) {
        y = event.clientY + 18;
        if (transform === 'translate(-50%, -100%)') transform = 'translate(-50%, 0)';
        else if (transform === 'translate(0, -100%)') transform = 'translate(0, 0)';
        else if (transform === 'translate(-100%, -100%)') transform = 'translate(-100%, 0)';
      }

      if (y > viewportH - margin) y = viewportH - margin;

      return { x, y, transform };
    },

    async openEditStudentMatchModal(student) {
      const yearId = this.settingsCurrentYearId;
      const classId = this.settingsCurrentClassId;
      if (!yearId || !classId) { this.addToast('請先選擇班別', 'warning'); return; }

      let candidates = [];
      let sameNameGlobals = [];
      try {
        const cands = await this._buildStudentMatchCandidates(yearId, classId, student.studentName);
        candidates = cands.previousYearCandidates;
        sameNameGlobals = cands.sameNameGlobals.filter(g => g.id !== student.globalStudentId);
      } catch (e) {
        console.error('build candidates failed', e);
      }

      this.editMatchSearchQuery = '';
      this.openModal('editStudentMatch', {
        studentId: student.id,
        studentNumber: student.studentNumber,
        studentName: student.studentName,
        yearId, classId,
        currentGlobalStudentId: student.globalStudentId || null,
        candidates,
        sameNameGlobals,
        selectedAction: 'keep'
      });
    },

    selectMatchOption(action) {
      this.modalData.selectedAction = action;
    },

    selectMatchSearchCandidate(gs) {
      this.modalData.selectedAction = 'link:' + gs.id;
    },

    // ============================================================
    // ★ req5: 跨學年分析 — 樹狀（學年 → 科目班別 → 學生）選擇
    // ============================================================
    async analysisCrossYearToggleYear(yearId) {
      const open = !this.analysisCrossYearExpandedYears[yearId];
      this.analysisCrossYearExpandedYears = { ...this.analysisCrossYearExpandedYears, [yearId]: open };
      if (open) {
        const yr = this.academicYears.find(y => y.id === yearId);
        if (yr && !yr._loaded && !yr._loading) {
          await this.ensureYearLoaded(yearId);
        }
      }
    },

    analysisCrossYearToggleClass(classId) {
      this.analysisCrossYearExpandedClasses = {
        ...this.analysisCrossYearExpandedClasses,
        [classId]: !this.analysisCrossYearExpandedClasses[classId]
      };
    },

    analysisCrossYearClassesForYear(y) {
      if (!y || !y.classes) return [];
      return y.classes
        .filter(c => c.classType === 'subject' || c.classType === 'elective')
        .slice()
        .sort((a, b) => {
          if (a.classType !== b.classType) return a.classType === 'subject' ? -1 : 1;
          const cn = a.className.localeCompare(b.className);
          if (cn !== 0) return cn;
          return (a.subject || '').localeCompare(b.subject || '');
        });
    },

    analysisCrossYearSortedStudents(c) {
      const arr = [...(c.students || [])];
      arr.sort((a, b) => (parseInt(a.studentNumber) || 0) - (parseInt(b.studentNumber) || 0));
      return arr;
    },

    // 從樹狀點選學生 → 找到（或建立）對應的全域學生記錄後顯示分析
    async analysisSelectCrossYearStudentFromTree(student) {
      let gid = student.globalStudentId;
      let gs = gid ? this.globalStudents.find(g => g.id === gid) : null;

      if (!gs) {
        // 沒有全域記錄：嘗試用同名全域記錄；否則提示無跨學年資料
        const sameName = this.globalStudents.filter(g => (g.name || '').trim() === (student.studentName || '').trim());
        if (sameName.length === 1) {
          gs = sameName[0];
        } else if (sameName.length > 1) {
          this.addToast('此學生尚未連結全域記錄，且有多位同名學生，請改用姓名搜尋或先於「學生管理」修改匹配', 'warning');
          return;
        } else {
          this.addToast('此學生尚未連結任何跨學年記錄', 'info');
          return;
        }
      }

      this.analysisSelectCrossYearStudent(gs);
    },

    // ★ req6: 點擊「跨學年分析」分頁時，重設回搜尋 / 選擇頁面
    onAnalysisCrossYearTabClick() {
      this.analysisClearCrossYearStudent();
      this.analysisCrossYearSearchQuery = '';
      this.analysisCrossYearExpandedYears = {};
      this.analysisCrossYearExpandedClasses = {};
      this.analysisSetTab('crossYear');
    },

    scoringToggleReportHighlight(field, category) {
      if (this.scoringReportHighlight && this.scoringReportHighlight.field === field && this.scoringReportHighlight.category === category) {
        this.scoringReportHighlight = null;
      } else {
        this.scoringReportHighlight = { field, category };
      }
    },
    isReportHighlightActive(field, category) {
      return !!(this.scoringReportHighlight && this.scoringReportHighlight.field === field && this.scoringReportHighlight.category === category);
    },
    scoringGetReportRowClass(row) {
      if (!this.scoringReportHighlight) return '';
      const { field, category } = this.scoringReportHighlight;
      const v = row[field];
      if (v === null || v === undefined) return '';
      const passT = this.scoringPassThreshold;
      if (category === 'pass' && v >= passT) return 'report-row-highlight-pass';
      if (category === 'good' && v >= 70) return 'report-row-highlight-good';
      if (category === 'excellent' && v >= 80) return 'report-row-highlight-excellent';
      return '';
    },

    confirmDeleteClass(c) {
      let msg = '確定要刪除「' + c.className + (c.subject ? ' - ' + c.subject : '') + '」嗎？';
      let sub = '';
      if (c.classType === 'regular') {
        const linkedSubjects = this.classSubjectsCount(c);
        if (linkedSubjects > 0) sub = '此班別連結了 ' + linkedSubjects + ' 個科目，將一併刪除（包含所有成績數據及全域學生記錄）。';
        else sub = '此班別的學生名單會被刪除（並同步清理全域學生記錄）。';
      } else if (c.classType === 'subject') {
        sub = '此科目的所有成績數據會被刪除（一般班別的學生名單會保留；全域學生記錄會同步清理此科目項）。';
      } else if (c.classType === 'elective') {
        sub = '此選修科及其所有成績數據會被刪除（並同步清理全域學生記錄）。';
      }
      this.openModal('deleteConfirm', { target: 'class', id: c.id, yearId: this.settingsCurrentYearId, message: msg, submessage: sub });
    },

    settingsEnter(item) { this.settingsNav=[...this.settingsNav,item]; if (item.yearId) this.ensureYearLoaded(item.yearId); },
    settingsGoTo(idx) { this.settingsNav=this.settingsNav.slice(0,idx+1); },
    settingsBack() { if (this.settingsNav.length > 0) this.settingsNav = this.settingsNav.slice(0, -1); },

    handleSubjectSelectChange() {
      if (this.modalData.subject === '__new__') {
        this.modalData._useNewSubject = true;
        this.modalData.subject = '';
      }
    },
    cancelNewSubject() { this.modalData._useNewSubject = false; this.modalData.subject = ''; },

    selectAllInGroup(group) {
      if (!this.modalData.selectedStudentIds) this.modalData.selectedStudentIds = [];
      for (const s of group.students) {
        if (!this.modalData.selectedStudentIds.includes(s.id)) this.modalData.selectedStudentIds.push(s.id);
      }
    },
    deselectAllInGroup(group) {
      if (!this.modalData.selectedStudentIds) return;
      const ids = new Set(group.students.map(s => s.id));
      this.modalData.selectedStudentIds = this.modalData.selectedStudentIds.filter(id => !ids.has(id));
    },

    async _saveLastSelectedYear(yearId) {
      try { await db.collection('settings').doc('main').set({ lastSelectedYearId: yearId }, { merge: true }); }
      catch (e) { console.error('save lastSelectedYearId failed', e); }
    },

    applyThemeTokens() {
      const t = this.themeColors || {};
      const root = document.documentElement;
      const hexToRgb = (hex) => {
        if (!hex) return [37, 99, 235];
        let h = String(hex).replace('#', '').trim();
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        if (h.length !== 6) return [37, 99, 235];
        const n = parseInt(h, 16);
        if (isNaN(n)) return [37, 99, 235];
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      };
      const primary = t.accent || '#2563eb';
      const text = t.text || primary;
      const from = (t.gradient && t.gradient[0]) || primary;
      const to = (t.gradient && t.gradient[1]) || primary;
      const secondary = t.secondary || (t.gradient && t.gradient[1]) || '#38bdf8';
      const accent2 = t.accent2 || '#8b5cf6';
      const pRgb = hexToRgb(primary);
      const sRgb = hexToRgb(secondary);
      const aRgb = hexToRgb(accent2);
      const set = (k, v) => root.style.setProperty(k, v);
      set('--theme-primary', primary);
      set('--theme-primary-rgb', pRgb.join(','));
      set('--theme-secondary', secondary);
      set('--theme-secondary-rgb', sRgb.join(','));
      set('--theme-accent', accent2);
      set('--theme-accent-rgb', aRgb.join(','));
      set('--theme-gradient-from', from);
      set('--theme-gradient-to', to);
      set('--theme-text', text);
      set('--theme-soft-bg', 'rgba(' + pRgb.join(',') + ',0.10)');
      set('--theme-soft-border', 'rgba(' + pRgb.join(',') + ',0.32)');
      set('--theme-bg-1', 'rgba(' + pRgb.join(',') + ',0.14)');
      set('--theme-bg-2', 'rgba(' + aRgb.join(',') + ',0.12)');
      set('--theme-bg-3', 'rgba(' + sRgb.join(',') + ',0.10)');
      set('--focus-ring', 'rgba(' + pRgb.join(',') + ',0.16)');
    },

    setTheme(key) { this.currentTheme=key; this.applyThemeTokens(); this.saveLayoutSettings(); this.addToast('已切換至「'+this.themeColors.name+'」主題','success'); },
    moveTabUp(idx) { if(idx<=0)return;const a=[...this.tabOrder];[a[idx-1],a[idx]]=[a[idx],a[idx-1]];this.tabOrder=a;this.saveLayoutSettings(); },
    moveTabDown(idx) { if(idx>=this.tabOrder.length-1)return;const a=[...this.tabOrder];[a[idx],a[idx+1]]=[a[idx+1],a[idx]];this.tabOrder=a;this.saveLayoutSettings(); },
    async saveLayoutSettings() { try{await db.collection('settings').doc('main').set({themeColor:this.currentTheme,tabOrder:this.tabOrder},{merge:true});}catch(e){console.error(e);} },

    getQuickNavItem(key) { return this.quickNavAllItems.find(i=>i.key===key)||{label:key,icon:'',gradient:['#999','#999'],desc:''}; },
    handleQuickNav(key) {
      switch(key){ case'grades':this.currentView='grades';break; case'scoring':this.currentView='scoring';break; case'analysis':this.currentView='analysis';break; case'yearMgmt':this.currentView='settings';this.settingsNav=[{key:'years',label:'學年管理'}];break; case'appearance':this.currentView='settings';this.settingsNav=[{key:'layout',label:'外觀設定'}];break; default:this.addToast(this.getQuickNavItem(key).label+' 功能開發中','warning');break; }
    },
    goToQuickNavSettings() { this.currentView='settings';this.settingsNav=[{key:'quicknav',label:'快速導航設定'}]; },
    addQuickNav(key) { if(!this.activeQuickNavKeys.includes(key)){this.activeQuickNavKeys.push(key);this.saveQuickNavSettings();this.addToast('已新增「'+this.getQuickNavItem(key).label+'」','success');} },
    removeQuickNav(idx) { const r=this.activeQuickNavKeys[idx];this.activeQuickNavKeys.splice(idx,1);this.saveQuickNavSettings();this.addToast('已移除「'+this.getQuickNavItem(r).label+'」','success'); },
    moveQuickNavUp(idx) { if(idx<=0)return;const a=[...this.activeQuickNavKeys];[a[idx-1],a[idx]]=[a[idx],a[idx-1]];this.activeQuickNavKeys=a;this.saveQuickNavSettings(); },
    moveQuickNavDown(idx) { if(idx>=this.activeQuickNavKeys.length-1)return;const a=[...this.activeQuickNavKeys];[a[idx],a[idx+1]]=[a[idx+1],a[idx]];this.activeQuickNavKeys=a;this.saveQuickNavSettings(); },
    async saveQuickNavSettings() { try{await db.collection('settings').doc('main').set({activeQuickNavKeys:this.activeQuickNavKeys},{merge:true});}catch(e){console.error(e);} },

    addToast(message,type='success') { const id=++this.toastCounter;this.toasts.push({id,message,type});setTimeout(()=>this.removeToast(id),3000); },
    removeToast(id) { this.toasts=this.toasts.filter(t=>t.id!==id); },

    openModal(type,data={}) {
      this.modalType=type;
      this.modalData={...data};
      this.showModal=true;
      if(type==='addStudent'){
        this.modalData.matchedGlobal=null;
        this.modalData.matchCandidates=[];
        this.modalData.linkToGlobal=false;
        this.modalData.matchSource=null;
        this.modalData.selectedGlobalStudentId=null;
        if (this.modalData.studentName && this.modalData.studentName.trim()) {
          this.$nextTick(() => this.prepareStudentAutoMatch());
        }
      }
      if(type==='addClass'){
        if(!this.modalData.classType) this.modalData.classType = 'regular';
        if(!this.modalData.selectedStudentIds) this.modalData.selectedStudentIds = [];
        if(this.modalData._useNewSubject === undefined) this.modalData._useNewSubject = false;
      }
      if(type==='editClass'){ if(this.modalData._useNewSubject === undefined) this.modalData._useNewSubject = false; }
      if(type==='addSubject'){
        if(!this.modalData.selectedClassIds) this.modalData.selectedClassIds = [];
        if(this.modalData._useNewSubject === undefined) this.modalData._useNewSubject = false;
      }
      if(type==='editStudentMatch'){
        this.editMatchSearchQuery = '';
      }
    },
    closeModal() {
      this.showModal=false;
      this.modalType=null;
      this.modalData={};
      this.editMatchSearchQuery = '';
      this.hideMatchTooltip();
      if (this._studentNameMatchTimer) {
        clearTimeout(this._studentNameMatchTimer);
        this._studentNameMatchTimer = null;
      }
    },
    async confirmModal() {
      try {
        switch(this.modalType){
          case'addYear':await this.addAcademicYear();break;
          case'editYear':await this.updateAcademicYear();break;
          case'addClass':await this.addClass();break;
          case'editClass':await this.updateClass();break;
          case'addSubject':await this.addSubject();break;
          case'addStudent':await this.addStudent();break;
          case'editStudent':await this.updateStudent();break;
          case'editStudentMatch':await this.editStudentMatchConfirm();break;
          case'batchImport':await this.batchImportStudents();break;
          case'addAssessment':await this.addAssessmentConfirm();break;
          case'editAssessment':await this.updateAssessmentConfirm();break;
          case'calAddAssessment':await this.calAddAssessmentConfirm();break;
          case'addCustomCategory':await this.addCustomCategoryConfirm();break;
          case'addTemplate':await this.addTemplateConfirm();break;
          case'editTemplate':await this.updateTemplateConfirm();break;
          case'applyTemplateConfirm':await this.applyTemplateConfirm();break;
          case'deleteConfirm':await this.handleDelete();break;
        }
      } catch(err){this.addToast('操作失敗：'+err.message,'error');}
    },

    onModalKeydown(e) {
      if (e.key !== 'Enter') return;
      if (this.modalType === 'batchImport') return;
      if (this.modalType === 'editStudentMatch') return;
      const tag = (e.target.tagName || '').toUpperCase();
      if (tag === 'BUTTON') return;
      if (tag === 'SELECT') return;
      if (tag === 'TEXTAREA' && e.shiftKey) return;
      e.preventDefault();
      this.confirmModal();
    },

    openAddCustomCategoryModal() {
      if (!this.currentAcademicYearId || !this.currentClassId) { this.addToast('請先選擇班別','warning'); return; }
      this.openModal('addCustomCategory', { name:'', yearId:this.currentAcademicYearId, classId:this.currentClassId });
    },

    confirmDeleteCustomCategory(cat) {
      this.openModal('deleteConfirm', { target:'customCategory', id:cat.id, yearId:this.currentAcademicYearId, classId:this.currentClassId, message:'確定要刪除類別「'+cat.name+'」嗎？', submessage:'此類別下的所有評估項目及成績數據都將被刪除。' });
    },

    analysisToggleAssignmentCollapse() {
      this.analysisOverviewAssignmentCollapsed = !this.analysisOverviewAssignmentCollapsed;
    },

    _injectCustomStyles() {
      const style = document.createElement('style'); style.id = 'app-injected-styles';
      style.textContent = `
        .grades-cell{position:relative!important;overflow:hidden!important;box-sizing:border-box!important}
        .grades-cell.cell-focused{overflow:visible!important}
        .grades-cell.cell-readonly{background:#fafaf9!important;color:#78716c;font-weight:600;cursor:default}
        .grades-cell.cell-bonus{background:#e6e4df!important;color:#6b6964;font-weight:600}
        .grades-cell input{
          position:absolute!important;
          top:0!important;
          left:0!important;
          width:100%!important;
          height:100%!important;
          box-sizing:border-box!important;
          margin:0!important;
          padding:0 4px!important;
          border:none!important;
          outline:none!important;
          background:transparent!important;
          color:inherit!important;
          text-align:center!important;
          font-size:inherit!important;
          font-family:inherit!important;
          font-weight:inherit!important;
          line-height:inherit!important;
          z-index:5!important;
          min-width:0!important;
          max-width:none!important;
        }
        .grades-cell input:focus{outline:none!important;border:none!important;box-shadow:none!important;}
        .grades-cell input::selection{background:rgba(var(--theme-primary-rgb),0.25)}

        /* ★ req1: 高亮列改用「白底 + 主題色疊加」不透明背景，避免水平捲動時底下資料透出凍結欄 */
        .grades-table tr.row-hover-highlight .frozen-sn,
        .grades-table tr.row-hover-highlight .frozen-name,
        .grades-table tr.row-hover-highlight .frozen-class {
          background-image:linear-gradient(rgba(var(--theme-primary-rgb),0.06), rgba(var(--theme-primary-rgb),0.06)) !important;
          background-color:#ffffff !important;
          transition: background-color .12s;
        }
        .grades-scroll-container.is-dragging { user-select: none; -webkit-user-select: none; }
        .grades-touch-device .grades-cell.cell-focused{outline:2px solid var(--theme-primary)!important;outline-offset:-2px}

        /* ★ req1: 凍結欄必須永遠蓋在選取 / 聚焦資料格之上。
           內文凍結欄 z-index 提升至 30（高於 cell-focused=2 / cell-selected=1），
           表頭凍結欄 32，統計列凍結欄 29，徹底修正選取整列時左側班別/學號/姓名被覆蓋的問題。 */
        .grades-table .frozen-sn,
        .grades-table .frozen-name,
        .grades-table .frozen-class { z-index: 30 !important; }
        .grades-table thead .frozen-sn,
        .grades-table thead .frozen-name,
        .grades-table thead .frozen-class { z-index: 32 !important; }
        .grades-table .stats-frozen-sn,
        .grades-table .stats-frozen-name,
        .grades-table .stats-frozen-class { z-index: 29 !important; }

        .match-status-badge{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:500;white-space:nowrap}
        /* ★ req2: 有 tooltip 的徽章用 help 游標；新學生（tip-off）用一般游標 */
        .match-status-badge.tip-on{cursor:help}
        .match-status-badge.tip-off{cursor:default}
        .match-status-badge.tip-on:hover{filter:brightness(0.97)}
        .match-tooltip{max-width:420px}
        .match-tooltip-box{
          background:#111827;
          color:#fff;
          border-radius:10px;
          box-shadow:0 18px 50px rgba(0,0,0,.28);
          border:1px solid rgba(255,255,255,.08);
          padding:10px 12px;
          max-width:420px;
          max-height:60vh;
          overflow:auto;
        }
        .match-tooltip-pre{
          margin:0;
          white-space:pre-wrap;
          word-break:break-word;
          font-family:'Microsoft JhengHei','Segoe UI',sans-serif;
          font-size:12px;
          line-height:1.55;
        }
        .match-tooltip-arrow{
          width:0;
          height:0;
          margin-left:auto;
          margin-right:auto;
          border-left:6px solid transparent;
          border-right:6px solid transparent;
          border-top:6px solid #111827;
        }
        .match-option-card{display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;transition:all .15s;background:#fff}
        .match-option-card:hover{background:#f9fafb}
        .match-option-card.active{border-color:var(--theme-primary);background:rgba(var(--theme-primary-rgb),0.06);box-shadow:inset 0 0 0 1px var(--theme-primary)}
      `;
      document.head.appendChild(style);
    }
  },

  async mounted() {
    if(window.innerWidth<1024) this.leftPanelOpen=false;
    this.gradesIsTouchDevice = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (this.gradesIsTouchDevice) document.body.classList.add('grades-touch-device');
    this._injectCustomStyles();
    this.applyThemeTokens();
    this._updateCalMonthEventLimit(); // ★ req4
    this._analysisCharts = {};
    this._studentNameMatchTimer = null;
    await this.loadAllData();
    this.applyThemeTokens();
    this.initScoringWeights();
    document.addEventListener('keydown',(e)=>{
      if(e.key==='Escape'){
        if(this.calendarEventPopover){ this.calendarEventPopover=null; return; }
        if(this.calendarMoreEventsModal){ this.calendarMoreEventsModal=null; return; }
        if(this.showModal) this.closeModal();
      }
    });

    this._panelMousedownInside = false;
    this._panelMouseupInside = false;

    const _checkInsidePanel = (target) => {
      try {
        let t = target;
        if (t && t.nodeType === 3) t = t.parentNode;
        if (t && typeof t.closest === 'function') {
          return !!t.closest('.detail-panel');
        }
      } catch (err) { /* ignore */ }
      return false;
    };

    document.addEventListener('mousedown', (e) => {
      this._panelMousedownInside = _checkInsidePanel(e && e.target);
    }, true);

    document.addEventListener('mouseup', (e) => {
      this._panelMouseupInside = _checkInsidePanel(e && e.target);
      if (this.gradesIsDragging) {
        this.gradesIsDragging = false;
        this.gradesDragStartCell = null;
      }
    }, true);

    document.addEventListener('click', () => {
      this.gradesCPMenuOpen = false;
      this.gradesCustomMenuOpen = false;
      this.gradesHeaderMenu = null;
      this.scoringCopyMenuOpen = false;
      this.scoringTooltip = null;
      this.gradesExportMenuOpen = false;
      this.scoringExportMenuOpen = false;
      this.scoringApplyMenuOpen = false;
      this.hideMatchTooltip();
      if (this.gradesDetailPanel) {
        if (!this._panelMousedownInside && !this._panelMouseupInside) {
          this.gradesDetailPanel = null;
        }
      }
      this._panelMousedownInside = false;
      this._panelMouseupInside = false;
    });

    this.$watch(()=>this.modalData.studentName,(nv)=>{
      if (this.modalType !== 'addStudent') return;
      if (this._studentNameMatchTimer) clearTimeout(this._studentNameMatchTimer);
      if (!nv || !nv.trim()) {
        this.modalData.matchedGlobal = null;
        this.modalData.matchCandidates = [];
        this.modalData.linkToGlobal = false;
        this.modalData.matchSource = null;
        this.modalData.selectedGlobalStudentId = null;
        return;
      }
      this._studentNameMatchTimer = setTimeout(() => {
        this.prepareStudentAutoMatch();
      }, 400);
    });

    window.addEventListener('resize',()=>{
      this._updateCalMonthEventLimit(); // ★ req4
      if(window.innerWidth>=1024&&this.currentView!=='home'&&this.currentView!=='settings'){
        this.leftPanelOpen=true;
      }
    });
  }
}).mount('#app');