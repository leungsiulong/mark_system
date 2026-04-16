// ================================================================
// CRUD Operations (v4 — scoreCategory support)
// ================================================================
const CrudMethods = {
  async loadAllData() {
    try {
      this.loading = true;
      const sd = await db.collection('settings').doc('main').get();
      if (sd.exists) {
        const d = sd.data();
        this.settings = { ...this.settings, ...d };
        if (d.themeColor) this.currentTheme = d.themeColor;
        if (d.tabOrder && Array.isArray(d.tabOrder)) {
          const valid = d.tabOrder.filter(k => ALL_TABS.find(t => t.key === k));
          ALL_TABS.forEach(t => { if (!valid.includes(t.key)) valid.push(t.key); });
          this.tabOrder = valid;
        }
        if (d.activeQuickNavKeys && Array.isArray(d.activeQuickNavKeys)) this.activeQuickNavKeys = d.activeQuickNavKeys;
      }
      const ys = await db.collection('academicYears').orderBy('createdAt', 'desc').get();
      const years = [];
      for (const yD of ys.docs) {
        const year = { id: yD.id, ...yD.data(), classes: [] };
        const cs = await db.collection('academicYears').doc(yD.id).collection('classes').orderBy('createdAt').get();
        for (const cD of cs.docs) {
          const cls = { id: cD.id, ...cD.data(), students: [], terms: [] };
          const ss = await db.collection('academicYears').doc(yD.id).collection('classes').doc(cD.id).collection('students').orderBy('studentNumber').get();
          cls.students = ss.docs.map(d => ({ id: d.id, ...d.data() }));
          const ts = await db.collection('academicYears').doc(yD.id).collection('classes').doc(cD.id).collection('terms').get();
          for (const tD of ts.docs) {
            const term = { id: tD.id, ...tD.data(), assessments: [] };
            const as2 = await db.collection('academicYears').doc(yD.id).collection('classes').doc(cD.id).collection('terms').doc(tD.id).collection('assessments').orderBy('order').get();
            term.assessments = as2.docs.map(d => {
              const data = { id: d.id, ...d.data() };
              // ★ v4: Migrate — ensure scoreCategory exists for assignments/quizzes
              if ((data.type === 'assignment' || data.type === 'quiz') && !data.scoreCategory) {
                data.scoreCategory = 'none';
              }
              return data;
            });
            cls.terms.push(term);
          }
          year.classes.push(cls);
        }
        years.push(year);
      }
      this.academicYears = years;
      if (years.length > 0) this.expandedYears = { [years[0].id]: true };
      const gs = await db.collection('globalStudents').get();
      this.globalStudents = gs.docs.map(d => ({ id: d.id, ...d.data() }));
      this.loading = false;
    } catch (err) {
      console.error(err); this.error = err.message; this.loading = false;
      this.addToast('載入數據失敗：' + err.message, 'error');
    }
  },

  async addAcademicYear() {
    const name = (this.modalData.name || '').trim();
    if (!name) { this.addToast('請輸入學年名稱', 'warning'); return; }
    const dr = await db.collection('academicYears').add({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    this.academicYears.unshift({ id: dr.id, name, createdAt: new Date(), classes: [] });
    this.expandedYears = { ...this.expandedYears, [dr.id]: true };
    this.closeModal(); this.addToast('學年「' + name + '」已建立', 'success');
  },

  async updateAcademicYear() {
    const { id, name } = this.modalData;
    if (!name.trim()) { this.addToast('請輸入學年名稱', 'warning'); return; }
    await db.collection('academicYears').doc(id).update({ name: name.trim() });
    const y = this.academicYears.find(y => y.id === id); if (y) y.name = name.trim();
    this.settingsNav.forEach(n => { if (n.yearId === id) n.label = name.trim(); });
    this.settingsNav = [...this.settingsNav];
    this.closeModal(); this.addToast('學年已更新', 'success');
  },

  async deleteAcademicYear(yearId) {
    const year = this.academicYears.find(y => y.id === yearId); if (!year) return;
    for (const cls of year.classes) {
      for (const s of cls.students) await db.collection('academicYears').doc(yearId).collection('classes').doc(cls.id).collection('students').doc(s.id).delete();
      for (const t of cls.terms || []) for (const a of t.assessments || []) await db.collection('academicYears').doc(yearId).collection('classes').doc(cls.id).collection('terms').doc(t.id).collection('assessments').doc(a.id).delete();
      for (const t of cls.terms || []) await db.collection('academicYears').doc(yearId).collection('classes').doc(cls.id).collection('terms').doc(t.id).delete();
      await db.collection('academicYears').doc(yearId).collection('classes').doc(cls.id).delete();
    }
    await db.collection('academicYears').doc(yearId).delete();
    this.academicYears = this.academicYears.filter(y => y.id !== yearId);
    if (this.currentAcademicYearId === yearId) { this.currentAcademicYearId = null; this.currentClassId = null; }
    if (this.settingsCurrentYearId === yearId) { const idx = this.settingsNav.findIndex(n => n.yearId === yearId); if (idx >= 0) this.settingsNav = this.settingsNav.slice(0, idx); }
    this.addToast('學年已刪除', 'success');
  },

  async addClass() {
    const { className, subject } = this.modalData;
    if (!className.trim() || !subject.trim()) { this.addToast('請填寫班名和科目', 'warning'); return; }
    const yearId = this.modalData.yearId || this.currentAcademicYearId;
    if (!yearId) { this.addToast('請先選擇學年', 'warning'); return; }
    const dc = JSON.parse(JSON.stringify(DEFAULT_SCORE_CONFIG));
    const dr = await db.collection('academicYears').doc(yearId).collection('classes').add({ className: className.trim(), subject: subject.trim(), scoreConfig: dc, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    const cr = db.collection('academicYears').doc(yearId).collection('classes').doc(dr.id);
    const t1 = await cr.collection('terms').add({ name: '上學期' });
    const t2 = await cr.collection('terms').add({ name: '下學期' });
    const nc = { id: dr.id, className: className.trim(), subject: subject.trim(), scoreConfig: dc, createdAt: new Date(), students: [], terms: [{ id: t1.id, name: '上學期', assessments: [] }, { id: t2.id, name: '下學期', assessments: [] }] };
    const year = this.academicYears.find(y => y.id === yearId); if (year) year.classes.push(nc);
    this.closeModal(); this.addToast('班別「' + className.trim() + '」已建立', 'success');
  },

  async updateClass() {
    const { id, className, subject } = this.modalData;
    if (!className.trim() || !subject.trim()) { this.addToast('請填寫班名和科目', 'warning'); return; }
    const yearId = this.modalData.yearId || this.currentAcademicYearId;
    await db.collection('academicYears').doc(yearId).collection('classes').doc(id).update({ className: className.trim(), subject: subject.trim() });
    const y = this.academicYears.find(y => y.id === yearId); const c = y?.classes.find(c => c.id === id);
    if (c) { c.className = className.trim(); c.subject = subject.trim(); }
    this.settingsNav.forEach(n => { if (n.classId === id) n.label = className.trim() + ' - ' + subject.trim(); });
    this.settingsNav = [...this.settingsNav];
    this.closeModal(); this.addToast('班別已更新', 'success');
  },

  async deleteClass(yearId, classId) {
    const year = this.academicYears.find(y => y.id === yearId); const cls = year?.classes.find(c => c.id === classId); if (!cls) return;
    for (const s of cls.students) await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('students').doc(s.id).delete();
    for (const t of cls.terms || []) { for (const a of t.assessments || []) await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('terms').doc(t.id).collection('assessments').doc(a.id).delete(); await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('terms').doc(t.id).delete(); }
    await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).delete();
    year.classes = year.classes.filter(c => c.id !== classId);
    if (this.currentClassId === classId) this.currentClassId = null;
    if (this.settingsCurrentClassId === classId) { const idx = this.settingsNav.findIndex(n => n.classId === classId); if (idx >= 0) this.settingsNav = this.settingsNav.slice(0, idx); }
    this.addToast('班別已刪除', 'success');
  },

  async addStudent() {
    const { studentNumber, studentName, linkToGlobal, matchedGlobal } = this.modalData;
    if (!studentNumber.trim() || !studentName.trim()) { this.addToast('請填寫學號和姓名', 'warning'); return; }
    const yearId = this.modalData.yearId || this.currentAcademicYearId;
    const classId = this.modalData.classId || this.currentClassId;
    const cls = this.getClassObj(yearId, classId); if (!cls) { this.addToast('找不到班別', 'error'); return; }
    if (cls.students.find(s => s.studentNumber === studentNumber.trim())) { this.addToast('此班已有相同學號的學生', 'warning'); return; }
    let gid = null;
    if (linkToGlobal && matchedGlobal) { gid = matchedGlobal.id; await db.collection('globalStudents').doc(matchedGlobal.id).update({ records: firebase.firestore.FieldValue.arrayUnion({ academicYearId: yearId, classId }) }); }
    else { const gr = await db.collection('globalStudents').add({ name: studentName.trim(), records: [{ academicYearId: yearId, classId }] }); gid = gr.id; this.globalStudents.push({ id: gr.id, name: studentName.trim(), records: [{ academicYearId: yearId, classId }] }); }
    const dr = await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('students').add({ studentNumber: studentNumber.trim(), studentName: studentName.trim(), globalStudentId: gid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    cls.students.push({ id: dr.id, studentNumber: studentNumber.trim(), studentName: studentName.trim(), globalStudentId: gid });
    this.closeModal(); this.addToast('學生「' + studentName.trim() + '」已新增', 'success');
  },

  async updateStudent() {
    const { id, studentNumber, studentName } = this.modalData;
    if (!studentNumber.trim() || !studentName.trim()) { this.addToast('請填寫學號和姓名', 'warning'); return; }
    const yearId = this.modalData.yearId || this.currentAcademicYearId;
    const classId = this.modalData.classId || this.currentClassId;
    await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('students').doc(id).update({ studentNumber: studentNumber.trim(), studentName: studentName.trim() });
    const cls = this.getClassObj(yearId, classId); const s = cls?.students.find(s => s.id === id);
    if (s) { s.studentNumber = studentNumber.trim(); s.studentName = studentName.trim(); }
    this.closeModal(); this.addToast('學生資料已更新', 'success');
  },

  async deleteStudent(yearId, classId, studentId) {
    await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('students').doc(studentId).delete();
    const cls = this.getClassObj(yearId, classId); if (cls) cls.students = cls.students.filter(s => s.id !== studentId);
    this.addToast('學生已刪除', 'success');
  },

  async batchImportStudents() {
    const text = this.modalData.text || '';
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (!lines.length) { this.addToast('請輸入學生資料', 'warning'); return; }
    const yearId = this.modalData.yearId || this.currentAcademicYearId;
    const classId = this.modalData.classId || this.currentClassId;
    const cls = this.getClassObj(yearId, classId); if (!cls) { this.addToast('找不到班別', 'error'); return; }
    const students = [];
    for (const line of lines) {
      const parts = line.split(/[,，\t]/);
      if (parts.length < 2) { this.modalData.parseError = '格式錯誤：「' + line + '」'; return; }
      const num = parts[0].trim(), name = parts[1].trim();
      if (!num || !name) { this.modalData.parseError = '格式錯誤：「' + line + '」'; return; }
      if (cls.students.find(s => s.studentNumber === num)) { this.modalData.parseError = '學號「' + num + '」已存在'; return; }
      students.push({ studentNumber: num, studentName: name });
    }
    for (const s of students) {
      const gr = await db.collection('globalStudents').add({ name: s.studentName, records: [{ academicYearId: yearId, classId }] });
      const dr = await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('students').add({ studentNumber: s.studentNumber, studentName: s.studentName, globalStudentId: gr.id, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      cls.students.push({ id: dr.id, studentNumber: s.studentNumber, studentName: s.studentName, globalStudentId: gr.id });
      this.globalStudents.push({ id: gr.id, name: s.studentName, records: [{ academicYearId: yearId, classId }] });
    }
    this.closeModal(); this.addToast('已匯入 ' + students.length + ' 位學生', 'success');
  },

  openAddAssessmentModal(type, period) {
    if (!this.gradesTerm) return;
    const term = this.gradesTerm; const all = term.assessments || [];
    let name = '';
    if (type === 'assignment') name = '課業' + (all.filter(a => a.type === 'assignment').length + 1);
    else if (type === 'quiz') name = '小測' + (all.filter(a => a.type === 'quiz').length + 1);
    else if (type === 'unified_test') name = '統測';
    else if (type === 'exam') name = '考試';
    else if (type === 'class_performance') name = period === 'exam' ? '考試期課堂表現' : '統測期課堂表現';
    this.openModal('addAssessment', { type, period: period || null, name, fullMark: 100, date: '', notes: '', yearId: this.currentAcademicYearId, classId: this.currentClassId, termId: this.gradesTermId });
  },

  async addAssessmentConfirm() {
    const { type, period, name, fullMark, date, notes, yearId, classId, termId } = this.modalData;
    if (!name.trim()) { this.addToast('請輸入名稱', 'warning'); return; }
    const fm = parseInt(fullMark); if (isNaN(fm) || fm <= 0) { this.addToast('請輸入有效的滿分', 'warning'); return; }
    const cls = this.getClassObj(yearId, classId); const term = cls?.terms?.find(t => t.id === termId); if (!term) return;
    const order = Date.now();
    const data = { type, name: name.trim(), fullMark: fm, date: date || null, notes: (notes || '').trim(), includeInUT: true, includeInExam: true, scores: {}, order, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
    // ★ v4: Add scoreCategory for assignments/quizzes
    if (type === 'assignment' || type === 'quiz') data.scoreCategory = 'none';
    if (type === 'class_performance') data.period = period;
    const dr = await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('terms').doc(termId).collection('assessments').add(data);
    if (!term.assessments) term.assessments = [];
    term.assessments.push({ id: dr.id, ...data, createdAt: new Date() });
    this.closeModal(); this.addToast('已新增「' + name.trim() + '」', 'success');
  },

  async updateAssessmentConfirm() {
    const { assessmentId, name, fullMark, date, notes, yearId, classId, termId } = this.modalData;
    if (!name.trim()) { this.addToast('請輸入名稱', 'warning'); return; }
    const fm = parseInt(fullMark); if (isNaN(fm) || fm <= 0) { this.addToast('請輸入有效的滿分', 'warning'); return; }
    await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('terms').doc(termId).collection('assessments').doc(assessmentId).update({ name: name.trim(), fullMark: fm, date: date || null, notes: (notes || '').trim() });
    const cls = this.getClassObj(yearId, classId); const term = cls?.terms?.find(t => t.id === termId);
    const a = term?.assessments?.find(a => a.id === assessmentId);
    if (a) { a.name = name.trim(); a.fullMark = fm; a.date = date || null; a.notes = (notes || '').trim(); }
    this.closeModal(); this.addToast('已更新「' + name.trim() + '」', 'success');
  },

  async deleteAssessmentDoc(yearId, classId, termId, assessmentId) {
    await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('terms').doc(termId).collection('assessments').doc(assessmentId).delete();
    const cls = this.getClassObj(yearId, classId); const term = cls?.terms?.find(t => t.id === termId);
    if (term) term.assessments = term.assessments.filter(a => a.id !== assessmentId);
    this.gradesFocusRow = -1; this.gradesFocusCol = -1; this.addToast('已刪除評估項目', 'success');
  },

  async handleDelete() {
    const { target, id, yearId, classId } = this.modalData;
    switch (target) {
      case 'year': await this.deleteAcademicYear(id); break;
      case 'class': await this.deleteClass(yearId, id); break;
      case 'student': await this.deleteStudent(yearId, classId, id); break;
      case 'assessment': await this.deleteAssessmentDoc(yearId, classId, this.modalData.termId, id); break;
    }
    this.closeModal();
  }
};