// ================================================================
// Scoring Module (v4 — Total Score Calculation Engine)
// ================================================================
const ScoringMethods = {
  scoringSetSubTab(tab) { this.scoringSubTab = tab; },
  scoringToggleAccordion(key) { this.scoringAccordion = { ...this.scoringAccordion, [key]: !this.scoringAccordion[key] }; },

  initScoringWeights() {
    this._scoringSkipWatch = true;
    const cls = this.currentClass;
    if (!cls) { this.$nextTick(() => { this._scoringSkipWatch = false; }); return; }
    const sc = cls.scoreConfig || {};
    this.scoringWeightsLocal = {
      ut: { assignment: sc.ut?.assignment ?? 20, quiz: sc.ut?.quiz ?? 20, unifiedTest: sc.ut?.unifiedTest ?? 40, classPerformance: sc.ut?.classPerformance ?? 20 },
      exam: {
        a1Ratio: sc.exam?.a1Ratio ?? (sc.exam?.normalRatio ?? 30),
        a2Ratio: sc.exam?.a2Ratio ?? (sc.exam?.examRatio ?? 70),
        a1Weights: {
          assignment: sc.exam?.a1Weights?.assignment ?? 6,
          quiz: sc.exam?.a1Weights?.quiz ?? 6,
          unifiedTest: sc.exam?.a1Weights?.unifiedTest ?? 12,
          classPerformance: sc.exam?.a1Weights?.classPerformance ?? 6
        }
      },
      yearly: {
        t1Weight: sc.yearly?.t1Weight ?? 40,
        t2Weight: sc.yearly?.t2Weight ?? 60
      }
    };
    this.$nextTick(() => { this._scoringSkipWatch = false; });
  },

  scoringDebouncedAutoSave() {
    if (this._scoringSaveTimer) clearTimeout(this._scoringSaveTimer);
    this._scoringSaveTimer = setTimeout(async () => {
      if (!this.scoringConfigValid || !this.currentAcademicYearId || !this.currentClassId) return;
      const w = this.scoringWeightsLocal;
      const config = { ut:{...w.ut}, exam:{a1Ratio:w.exam.a1Ratio, a2Ratio:w.exam.a2Ratio, a1Weights:{...w.exam.a1Weights}}, yearly:{t1Weight:w.yearly.t1Weight, t2Weight:w.yearly.t2Weight} };
      try {
        await db.collection('academicYears').doc(this.currentAcademicYearId).collection('classes').doc(this.currentClassId).update({ scoreConfig: config });
        if (this.currentClass) this.currentClass.scoreConfig = config;
        this.scoringSaveStatus = 'saved';
        setTimeout(() => { if (this.scoringSaveStatus === 'saved') this.scoringSaveStatus = ''; }, 2000);
      } catch (e) { console.error('Auto-save scoring config failed:', e); }
    }, 1500);
  },

  async saveScoringConfig() {
    if (!this.currentAcademicYearId || !this.currentClassId) return;
    if (!this.scoringConfigValid) { this.addToast('請修正權重設定錯誤後再儲存', 'warning'); return; }
    const w = this.scoringWeightsLocal;
    const config = { ut:{...w.ut}, exam:{a1Ratio:w.exam.a1Ratio, a2Ratio:w.exam.a2Ratio, a1Weights:{...w.exam.a1Weights}}, yearly:{t1Weight:w.yearly.t1Weight, t2Weight:w.yearly.t2Weight} };
    try {
      await db.collection('academicYears').doc(this.currentAcademicYearId).collection('classes').doc(this.currentClassId).update({ scoreConfig: config });
      if (this.currentClass) this.currentClass.scoreConfig = config;
      this.addToast('計分設定已儲存', 'success');
    } catch (e) { this.addToast('儲存失敗：' + e.message, 'error'); }
  },

  async scoringSetCategory(assessment, category) {
    if (!assessment) return;
    const old = assessment.scoreCategory || 'none';
    if (old === category) return;
    assessment.scoreCategory = category;
    // Find term id for this assessment
    let termId = this.gradesTermId;
    if (!termId && this.currentClass) {
      for (const t of this.currentClass.terms || []) {
        if ((t.assessments || []).find(a => a.id === assessment.id)) { termId = t.id; break; }
      }
    }
    if (!termId) return;
    try {
      await db.collection('academicYears').doc(this.currentAcademicYearId).collection('classes').doc(this.currentClassId).collection('terms').doc(termId).collection('assessments').doc(assessment.id).update({ scoreCategory: category });
    } catch (e) { assessment.scoreCategory = old; this.addToast('更新失敗', 'error'); }
  },

  scoringSegTransform(category) {
    const idx = (category||'none') === 'ut' ? 0 : (category||'none') === 'exam' ? 1 : 2;
    return 'translateX(' + (idx * 100) + '%)';
  },

  // === Calculation Helpers ===
  _calcAvgPct(assessments, sid) {
    let sS = 0, fS = 0;
    for (const a of assessments) { const s = (a.scores||{})[sid]; if (s != null && s !== '') { const n = parseFloat(s); if (!isNaN(n)) { sS += n; fS += a.fullMark; } } }
    return fS > 0 ? (sS / fS * 100) : null;
  },
  _calcSinglePct(a, sid) {
    if (!a) return null; const s = (a.scores||{})[sid]; if (s == null || s === '') return null;
    const n = parseFloat(s); return isNaN(n) ? null : (n / a.fullMark * 100);
  },

  scoringCalcA3(sid, term) {
    if (!term) return { a3: null, d: null };
    const w = this.scoringWeightsLocal.ut;
    const aa = term.assessments || [];
    const utA = aa.filter(a => a.type === 'assignment' && (a.scoreCategory||'none') === 'ut');
    const utQ = aa.filter(a => a.type === 'quiz' && (a.scoreCategory||'none') === 'ut');
    const utI = aa.find(a => a.type === 'unified_test');
    const cpI = aa.find(a => a.type === 'class_performance' && a.period !== 'exam');
    const aP = this._calcAvgPct(utA, sid), qP = this._calcAvgPct(utQ, sid);
    const uP = this._calcSinglePct(utI, sid), cP = this._calcSinglePct(cpI, sid);
    if (w.unifiedTest > 0 && utI && uP === null) return { a3: null, d: { aP, qP, uP, cP, comps: [] } };
    let t = 0; const comps = [];
    const add = (l, v, wt) => { const val = v ?? 0; const c = val * wt / 100; t += c; comps.push({ label: l, value: val, weight: wt, contrib: c }); };
    if (w.assignment > 0) add('課業均分', aP, w.assignment);
    if (w.quiz > 0) add('小測均分', qP, w.quiz);
    if (w.unifiedTest > 0) add('統測分', uP, w.unifiedTest);
    if (w.classPerformance > 0) add('課堂表現', cP, w.classPerformance);
    return { a3: Math.round(t), d: { aP, qP, uP, cP, comps, raw: t } };
  },

  scoringCalcExam(sid, term, a3) {
    if (!term) return { a1: null, a2: null, total: null, d: null };
    const ec = this.scoringWeightsLocal.exam;
    const aa = term.assessments || [];
    const exA = aa.filter(a => a.type === 'assignment' && (a.scoreCategory||'none') === 'exam');
    const exQ = aa.filter(a => a.type === 'quiz' && (a.scoreCategory||'none') === 'exam');
    const exI = aa.find(a => a.type === 'exam');
    const cpI = aa.find(a => a.type === 'class_performance' && a.period === 'exam');
    const aP = this._calcAvgPct(exA, sid), qP = this._calcAvgPct(exQ, sid);
    const cP = this._calcSinglePct(cpI, sid), eP = this._calcSinglePct(exI, sid);
    let a1 = null, a1C = [];
    if (a3 !== null) {
      const w2 = ec.a1Weights; a1 = 0;
      const av = aP ?? 0, qv = qP ?? 0, cv = cP ?? 0;
      a1 += av * w2.assignment / 100; a1 += qv * w2.quiz / 100;
      a1 += a3 * w2.unifiedTest / 100; a1 += cv * w2.classPerformance / 100;
      a1C = [
        { label:'課業均分', value:av, weight:w2.assignment, contrib:av*w2.assignment/100 },
        { label:'小測均分', value:qv, weight:w2.quiz, contrib:qv*w2.quiz/100 },
        { label:'A3 統測', value:a3, weight:w2.unifiedTest, contrib:a3*w2.unifiedTest/100 },
        { label:'課堂表現', value:cv, weight:w2.classPerformance, contrib:cv*w2.classPerformance/100 }
      ];
    }
    let a2 = null;
    if (ec.a2Ratio > 0 && exI && eP !== null) a2 = eP * ec.a2Ratio / 100;
    if (ec.a2Ratio > 0 && exI && eP === null) return { a1, a2: null, total: null, d: { aP, qP, cP, eP, a1C, a3 } };
    let total = null;
    if (a1 !== null && a2 !== null) total = a1 + a2;
    else if (a1 !== null && (!exI || ec.a2Ratio === 0)) total = a1;
    else if (a2 !== null && ec.a1Ratio === 0) total = a2;
    return { a1, a2, total, d: { aP, qP, cP, eP, a1C, a3 } };
  },

  scoringBuildA3Tip(row) {
    if (row.a3 === null) return '';
    const d = row._a3d; if (!d || !d.comps || !d.comps.length) return '';
    let t = 'A3 統測總分 = ' + row.a3 + '\n─────────────\n';
    for (const c of d.comps) t += c.label + '：' + c.value.toFixed(1) + ' × ' + c.weight + '% = ' + c.contrib.toFixed(1) + '\n';
    t += '─────────────\n合計：' + d.raw.toFixed(1) + ' → 四捨五入 → ' + row.a3;
    return t;
  },

  scoringBuildExamTip(row) {
    if (row.examTotal === null) return '';
    const d = row._examd; if (!d) return '';
    let t = '考試總分 = ' + row.examTotal.toFixed(1) + '\n─────────────\n';
    t += 'A1 常分 = ' + (row.a1 !== null ? row.a1.toFixed(1) : '--') + '\n';
    if (d.a1C && d.a1C.length) for (const c of d.a1C) t += '  ' + c.label + '：' + (Number.isInteger(c.value) ? String(c.value) : c.value.toFixed(1)) + ' × ' + c.weight + '% = ' + c.contrib.toFixed(2) + '\n';
    t += '\nA2 考試分 = ' + (row.a2 !== null ? row.a2.toFixed(1) : '--') + '\n';
    if (d.eP !== null && row.a2 !== null) t += '  考試卷：' + d.eP.toFixed(1) + ' × ' + this.scoringWeightsLocal.exam.a2Ratio + '% = ' + row.a2.toFixed(2) + '\n';
    t += '─────────────\n合計：' + (row.a1 !== null ? row.a1.toFixed(2) : '--') + ' + ' + (row.a2 !== null ? row.a2.toFixed(2) : '--') + ' = ' + row.examTotal.toFixed(1);
    return t;
  },

  scoringShowTooltip(ev, text) { if (!text) return; const r = ev.target.getBoundingClientRect(); this.scoringTooltip = { text, x: r.left + r.width / 2, y: r.top - 8 }; },
  scoringHideTooltip() { this.scoringTooltip = null; },
  scoringSelectAllCopyColumns() { this.scoringCopyColumns = { a3:true, a1:true, a2:true, examTotal:true }; },

  scoringCopyResults() {
    const data = this.scoringResultsData;
    if (!data.length) { this.addToast('無數據可複製','warning'); return; }
    const cols = this.scoringCopyColumns;
    let hdr = ['學號','姓名'];
    if (cols.a3) hdr.push('A3 統測總分'); if (cols.a1) hdr.push('A1 常分');
    if (cols.a2) hdr.push('A2 考試分'); if (cols.examTotal) hdr.push('考試總分');
    let text = hdr.join('\t') + '\n';
    for (const r of data) {
      let row = [r.studentNumber, r.studentName];
      if (cols.a3) row.push(r.a3 !== null ? String(r.a3) : '--');
      if (cols.a1) row.push(r.a1 !== null ? r.a1.toFixed(1) : '--');
      if (cols.a2) row.push(r.a2 !== null ? r.a2.toFixed(1) : '--');
      if (cols.examTotal) row.push(r.examTotal !== null ? r.examTotal.toFixed(1) : '--');
      text += row.join('\t') + '\n';
    }
    navigator.clipboard.writeText(text).then(() => { this.addToast('已複製到剪貼簿','success'); this.scoringCopyMenuOpen = false; }).catch(() => this.addToast('複製失敗','error'));
  },

  scoringCopyReport() {
    const data = this.scoringReportSortedData;
    if (!data.length) { this.addToast('無數據可複製','warning'); return; }
    let text = '排名\t學號\t姓名\tT1A3\tT1考試總分\tT2A3\tT2考試總分\t全年總分\t全年排名\n';
    for (const r of data) {
      text += [r.rank??'--', r.studentNumber, r.studentName, r.t1a3!==null?String(r.t1a3):'--', r.t1ExamTotal!==null?r.t1ExamTotal.toFixed(1):'--', r.t2a3!==null?String(r.t2a3):'--', r.t2ExamTotal!==null?r.t2ExamTotal.toFixed(1):'--', r.yearlyTotal!==null?r.yearlyTotal.toFixed(1):'--', r.yearlyRank??'--'].join('\t') + '\n';
    }
    navigator.clipboard.writeText(text).then(() => this.addToast('已複製到剪貼簿','success')).catch(() => this.addToast('複製失敗','error'));
  },

  scoringSortReport(key) {
    if (this.scoringReportSortKey === key) this.scoringReportSortAsc = !this.scoringReportSortAsc;
    else { this.scoringReportSortKey = key; this.scoringReportSortAsc = key === 'studentNumber'; }
  },

  exportCSV() {
    if (!this.gradesTerm || !this.gradesSortedStudents.length) { this.addToast('無數據可匯出','warning'); return; }
    const ord = this.gradesOrderedAssessments, stu = this.gradesSortedStudents;
    let csv = '\uFEFF學號,姓名';
    for (const a of ord) csv += ',' + a.name + '(' + a.fullMark + ')';
    csv += '\n';
    for (const s of stu) { csv += s.studentNumber + ',' + s.studentName; for (const a of ord) { const sc = (a.scores||{})[s.id]; csv += ',' + (sc != null ? sc : ''); } csv += '\n'; }
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url;
    const cls = this.currentClass;
    link.download = (cls ? cls.className+'_'+cls.subject : '成績') + '_' + (this.gradesTerm ? this.gradesTerm.name : '') + '.csv';
    link.click(); URL.revokeObjectURL(url); this.addToast('CSV 已匯出','success');
  }
};

