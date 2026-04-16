// ================================================================
// Main Application (v4 — Total Score Engine)
// ================================================================
const { createApp } = Vue;

createApp({
  data() {
    return {
      loading: true, error: null, academicYears: [], globalStudents: [],
      settings: { schoolName:'', teacherName:'', defaultFullMark:100, termDates:{} },
      currentView: 'home', currentAcademicYearId: null, currentClassId: null,
      leftPanelOpen: true, expandedYears: {},
      calendarDate: new Date(), calendarFilter: 'all',
      dayNames: ['日','一','二','三','四','五','六'],
      allTabs: ALL_TABS,
      tabOrder: ['home','grades','scoring','analysis','settings'],
      currentTheme: 'blue', colorThemes: COLOR_THEMES,
      quickNavAllItems: QUICK_NAV_ITEMS,
      activeQuickNavKeys: ['grades','scoring','analysis','yearMgmt'],
      settingsNav: [],
      showModal: false, modalType: null, modalData: {},
      toasts: [], toastCounter: 0,
      studentSortKey: 'studentNumber', studentSortAsc: true,

      // Grades
      gradesTermId: null, gradesFocusRow: -1, gradesFocusCol: -1,
      gradesEditing: false, gradesEditValue: '', gradesOriginalValue: '', gradesCellOriginalValue: '',
      gradesSaveTimers: {}, gradesSavingCells: {},
      gradesHeaderMenu: null, gradesDetailPanel: null, gradesHighlightCol: -1,
      gradesCPMenuOpen: false, gradesUndoStack: [],
      gradesSelStart: null, gradesSelEnd: null,
      gradesHighlightUnenteredCol: -1,
      gradesShowFailHighlight: true, gradesFailPercent: null,
      gradesStatRows: [
        { key:'avg', label:'平均' }, { key:'max', label:'最高' }, { key:'min', label:'最低' },
        { key:'median', label:'中位數' }, { key:'stddev', label:'標準差' }, { key:'count', label:'已輸入' }
      ],

      // ★ v4: Scoring
      scoringSubTab: 'settings',
      scoringAccordion: { ut: true, exam: false, yearly: false },
      scoringSaveStatus: '',
      scoringTooltip: null,
      scoringCopyMenuOpen: false,
      scoringCopyColumns: { a3: true, a1: false, a2: false, examTotal: true },
      scoringReportSortKey: 'studentNumber',
      scoringReportSortAsc: true,
      scoringWeightsLocal: {
        ut: { assignment:20, quiz:20, unifiedTest:40, classPerformance:20 },
        exam: { a1Ratio:30, a2Ratio:70, a1Weights:{ assignment:6, quiz:6, unifiedTest:12, classPerformance:6 } },
        yearly: { t1Weight:40, t2Weight:60 }
      }
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
    isLeftPanelVisible() { return this.currentView !== 'home' && this.leftPanelOpen; },
    settingsCurrentView() { if (this.settingsNav.length===0) return 'root'; return this.settingsNav[this.settingsNav.length-1].key; },
    settingsCurrentYearId() { for (let i=this.settingsNav.length-1;i>=0;i--) { if (this.settingsNav[i].yearId) return this.settingsNav[i].yearId; } return null; },
    settingsCurrentClassId() { for (let i=this.settingsNav.length-1;i>=0;i--) { if (this.settingsNav[i].classId) return this.settingsNav[i].classId; } return null; },
    settingsYear() { if (!this.settingsCurrentYearId) return null; return this.academicYears.find(y => y.id === this.settingsCurrentYearId) || null; },
    settingsClassesForYear() { return this.settingsYear ? this.settingsYear.classes : []; },
    settingsClass() { if (!this.settingsYear||!this.settingsCurrentClassId) return null; return this.settingsYear.classes.find(c => c.id === this.settingsCurrentClassId) || null; },
    settingsStudents() { return this.settingsClass ? this.settingsClass.students : []; },
    settingsSortedStudents() {
      const arr=[...this.settingsStudents]; const key=this.studentSortKey; const asc=this.studentSortAsc;
      arr.sort((a,b)=>{ let va=a[key],vb=b[key]; if(key==='studentNumber'){va=parseInt(va)||0;vb=parseInt(vb)||0;} if(va<vb)return asc?-1:1; if(va>vb)return asc?1:-1; return 0; });
      return arr;
    },
    currentAcademicYear() { return this.academicYears.find(y => y.id === this.currentAcademicYearId) || null; },
    classesForSelectedYear() { return this.currentAcademicYear ? this.currentAcademicYear.classes : []; },
    currentClass() { if (!this.currentAcademicYear) return null; return this.currentAcademicYear.classes.find(c => c.id === this.currentClassId) || null; },
    currentStudents() { return this.currentClass ? this.currentClass.students : []; },
    allClassesFlat() { const r=[]; if (this.currentAcademicYear) for (const c of this.currentAcademicYear.classes) r.push(c); return r; },
    modalTitle() {
      const map = { addYear:'新增學年',editYear:'編輯學年',addClass:'新增班別',editClass:'編輯班別',addStudent:'新增學生',editStudent:'編輯學生',batchImport:'批量匯入學生',deleteConfirm:'確認刪除',addAssessment:'新增評估項目',editAssessment:'編輯評估項目',calAddAssessment:'從月曆新增項目' };
      return map[this.modalType]||'';
    },
    ...GradesComputed, ...ScoringComputed, ...CalendarComputed,
  },

  watch: {
    currentAcademicYearId(nv, ov) {
      if (nv !== ov) { if (this.currentClassId) { const year=this.academicYears.find(y=>y.id===nv); if (!year||!year.classes.find(c=>c.id===this.currentClassId)) this.currentClassId=null; } this.gradesResetFocus(); }
    },
    currentClassId() { this.gradesResetFocus(); this.gradesAutoSelectTerm(); this.initScoringWeights(); this.gradesFailPercent=null; },
    currentView(nv) { if (nv==='grades'||nv==='scoring') { this.gradesAutoSelectTerm(); if (nv==='scoring') this.initScoringWeights(); } },
    // ★ v4: Auto-save scoring config
    scoringWeightsLocal: {
      handler() { if (this._scoringSkipWatch) return; this.scoringDebouncedAutoSave(); },
      deep: true
    }
  },

  methods: {
    ...GradesMethods, ...ScoringMethods, ...CalendarMethods, ...CrudMethods,

    getClassObj(yearId, classId) { const y=this.academicYears.find(y=>y.id===yearId); if(!y)return null; return y.classes.find(c=>c.id===classId)||null; },
    getTabDef(key) { return this.allTabs.find(t => t.key === key) || { label:key, icon:'' }; },
    dateToStr(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); },
    isToday(d) { const t=new Date(); return d.getDate()===t.getDate()&&d.getMonth()===t.getMonth()&&d.getFullYear()===t.getFullYear(); },
    assessmentColor(type) { return {'bg-blue-500':type==='assignment','bg-green-500':type==='quiz','bg-orange-500':type==='unified_test','bg-red-500':type==='exam','bg-purple-500':type==='class_performance'}; },
    assessmentDot(type) { return {'bg-blue-500':type==='assignment','bg-green-500':type==='quiz','bg-orange-500':type==='unified_test','bg-red-500':type==='exam','bg-purple-500':type==='class_performance'}; },
    assessmentLabel(type) { return {assignment:'課業',quiz:'小測',unified_test:'統測',exam:'考試',class_performance:'課堂表現'}[type]||type; },

    toggleYear(yearId) { this.expandedYears={...this.expandedYears,[yearId]:!this.expandedYears[yearId]}; },
    selectFromTree(yearId,classId) { this.currentAcademicYearId=yearId;this.currentClassId=classId; },
    sortStudents(key) { if(this.studentSortKey===key)this.studentSortAsc=!this.studentSortAsc;else{this.studentSortKey=key;this.studentSortAsc=true;} },
    yearStudentCount(y) { return y.classes.reduce((s,c)=>s+c.students.length,0); },
    settingsEnter(item) { this.settingsNav=[...this.settingsNav,item]; },
    settingsGoTo(idx) { this.settingsNav=this.settingsNav.slice(0,idx+1); },

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

    addToast(message,type='success') { const id=++this.toastCounter;this.toasts.push({id,message,type});setTimeout(()=>this.removeToast(id),3000); },
    removeToast(id) { this.toasts=this.toasts.filter(t=>t.id!==id); },

    openModal(type,data={}) { this.modalType=type;this.modalData={...data};this.showModal=true;if(type==='addStudent'){this.modalData.matchedGlobal=null;this.modalData.linkToGlobal=false;} },
    closeModal() { this.showModal=false;this.modalType=null;this.modalData={}; },
    async confirmModal() {
      try {
        switch(this.modalType){
          case'addYear':await this.addAcademicYear();break;case'editYear':await this.updateAcademicYear();break;
          case'addClass':await this.addClass();break;case'editClass':await this.updateClass();break;
          case'addStudent':await this.addStudent();break;case'editStudent':await this.updateStudent();break;
          case'batchImport':await this.batchImportStudents();break;
          case'addAssessment':await this.addAssessmentConfirm();break;
          case'editAssessment':await this.updateAssessmentConfirm();break;
          case'calAddAssessment':await this.calAddAssessmentConfirm();break;
          case'deleteConfirm':await this.handleDelete();break;
        }
      } catch(err){this.addToast('操作失敗：'+err.message,'error');}
    },

    _injectCustomStyles() {
      const style = document.createElement('style'); style.id = 'app-injected-styles';
      style.textContent = `
        .grades-cell{position:relative!important;overflow:hidden!important;box-sizing:border-box!important}
        .grades-cell.cell-focused{overflow:visible!important}
        .grades-cell input{position:absolute!important;top:-1px!important;left:-1px!important;width:calc(100% + 2px)!important;height:calc(100% + 2px)!important;box-sizing:border-box!important;margin:0!important;padding:0 4px!important;border:2px solid #3b82f6!important;border-radius:1px!important;outline:none!important;background:#fff!important;text-align:center!important;font-size:inherit!important;font-family:inherit!important;line-height:inherit!important;z-index:5!important;min-width:0!important;max-width:none!important}
        .grades-cell input:focus{border-color:#2563eb!important;box-shadow:0 0 0 1px rgba(37,99,235,.2)!important}
      `;
      document.head.appendChild(style);
    }
  },

  async mounted() {
    if(window.innerWidth<768) this.leftPanelOpen=false;
    this._injectCustomStyles();
    await this.loadAllData();
    this.initScoringWeights();
    document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&this.showModal)this.closeModal();});
    document.addEventListener('click',()=>{this.gradesCPMenuOpen=false;this.gradesHeaderMenu=null;this.scoringCopyMenuOpen=false;});
    this.$watch(()=>this.modalData.studentName,(nv)=>{
      if(this.modalType==='addStudent'&&nv&&nv.trim().length>0){const m=this.globalStudents.find(g=>g.name===nv.trim());this.modalData.matchedGlobal=m||null;if(!m)this.modalData.linkToGlobal=false;}
    });
  }
}).mount('#app');