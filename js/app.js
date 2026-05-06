// ================================================================
// Main Application (v16 — robust drag-out protection for detail panel,
//                         uncapped ranking integration)
// ================================================================
const { createApp } = Vue;

createApp({
  data() {
    return {
      loading: true, loadingText: '正在載入數據...', loadingProgress: 0,
      error: null, academicYears: [], globalStudents: [],
      settings: { schoolName:'', teacherName:'', defaultFullMark:100, termDates:{} },
      currentView: 'home', currentAcademicYearId: null, currentClassId: null,
      leftPanelOpen: true, expandedYears: {},

      nameTemplates: ['工作紙', '默寫', '單元測試', '聆聽測驗', '說話練習', '閱讀理解', '寫作'],
      newNameTemplate: '',

      calendarDate: new Date(),
      calendarWeekDate: new Date(),
      calendarView: 'month',
      calendarFilter: 'all',
      calendarTypeFilter: { assignment: true, quiz: true, unified_test: true, exam: true },
      calendarEventPopover: null,
      calendarMoreEventsModal: null,

      dayNames: ['日','一','二','三','四','五','六'],
      allTabs: ALL_TABS,
      tabOrder: ['home','grades','scoring','analysis','settings'],
      currentTheme: 'blue', colorThemes: COLOR_THEMES,
      quickNavAllItems: QUICK_NAV_ITEMS,
      activeQuickNavKeys: ['grades','scoring','analysis','yearMgmt'],
      settingsNav: [],
      settingsYearTab: 'classes',
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
      gradesStatRows: [
        { key:'avg', label:'平均' }, { key:'max', label:'最高' }, { key:'min', label:'最低' },
        { key:'median', label:'中位數' }, { key:'stddev', label:'標準差' }, { key:'count', label:'已輸入' }
      ],

      scoringSubTab: 'settings',
      scoringAccordion: { attribution: true, ut: true, exam: false, yearly: false },
      scoringSaveStatus: '',
      scoringTooltip: null,
      scoringCopyMenuOpen: false,
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
      analysisOverviewSortKey: null,
      analysisOverviewSortAsc: true,
      analysisRankingSortKey: 'yearlyRank',
      analysisRankingSortAsc: true,
      analysisStudentSortKey: 'diff',
      analysisStudentSortAsc: false,
      analysisOverviewAssignmentCollapsed: true
    };
  },

  computed: {
    themeColors() { return this.colorThemes.find(t => t.key === this.currentTheme) || this.colorThemes[0]; },
    headerStyle() { const t=this.themeColors; return { background:'linear-gradient(to right,'+t.gradient[0]+','+t.gradient[1]+')' }; },
    bannerStyle() { const t=this.themeColors; return { background:'linear-gradient(to right,'+t.gradient[1]+','+t.accent+')' }; },
    activeTabStyle() { const t=this.themeColors; return { borderColor:t.accent, color:t.text, backgroundColor:t.accentBg }; },
    treeActiveStyle() { const t=this.themeColors; return { backgroundColor:t.accentBg, color:t.text }; },
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
        batchImport:'批量匯入學生',
        deleteConfirm:'確認刪除',
        addAssessment:'新增評估項目', editAssessment:'編輯評估項目',
        calAddAssessment:'從月曆新增項目',
        addCustomCategory:'新增自訂類別'
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

    ...GradesComputed, ...ScoringComputed, ...CalendarComputed, ...AnalysisComputed,
  },

  watch: {
    currentAcademicYearId(nv, ov) {
      if (nv !== ov) { if (this.currentClassId) { const year=this.academicYears.find(y=>y.id===nv); if (!year||!year.classes.find(c=>c.id===this.currentClassId)) this.currentClassId=null; } this.gradesResetFocus(); }
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
    analysisCrossYearStudent() {
      this.$nextTick(() => setTimeout(() => this.analysisRenderCrossYearTrend(), 80));
    }
  },

  methods: {
    ...GradesMethods, ...ScoringMethods, ...CalendarMethods, ...CrudMethods, ...AnalysisMethods,

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

    toggleYear(yearId) { this.expandedYears={...this.expandedYears,[yearId]:!this.expandedYears[yearId]}; },
    selectFromTree(yearId,classId) {
      this.currentAcademicYearId=yearId;
      this.currentClassId=classId;
      if (window.innerWidth < 1024) this.leftPanelOpen = false;
    },
    sortStudents(key) { if(this.studentSortKey===key)this.studentSortAsc=!this.studentSortAsc;else{this.studentSortKey=key;this.studentSortAsc=true;} },

    yearStudentCount(y) {
      const seen = new Set();
      for (const c of y.classes) for (const s of (c.students || [])) seen.add(s.globalStudentId || s.id);
      return seen.size;
    },
    yearRegularCount(y) { return y.classes.filter(c => c.classType === 'regular').length; },
    yearSubjectCount(y) { return y.classes.filter(c => c.classType === 'subject' || c.classType === 'elective').length; },

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
        if (linkedSubjects > 0) sub = '此班別連結了 ' + linkedSubjects + ' 個科目，將一併刪除（包含所有成績數據）。';
        else sub = '此班別的學生名單會被刪除。';
      } else if (c.classType === 'subject') {
        sub = '此科目的所有成績數據會被刪除（一般班別的學生名單會保留）。';
      } else if (c.classType === 'elective') {
        sub = '此選修科及其所有成績數據會被刪除。';
      }
      this.openModal('deleteConfirm', { target: 'class', id: c.id, yearId: this.settingsCurrentYearId, message: msg, submessage: sub });
    },

    settingsEnter(item) { this.settingsNav=[...this.settingsNav,item]; },
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

    setTheme(key) { this.currentTheme=key;this.saveLayoutSettings();this.addToast('已切換至「'+this.themeColors.name+'」主題','success'); },
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

    insertNameTemplate(tpl) {
      this.modalData.name = (this.modalData.name || '') + tpl;
      this.$nextTick(() => {
        const inputs = document.querySelectorAll('input[name="assessmentName"]');
        if (inputs.length > 0) {
          const input = inputs[inputs.length - 1];
          try {
            input.focus();
            const len = input.value.length;
            input.setSelectionRange(len, len);
          } catch (e) {}
        }
      });
    },

    async addNameTemplate() {
      const tpl = (this.newNameTemplate || '').trim();
      if (!tpl) { this.addToast('請輸入模板內容', 'warning'); return; }
      if (this.nameTemplates.includes(tpl)) {
        this.addToast('已有相同模板', 'warning');
        return;
      }
      this.nameTemplates.push(tpl);
      this.newNameTemplate = '';
      await this.saveNameTemplates();
      this.addToast('已新增模板「' + tpl + '」', 'success');
    },

    async removeNameTemplate(idx) {
      const removed = this.nameTemplates[idx];
      this.nameTemplates.splice(idx, 1);
      await this.saveNameTemplates();
      this.addToast('已刪除「' + removed + '」', 'success');
    },

    moveNameTemplateUp(idx) {
      if (idx <= 0) return;
      const a = [...this.nameTemplates];
      [a[idx-1], a[idx]] = [a[idx], a[idx-1]];
      this.nameTemplates = a;
      this.saveNameTemplates();
    },

    moveNameTemplateDown(idx) {
      if (idx >= this.nameTemplates.length - 1) return;
      const a = [...this.nameTemplates];
      [a[idx], a[idx+1]] = [a[idx+1], a[idx]];
      this.nameTemplates = a;
      this.saveNameTemplates();
    },

    async saveNameTemplates() {
      try {
        await db.collection('settings').doc('main').set({
          nameTemplates: this.nameTemplates
        }, { merge: true });
      } catch (e) {
        console.error('Save name templates failed:', e);
        this.addToast('儲存模板失敗', 'error');
      }
    },

    addToast(message,type='success') { const id=++this.toastCounter;this.toasts.push({id,message,type});setTimeout(()=>this.removeToast(id),3000); },
    removeToast(id) { this.toasts=this.toasts.filter(t=>t.id!==id); },

    openModal(type,data={}) {
      this.modalType=type;
      this.modalData={...data};
      this.showModal=true;
      if(type==='addStudent'){this.modalData.matchedGlobal=null;this.modalData.linkToGlobal=false;}
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
    },
    closeModal() { this.showModal=false;this.modalType=null;this.modalData={}; },
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
          case'batchImport':await this.batchImportStudents();break;
          case'addAssessment':await this.addAssessmentConfirm();break;
          case'editAssessment':await this.updateAssessmentConfirm();break;
          case'calAddAssessment':await this.calAddAssessmentConfirm();break;
          case'addCustomCategory':await this.addCustomCategoryConfirm();break;
          case'deleteConfirm':await this.handleDelete();break;
        }
      } catch(err){this.addToast('操作失敗：'+err.message,'error');}
    },

    onModalKeydown(e) {
      if (e.key !== 'Enter') return;
      if (this.modalType === 'batchImport') return;
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
        .grades-cell input::selection{background:rgba(59,130,246,0.25)}
        .grades-table tr.row-hover-highlight .frozen-sn,
        .grades-table tr.row-hover-highlight .frozen-name,
        .grades-table tr.row-hover-highlight .frozen-class { background:#eff6ff !important; transition: background-color .12s }
        .grades-scroll-container.is-dragging { user-select: none; -webkit-user-select: none; }
      `;
      document.head.appendChild(style);
    }
  },

  async mounted() {
    if(window.innerWidth<1024) this.leftPanelOpen=false;
    this._injectCustomStyles();
    this._analysisCharts = {};
    await this.loadAllData();
    this.initScoringWeights();
    document.addEventListener('keydown',(e)=>{
      if(e.key==='Escape'){
        if(this.calendarEventPopover){ this.calendarEventPopover=null; return; }
        if(this.calendarMoreEventsModal){ this.calendarMoreEventsModal=null; return; }
        if(this.showModal) this.closeModal();
      }
    });

    // ★ v16: Robust drag-out protection — track BOTH mousedown and mouseup positions.
    // Detail panel will close ONLY if BOTH press AND release happened outside the panel.
    // Cases handled:
    //   • Press inside,  release inside  → both inside  → don't close (normal panel interaction)
    //   • Press inside,  release outside → press inside → don't close (drag-out scenario) ★
    //   • Press outside, release inside  → up inside    → don't close (drag-in scenario)
    //   • Press outside, release outside → both outside → CLOSE (normal outside click) ✓
    this._panelMousedownInside = false;
    this._panelMouseupInside = false;

    const _checkInsidePanel = (target) => {
      try {
        let t = target;
        if (t && t.nodeType === 3) t = t.parentNode; // normalize text node → parent element
        if (t && typeof t.closest === 'function') {
          return !!t.closest('.detail-panel');
        }
      } catch (err) { /* ignore */ }
      return false;
    };

    // mousedown — capture phase so it fires before any @mousedown.stop in bubble phase
    document.addEventListener('mousedown', (e) => {
      this._panelMousedownInside = _checkInsidePanel(e && e.target);
    }, true);

    // mouseup — capture phase as well, also resets gradesIsDragging state
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
      // ★ v16: Only close detail panel if BOTH mousedown AND mouseup were OUTSIDE
      if (this.gradesDetailPanel) {
        if (!this._panelMousedownInside && !this._panelMouseupInside) {
          this.gradesDetailPanel = null;
        }
      }
      // Reset both flags for the next interaction
      this._panelMousedownInside = false;
      this._panelMouseupInside = false;
    });

    this.$watch(()=>this.modalData.studentName,(nv)=>{
      if(this.modalType==='addStudent'&&nv&&nv.trim().length>0){const m=this.globalStudents.find(g=>g.name===nv.trim());this.modalData.matchedGlobal=m||null;if(!m)this.modalData.linkToGlobal=false;}
    });
    window.addEventListener('resize',()=>{
      if(window.innerWidth>=1024&&this.currentView!=='home'&&this.currentView!=='settings'){
        this.leftPanelOpen=true;
      }
    });
  }
}).mount('#app');