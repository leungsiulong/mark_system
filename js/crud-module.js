// ================================================================
// CRUD Operations (v13 — settings termDates/templates 保護；
//   新增評估非課業預設滿分讀 settings.defaultFullMark；模板刪除)
// ================================================================
const CrudMethods = {

  async loadAllData() {
    try {
      this.loading = true;
      this.loadingText = '正在連接伺服器...';
      this.loadingProgress = 5;

      this.loadingText = '正在載入基本資料...';
      // ★ v20: 第一階段（首屏必載）：settings、globalStudents（全量）、所有學年（含骨架）
      const [settingsSnap, yearsSnap, globalSnap] = await Promise.all([
        db.collection('settings').doc('main').get(),
        db.collection('academicYears').orderBy('createdAt', 'desc').get(),
        db.collection('globalStudents').get()
      ]);
      this.loadingProgress = 20;

      let lastSelectedYearId = null;
      if (settingsSnap.exists) {
        const d = settingsSnap.data();
        this.settings = { ...this.settings, ...d };
        // ★ 第六輪：結構保護，避免 v-model 綁定 termDates / templates 時出錯
        if (!this.settings.termDates || typeof this.settings.termDates !== 'object') this.settings.termDates = {};
        if (!Array.isArray(this.settings.templates)) this.settings.templates = [];
        if (d.themeColor) this.currentTheme = d.themeColor;
        if (d.tabOrder && Array.isArray(d.tabOrder)) {
          const valid = d.tabOrder.filter(k => ALL_TABS.find(t => t.key === k));
          ALL_TABS.forEach(t => { if (!valid.includes(t.key)) valid.push(t.key); });
          this.tabOrder = valid;
        }
        if (d.activeQuickNavKeys && Array.isArray(d.activeQuickNavKeys)) this.activeQuickNavKeys = d.activeQuickNavKeys;
        if (d.lastSelectedYearId) lastSelectedYearId = d.lastSelectedYearId; // ★ v20
      }

      // ★ v20: globalStudents 維持全量（資料量通常小，且連結 / 同名 / 未載入學年人數推導皆依賴它）
      this.globalStudents = globalSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (yearsSnap.docs.length === 0) {
        this.academicYears = [];
        this.loadingProgress = 100;
        this.loading = false;
        return;
      }

      // ★ v20: 第二階段 — 載入所有學年的「班別骨架」（classes 基本資料；不含 students/terms/assessments）
      this.loadingText = '正在載入班別資料...';
      const yearDocs = yearsSnap.docs;
      const classesPerYearPromises = yearDocs.map(yD =>
        db.collection('academicYears').doc(yD.id).collection('classes').orderBy('createdAt').get()
      );
      const classesPerYearSnaps = await Promise.all(classesPerYearPromises);
      this.loadingProgress = 45;

      const years = yearDocs.map((yD, i) => {
        // ★ v20: _loaded / _loading 為「學年完整載入」狀態旗標
        const year = { id: yD.id, ...yD.data(), classes: [], _loaded: false, _loading: false };
        const cs = classesPerYearSnaps[i];
        year.classes = cs.docs.map(cD => {
          const cls = { id: cD.id, ...cD.data(), students: [], terms: [], _yearId: yD.id };
          if (!cls.customCategories) cls.customCategories = [];
          if (!cls.assignmentCategories) cls.assignmentCategories = [];

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

      this.academicYears = years;

      // ★ v20: 決定「當前學年」：優先上次選取，否則最新（desc 第一筆）
      let initialYearId = (lastSelectedYearId && years.find(y => y.id === lastSelectedYearId))
        ? lastSelectedYearId : years[0].id;
      this.expandedYears = { [initialYearId]: true };

      // ★ v20: 第三階段 — 僅對「當前學年」執行完整載入（students / terms / assessments）
      this.loadingText = '正在載入當前學年詳細資料...';
      this.loadingProgress = 60;
      await this.loadYearData(initialYearId);
      this.loadingProgress = 95;

      // ★ v20: 設定當前學年（跳過此次 lastSelectedYearId 的重複寫入）
      this._skipYearWatchSave = true;
      this.currentAcademicYearId = initialYearId;

      this.loadingText = '完成';
      this.loadingProgress = 100;

      setTimeout(() => { this.loading = false; }, 150);
    } catch (err) {
      console.error(err); this.error = err.message; this.loading = false;
      this.addToast('載入數據失敗:' + err.message, 'error');
    }
  },

  // ★ v20: 完整載入指定學年（students / terms / assessments）。防重入 + 並發共享 promise。
  loadYearData(yearId) {
    const year = this.academicYears.find(y => y.id === yearId);
    if (!year) return Promise.resolve();
    if (year._loaded) return Promise.resolve();
    if (!this._yearLoadPromises) this._yearLoadPromises = {};
    if (this._yearLoadPromises[yearId]) return this._yearLoadPromises[yearId];
    const p = this._doLoadYearData(year, yearId)
      .catch(err => {
        console.error('loadYearData failed:', yearId, err);
        this.addToast('載入學年資料失敗：' + err.message, 'error');
        throw err;
      })
      .finally(() => { if (this._yearLoadPromises) delete this._yearLoadPromises[yearId]; });
    this._yearLoadPromises[yearId] = p;
    return p;
  },

  async _doLoadYearData(year, yearId) {
    year._loading = true;
    try {
      const classes = year.classes || [];
      if (classes.length === 0) { year._loaded = true; return; }

      const studentsPromises = classes.map(cls =>
        db.collection('academicYears').doc(yearId).collection('classes').doc(cls.id)
          .collection('students').orderBy('studentNumber').get()
      );
      const termsPromises = classes.map(cls =>
        db.collection('academicYears').doc(yearId).collection('classes').doc(cls.id)
          .collection('terms').get()
      );
      const [studentsSnaps, termsSnaps] = await Promise.all([
        Promise.all(studentsPromises),
        Promise.all(termsPromises)
      ]);

      classes.forEach((cls, i) => {
        cls.students = studentsSnaps[i].docs.map(d => ({ id: d.id, ...d.data() }));
        cls.terms = termsSnaps[i].docs.map(tD => ({
          id: tD.id, ...tD.data(), assessments: [], _classId: cls.id, _yearId: yearId
        }));
      });

      const allTerms = [];
      classes.forEach(cls => cls.terms.forEach(t => allTerms.push(t)));

      if (allTerms.length > 0) {
        const assessmentsPromises = allTerms.map(t =>
          db.collection('academicYears').doc(yearId).collection('classes').doc(t._classId)
            .collection('terms').doc(t.id).collection('assessments').orderBy('order').get()
        );
        const assessmentsSnaps = await Promise.all(assessmentsPromises);
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
          delete t._classId;
          delete t._yearId;
        });
      }

      year._loaded = true;

      // ★ v20: 若剛載入的正是目前選取中的學年與班別，補跑相依初始化
      // （避免在骨架狀態下 gradesTermId / scoringWeights 被設成空值）
      if (yearId === this.currentAcademicYearId && this.currentClassId) {
        this.$nextTick(() => {
          this.gradesAutoSelectTerm();
          this.initScoringWeights();
          if (this.currentView === 'analysis') setTimeout(() => this.analysisRenderAllCharts(), 80);
        });
      }
    } finally {
      year._loading = false;
    }
  },

  // ★ v20: 確保「單一學年」已完整載入（附 UI 載入狀態）
  async ensureYearLoaded(yearId) {
    const year = this.academicYears.find(y => y.id === yearId);
    if (!year || year._loaded) return;
    this.yearLoading = true;
    this.yearLoadingText = '正在載入「' + (year.name || '學年') + '」資料...';
    try { await this.loadYearData(yearId); }
    catch (e) { /* toast 已於 loadYearData 顯示，保留可重試 */ }
    finally { this.yearLoading = false; }
  },

  // ★ v20: 確保「指定多個學年」已載入（跨學年分析按需只載相關學年）
  async ensureYearsLoaded(yearIds) {
    const ids = [...new Set(yearIds || [])].filter(id => {
      const y = this.academicYears.find(yy => yy.id === id);
      return y && !y._loaded;
    });
    if (!ids.length) return;
    this.yearLoading = true;
    this.yearLoadingText = '正在載入跨學年資料...';
    try { for (const id of ids) await this.loadYearData(id); }
    catch (e) { /* 個別錯誤已 toast */ }
    finally { this.yearLoading = false; }
  },

  // ★ v20: 確保「所有」學年皆已完整載入（供需要全量資料的功能，例如批次3資料備份匯出）
  async ensureAllYearsLoaded() {
    const unloaded = this.academicYears.filter(y => !y._loaded);
    if (!unloaded.length) return;
    this.yearLoading = true;
    try {
      for (const y of unloaded) {
        this.yearLoadingText = '正在準備備份資料… 載入「' + (y.name || '學年') + '」';
        await this.loadYearData(y.id);
      }
    } catch (e) { /* 個別錯誤已 toast */ }
    finally { this.yearLoading = false; }
  },

  _getLinkedClasses(yearId, cls) {
    const year = this.academicYears.find(y => y.id === yearId);
    if (!year) return [cls];
    const type = cls.classType || 'regular';
    if (type === 'elective') return [cls];
    return year.classes.filter(c => c.className === cls.className &&
      (c.classType === 'regular' || c.classType === 'subject'));
  },

  // ★ v13: create (or reuse by name) an assignment category on a class
  async _ensureAssignmentCategory(yearId, classId, name) {
    const cls = this.getClassObj(yearId, classId);
    if (!cls) return null;
    if (!cls.assignmentCategories) cls.assignmentCategories = [];
    const existing = cls.assignmentCategories.find(c => c.name === name);
    if (existing) return existing.id;
    const catId = 'ac_' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
    cls.assignmentCategories.push({ id: catId, name, order: cls.assignmentCategories.length });
    try {
      await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).update({
        assignmentCategories: cls.assignmentCategories
      });
    } catch (e) { console.error('save assignment category failed', e); }
    return catId;
  },

  async addAcademicYear() {
    const name = (this.modalData.name || '').trim();
    if (!name) { this.addToast('請輸入學年名稱', 'warning'); return; }
    const dr = await db.collection('academicYears').add({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    // ★ v20: 新建空學年無需懶載入 → 直接標記為已載入
    this.academicYears.unshift({ id: dr.id, name, createdAt: new Date(), classes: [], _loaded: true, _loading: false });
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
    // ★ v20: 刪除前確保該學年已完整載入，避免漏刪未載入的 students / assessments
    await this.ensureYearLoaded(yearId);
    const deletionPromises = [];
    for (const cls of year.classes) {
      for (const s of cls.students) deletionPromises.push(db.collection('academicYears').doc(yearId).collection('classes').doc(cls.id).collection('students').doc(s.id).delete());
      for (const t of cls.terms || []) {
        for (const a of t.assessments || []) deletionPromises.push(db.collection('academicYears').doc(yearId).collection('classes').doc(cls.id).collection('terms').doc(t.id).collection('assessments').doc(a.id).delete());
      }
    }
    await Promise.all(deletionPromises);
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
      assignmentCategories: [],
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
      classType: type, scoreConfig: dc, customCategories: [], assignmentCategories: [], createdAt: new Date(),
      students: [],
      terms: terms
    };
    year.classes.push(nc);

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
        assignmentCategories: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      const cr = db.collection('academicYears').doc(yearId).collection('classes').doc(dr.id);

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
        assignmentCategories: [],
        createdAt: new Date(),
        students: [],
        terms: [
          { id: t1.id, name: '上學期', assessments: [] },
          { id: t2.id, name: '下學期', assessments: [] }
        ]
      };
      year.classes.push(nc);

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
    // ★ v20: 確保學年完整載入再刪除（避免漏刪 students / assessments）
    await this.ensureYearLoaded(yearId);

    const targets = [cls];
    if (cls.classType === 'regular') {
      const linked = year.classes.filter(c =>
        c.id !== cls.id && c.className === cls.className && c.classType === 'subject');
      targets.push(...linked);
    }

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

    const termDeletions = [];
    for (const t of targets) {
      for (const term of t.terms || []) {
        termDeletions.push(db.collection('academicYears').doc(yearId).collection('classes').doc(t.id).collection('terms').doc(term.id).delete());
      }
    }
    await Promise.all(termDeletions);

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

  // ★ 第六輪：name default blank（teacher input）；課業預設 10，其他類型讀 settings.defaultFullMark
  openAddAssessmentModal(type, period, customCategoryId) {
    if (!this.gradesTerm) return;
    this.openModal('addAssessment', {
      type, period: period || null, customCategoryId: customCategoryId || null,
      name: '',
      fullMark: type === 'assignment' ? 10 : this.getDefaultFullMark(),
      date: '', notes: '',
      assignmentCategoryId: '', _newAsgCatName: '',
      hasSubItems: false, subItems: [],
      hasAdjustedPaper: false, adjustedMultiplier: 80, passingScore: 50,
      fullMarkS2: '',
      hasMultiplePapers: false, papers: [],
      yearId: this.currentAcademicYearId, classId: this.currentClassId, termId: this.gradesTermId
    });
  },

  async addAssessmentConfirm() {
    const { type, period, customCategoryId, fullMark, date, notes, yearId, classId, termId,
      hasSubItems, subItems,
      hasAdjustedPaper, adjustedMultiplier, passingScore, fullMarkS2,
      hasMultiplePapers, papers } = this.modalData;

    const cls = this.getClassObj(yearId, classId);
    const term = cls?.terms?.find(t => t.id === termId);
    if (!term) { this.addToast('找不到學期', 'error'); return; }

    // ★ v11: name can be blank → auto-generate
    let aName = (this.modalData.name || '').trim();
    if (!aName) {
      const all = term.assessments || [];
      if (type === 'assignment') aName = '課業' + (all.filter(a => a.type === 'assignment').length + 1);
      else if (type === 'quiz') aName = '小測' + (all.filter(a => a.type === 'quiz').length + 1);
      else if (type === 'unified_test') aName = '統測';
      else if (type === 'exam') aName = '考試';
      else if (type === 'class_performance') aName = period === 'exam' ? '考試期課堂表現' : '統測期課堂表現';
      else if (type === 'custom' && customCategoryId) {
        const cat = (cls.customCategories || []).find(c => c.id === customCategoryId);
        aName = (cat ? cat.name : '自訂') + (all.filter(a => a.type === 'custom' && a.customCategoryId === customCategoryId).length + 1);
      } else aName = '項目';
    }

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
        const paperObj = {
          id: (p.id && !String(p.id).startsWith('new_')) ? p.id : ('pap_' + Date.now() + '_' + Math.random().toString(36).substr(2,5)),
          name: p.name.trim(), fullMark: pfm, weight: pw, order: finalPapers.length
        };
        const pfmS2 = parseFloat(p.fullMarkS2);
        if (hasAdjustedPaper && !isNaN(pfmS2) && pfmS2 > 0 && pfmS2 !== pfm) {
          paperObj.fullMarkS2 = pfmS2;
        }
        finalPapers.push(paperObj);
      }
    }

    // ★ v13: resolve assignment category (supports inline-created category)
    let asgCatId = null;
    if (type === 'assignment') {
      asgCatId = this.modalData.assignmentCategoryId || null;
      if (asgCatId === '__new__') {
        const nm = (this.modalData._newAsgCatName || '').trim();
        asgCatId = nm ? await this._ensureAssignmentCategory(yearId, classId, nm) : null;
      }
    }

    const order = Date.now();
    const data = {
      type, name: aName, fullMark: fm, date: date || null, notes: (notes || '').trim(),
      includeInUT: true, includeInExam: true, scores: {}, order,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (type === 'assignment' || type === 'quiz' || type === 'custom') data.scoreCategory = 'none';
    if (type === 'class_performance') data.period = period;
    if (type === 'custom') data.customCategoryId = customCategoryId;
    if (type === 'assignment' && asgCatId) data.assignmentCategoryId = asgCatId;
    if (hasSubItems && finalSubItems.length > 0) { data.hasSubItems = true; data.subItems = finalSubItems; data.subItemScores = {}; }
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
    const dr = await db.collection('academicYears').doc(yearId).collection('classes').doc(classId).collection('terms').doc(termId).collection('assessments').add(data);
    if (!term.assessments) term.assessments = [];
    term.assessments.push({ id: dr.id, ...data, createdAt: new Date() });
    this.closeModal(); this.addToast('已新增「' + aName + '」', 'success');
  },

  async updateAssessmentConfirm() {
    const { assessmentId, name, fullMark, date, notes, yearId, classId, termId,
      hasSubItems, subItems,
      hasAdjustedPaper, adjustedMultiplier, passingScore, fullMarkS2,
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
        const paperObj = {
          id: (p.id && !String(p.id).startsWith('new_')) ? p.id : ('pap_' + Date.now() + '_' + Math.random().toString(36).substr(2,5)),
          name: p.name.trim(), fullMark: pfm, weight: pw, order: finalPapers.length
        };
        const pfmS2 = parseFloat(p.fullMarkS2);
        if (hasAdjustedPaper && !isNaN(pfmS2) && pfmS2 > 0 && pfmS2 !== pfm) {
          paperObj.fullMarkS2 = pfmS2;
        }
        finalPapers.push(paperObj);
      }
    }

    const wasSubItems = !!a.hasSubItems;
    const wasAdjustedPaper = !!a.hasAdjustedPaper;
    const wasMultiplePapers = !!a.hasMultiplePapers;

    a.name = name.trim();
    a.fullMark = fm;
    a.date = date || null;
    a.notes = (notes || '').trim();

    // ★ v13: assignment category update
    if (a.type === 'assignment') {
      let asgCatId = this.modalData.assignmentCategoryId || null;
      if (asgCatId === '__new__') {
        const nm = (this.modalData._newAsgCatName || '').trim();
        asgCatId = nm ? await this._ensureAssignmentCategory(yearId, classId, nm) : null;
      }
      if (asgCatId) a.assignmentCategoryId = asgCatId;
      else delete a.assignmentCategoryId;
    }

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
        const fmS2Val = parseFloat(fullMarkS2);
        if (!hasMultiplePapers && !isNaN(fmS2Val) && fmS2Val > 0 && fmS2Val !== fm) {
          a.fullMarkS2 = fmS2Val;
        } else {
          delete a.fullMarkS2;
        }
        if (!wasAdjustedPaper && !hasMultiplePapers) {
          a.adjustedScores = a.adjustedScores || {};
        }
      } else if (wasAdjustedPaper) {
        a.hasAdjustedPaper = false;
        delete a.adjustedMultiplier;
        delete a.passingScore;
        delete a.fullMarkS2;
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

    // ★ v13: persist assignment category
    if (a.type === 'assignment') {
      if (a.assignmentCategoryId) updateData.assignmentCategoryId = a.assignmentCategoryId;
      else updateData.assignmentCategoryId = firebase.firestore.FieldValue.delete();
    }

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
        if (a.fullMarkS2 != null) updateData.fullMarkS2 = a.fullMarkS2;
        else updateData.fullMarkS2 = firebase.firestore.FieldValue.delete();
        if (!a.hasMultiplePapers) {
          updateData.adjustedScores = a.adjustedScores || {};
        }
      } else if (wasAdjustedPaper) {
        updateData.hasAdjustedPaper = false;
        updateData.adjustedMultiplier = firebase.firestore.FieldValue.delete();
        updateData.passingScore = firebase.firestore.FieldValue.delete();
        updateData.fullMarkS2 = firebase.firestore.FieldValue.delete();
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
      case 'template': await this.deleteTemplate(id); break; // ★ 第六輪
    }
    this.closeModal();
  }
};