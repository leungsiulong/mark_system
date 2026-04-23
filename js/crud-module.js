// ================================================================
// CRUD Operations (v9 — parallel loading for mobile performance)
// ================================================================
const CrudMethods = {

  // ★ v9: Completely rewritten load with Promise.all parallelism
  // Previously: sequential awaits inside nested for-loops caused 600+ serial HTTP requests.
  // Now: parallel requests at every layer reduce total wait from ~minutes to seconds on mobile.
  async loadAllData() {
    try {
      this.loading = true;
      this.loadingText = '正在連接伺服器...';
      this.loadingProgress = 5;

      // Step 1: Load settings + academicYears list + globalStudents in parallel
      this.loadingText = '正在載入基本資料...';
      const [settingsSnap, yearsSnap, globalSnap] = await Promise.all([
        db.collection('settings').doc('main').get(),
        db.collection('academicYears').orderBy('createdAt', 'desc').get(),
        db.collection('globalStudents').get()
      ]);
      this.loadingProgress = 20;

      // Process settings
      if (settingsSnap.exists) {
        const d = settingsSnap.data();
        this.settings = { ...this.settings, ...d };
        if (d.themeColor) this.currentTheme = d.themeColor;
        if (d.tabOrder && Array.isArray(d.tabOrder)) {
          const valid = d.tabOrder.filter(k => ALL_TABS.find(t => t.key === k));
          ALL_TABS.forEach(t => { if (!valid.includes(t.key)) valid.push(t.key); });
          this.tabOrder = valid;
        }
        if (d.activeQuickNavKeys && Array.isArray(d.activeQuickNavKeys)) this.activeQuickNavKeys = d.activeQuickNavKeys;
      }

      // Process global students
      this.globalStudents = globalSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (yearsSnap.docs.length === 0) {
        this.academicYears = [];
        this.loadingProgress = 100;
        this.loading = false;
        return;
      }

      // Step 2: Load all classes for all years IN PARALLEL
      this.loadingText = '正在載入班別資料...';
      const yearDocs = yearsSnap.docs;
      const classesPerYearPromises = yearDocs.map(yD =>
        db.collection('academicYears').doc(yD.id).collection('classes').orderBy('createdAt').get()
      );
      const classesPerYearSnaps = await Promise.all(classesPerYearPromises);
      this.loadingProgress = 40;

      // Build year objects with class shells
      const years = yearDocs.map((yD, i) => {
        const year = { id: yD.id, ...yD.data(), classes: [] };
        const cs = classesPerYearSnaps[i];
        year.classes = cs.docs.map(cD => {
          const cls = { id: cD.id, ...cD.data(), students: [], terms: [], _yearId: yD.id };
          if (!cls.customCategories) cls.customCategories = [];

          // Migrate classType on load (in-memory only)
          if (!cls.classType) {
            cls.classType = cls.subject ? 'subject' : 'regular';
          } else if (cls.classType === 'gradeRoster') {
            cls.classType = 'regular';
          } else if (cls.classType === 'regular' && cls.subject) {
            cls.classType = 'subject';
          }
          if (cls.classType === 'regular' && !cls.subject) cls.subject = '';

          if (!cls.scoreConfig) cls.scoreConfig = JSON.parse(JSON.stringify(DEFAULT_SCORE_CONFIG));
          if (!cls.scoreConfig.ut) cls.scoreConfig.ut = {};
          if (!cls.scoreConfig.ut.customCategories) cls.scoreConfig.ut.customCategories = {};
          if (!cls.scoreConfig.exam) cls.scoreConfig.exam = {};
          if (!cls.scoreConfig.exam.a1Weights) cls.scoreConfig.exam.a1Weights = {};
          if (!cls.scoreConfig.exam.a1Weights.customCategories) cls.scoreConfig.exam.a1Weights.customCategories = {};

          return cls;
        });
        return year;
      });

      // Flatten list of all classes (for parallel student + term fetch)
      const allClasses = [];
      years.forEach(year => year.classes.forEach(cls => allClasses.push(cls)));

      if (allClasses.length === 0) {
        this.academicYears = years;
        if (years.length > 0) this.expandedYears = { [years[0].id]: true };
        this.loadingProgress = 100;
        this.loading = false;
        return;
      }

      // Step 3: Load all students + all terms IN PARALLEL across all classes
      this.loadingText = '正在載入學生及學期...';
      const studentsPromises = allClasses.map(cls =>
        db.collection('academicYears').doc(cls._yearId).collection('classes').doc(cls.id)
          .collection('students').orderBy('studentNumber').get()
      );
      const termsPromises = allClasses.map(cls =>
        db.collection('academicYears').doc(cls._yearId).collection('classes').doc(cls.id)
          .collection('terms').get()
      );
      const [studentsSnaps, termsSnaps] = await Promise.all([
        Promise.all(studentsPromises),
        Promise.all(termsPromises)
      ]);
      this.loadingProgress = 65;

      // Populate students + term shells
      allClasses.forEach((cls, i) => {
        cls.students = studentsSnaps[i].docs.map(d => ({ id: d.id, ...d.data() }));
        cls.terms = termsSnaps[i].docs.map(tD => ({
          id: tD.id, ...tD.data(), assessments: [], _classId: cls.id, _yearId: cls._yearId
        }));
      });

      // Step 4: Load all assessments for all terms IN PARALLEL
      this.loadingText = '正在載入評估項目...';
      const allTerms = [];
      allClasses.forEach(cls => cls.terms.forEach(t => allTerms.push(t)));

      if (allTerms.length > 0) {
        const assessmentsPromises = allTerms.map(t =>
          db.collection('academicYears').doc(t._yearId).collection('classes').doc(t._classId)
            .collection('terms').doc(t.id).collection('assessments').orderBy('order').get()
        );
        const assessmentsSnaps = await Promise.all(assessmentsPromises);
        this.loadingProgress = 90;

        allTerms.forEach((t, i) => {
          t.assessments = assessmentsSnaps[i].docs.map(d => {
            const data = { id: d.id, ...d.data() };
            if ((data.type === 'assignment' || data.type === 'quiz' || data.type === 'custom') && !data.scoreCategory) data.scoreCategory = 'none';
            if (data.hasSubItems && !Array.isArray(data.subItems)) data.subItems = [];
            if (data.hasSubItems && !data.subItemScores) data.subItemScores = {};
            if (data.type === 'exam' && data.hasMultiplePapers && !Array.isArray(data.papers)) data.papers = [];
            if (data.type === 'exam' && !data.paperScores) data.paperScores = {};
            if (data.type === 'exam' && !data.adjustedScores) data.adjustedScores = {};
            return data;
          });
          // Clean up tracking props
          delete t._classId;
          delete t._yearId;
        });
      }

      // Clean up tracking props from classes
      allClasses.forEach(cls => delete cls._yearId);

      this.loadingText = '完成';
      this.loadingProgress = 100;
      this.academicYears = years;
      if (years.length > 0) this.expandedYears = { [years[0].id]: true };

      // Small delay for user to perceive completion, then hide loader
      setTimeout(() => { this.loading = false; }, 150);
    } catch (err) {
      console.error(err); this.error = err.message; this.loading = false;
      this.addToast('載入數據失敗:' + err.message, 'error');
    }
  },

  _getLinkedClasses(yearId, cls) {
    const year = this.academicYears.find(y => y.id === yearId);
    if (!year) return [cls];
    const type = cls.classType || 'regular';
    if (type === 'elective') return [cls];
    return year.classes.filter(c => c.className === cls.className &&
      (c.classType === 'regular' || c.classType === 'subject'));
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
    // ★ v9: Parallelize deletions
    const deletionPromises = [];
    for (const cls of year.classes) {
      for (const s of cls.students) deletionPromises.push(db.collection('academicYears').doc(yearId).collection('classes').doc(cls.id).collection('students').doc(s.id).delete());
      for (const t of cls.terms || []) {
        for (const a of t.assessments || []) deletionPromises.push(db.collection('academicYears').doc(yearId).collection('classes').doc(cls.id).collection('terms').doc(t.id).collection('assessments').doc(a.id).delete());
      }
    }
    await Promise.all(deletionPromises);
    // Then delete terms + classes sequentially (they depend on subcollections)
    for (const cls of year.classes) {
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
    const { className, classType, selectedStudentIds, subject } = this.modalData;
    if (!className.trim()) { this.addToast('請填寫班名', 'warning'); return; }
    const type = classType || 'regular';

    const yearId = this.modalData.yearId || this.currentAcademicYearId;
    if (!yearId) { this.addToast('請先選擇學年', 'warning'); return; }
    const year = this.academicYears.find(y => y.id === yearId);
    if (!year) { this.addToast('找不到學年', 'error'); return; }

    let subjectName = '';
    if (type === 'elective') {
      subjectName = (subject || '').trim();
      if (subjectName === '__new__') subjectName = '';
      if (!subjectName) { this.addToast('請選擇或輸入科目', 'warning'); return; }
    }

    if (type === 'regular') {
      const existing = year.classes.find(c => c.className === className.trim() && c.classType === 'regular');
      if (existing) {
        this.addToast('此學年已有一般班別「' + className.trim() + '」', 'warning');
        return;
      }
    }

    let initialStudents = [];
    if (type === 'regular') {
      const siblings = year.classes.filter(c =>
        c.className === className.trim() && c.classType === 'subject');
      if (siblings.length > 0) {
        const seen = new Set();
        const sib = siblings[0];
        for (const s of sib.students) {
          const gid = s.globalStudentId || s.id;
          if (seen.has(gid)) continue;
          seen.add(gid);
          initialStudents.push({
            studentNumber: s.studentNumber, studentName: s.studentName, globalStudentId: s.globalStudentId
          });
        }
      }
    } else if (type === 'elective' && selectedStudentIds && selectedStudentIds.length > 0) {
      const seen = new Set();
      for (const c of year.classes) {
        const ct = c.classType || 'regular';
        if (ct !== 'regular' && ct !== 'subject') continue;
        for (const s of c.students) {
          const gid = s.globalStudentId || s.id;
          if (selectedStudentIds.includes(s.id) && !seen.has(gid)) {
            seen.add(gid);
            initialStudents.push({
              studentNumber: s.studentNumber, studentName: s.studentName, globalStudentId: s.globalStudentId
            });
          }
        }
      }
    }

    const dc = JSON.parse(JSON.stringify(DEFAULT_SCORE_CONFIG));
    const dr = await db.collection('academicYears').doc(yearId).collection('classes').add({
      className: className.trim(), subject: subjectName, scoreConfig: dc,
      classType: type,
      customCategories: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    const cr = db.collection('academicYears').doc(yearId).collection('classes').doc(dr.id);

    let terms = [];
    if (type !== 'regular') {
      const [t1, t2] = await Promise.all([
        cr.collection('terms').add({ name: '上學期' }),
        cr.collection('terms').add({ name: '下學期' })
      ]);
      terms = [{ id: t1.id, name: '上學期', assessments: [] }, { id: t2.id, name: '下學期', assessments: [] }];
    }

    const nc = {
      id: dr.id, className: className.trim(), subject: subjectName,
      classType: type, scoreConfig: dc, customCategories: [], createdAt: new Date(),
      students: [],
      terms: terms
    };
    year.classes.push(nc);

    // ★ v9: Parallelize student creation
    if (initialStudents.length > 0) {
      const studentPromises = initialStudents.map(s =>
        cr.collection('students').add({
          studentNumber: s.studentNumber, studentName: s.studentName, globalStudentId: s.globalStudentId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(sdr => ({ sdr, s }))
      );
      const results = await Promise.all(studentPromises);
      for (const { sdr, s } of results) {
        nc.students.push({
          id: sdr.id, studentNumber: s.studentNumber, studentName: s.studentName, globalStudentId: s.globalStudentId
        });
        if (s.globalStudentId) {
          try {
            await db.collection('globalStudents').doc(s.globalStudentId).update({
              records: firebase.firestore.FieldValue.arrayUnion({ academicYearId: yearId, classId: dr.id })
            });
            const gs = this.globalStudents.find(g => g.id === s.globalStudentId);
            if (gs) {
              if (!gs.records) gs.records = [];
              if (!gs.records.find(r => r.academicYearId === yearId && r.classId === dr.id)) {
                gs.records.push({ academicYearId: yearId, classId: dr.id });
              }
            }
          } catch (e) { /* silent */ }
        }
      }
    }

    this.closeModal();
    let typeLabel = type === 'elective' ? '選修科' : '班別';
    const displayName = className.trim() + (subjectName ? ' - ' + subjectName : '');
    let msg = typeLabel + '「' + displayName + '」已建立';
    if (initialStudents.length > 0) {
      msg += ',已同步 ' + initialStudents.length + ' 位學生';
    }
    this.addToast(msg, 'success');
  },

  async addSubject() {
    let subjectName = (this.modalData.subject || '').trim();
    if (subjectName === '__new__') subjectName = '';
    if (!subjectName) { this.addToast('請選擇或輸入科目名稱', 'warning'); return; }

    const selectedClassIds = this.modalData.selectedClassIds || [];
    if (selectedClassIds.length === 0) { this.addToast('請至少選擇一個班別', 'warning'); return; }

    const yearId = this.modalData.yearId || this.currentAcademicYearId;
    const year = this.academicYears.find(y => y.id === yearId);
    if (!year) { this.addToast('找不到學年', 'error'); return; }

    const conflicts = [];
    for (const classId of selectedClassIds) {
      const baseClass = year.classes.find(c => c.id === classId);
      if (!baseClass) continue;
      const existing = year.classes.find(c =>
        c.classType === 'subject' && c.className === baseClass.className && c.subject === subjectName);
      if (existing) conflicts.push(baseClass.className);
    }
    if (conflicts.length > 0) {
      this.addToast('以下班別已有此科目:' + conflicts.join('、'), 'warning');
      return;
    }

    let createdCount = 0;
    let totalStudents = 0;
    for (const classId of selectedClassIds) {
      const baseClass = year.classes.find(c => c.id === classId);
      if (!baseClass) continue;

      const dc = JSON.parse(JSON.stringify(DEFAULT_SCORE_CONFIG));
      const dr = await db.collection('academicYears').doc(yearId).collection('classes').add({
        className: baseClass.className,
        subject: subjectName,
        scoreConfig: dc,
        classType: 'subject',
        customCategories: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      const cr = db.collection('academicYears').doc(yearId).collection('classes').doc(dr.id);

      // ★ v9: Parallelize term + students
      const [t1, t2] = await Promise.all([
        cr.collection('terms').add({ name: '上學期' }),
        cr.collection('terms').add({ name: '下學期' })
      ]);

      const nc = {
        id: dr.id,
        className: baseClass.className,
        subject: subjectName,
        classType: 'subject',
        scoreConfig: dc,
        customCategories: [],
        createdAt: new Date(),
        students: [],
        terms: [
          { id: t1.id, name: '上學期', assessments: [] },
          { id: t2.id, name: '下學期', assessments: [] }
        ]
      };
      year.classes.push(nc);

      // Parallelize student additions
      if (baseClass.students.length > 0) {
        const studentPromises = baseClass.students.map(s =>
          cr.collection('students').add({
            studentNumber: s.studentNumber,
            studentName: s.studentName,
            globalStudentId: s.globalStudentId || null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          }).then(sdr => ({ sdr, s }))
        );
        const results = await Promise.all(studentPromises);
        for (const { sdr, s } of results) {
          nc.students.push({
            id: sdr.id,
            studentNumber: s.studentNumber,
            studentName: s.studentName,
            globalStudentId: s.globalStudentId || null
          });
          if (s.globalStudentId) {
            try {
              await db.collection('globalStudents').doc(s.globalStudentId).update({
                records: firebase.firestore.FieldValue.arrayUnion({ academicYearId: yearId, classId: dr.id })
              });
              const gs = this.globalStudents.find(g => g.id === s.globalStudentId);
              if (gs) {
                if (!gs.records) gs.records = [];
                if (!gs.records.find(r => r.academicYearId === yearId && r.classId === dr.id)) {
                  gs.records.push({ academicYearId: yearId, classId: dr.id });
                }
              }
            } catch (e) { /* silent */ }
          }
          totalStudents++;
        }
      }
      createdCount++;
    }

    this.closeModal();
    this.addToast('已新增科目「' + subjectName + '」至 ' + createdCount + ' 個班別(共同步 ' + totalStudents + ' 位學生)', 'success');
  },

  async updateClass() {
    const { id, className, subject, classType } = this.modalData;
    const type = classType || 'regular';

    if (!className.trim()) { this.addToast('請填寫班名', 'warning'); return; }

    let subjectName = (subject || '').trim();
    if (subjectName === '__new__') subjectName = '';

    const yearId = this.modalData.yearId || this.currentAcademicYearId;
    const year = this.academicYears.find(y => y.id === yearId);
    const origCls = year?.classes.find(c => c.id === id);
    if (!origCls) return;

    if (type === 'regular') {
      const newName = className.trim();
      const oldName = origCls.className;
      if (newName !== oldName) {
        if (year.classes.find(c => c.id !== id && c.className === newName && c.classType === 'regular')) {
          this.addToast('此學年已有另一個一般班別「' + newName + '」', 'warning');
          return;
        }
        const linked = year.classes.filter(c => c.className === oldName && (c.classType === 'regular' || c.classType === 'subject'));
        // ★ v9: Parallelize updates
        await Promise.all(linked.map(c =>
          db.collection('academicYears').doc(yearId).collection('classes').doc(c.id).update({ className: newName })
        ));
        linked.forEach(c => { c.className = newName; });
      } else {
        await db.collection('academicYears').doc(yearId).collection('classes').doc(id).update({ classType: 'regular' });
      }
    } else if (type === 'subject') {
      if (!subjectName) { this.addToast('請選擇或輸入科目', 'warning'); return; }
      const conflict = year.classes.find(c =>
        c.id !== id && c.classType === 'subject' && c.className === origCls.className && c.subject === subjectName);
      if (conflict) {
        this.addToast('此班別已有相同科目「' + subjectName + '」', 'warning');
        return;
      }
      await db.collection('academicYears').doc(yearId).collection('classes').doc(id).update({ subject: subjectName, classType: 'subject' });
      origCls.subject = subjectName;
    } else if (type === 'elective') {
      if (!subjectName) { this.addToast('請選擇或輸入科目', 'warning'); return; }
      await db.collection('academicYears').doc(yearId).collection('classes').doc(id).update({
        className: className.trim(),
        subject: subjectName
      });
      origCls.className = className.trim();
      origCls.subject = subjectName;
    }

    this.settingsNav.forEach(n => {
      if (n.classId === id) {
        n.label = origCls.className + (origCls.subject ? ' - ' + origCls.subject : '');
      }
    });
    this.settingsNav = [...this.settingsNav];

    this.closeModal();
    this.addToast('已更新', 'success');
  },

  async deleteClass(yearId, classId) {
    const year = this.academicYears.find(y => y.id === yearId);
    const cls = year?.classes.find(c => c.id === classId);
    if (!cls) return;

    const targets = [cls];
    if (cls.classType === 'regular') {
      const linked = year.classes.filter(c =>
        c.id !== cls.id && c.className === cls.className && c.classType === 'subject');
      targets.push(...linked);
    }

    // ★ v9: Parallelize deep deletions
    const studentDeletions = [];
    const assessmentDeletions = [];
    for (const t of targets) {
      for (const s of t.students) {
        studentDeletions.push(db.collection('academicYears').doc(yearId).collection('classes').doc(t.id).collection('students').doc(s.id).delete());
      }
      for (const term of t.terms || []) {
        for (const a of term.assessments || []) {
          assessmentDeletions.push(db.collection('academicYears').doc(yearId).collection('classes').doc(t.id).collection('terms').doc(term.id).collection('assessments').doc(a.id).delete());
        }
      }
    }
    await Promise.all([...studentDeletions, ...assessmentDeletions]);

    // Then delete terms
    const termDeletions = [];
    for (const t of targets) {
      for (const term of t.terms || []) {
        termDeletions.push(db.collection('academicYears').doc(yearId).collection('classes').doc(t.id).collection('terms').doc(term.id).delete());
      }
    }
    await Promise.all(termDeletions);

    // Finally delete classes
    await Promise.all(targets.map(t => db.collection('academicYears').doc(yearId).collection('classes').doc(t.id).delete()));

    const deletedIds = targets.map(t => t.id);
    year.classes = year.classes.filter(c => !deletedIds.includes(c.id));

    if (this.currentClassId && deletedIds.includes(this.currentClassId)) this.currentClassId = null;
    if (this.settingsCurrentClassId && deletedIds.includes(this.settingsCurrentClassId)) {
      const idx = this.settingsNav.findIndex(n => deletedIds.includes(n.classId));
      if (idx >= 0) this.settingsNav = this.settingsNav.slice(0, idx);
    }

    const msg = targets.length > 1
      ? '已刪除班別及其 ' + (targets.length - 1) + ' 個科目'
      : '已刪除';
    this.addToast(msg, 'success');
  },

  async addStudent() {
    const { studentNumber, studentName, linkToGlobal, matchedGlobal } = this.modalData;
    if (!studentNumber.trim() || !studentName.trim()) { this.addToast('請填寫學號和姓名', 'warning'); return; }
    const yearId = this.modalData.yearId || this.currentAcademicYearId;
    const classId = this.modalData.classId || this.currentClassId;
    const cls = this.getClassObj(yearId, classId); if (!cls) { this.addToast('找不到班別', 'error'); return; }

    const targets = this._getLinkedClasses(yearId, cls);

    for (const t of targets) {
      if (t.students.find(s => s.studentNumber === studentNumber.trim())) {
        const typeLabel = t.classType === 'regular' ? '(一般班別)' : t.subject ? '(' + t.subject + ')' : '';
        const msg = t.id === classId ? '此班已有相同學號的學生' : '連結班別「' + t.className + typeLabel + '」已有相同學號';
        this.addToast(msg, 'warning');
        return;
      }
    }

    let gid = null;
    const recordsToAdd = targets.map(t => ({ academicYearId: yearId, classId: t.id }));
    if (linkToGlobal && matchedGlobal) {
      gid = matchedGlobal.id;
      await db.collection('globalStudents').doc(matchedGlobal.id).update({
        records: firebase.firestore.FieldValue.arrayUnion(...recordsToAdd)
      });
    } else {
      const gr = await db.collection('globalStudents').add({ name: studentName.trim(), records: recordsToAdd });
      gid = gr.id;
      this.globalStudents.push({ id: gr.id, name: studentName.trim(), records: [...recordsToAdd] });
    }

    // ★ v9: Parallelize per-target student creation
    const addPromises = targets.map(t =>
      db.collection('academicYears').doc(yearId).collection('classes').doc(t.id).collection('students').add({
        studentNumber: studentNumber.trim(), studentName: studentName.trim(), globalStudentId: gid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(dr => ({ dr, t }))
    );
    const results = await Promise.all(addPromises);
    for (const { dr, t } of results) {
      t.students.push({ id: dr.id, studentNumber: studentNumber.trim(), studentName: studentName.trim(), globalStudentId: gid });
    }

    this.closeModal();
    const msg = targets.length > 1
      ? '學生「' + studentName.trim() + '」已新增(同步至 ' + targets.length + ' 個連結班別)'
      : '學生「' + studentName.trim() + '」已新增';
    this.addToast(msg, 'success');
  },

  async updateStudent() {
    const { id, studentNumber, studentName } = this.modalData;
    if (!studentNumber.trim() || !studentName.trim()) { this.addToast('請填寫學號和姓名', 'warning'); return; }
    const yearId = this.modalData.yearId || this.currentAcademicYearId;
    const classId = this.modalData.classId || this.currentClassId;
    const cls = this.getClassObj(yearId, classId);
    if (!cls) return;
    const origStu = cls.students.find(s => s.id === id);
    if (!origStu) return;
    const gid = origStu.globalStudentId;

    const targets = this._getLinkedClasses(yearId, cls);

    for (const t of targets) {
      const conflict = t.students.find(s => s.studentNumber === studentNumber.trim() && (gid ? s.globalStudentId !== gid : s.id !== id));
      if (conflict) {
        const typeLabel = t.classType === 'regular' ? '(一般班別)' : t.subject ? '(' + t.subject + ')' : '';
        this.addToast('班別「' + t.className + typeLabel + '」已有相同學號的其他學生', 'warning');
        return;
      }
    }

    // ★ v9: Parallelize target updates
    const updatePromises = [];
    const localUpdates = [];
    for (const t of targets) {
      let stuInTarget;
      if (t.id === classId) stuInTarget = origStu;
      else stuInTarget = gid ? t.students.find(s => s.globalStudentId === gid) : null;
      if (!stuInTarget) continue;
      updatePromises.push(
        db.collection('academicYears').doc(yearId).collection('classes').doc(t.id).collection('students').doc(stuInTarget.id).update({
          studentNumber: studentNumber.trim(), studentName: studentName.trim()
        })
      );
      localUpdates.push(stuInTarget);
    }
    await Promise.all(updatePromises);
    for (const s of localUpdates) {
      s.studentNumber = studentNumber.trim();
      s.studentName = studentName.trim();
    }

    if (gid) {
      try {
        await db.collection('globalStudents').doc(gid).update({ name: studentName.trim() });
        const gs = this.globalStudents.find(g => g.id === gid);
        if (gs) gs.name = studentName.trim();
      } catch (e) { /* silent */ }
    }

    this.closeModal();
    const msg = targets.length > 1
      ? '學生資料已更新(同步至 ' + targets.length + ' 個連結班別)'
      : '學生資料已更新';
    this.addToast(msg, 'success');
  },

  async deleteStudent(yearId, classId, studentId) {
    const cls = this.getClassObj(yearId, classId);
    if (!cls) return;
    const stu = cls.students.find(s => s.id === studentId);
    if (!stu) return;
    const gid = stu.globalStudentId;
    const targets = this._getLinkedClasses(yearId, cls);
    let count = 0;
    // ★ v9: Parallelize deletions
    const delPromises = [];
    const localRemovals = [];
    for (const t of targets) {
      let stuInTarget;
      if (t.id === classId) stuInTarget = stu;
      else stuInTarget = gid ? t.students.find(s => s.globalStudentId === gid) : null;
      if (!stuInTarget) continue;
      delPromises.push(db.collection('academicYears').doc(yearId).collection('classes').doc(t.id).collection('students').doc(stuInTarget.id).delete());
      localRemovals.push({ t, sid: stuInTarget.id });
      count++;
    }
    await Promise.all(delPromises);
    for (const { t, sid } of localRemovals) {
      t.students = t.students.filter(s => s.id !== sid);
    }
    const msg = count > 1 ? '學生已從 ' + count + ' 個連結班別中刪除' : '學生已刪除';
    this.addToast(msg, 'success');
  },

  async batchImportStudents() {
    const text = this.modalData.text || '';
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (!lines.length) { this.addToast('請輸入學生資料', 'warning'); return; }
    const yearId = this.modalData.yearId || this.currentAcademicYearId;
    const classId = this.modalData.classId || this.currentClassId;
    const cls = this.getClassObj(yearId, classId); if (!cls) { this.addToast('找不到班別', 'error'); return; }
    const targets = this._getLinkedClasses(yearId, cls);

    const students = [];
    for (const line of lines) {
      const parts = line.split(/[,,\t]/);
      if (parts.length < 2) { this.modalData.parseError = '格式錯誤:「' + line + '」'; return; }
      const num = parts[0].trim(), name = parts[1].trim();
      if (!num || !name) { this.modalData.parseError = '格式錯誤:「' + line + '」'; return; }
      for (const t of targets) {
        if (t.students.find(s => s.studentNumber === num)) {
          const typeLabel = t.classType === 'regular' ? '(一般班別)' : t.subject ? '(' + t.subject + ')' : '';
          this.modalData.parseError = '班別「' + t.className + typeLabel + '」已存在學號「' + num + '」';
          return;
        }
      }
      if (students.find(s => s.studentNumber === num)) {
        this.modalData.parseError = '輸入資料中有重複學號「' + num + '」';
        return;
      }
      students.push({ studentNumber: num, studentName: name });
    }

    const recordsForAll = targets.map(t => ({ academicYearId: yearId, classId: t.id }));
    // ★ v9: Parallelize all student creation
    const allPromises = [];
    const globalStudentResults = [];
    for (const s of students) {
      const p = db.collection('globalStudents').add({ name: s.studentName, records: recordsForAll })
        .then(gr => {
          globalStudentResults.push({ gr, s });
          return Promise.all(targets.map(t =>
            db.collection('academicYears').doc(yearId).collection('classes').doc(t.id).collection('students').add({
              studentNumber: s.studentNumber, studentName: s.studentName, globalStudentId: gr.id,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }).then(dr => ({ dr, t, s, gid: gr.id }))
          ));
        });
      allPromises.push(p);
    }
    const allResults = await Promise.all(allPromises);
    for (const { gr, s } of globalStudentResults) {
      this.globalStudents.push({ id: gr.id, name: s.studentName, records: [...recordsForAll] });
    }
    for (const resultArr of allResults) {
      for (const { dr, t, s, gid } of resultArr) {
        t.students.push({ id: dr.id, studentNumber: s.studentNumber, studentName: s.studentName, globalStudentId: gid });
      }
    }

    this.closeModal();
    const msg = targets.length > 1
      ? '已匯入 ' + students.length + ' 位學生至 ' + targets.length + ' 個連結班別'
      : '已匯入 ' + students.length + ' 位學生';
    this.addToast(msg, 'success');
  },

  openAddAssessmentModal(type, period, customCategoryId) {
    if (!this.gradesTerm) return;
    const term = this.gradesTerm; const all = term.assessments || [];
    let name = '';
    if (type === 'assignment') name = '課業' + (all.filter(a => a.type === 'assignment').length + 1);
    else if (type === 'quiz') name = '小測' + (all.filter(a => a.type === 'quiz').length + 1);
    else if (type === 'unified_test') name = '統測';
    else if (type === 'exam') name = '考試';
    else if (type === 'class_performance') name = period === 'exam' ? '考試期課堂表現' : '統測期課堂表現';
    else if (type === 'custom' && customCategoryId) {
      const cat = (this.currentClass.customCategories || []).find(c => c.id === customCategoryId);
      const count = all.filter(a => a.type === 'custom' && a.customCategoryId === customCategoryId).length;
      name = (cat ? cat.name : '自訂') + (count + 1);
    }
    this.openModal('addAssessment', {
      type, period: period || null, customCategoryId: customCategoryId || null,
      name, fullMark: 100, date: '', notes: '',
      hasSubItems: false, subItems: [],
      hasAdjustedPaper: false, adjustedMultiplier: 80, passingScore: 50,
      hasMultiplePapers: false, papers: [],
      yearId: this.currentAcademicYearId, classId: this.currentClassId, termId: this.gradesTermId
    });
  },

  async addAssessmentConfirm() {
    const { type, period, customCategoryId, name, fullMark, date, notes, yearId, classId, termId,
      hasSubItems, subItems,
      hasAdjustedPaper, adjustedMultiplier, passingScore,
      hasMultiplePapers, papers } = this.modalData;
    if (!name.trim()) { this.addToast('請輸入名稱', 'warning'); return; }
    const fm = parseInt(fullMark); if (isNaN(fm) || fm <= 0) { this.addToast('請輸入有效的滿分', 'warning'); return; }
    let finalSubItems = [];
    if (hasSubItems) {
      if (!subItems || subItems.length === 0) { this.addToast('請至少新增一個小項目', 'warning'); return; }
      for (const si of subItems) {
        if (!si.name || !si.name.trim()) { this.addToast('小項目必須有名稱', 'warning'); return; }
        const sfm = parseInt(si.fullMark);
        if (isNaN(sfm) || sfm <= 0) { this.addToast('小項目滿分無效', 'warning'); return; }
        finalSubItems.push({
          id: (si.id && !String(si.id).startsWith('new_')) ? si.id : ('si_' + Date.now() + '_' + Math.random().toString(36).substr(2,5)),
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
        finalPapers.push({
          id: (p.id && !String(p.id).startsWith('new_')) ? p.id : ('pap_' + Date.now() + '_' + Math.random().toString(36).substr(2,5)),
          name: p.name.trim(), fullMark: pfm, weight: pw, order: finalPapers.length
        });
      }
    }
    const cls = this.getClassObj(yearId, classId); const term = cls?.terms?.find(t => t.id === termId); if (!term) return;
    const order = Date.now();
    const data = {
      type, name: name.trim(), fullMark: fm, date: date || null, notes: (notes || '').trim(),
      includeInUT: true, includeInExam: true, scores: {}, order,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (type === 'assignment' || type === 'quiz' || type === 'custom') data.scoreCategory = 'none';
    if (type === 'class_performance') data.period = period;
    if (type === 'custom') data.customCategoryId = customCategoryId;
    if (hasSubItems && finalSubItems.length > 0) { data.hasSubItems = true; data.subItems = finalSubItems; data.subItemScores = {}; }
    if (type === 'exam') {
      if (hasAdjustedPaper) { data.hasAdjustedPaper = true; data.adjustedMultiplier = parseFloat(adjustedMultiplier) || 80; data.passingScore = parseFloat(passingScore) || 50; data.adjustedScores = {}; }
      if (hasMultiplePapers && finalPapers.length > 0) { data.hasMultiplePapers = true; data.papers = finalPapers; data.paperScores = {}; }
    }
    const dr = await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('terms').doc(termId).collection('assessments').add(data);
    if (!term.assessments) term.assessments = [];
    term.assessments.push({ id: dr.id, ...data, createdAt: new Date() });
    this.closeModal(); this.addToast('已新增「' + name.trim() + '」', 'success');
  },

  async updateAssessmentConfirm() {
    const { assessmentId, name, fullMark, date, notes, yearId, classId, termId,
      hasSubItems, subItems,
      hasAdjustedPaper, adjustedMultiplier, passingScore,
      hasMultiplePapers, papers } = this.modalData;
    if (!name.trim()) { this.addToast('請輸入名稱', 'warning'); return; }
    const fm = parseInt(fullMark);
    if (isNaN(fm) || fm <= 0) { this.addToast('請輸入有效的滿分', 'warning'); return; }

    const cls = this.getClassObj(yearId, classId);
    const term = cls?.terms?.find(t => t.id === termId);
    const a = term?.assessments?.find(a => a.id === assessmentId);
    if (!a) return;

    let finalSubItems = [];
    if (hasSubItems) {
      if (!subItems || subItems.length === 0) { this.addToast('請至少新增一個小項目', 'warning'); return; }
      for (const si of subItems) {
        if (!si.name || !si.name.trim()) { this.addToast('小項目必須有名稱', 'warning'); return; }
        const sfm = parseInt(si.fullMark);
        if (isNaN(sfm) || sfm <= 0) { this.addToast('小項目滿分無效', 'warning'); return; }
        finalSubItems.push({
          id: (si.id && !String(si.id).startsWith('new_')) ? si.id : ('si_' + Date.now() + '_' + Math.random().toString(36).substr(2,5)),
          name: si.name.trim(), fullMark: sfm, order: finalSubItems.length
        });
      }
    }

    let finalPapers = [];
    if (a.type === 'exam' && hasMultiplePapers) {
      if (!papers || papers.length === 0) { this.addToast('請至少新增一個分卷', 'warning'); return; }
      for (const p of papers) {
        if (!p.name || !p.name.trim()) { this.addToast('分卷必須有名稱', 'warning'); return; }
        const pfm = parseInt(p.fullMark);
        const pw = parseFloat(p.weight);
        if (isNaN(pfm) || pfm <= 0) { this.addToast('分卷滿分無效', 'warning'); return; }
        if (isNaN(pw) || pw < 0) { this.addToast('分卷權重無效', 'warning'); return; }
        finalPapers.push({
          id: (p.id && !String(p.id).startsWith('new_')) ? p.id : ('pap_' + Date.now() + '_' + Math.random().toString(36).substr(2,5)),
          name: p.name.trim(), fullMark: pfm, weight: pw, order: finalPapers.length
        });
      }
    }

    const wasSubItems = !!a.hasSubItems;
    const wasAdjustedPaper = !!a.hasAdjustedPaper;
    const wasMultiplePapers = !!a.hasMultiplePapers;

    a.name = name.trim();
    a.fullMark = fm;
    a.date = date || null;
    a.notes = (notes || '').trim();

    if (hasSubItems) {
      a.hasSubItems = true;
      a.subItems = finalSubItems;
      if (!a.subItemScores) a.subItemScores = {};
      const validIds = new Set(finalSubItems.map(si => si.id));
      for (const sid in a.subItemScores) {
        for (const siId in a.subItemScores[sid]) {
          if (!validIds.has(siId)) delete a.subItemScores[sid][siId];
        }
        if (Object.keys(a.subItemScores[sid]).length === 0) delete a.subItemScores[sid];
      }
      if (!wasSubItems) a.scores = {};
    } else if (wasSubItems) {
      a.hasSubItems = false;
      delete a.subItems;
      delete a.subItemScores;
      a.scores = {};
    }

    if (a.type === 'exam') {
      if (hasAdjustedPaper) {
        a.hasAdjustedPaper = true;
        a.adjustedMultiplier = parseFloat(adjustedMultiplier) || 80;
        a.passingScore = parseFloat(passingScore) || 50;
        if (!wasAdjustedPaper && !hasMultiplePapers) {
          a.adjustedScores = a.adjustedScores || {};
        }
      } else if (wasAdjustedPaper) {
        a.hasAdjustedPaper = false;
        delete a.adjustedMultiplier;
        delete a.passingScore;
        delete a.adjustedScores;
        if (!hasMultiplePapers && !hasSubItems) a.scores = {};
      }

      if (hasMultiplePapers) {
        a.hasMultiplePapers = true;
        a.papers = finalPapers;
        if (!a.paperScores) a.paperScores = {};
        const validIds = new Set(finalPapers.map(p => p.id));
        for (const sid in a.paperScores) {
          for (const pId in a.paperScores[sid]) {
            if (!validIds.has(pId)) delete a.paperScores[sid][pId];
          }
          if (Object.keys(a.paperScores[sid]).length === 0) delete a.paperScores[sid];
        }
        if (!wasMultiplePapers) a.scores = {};
      } else if (wasMultiplePapers) {
        a.hasMultiplePapers = false;
        delete a.papers;
        delete a.paperScores;
        if (!hasSubItems) a.scores = {};
      }
    }

    if (a.hasSubItems) {
      for (const sid in (a.subItemScores || {})) {
        this._gradesRecomputeSubItemTotal(a, sid);
      }
    }
    if (a.type === 'exam') {
      if (a.hasMultiplePapers) {
        for (const sid in (a.paperScores || {})) {
          this._gradesRecomputePaperTotal(a, sid);
        }
      } else if (a.hasAdjustedPaper) {
        for (const sid in (a.adjustedScores || {})) {
          this._gradesRecomputeExamAdjustedTotal(a, sid);
        }
      }
    }

    const updateData = {
      name: name.trim(),
      fullMark: fm,
      date: date || null,
      notes: (notes || '').trim(),
      scores: a.scores || {}
    };

    if (a.hasSubItems) {
      updateData.hasSubItems = true;
      updateData.subItems = a.subItems;
      updateData.subItemScores = a.subItemScores || {};
    } else if (wasSubItems) {
      updateData.hasSubItems = false;
      updateData.subItems = firebase.firestore.FieldValue.delete();
      updateData.subItemScores = firebase.firestore.FieldValue.delete();
    }

    if (a.type === 'exam') {
      if (a.hasAdjustedPaper) {
        updateData.hasAdjustedPaper = true;
        updateData.adjustedMultiplier = a.adjustedMultiplier;
        updateData.passingScore = a.passingScore;
        if (!a.hasMultiplePapers) {
          updateData.adjustedScores = a.adjustedScores || {};
        }
      } else if (wasAdjustedPaper) {
        updateData.hasAdjustedPaper = false;
        updateData.adjustedMultiplier = firebase.firestore.FieldValue.delete();
        updateData.passingScore = firebase.firestore.FieldValue.delete();
        updateData.adjustedScores = firebase.firestore.FieldValue.delete();
      }

      if (a.hasMultiplePapers) {
        updateData.hasMultiplePapers = true;
        updateData.papers = a.papers;
        updateData.paperScores = a.paperScores || {};
      } else if (wasMultiplePapers) {
        updateData.hasMultiplePapers = false;
        updateData.papers = firebase.firestore.FieldValue.delete();
        updateData.paperScores = firebase.firestore.FieldValue.delete();
      }
    }

    await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('terms').doc(termId).collection('assessments').doc(assessmentId).update(updateData);

    this.closeModal();
    this.addToast('已更新「' + name.trim() + '」', 'success');
  },

  async deleteAssessmentDoc(yearId, classId, termId, assessmentId) {
    await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('terms').doc(termId).collection('assessments').doc(assessmentId).delete();
    const cls = this.getClassObj(yearId, classId); const term = cls?.terms?.find(t => t.id === termId);
    if (term) term.assessments = term.assessments.filter(a => a.id !== assessmentId);
    this.gradesFocusRow = -1; this.gradesFocusCol = -1; this.addToast('已刪除評估項目', 'success');
  },

  async addCustomCategoryConfirm() {
    const { name, yearId, classId } = this.modalData;
    if (!name || !name.trim()) { this.addToast('請輸入類別名稱', 'warning'); return; }
    const cls = this.getClassObj(yearId, classId);
    if (!cls) return;
    if (!cls.customCategories) cls.customCategories = [];
    const catId = 'cc_' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
    const colorIdx = cls.customCategories.length % CUSTOM_CAT_COLORS.length;
    const newCat = { id: catId, name: name.trim(), colorKey: CUSTOM_CAT_COLORS[colorIdx].key, order: cls.customCategories.length };
    cls.customCategories.push(newCat);
    if (!cls.scoreConfig) cls.scoreConfig = JSON.parse(JSON.stringify(DEFAULT_SCORE_CONFIG));
    if (!cls.scoreConfig.ut.customCategories) cls.scoreConfig.ut.customCategories = {};
    if (!cls.scoreConfig.exam.a1Weights.customCategories) cls.scoreConfig.exam.a1Weights.customCategories = {};
    cls.scoreConfig.ut.customCategories[catId] = 0;
    cls.scoreConfig.exam.a1Weights.customCategories[catId] = 0;
    await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).update({
      customCategories: cls.customCategories,
      scoreConfig: cls.scoreConfig
    });
    // ★ v13: Sync local scoringWeightsLocal so UI reflects new category immediately
    if (this.currentAcademicYearId === yearId && this.currentClassId === classId) {
      this._scoringSkipWatch = true;
      if (!this.scoringWeightsLocal.ut.customCategories) this.scoringWeightsLocal.ut.customCategories = {};
      if (!this.scoringWeightsLocal.exam.a1Weights.customCategories) this.scoringWeightsLocal.exam.a1Weights.customCategories = {};
      this.scoringWeightsLocal.ut.customCategories[catId] = 0;
      this.scoringWeightsLocal.exam.a1Weights.customCategories[catId] = 0;
      this.$nextTick(() => { this._scoringSkipWatch = false; });
    }
    this.closeModal();
    this.addToast('已新增類別「' + name.trim() + '」', 'success');
  },

  async deleteCustomCategory(yearId, classId, categoryId) {
    const cls = this.getClassObj(yearId, classId);
    if (!cls) return;
    cls.customCategories = (cls.customCategories || []).filter(c => c.id !== categoryId);
    if (cls.scoreConfig?.ut?.customCategories) delete cls.scoreConfig.ut.customCategories[categoryId];
    if (cls.scoreConfig?.exam?.a1Weights?.customCategories) delete cls.scoreConfig.exam.a1Weights.customCategories[categoryId];
    // ★ v9: Parallelize assessment deletions
    const delPromises = [];
    for (const t of cls.terms || []) {
      const toDelete = (t.assessments || []).filter(a => a.type === 'custom' && a.customCategoryId === categoryId);
      for (const a of toDelete) {
        delPromises.push(db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('terms').doc(t.id).collection('assessments').doc(a.id).delete());
      }
      t.assessments = (t.assessments || []).filter(a => !(a.type === 'custom' && a.customCategoryId === categoryId));
    }
    await Promise.all(delPromises);
    await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).update({
      customCategories: cls.customCategories,
      scoreConfig: cls.scoreConfig
    });
    // ★ v13: Sync local scoringWeightsLocal
    if (this.currentAcademicYearId === yearId && this.currentClassId === classId) {
      this._scoringSkipWatch = true;
      if (this.scoringWeightsLocal.ut.customCategories) delete this.scoringWeightsLocal.ut.customCategories[categoryId];
      if (this.scoringWeightsLocal.exam.a1Weights.customCategories) delete this.scoringWeightsLocal.exam.a1Weights.customCategories[categoryId];
      this.$nextTick(() => { this._scoringSkipWatch = false; });
    }
    this.addToast('已刪除類別', 'success');
  },

  async handleDelete() {
    const { target, id, yearId, classId } = this.modalData;
    switch (target) {
      case 'year': await this.deleteAcademicYear(id); break;
      case 'class': await this.deleteClass(yearId, id); break;
      case 'student': await this.deleteStudent(yearId, classId, id); break;
      case 'assessment': await this.deleteAssessmentDoc(yearId, classId, this.modalData.termId, id); break;
      case 'customCategory': await this.deleteCustomCategory(yearId, classId, id); break;
    }
    this.closeModal();
  }
};