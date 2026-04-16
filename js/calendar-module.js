// ================================================================
// Calendar Module (v4 — scoreCategory support)
// ================================================================
const CalendarMethods = {
  calPrev() { const d=new Date(this.calendarDate);d.setMonth(d.getMonth()-1);this.calendarDate=d; },
  calNext() { const d=new Date(this.calendarDate);d.setMonth(d.getMonth()+1);this.calendarDate=d; },
  calToday() { this.calendarDate=new Date(); },
  getEventsForDate(d) { return this.allEventsMap[this.dateToStr(d)]||[]; },

  onCalendarDayClick(day) {
    if (!day.isCurrentMonth) return;
    const dateStr = this.dateToStr(day.date);
    const preYearId = this.currentAcademicYearId || (this.academicYears.length>0?this.academicYears[0].id:null);
    let preClassId = null, preTermId = null;
    if (preYearId) {
      const yr = this.academicYears.find(y=>y.id===preYearId);
      if (yr && yr.classes.length>0) {
        preClassId = this.currentClassId && yr.classes.find(c=>c.id===this.currentClassId) ? this.currentClassId : yr.classes[0].id;
        const cls = yr.classes.find(c=>c.id===preClassId);
        if (cls && cls.terms && cls.terms.length>0) preTermId = cls.terms[0].id;
      }
    }
    this.openModal('calAddAssessment', { date:dateStr, yearId:preYearId, classId:preClassId, termId:preTermId, type:'assignment', name:'', fullMark:100, notes:'' });
  },

  onCalModalYearChange() { this.modalData.classId=null;this.modalData.termId=null;this.modalData.name=''; },
  onCalModalClassChange() {
    this.modalData.termId=null;this.modalData.name='';
    if (this.modalData.classId) {
      const yr=this.academicYears.find(y=>y.id===this.modalData.yearId);
      const cls=yr&&yr.classes.find(c=>c.id===this.modalData.classId);
      if (cls&&cls.terms&&cls.terms.length>0) this.modalData.termId=cls.terms[0].id;
    }
  },

  async calAddAssessmentConfirm() {
    const { date, yearId, classId, termId, type, name, fullMark, notes } = this.modalData;
    if (!yearId||!classId||!termId) { this.addToast('請選擇學年、班別和學期','warning'); return; }
    let aName = (name||'').trim();
    const cls = this.getClassObj(yearId, classId);
    const term = cls && cls.terms && cls.terms.find(t=>t.id===termId);
    if (!term) { this.addToast('找不到學期','error'); return; }
    if (!aName) {
      const all = term.assessments || [];
      if (type==='assignment') aName = '課業' + (all.filter(a=>a.type==='assignment').length + 1);
      else aName = '小測' + (all.filter(a=>a.type==='quiz').length + 1);
    }
    const fm = parseInt(fullMark); if (isNaN(fm)||fm<=0) { this.addToast('請輸入有效的滿分','warning'); return; }
    const order = Date.now();
    const data = {
      type, name:aName, fullMark:fm, date:date||null, notes:(notes||'').trim(),
      includeInUT:true, includeInExam:true,
      scoreCategory: (type==='assignment'||type==='quiz') ? 'none' : undefined,
      scores:{}, order, createdAt:firebase.firestore.FieldValue.serverTimestamp()
    };
    // Remove undefined fields
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
    const dr = await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('terms').doc(termId).collection('assessments').add(data);
    if (!term.assessments) term.assessments = [];
    term.assessments.push({ id:dr.id, ...data, createdAt:new Date() });
    this.closeModal();
    this.addToast('已新增「'+aName+'」至 '+cls.className,'success');
  }
};

const CalendarComputed = {
  calendarTitle() { return this.calendarDate.getFullYear() + '年' + (this.calendarDate.getMonth()+1) + '月'; },
  calendarDays() {
    const y=this.calendarDate.getFullYear(),m=this.calendarDate.getMonth();
    const first=new Date(y,m,1),last=new Date(y,m+1,0); let sd=first.getDay(); const days=[];
    const pl=new Date(y,m,0).getDate();
    for(let i=sd-1;i>=0;i--) days.push({date:new Date(y,m-1,pl-i),isCurrentMonth:false});
    for(let d=1;d<=last.getDate();d++) days.push({date:new Date(y,m,d),isCurrentMonth:true});
    while(days.length<42){const nd=days.length-sd-last.getDate()+1;days.push({date:new Date(y,m+1,nd),isCurrentMonth:false});}
    return days;
  },
  allEventsMap() {
    const map={};
    for(const y of this.academicYears) for(const c of y.classes){
      if(this.calendarFilter!=='all'&&c.id!==this.calendarFilter) continue;
      for(const t of c.terms||[]) for(const a of t.assessments||[]){
        if(a.date){if(!map[a.date])map[a.date]=[];map[a.date].push({...a,className:c.className,yearId:y.id,classId:c.id,termId:t.id});}
      }
    }
    return map;
  },
  todayEvents() { return this.allEventsMap[this.dateToStr(new Date())]||[]; },
  thisWeekEvents() {
    const t=new Date(),dow=t.getDay(),sun=new Date(t);sun.setDate(t.getDate()-dow);const evts=[];
    for(let i=0;i<7;i++){const d=new Date(sun);d.setDate(sun.getDate()+i);const k=this.dateToStr(d);if(this.allEventsMap[k])evts.push(...this.allEventsMap[k]);}
    return evts;
  },
  calModalClasses() { if(!this.modalData.yearId) return []; const yr=this.academicYears.find(y=>y.id===this.modalData.yearId); return yr?yr.classes:[]; },
  calModalTerms() { if(!this.modalData.yearId||!this.modalData.classId) return []; const yr=this.academicYears.find(y=>y.id===this.modalData.yearId); const cls=yr&&yr.classes.find(c=>c.id===this.modalData.classId); return cls?(cls.terms||[]):[]; }
};