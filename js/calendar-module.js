// ================================================================
// Calendar Module (v7 — supports fullMarkS2 in calendar-added exam events)
// ================================================================
const CalendarMethods = {
  // ---------- Month navigation ----------
  calPrev() { const d=new Date(this.calendarDate);d.setMonth(d.getMonth()-1);this.calendarDate=d; },
  calNext() { const d=new Date(this.calendarDate);d.setMonth(d.getMonth()+1);this.calendarDate=d; },
  calToday() { this.calendarDate=new Date(); },

  calWeekPrev() { const d=new Date(this.calendarWeekDate);d.setDate(d.getDate()-7);this.calendarWeekDate=d; },
  calWeekNext() { const d=new Date(this.calendarWeekDate);d.setDate(d.getDate()+7);this.calendarWeekDate=d; },
  calWeekToday() { this.calendarWeekDate=new Date(); },

  calSetView(view) {
    this.calendarView = view;
    if (view === 'week') this.calendarWeekDate = new Date(this.calendarDate);
    else this.calendarDate = new Date(this.calendarWeekDate);
    this.calendarEventPopover = null;
    this.calendarMoreEventsModal = null;
  },

  calToggleTypeFilter(type) {
    this.calendarTypeFilter = { ...this.calendarTypeFilter, [type]: !this.calendarTypeFilter[type] };
  },

  getEventsForDate(d) { return this.allEventsMap[this.dateToStr(d)] || []; },

  onCalendarDayClick(day) {
    if (!day.isCurrentMonth) return;
    this.openCalendarAddModal(day.date);
  },

  onDayAddClick(day, event) {
    if (event) event.stopPropagation();
    if (!day.isCurrentMonth && this.calendarView === 'month') return;
    this.openCalendarAddModal(day.date);
  },

  openCalendarAddModal(date) {
    const dateStr = this.dateToStr(date);
    const preYearId = this.currentAcademicYearId || (this.academicYears.length > 0 ? this.academicYears[0].id : null);
    let preClassId = null, preTermId = null;
    if (preYearId) {
      const yr = this.academicYears.find(y => y.id === preYearId);
      if (yr) {
        const subjectClasses = yr.classes.filter(c => c.classType === 'subject' || c.classType === 'elective');
        if (subjectClasses.length > 0) {
          preClassId = (this.currentClassId && subjectClasses.find(c => c.id === this.currentClassId))
            ? this.currentClassId : subjectClasses[0].id;
          const cls = subjectClasses.find(c => c.id === preClassId);
          if (cls) preTermId = this._autoSelectTermByDate(cls, date);
        }
      }
    }
    const fm = (this.settings && this.settings.defaultFullMark) ? this.settings.defaultFullMark : 100;
    this.openModal('calAddAssessment', {
      date: dateStr,
      yearId: preYearId,
      classId: preClassId,
      termId: preTermId,
      type: 'assignment',
      name: '',
      fullMark: fm,
      notes: '',
      hasSubItems: false, subItems: [],
      hasAdjustedPaper: false, adjustedMultiplier: 80, passingScore: 50,
      fullMarkS2: '',
      hasMultiplePapers: false, papers: []
    });
  },

  _autoSelectTermByDate(cls, date) {
    if (!cls.terms || cls.terms.length === 0) return null;
    if (cls.terms.length === 1) return cls.terms[0].id;
    const m = date.getMonth() + 1;
    if (m >= 9 || m === 1) return cls.terms[0].id;
    return cls.terms[Math.min(1, cls.terms.length - 1)].id;
  },

  onCalModalYearChange() { this.modalData.classId = null; this.modalData.termId = null; this.modalData.name = ''; },
  onCalModalClassChange() {
    this.modalData.termId = null; this.modalData.name = '';
    if (this.modalData.classId) {
      const yr = this.academicYears.find(y => y.id === this.modalData.yearId);
      const cls = yr && yr.classes.find(c => c.id === this.modalData.classId);
      if (cls && cls.terms && cls.terms.length > 0) {
        const refDate = this.modalData.date ? new Date(this.modalData.date) : new Date();
        this.modalData.termId = this._autoSelectTermByDate(cls, refDate);
      }
    }
    if (this.modalData.type === 'unified_test' && this.calendarExistingUT) this.modalData.type = 'assignment';
    if (this.modalData.type === 'exam' && this.calendarExistingExam) this.modalData.type = 'assignment';
  },

  onCalModalTermChange() {
    if (this.modalData.type === 'unified_test' && this.calendarExistingUT) this.modalData.type = 'assignment';
    if (this.modalData.type === 'exam' && this.calendarExistingExam) this.modalData.type = 'assignment';
  },

  onCalModalTypeChange(newType) {
    if (newType === 'unified_test' && this.calendarExistingUT) {
      this.addToast('該班別該學期已有統測', 'warning');
      return;
    }
    if (newType === 'exam' && this.calendarExistingExam) {
      this.addToast('該班別該學期已有考試', 'warning');
      return;
    }
    this.modalData.type = newType;
    if (newType !== 'exam') {
      this.modalData.hasAdjustedPaper = false;
      this.modalData.hasMultiplePapers = false;
      this.modalData.papers = [];
      this.modalData.fullMarkS2 = '';
    }
    if (newType === 'unified_test') {
      this.modalData.hasSubItems = false;
      this.modalData.subItems = [];
    }
  },

  onEventClick(event, evt) {
    if (evt) evt.stopPropagation();
    const rect = evt ? evt.currentTarget.getBoundingClientRect() : { left: window.innerWidth/2, top: window.innerHeight/3, width: 0, height: 0, bottom: window.innerHeight/3 };
    const pW = 320, pH = 420;
    let x = rect.left + rect.width / 2;
    let y = rect.bottom + 8;
    if (x + pW/2 > window.innerWidth - 8) x = window.innerWidth - pW/2 - 8;
    if (x - pW/2 < 8) x = pW/2 + 8;
    if (y + pH > window.innerHeight - 8) {
      const aboveY = rect.top - pH - 8;
      y = aboveY >= 8 ? aboveY : Math.max(8, window.innerHeight - pH - 8);
    }
    this.calendarEventPopover = { event, x, y };
    this.calendarMoreEventsModal = null;
  },

  onEventClickFromMoreModal(ev) {
    this.calendarMoreEventsModal = null;
    this.$nextTick(() => {
      const fakeEvt = { stopPropagation: ()=>{}, currentTarget: { getBoundingClientRect: () => ({ left: window.innerWidth/2, top: window.innerHeight/3, width: 0, height: 0, bottom: window.innerHeight/3 }) } };
      this.onEventClick(ev, fakeEvt);
    });
  },

  onMoreEventsClick(day, evt) {
    if (evt) evt.stopPropagation();
    const events = this.getEventsForDate(day.date);
    this.calendarMoreEventsModal = { date: day.date, events };
    this.calendarEventPopover = null;
  },

  calClosePopover() { this.calendarEventPopover = null; },
  calCloseMoreEventsModal() { this.calendarMoreEventsModal = null; },

  calEventProgress(event) {
    const cls = this.getClassObj(event.yearId, event.classId);
    if (!cls) return { entered: 0, total: 0, avg: null, passRate: null };
    const total = cls.students.length;
    let entered = 0, sum = 0, cnt = 0, pass = 0;
    const scores = event.scores || {};
    const passT = event.fullMark * 0.5;
    for (const s of cls.students) {
      const v = scores[s.id];
      if (v != null && v !== '') {
        entered++;
        let eff;
        if (typeof v === 'object') eff = Math.min((v.base || 0) + (v.bonus || 0), event.fullMark);
        else eff = Math.min(parseFloat(v), event.fullMark);
        if (!isNaN(eff)) { sum += eff; cnt++; if (eff >= passT) pass++; }
      }
    }
    const avg = cnt > 0 ? (sum / cnt) : null;
    const passRate = cnt > 0 ? (pass / cnt * 100) : null;
    return { entered, total, avg, passRate };
  },

  calJumpToGradesFromEvent(event) {
    const yearId = event.yearId, classId = event.classId, termId = event.termId, assessmentId = event.id;
    this.calClosePopover();
    this.calCloseMoreEventsModal();
    this.currentAcademicYearId = yearId;
    this.currentClassId = classId;
    this.gradesTermId = termId;
    this.currentView = 'grades';
    this.$nextTick(() => {
      setTimeout(() => {
        if (this.gradesTermId !== termId) this.gradesTermId = termId;
        this.$nextTick(() => {
          setTimeout(() => { this.gradesScrollToColumn(assessmentId); }, 100);
        });
      }, 100);
    });
  },

  calEditEventFromPopover() {
    if (!this.calendarEventPopover) return;
    const ev = this.calendarEventPopover.event;
    this.calClosePopover();
    this.openModal('editAssessment', {
      assessmentId: ev.id,
      type: ev.type,
      name: ev.name,
      fullMark: ev.fullMark,
      date: ev.date || '',
      notes: ev.notes || '',
      hasSubItems: ev.hasSubItems || false,
      subItems: ev.hasSubItems ? JSON.parse(JSON.stringify(ev.subItems || [])) : [],
      hasAdjustedPaper: ev.hasAdjustedPaper || false,
      adjustedMultiplier: ev.adjustedMultiplier != null ? ev.adjustedMultiplier : 80,
      passingScore: ev.passingScore != null ? ev.passingScore : 50,
      fullMarkS2: ev.fullMarkS2 != null ? ev.fullMarkS2 : '',
      hasMultiplePapers: ev.hasMultiplePapers || false,
      papers: ev.hasMultiplePapers ? JSON.parse(JSON.stringify(ev.papers || [])) : [],
      yearId: ev.yearId,
      classId: ev.classId,
      termId: ev.termId
    });
  },

  calDeleteEventFromPopover() {
    if (!this.calendarEventPopover) return;
    const ev = this.calendarEventPopover.event;
    this.calClosePopover();
    this.openModal('deleteConfirm', {
      target: 'assessment',
      yearId: ev.yearId,
      classId: ev.classId,
      termId: ev.termId,
      id: ev.id,
      message: '確定要刪除「' + ev.name + '」嗎？',
      submessage: '該項目在成績表中的欄位及所有已輸入的分數都將被刪除。'
    });
  },

  async calAddAssessmentConfirm() {
    const { date, yearId, classId, termId, type, name, fullMark, notes,
      hasSubItems, subItems,
      hasAdjustedPaper, adjustedMultiplier, passingScore, fullMarkS2,
      hasMultiplePapers, papers } = this.modalData;

    if (!yearId || !classId || !termId) { this.addToast('請選擇學年、班別和學期', 'warning'); return; }

    const cls = this.getClassObj(yearId, classId);
    const term = cls && cls.terms && cls.terms.find(t => t.id === termId);
    if (!term) { this.addToast('找不到學期', 'error'); return; }

    if (type === 'unified_test' && (term.assessments || []).some(a => a.type === 'unified_test')) {
      this.addToast('該班別該學期已有統測', 'warning'); return;
    }
    if (type === 'exam' && (term.assessments || []).some(a => a.type === 'exam')) {
      this.addToast('該班別該學期已有考試', 'warning'); return;
    }

    let aName = (name || '').trim();
    if (!aName) {
      const all = term.assessments || [];
      if (type === 'assignment') aName = '課業' + (all.filter(a => a.type === 'assignment').length + 1);
      else if (type === 'quiz') aName = '小測' + (all.filter(a => a.type === 'quiz').length + 1);
      else if (type === 'unified_test') aName = '統測';
      else if (type === 'exam') aName = '考試';
      else aName = '項目';
    }

    const fm = parseInt(fullMark);
    if (isNaN(fm) || fm <= 0) { this.addToast('請輸入有效的滿分', 'warning'); return; }

    let finalSubItems = [];
    if (hasSubItems) {
      if (!subItems || subItems.length === 0) { this.addToast('請至少新增一個小項目', 'warning'); return; }
      for (const si of subItems) {
        if (!si.name || !si.name.trim()) { this.addToast('小項目必須有名稱', 'warning'); return; }
        const sfm = parseInt(si.fullMark);
        if (isNaN(sfm) || sfm <= 0) { this.addToast('小項目滿分無效', 'warning'); return; }
        finalSubItems.push({
          id: 'si_' + Date.now() + '_' + Math.random().toString(36).substr(2,5),
          name: si.name.trim(), fullMark: sfm, order: finalSubItems.length
        });
      }
    }

    let finalPapers = [];
    if (type === 'exam' && hasMultiplePapers) {
      if (!papers || papers.length === 0) { this.addToast('請至少新增一個分卷', 'warning'); return; }
      for (const p of papers) {
        if (!p.name || !p.name.trim()) { this.addToast('分卷必須有名稱', 'warning'); return; }
        const pfm = parseInt(p.fullMark);
        const pw = parseFloat(p.weight);
        if (isNaN(pfm) || pfm <= 0) { this.addToast('分卷滿分無效', 'warning'); return; }
        if (isNaN(pw) || pw < 0) { this.addToast('分卷權重無效', 'warning'); return; }
        const paperObj = {
          id: 'pap_' + Date.now() + '_' + Math.random().toString(36).substr(2,5),
          name: p.name.trim(), fullMark: pfm, weight: pw, order: finalPapers.length
        };
        const pfmS2 = parseFloat(p.fullMarkS2);
        if (hasAdjustedPaper && !isNaN(pfmS2) && pfmS2 > 0 && pfmS2 !== pfm) {
          paperObj.fullMarkS2 = pfmS2;
        }
        finalPapers.push(paperObj);
      }
    }

    const order = Date.now();
    const data = {
      type, name: aName, fullMark: fm, date: date || null, notes: (notes || '').trim(),
      includeInUT: true, includeInExam: true,
      scores: {}, order,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (type === 'assignment' || type === 'quiz') data.scoreCategory = 'none';
    if (type === 'quiz') data.allowBonus = false;
    if (hasSubItems && finalSubItems.length > 0) {
      data.hasSubItems = true;
      data.subItems = finalSubItems;
      data.subItemScores = {};
    }
    if (type === 'exam') {
      if (hasAdjustedPaper) {
        data.hasAdjustedPaper = true;
        data.adjustedMultiplier = parseFloat(adjustedMultiplier) || 80;
        data.passingScore = parseFloat(passingScore) || 50;
        const fmS2Val = parseFloat(fullMarkS2);
        if (!hasMultiplePapers && !isNaN(fmS2Val) && fmS2Val > 0 && fmS2Val !== fm) {
          data.fullMarkS2 = fmS2Val;
        }
        data.adjustedScores = {};
      }
      if (hasMultiplePapers && finalPapers.length > 0) {
        data.hasMultiplePapers = true;
        data.papers = finalPapers;
        data.paperScores = {};
      }
    }
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

    const dr = await db.collection('academicYears').doc(yearId).collection('classes').doc(classId)
      .collection('terms').doc(termId).collection('assessments').add(data);
    if (!term.assessments) term.assessments = [];
    term.assessments.push({ id: dr.id, ...data, createdAt: new Date() });
    this.closeModal();
    this.addToast('已新增「' + aName + '」至 ' + cls.className, 'success');
  }
};

const CalendarComputed = {
  calendarTitle() { return this.calendarDate.getFullYear() + '年' + (this.calendarDate.getMonth() + 1) + '月'; },

  calendarDays() {
    const y = this.calendarDate.getFullYear(), m = this.calendarDate.getMonth();
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    let sd = first.getDay();
    const days = [];
    const pl = new Date(y, m, 0).getDate();
    for (let i = sd - 1; i >= 0; i--) days.push({ date: new Date(y, m - 1, pl - i), isCurrentMonth: false });
    for (let d = 1; d <= last.getDate(); d++) days.push({ date: new Date(y, m, d), isCurrentMonth: true });
    while (days.length < 42) {
      const nd = days.length - sd - last.getDate() + 1;
      days.push({ date: new Date(y, m + 1, nd), isCurrentMonth: false });
    }
    return days;
  },

  calendarWeekDays() {
    const base = new Date(this.calendarWeekDate);
    const dow = base.getDay();
    const sun = new Date(base);
    sun.setDate(base.getDate() - dow);
    sun.setHours(0, 0, 0, 0);
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sun);
      d.setDate(sun.getDate() + i);
      arr.push(d);
    }
    return arr;
  },

  calendarWeekTitle() {
    const days = this.calendarWeekDays;
    if (!days.length) return '';
    const first = days[0], last = days[6];
    if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
      return first.getFullYear() + '年' + (first.getMonth() + 1) + '月' + first.getDate() + '日 - ' + last.getDate() + '日';
    }
    if (first.getFullYear() === last.getFullYear()) {
      return first.getFullYear() + '年' + (first.getMonth() + 1) + '月' + first.getDate() + '日 - ' + (last.getMonth() + 1) + '月' + last.getDate() + '日';
    }
    return first.getFullYear() + '年' + (first.getMonth() + 1) + '月' + first.getDate() + '日 - ' +
      last.getFullYear() + '年' + (last.getMonth() + 1) + '月' + last.getDate() + '日';
  },

  allEventsMap() {
    const map = {};
    const tf = this.calendarTypeFilter || {};
    for (const y of this.academicYears) {
      for (const c of y.classes) {
        if (this.calendarFilter !== 'all' && c.id !== this.calendarFilter) continue;
        for (const t of c.terms || []) {
          for (const a of t.assessments || []) {
            if (['assignment', 'quiz', 'unified_test', 'exam'].includes(a.type) && tf[a.type] === false) continue;
            if (a.date) {
              if (!map[a.date]) map[a.date] = [];
              map[a.date].push({
                ...a,
                className: c.className,
                subject: c.subject || '',
                termName: t.name,
                yearId: y.id,
                classId: c.id,
                termId: t.id
              });
            }
          }
        }
      }
    }
    for (const k in map) map[k].sort((x, y) => (x.order || 0) - (y.order || 0));
    return map;
  },

  todayEvents() { return this.allEventsMap[this.dateToStr(new Date())] || []; },

  thisWeekEvents() {
    const t = new Date(), dow = t.getDay(), sun = new Date(t);
    sun.setDate(t.getDate() - dow);
    const evts = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sun); d.setDate(sun.getDate() + i);
      const k = this.dateToStr(d);
      if (this.allEventsMap[k]) evts.push(...this.allEventsMap[k]);
    }
    return evts;
  },

  calModalClasses() {
    if (!this.modalData.yearId) return [];
    const yr = this.academicYears.find(y => y.id === this.modalData.yearId);
    return yr ? yr.classes : [];
  },

  calModalTerms() {
    if (!this.modalData.yearId || !this.modalData.classId) return [];
    const yr = this.academicYears.find(y => y.id === this.modalData.yearId);
    const cls = yr && yr.classes.find(c => c.id === this.modalData.classId);
    return cls ? (cls.terms || []) : [];
  },

  calModalTypeIndex() {
    const types = ['assignment', 'quiz', 'unified_test', 'exam'];
    const idx = types.indexOf(this.modalData.type);
    return idx >= 0 ? idx : 0;
  },

  calModalTermIndex() {
    if (!this.calModalTerms.length) return 0;
    const idx = this.calModalTerms.findIndex(t => t.id === this.modalData.termId);
    return Math.max(0, idx);
  },

  calendarExistingUT() {
    if (this.modalType !== 'calAddAssessment') return false;
    if (!this.modalData.yearId || !this.modalData.classId || !this.modalData.termId) return false;
    const cls = this.getClassObj(this.modalData.yearId, this.modalData.classId);
    if (!cls) return false;
    const term = cls.terms?.find(t => t.id === this.modalData.termId);
    if (!term) return false;
    return (term.assessments || []).some(a => a.type === 'unified_test');
  },

  calendarExistingExam() {
    if (this.modalType !== 'calAddAssessment') return false;
    if (!this.modalData.yearId || !this.modalData.classId || !this.modalData.termId) return false;
    const cls = this.getClassObj(this.modalData.yearId, this.modalData.classId);
    if (!cls) return false;
    const term = cls.terms?.find(t => t.id === this.modalData.termId);
    if (!term) return false;
    return (term.assessments || []).some(a => a.type === 'exam');
  },

  calendarPopoverProgress() {
    if (!this.calendarEventPopover) return null;
    return this.calEventProgress(this.calendarEventPopover.event);
  }
};