const ScoringComputed = {
  scoringUTWeightTotal() { const w=this.scoringWeightsLocal.ut; return (w.assignment||0)+(w.quiz||0)+(w.unifiedTest||0)+(w.classPerformance||0); },
  scoringA1A2WeightTotal() { return (this.scoringWeightsLocal.exam.a1Ratio||0)+(this.scoringWeightsLocal.exam.a2Ratio||0); },
  scoringA1InternalTotal() { const w=this.scoringWeightsLocal.exam.a1Weights; return (w.assignment||0)+(w.quiz||0)+(w.unifiedTest||0)+(w.classPerformance||0); },
  scoringYearlyWeightTotal() { return (this.scoringWeightsLocal.yearly.t1Weight||0)+(this.scoringWeightsLocal.yearly.t2Weight||0); },
  scoringExamWeightTotal() { return this.scoringA1A2WeightTotal; },
  scoringConfigValid() {
    return this.scoringUTWeightTotal === 100 && this.scoringA1A2WeightTotal === 100 &&
      this.scoringA1InternalTotal === this.scoringWeightsLocal.exam.a1Ratio && this.scoringYearlyWeightTotal === 100;
  },
  scoringAssignmentsAndQuizzes() {
    if (!this.gradesTerm) return [];
    return (this.gradesTerm.assessments || []).filter(a => a.type === 'assignment' || a.type === 'quiz')
      .sort((a, b) => { const o = { assignment:0, quiz:1 }; if (o[a.type] !== o[b.type]) return o[a.type]-o[b.type]; return (a.order||0)-(b.order||0); });
  },
  scoringResultsData() {
    const term = this.gradesTerm; if (!term) return [];
    return this.gradesSortedStudents.map(s => {
      const r3 = this.scoringCalcA3(s.id, term);
      const rE = this.scoringCalcExam(s.id, term, r3.a3);
      const row = {
        studentId:s.id, studentNumber:s.studentNumber, studentName:s.studentName,
        utAssignAvg:r3.d?.aP??null, utQuizAvg:r3.d?.qP??null, utScore:r3.d?.uP??null, utCpScore:r3.d?.cP??null,
        a3:r3.a3, examAssignAvg:rE.d?.aP??null, examQuizAvg:rE.d?.qP??null, examCpScore:rE.d?.cP??null,
        a1:rE.a1, a2:rE.a2, examTotal:rE.total, _a3d:r3.d, _examd:rE.d
      };
      row.a3Tooltip = this.scoringBuildA3Tip(row);
      row.examTotalTooltip = this.scoringBuildExamTip(row);
      return row;
    });
  },
  scoringResultStats() {
    const data = this.scoringResultsData;
    const fields = ['utAssignAvg','utQuizAvg','utScore','utCpScore','a3','examAssignAvg','examQuizAvg','examCpScore','a1','a2','examTotal'];
    const stats = {};
    for (const f of fields) {
      const vals = data.map(r=>r[f]).filter(v=>v!==null&&v!==undefined);
      if (!vals.length) { stats[f] = { avg:'--', max:'--', min:'--', median:'--' }; continue; }
      const sum = vals.reduce((a,b)=>a+b,0), sorted = [...vals].sort((a,b)=>a-b);
      const mid = Math.floor(sorted.length/2), isInt = f==='a3';
      const avg = sum/vals.length;
      const med = sorted.length%2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
      stats[f] = { avg:isInt?String(Math.round(avg)):avg.toFixed(1), max:isInt?String(Math.max(...vals)):Math.max(...vals).toFixed(1), min:isInt?String(Math.min(...vals)):Math.min(...vals).toFixed(1), median:isInt?String(Math.round(med)):med.toFixed(1) };
    }
    return stats;
  },
  scoringReportData() {
    if (!this.currentClass) return [];
    const terms = this.currentClass.terms || [];
    const t1 = terms.length > 0 ? terms[0] : null;
    const t2 = terms.length > 1 ? terms[1] : null;
    const w = this.scoringWeightsLocal.yearly;
    return this.gradesSortedStudents.map(s => {
      const r1 = this.scoringCalcA3(s.id, t1), e1 = this.scoringCalcExam(s.id, t1, r1.a3);
      const r2 = this.scoringCalcA3(s.id, t2), e2 = this.scoringCalcExam(s.id, t2, r2.a3);
      let yt = null;
      if (e1.total !== null && e2.total !== null) yt = parseFloat((e1.total*w.t1Weight/100 + e2.total*w.t2Weight/100).toFixed(1));
      return { studentId:s.id, studentNumber:s.studentNumber, studentName:s.studentName, t1a3:r1.a3, t1ExamTotal:e1.total!==null?parseFloat(e1.total.toFixed(1)):null, t2a3:r2.a3, t2ExamTotal:e2.total!==null?parseFloat(e2.total.toFixed(1)):null, yearlyTotal:yt, rank:null, yearlyRank:null };
    });
  },
  scoringReportRankedData() {
    const data = JSON.parse(JSON.stringify(this.scoringReportData));
    const tk = this.gradesTerm && this.currentClass && this.currentClass.terms && this.currentClass.terms.length > 1 && this.gradesTermId === this.currentClass.terms[1].id ? 't2ExamTotal' : 't1ExamTotal';
    let s1 = data.filter(r=>r[tk]!==null).sort((a,b)=>b[tk]-a[tk]), rk=0, lv=null;
    s1.forEach((r,i)=>{ if(r[tk]!==lv){rk=i+1;lv=r[tk];}r.rank=rk; });
    let s2 = data.filter(r=>r.yearlyTotal!==null).sort((a,b)=>b.yearlyTotal-a.yearlyTotal);
    rk=0; lv=null; s2.forEach((r,i)=>{ if(r.yearlyTotal!==lv){rk=i+1;lv=r.yearlyTotal;}r.yearlyRank=rk; });
    return data;
  },
  scoringReportSortedData() {
    const data = [...this.scoringReportRankedData];
    const k = this.scoringReportSortKey, asc = this.scoringReportSortAsc;
    data.sort((a,b)=>{ let va=a[k],vb=b[k]; if(va==null)va=asc?Infinity:-Infinity; if(vb==null)vb=asc?Infinity:-Infinity; if(k==='studentNumber'){va=parseInt(va)||0;vb=parseInt(vb)||0;} return asc?(va<vb?-1:va>vb?1:0):(va>vb?-1:va<vb?1:0); });
    return data;
  },
  scoringReportStats() {
    const data = this.scoringReportRankedData;
    const fields = ['t1a3','t1ExamTotal','t2a3','t2ExamTotal','yearlyTotal'];
    const stats = {};
    for (const f of fields) {
      const vals = data.map(r=>r[f]).filter(v=>v!==null);
      if (!vals.length) { stats[f]={avg:'--',max:'--',min:'--',median:'--',stddev:'--',pass:0,good:0,excellent:0,total:data.length}; continue; }
      const sum=vals.reduce((a,b)=>a+b,0),mean=sum/vals.length;
      const sorted=[...vals].sort((a,b)=>a-b), mid=Math.floor(sorted.length/2);
      const med=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
      const variance=vals.reduce((acc,v)=>acc+(v-mean)**2,0)/vals.length;
      const isInt=f.includes('a3');
      stats[f]={ avg:isInt?String(Math.round(mean)):mean.toFixed(1), max:isInt?String(Math.max(...vals)):Math.max(...vals).toFixed(1), min:isInt?String(Math.min(...vals)):Math.min(...vals).toFixed(1), median:isInt?String(Math.round(med)):med.toFixed(1), stddev:Math.sqrt(variance).toFixed(1), pass:vals.filter(v=>v>=50).length, good:vals.filter(v=>v>=70).length, excellent:vals.filter(v=>v>=80).length, total:data.length };
    }
    return stats;
  }
};