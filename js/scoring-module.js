// ================================================================
// Scoring Module (v9 —
//   1) 排名改用「未四捨五入」的真實分數計算（只有真實分數相同才會同名次）
//   2) 項目歸屬：可輸入統測 / 考試計算日期，按項目日期自動歸類
//   (v8: robust CSV export with proper escaping)
// )
// ================================================================

// 浮點誤差容許值：差距小於此值視為同分
const SCORING_RANK_EPSILON = 1e-9;

// 項目歸屬日期欄位
const SCORING_ATTR_DATE_FIELDS = ['utStart', 'utEnd', 'examStart', 'examEnd'];

const ScoringMethods = {
  scoringSetSubTab(tab) { this.scoringSubTab = tab; },
  scoringToggleAccordion(key) { this.scoringAccordion = { ...this.scoringAccordion, [key]: !this.scoringAccordion[key] }; },

  initScoringWeights() {
    this._scoringSkipWatch = true;
    const cls = this.currentClass;
    if (!cls) { this.$nextTick(() => { this._scoringSkipWatch = false; }); return; }
    const sc = cls.scoreConfig || {};
    const ccIds = (cls.customCategories || []).map(c => c.id);
    const utCC = {}, examCC = {};
    for (const id of ccIds) {
      utCC[id] = sc.ut?.customCategories?.[id] ?? 0;
      examCC[id] = sc.exam?.a1Weights?.customCategories?.[id] ?? 0;
    }
    this.scoringWeightsLocal = {
      ut: { assignment: sc.ut?.assignment ?? 20, quiz: sc.ut?.quiz ?? 20, unifiedTest: sc.ut?.unifiedTest ?? 40, classPerformance: sc.ut?.classPerformance ?? 20, customCategories: utCC },
      exam: {
        a1Ratio: sc.exam?.a1Ratio ?? 30,
        a2Ratio: sc.exam?.a2Ratio ?? 70,
        a1Weights: {
          assignment: sc.exam?.a1Weights?.assignment ?? 6,
          quiz: sc.exam?.a1Weights?.quiz ?? 6,
          unifiedTest: sc.exam?.a1Weights?.unifiedTest ?? 12,
          classPerformance: sc.exam?.a1Weights?.classPerformance ?? 6,
          customCategories: examCC
        }
      },
      yearly: { t1Weight: sc.yearly?.t1Weight ?? 40, t2Weight: sc.yearly?.t2Weight ?? 60 }
    };
    this.$nextTick(() => { this._scoringSkipWatch = false; });
  },

  scoringDebouncedAutoSave() {
    if (this._scoringSaveTimer) clearTimeout(this._scoringSaveTimer);
    this._scoringSaveTimer = setTimeout(async () => {
      if (!this.scoringConfigValid || !this.currentAcademicYearId || !this.currentClassId) return;
      const w = this.scoringWeightsLocal;
      const config = {
        ut: { ...w.ut, customCategories: { ...w.ut.customCategories } },
        exam: { a1Ratio: w.exam.a1Ratio, a2Ratio: w.exam.a2Ratio, a1Weights: { ...w.exam.a1Weights, customCategories: { ...w.exam.a1Weights.customCategories } } },
        yearly: { t1Weight: w.yearly.t1Weight, t2Weight: w.yearly.t2Weight }
      };
      try {
        await db.collection('academicYears').doc(this.currentAcademicYearId).collection('classes').doc(this.currentClassId).update({ scoreConfig: config });
        if (this.currentClass) this.currentClass.scoreConfig = config;
        this.scoringSaveStatus = 'saved';
        setTimeout(() => { if (this.scoringSaveStatus === 'saved') this.scoringSaveStatus = ''; }, 2000);
      } catch (e) { console.error('Auto-save scoring config failed:', e); }
    }, 1500);
  },

  // ★ v7: Manual saveScoringConfig kept as helper (called internally if ever needed), not bound to UI button
  async saveScoringConfig() {
    if (!this.currentAcademicYearId || !this.currentClassId) return;
    if (!this.scoringConfigValid) { this.addToast('請修正權重設定錯誤後再儲存', 'warning'); return; }
    const w = this.scoringWeightsLocal;
    const config = {
      ut: { ...w.ut, customCategories: { ...w.ut.customCategories } },
      exam: { a1Ratio: w.exam.a1Ratio, a2Ratio: w.exam.a2Ratio, a1Weights: { ...w.exam.a1Weights, customCategories: { ...w.exam.a1Weights.customCategories } } },
      yearly: { t1Weight: w.yearly.t1Weight, t2Weight: w.yearly.t2Weight }
    };
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

  // ============================================================
  // ★ v9: 項目歸屬 — 按日期自動歸類
  //   資料儲存於班別文件：attributionDates = {
  //     [termId]: { utStart, utEnd, examStart, examEnd, autoApply }
  //   }
  //   規則：
  //     - 項目日期落在「統測計算期」→ 統測（重疊時優先統測）
  //     - 否則落在「考試計算期」→ 考試
  //     - 都不在 → 不計入
  //     - 未設日期的項目 → 維持不變
  //     - 留空的開始日期 = 不設下限；留空的截止日期 = 不設上限
  // ============================================================
  _scoringNormDate(v) {
    if (!v) return '';
    const s = String(v).trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  },

  _scoringNextDay(dateStr) {
    const s = this._scoringNormDate(dateStr);
    if (!s) return '';
    const [y, m, d] = s.split('-').map(n => parseInt(n, 10));
    const dt = new Date(y, m - 1, d + 1);
    const pad = n => String(n).padStart(2, '0');
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  },

  _scoringAttrIsConfigured(cfg) {
    return !!(cfg && SCORING_ATTR_DATE_FIELDS.some(f => cfg[f]));
  },

  _scoringAttrValidate(cfg) {
    if (!cfg) return '';
    if (cfg.utStart && cfg.utEnd && cfg.utStart > cfg.utEnd) return '統測計算期的開始日期遲於截止日期';
    if (cfg.examStart && cfg.examEnd && cfg.examStart > cfg.examEnd) return '考試計算期的開始日期遲於截止日期';
    return '';
  },

  _scoringAttrOverlap(cfg) {
    if (!cfg) return false;
    const utOn = !!(cfg.utStart || cfg.utEnd);
    const exOn = !!(cfg.examStart || cfg.examEnd);
    if (!utOn || !exOn) return false;
    const starts = [cfg.utStart, cfg.examStart].filter(Boolean).sort();
    const ends = [cfg.utEnd, cfg.examEnd].filter(Boolean).sort();
    const lo = starts.length ? starts[starts.length - 1] : '0000-00-00';
    const hi = ends.length ? ends[0] : '9999-12-31';
    // 只有兩段都設定開始日或都設定截止日時，才可能真正交疊
    if (!cfg.utStart && !cfg.examStart) return true;
    if (!cfg.utEnd && !cfg.examEnd) return true;
    return lo <= hi;
  },

  // 回傳 'ut' / 'exam' / 'none'；無日期或未設定時回傳 null（不變更）
  _scoringCategoryByDate(date, cfg) {
    const d = this._scoringNormDate(date);
    if (!d || !cfg) return null;
    const utOn = !!(cfg.utStart || cfg.utEnd);
    const exOn = !!(cfg.examStart || cfg.examEnd);
    if (!utOn && !exOn) return null;
    const inRange = (s, e) => (!s || d >= s) && (!e || d <= e);
    if (utOn && inRange(cfg.utStart, cfg.utEnd)) return 'ut';
    if (exOn && inRange(cfg.examStart, cfg.examEnd)) return 'exam';
    return 'none';
  },

  // 供新增 / 修改評估項目時呼叫（crud-module / calendar-module）
  _scoringAutoCategoryFor(cls, termId, date) {
    if (!cls || !termId) return null;
    const cfg = cls.attributionDates && cls.attributionDates[termId];
    if (!cfg || cfg.autoApply === false) return null;
    if (this._scoringAttrValidate(cfg)) return null;
    return this._scoringCategoryByDate(date, cfg);
  },

  _scoringFlashSaved() {
    this.scoringSaveStatus = 'saved';
    setTimeout(() => { if (this.scoringSaveStatus === 'saved') this.scoringSaveStatus = ''; }, 2000);
  },

  _scoringTermDateRange(term) {
    const td = (this.settings && this.settings.termDates) || {};
    const cls = this.currentClass;
    const name = String((term && term.name) || '').replace(/\s+/g, '');
    let key;
    if (/上學期|第一學期/.test(name)) key = 't1';
    else if (/下學期|第二學期/.test(name)) key = 't2';
    else {
      const idx = ((cls && cls.terms) || []).findIndex(t => t.id === (term && term.id));
      key = idx === 1 ? 't2' : 't1';
    }
    return {
      start: this._scoringNormDate(td[key + 'Start']),
      end: this._scoringNormDate(td[key + 'End'])
    };
  },

  async _scoringAttrUpdate(patch) {
    const cls = this.currentClass;
    const termId = this.gradesTermId;
    const yearId = this.currentAcademicYearId;
    const classId = this.currentClassId;
    if (!cls || !termId || !yearId || !classId) return;

    const all = (cls.attributionDates && typeof cls.attributionDates === 'object') ? cls.attributionDates : {};
    const next = { ...(all[termId] || {}) };
    for (const k in patch) {
      if (k === 'autoApply') next.autoApply = !!patch[k];
      else if (SCORING_ATTR_DATE_FIELDS.includes(k)) next[k] = this._scoringNormDate(patch[k]);
    }
    cls.attributionDates = { ...all, [termId]: next };

    try {
      await db.collection('academicYears').doc(yearId).collection('classes').doc(classId)
        .update({ attributionDates: JSON.parse(JSON.stringify(cls.attributionDates)) });
      this._scoringFlashSaved();
    } catch (e) {
      console.error('save attributionDates failed', e);
      this.addToast('儲存歸屬日期失敗：' + e.message, 'error');
      return;
    }

    // 自動歸類：日期有變更（或剛開啟自動歸類）且設定有效時立即套用
    const dateChanged = Object.keys(patch).some(k => SCORING_ATTR_DATE_FIELDS.includes(k));
    const turnedOn = patch.autoApply === true;
    if (
      (dateChanged || turnedOn) &&
      next.autoApply !== false &&
      this._scoringAttrIsConfigured(next) &&
      !this._scoringAttrValidate(next) &&
      this.currentClassId === classId &&
      this.gradesTermId === termId
    ) {
      await this.scoringApplyAttributionByDate({ silent: true });
    }
  },

  scoringAttrSet(field, value) {
    this._scoringAttrUpdate({ [field]: value });
  },

  scoringAttrClear() {
    this._scoringAttrUpdate({ utStart: '', utEnd: '', examStart: '', examEnd: '' });
  },

  // 一鍵：以本學期「統測」及「考試」項目的日期填入計算期
  scoringAttrFillFromAssessments() {
    const term = this.gradesTerm;
    if (!term) return;
    const aa = term.assessments || [];
    const ut = aa.find(a => a.type === 'unified_test');
    const ex = aa.find(a => a.type === 'exam');
    const utDate = ut ? this._scoringNormDate(ut.date) : '';
    const exDate = ex ? this._scoringNormDate(ex.date) : '';

    if (!utDate && !exDate) {
      this.addToast('此學期的統測及考試尚未設定日期，請先在成績輸入中設定日期', 'warning');
      return;
    }

    const range = this._scoringTermDateRange(term);
    const patch = {};
    if (utDate) {
      patch.utStart = range.start || '';
      patch.utEnd = utDate;
    }
    if (exDate) {
      patch.examStart = utDate ? this._scoringNextDay(utDate) : (range.start || '');
      patch.examEnd = exDate;
    }
    this._scoringAttrUpdate(patch);
    this.addToast('已根據統測／考試日期填入計算期', 'success');
  },

  async scoringApplyAttributionByDate(opts) {
    const silent = !!(opts && opts.silent);
    const cfg = this.scoringAttrConfig;

    if (!this._scoringAttrIsConfigured(cfg)) {
      if (!silent) this.addToast('請先輸入統測或考試的計算日期', 'warning');
      return 0;
    }
    const err = this._scoringAttrValidate(cfg);
    if (err) {
      if (!silent) this.addToast(err, 'warning');
      return 0;
    }

    const yearId = this.currentAcademicYearId;
    const classId = this.currentClassId;
    const termId = this.gradesTermId;
    if (!yearId || !classId || !termId) return 0;

    const changes = [];
    let undated = 0;
    for (const a of this.scoringAssignmentsAndQuizzes) {
      const cat = this._scoringCategoryByDate(a.date, cfg);
      if (cat === null) { undated++; continue; }
      const old = a.scoreCategory || 'none';
      if (old !== cat) changes.push({ a, old, cat });
    }

    if (changes.length === 0) {
      if (!silent) {
        this.addToast('所有項目已符合日期設定，無需變更' + (undated ? '（' + undated + ' 項未設日期）' : ''), 'info');
      }
      return 0;
    }

    changes.forEach(c => { c.a.scoreCategory = c.cat; });

    const results = await Promise.allSettled(changes.map(c =>
      db.collection('academicYears').doc(yearId).collection('classes').doc(classId)
        .collection('terms').doc(termId).collection('assessments').doc(c.a.id)
        .update({ scoreCategory: c.cat })
    ));

    let failed = 0;
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        changes[i].a.scoreCategory = changes[i].old;
        failed++;
        console.error('apply attribution failed', changes[i].a.id, r.reason);
      }
    });

    const ok = changes.length - failed;
    if (ok > 0) {
      let msg = '已按日期自動歸類 ' + ok + ' 個項目';
      if (undated) msg += '（' + undated + ' 項未設日期，維持不變）';
      this.addToast(msg, 'success');
    }
    if (failed > 0) this.addToast(failed + ' 個項目更新失敗，請重試', 'error');
    return ok;
  },

  // ============================================================

  _getEffScore(a, sid) {
    const v = (a.scores || {})[sid];
    if (v == null) return null;
    if (typeof v === 'object' && v !== null) {
      return Math.min((v.base || 0) + (v.bonus || 0), a.fullMark);
    }
    const n = parseFloat(v);
    if (isNaN(n)) return null;
    return Math.min(n, a.fullMark);
  },

  _calcAvgPct(assessments, sid) {
    let sS = 0, fS = 0;
    for (const a of assessments) {
      const eff = this._getEffScore(a, sid);
      if (eff !== null) { sS += eff; fS += a.fullMark; }
    }
    return fS > 0 ? (sS / fS * 100) : null;
  },
  _calcSinglePct(a, sid) {
    if (!a) return null;
    const eff = this._getEffScore(a, sid);
    if (eff === null) return null;
    return (eff / a.fullMark * 100);
  },

  _calcCustomCatAvg(term, sid, catId, scoreCategoryFilter) {
    const list = (term.assessments || []).filter(a => a.type === 'custom' && a.customCategoryId === catId && (a.scoreCategory || 'none') === scoreCategoryFilter);
    return this._calcAvgPct(list, sid);
  },

  scoringCalcA3(sid, term) {
    if (!term) return { a3: null, d: null };
    const w = this.scoringWeightsLocal.ut;
    const aa = term.assessments || [];
    const utA = aa.filter(a => a.type === 'assignment' && (a.scoreCategory || 'none') === 'ut');
    const utQ = aa.filter(a => a.type === 'quiz' && (a.scoreCategory || 'none') === 'ut');
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
    const ccs = (this.currentClass?.customCategories || []);
    for (const cc of ccs) {
      const wt = (w.customCategories && w.customCategories[cc.id]) || 0;
      if (wt > 0) {
        const p = this._calcCustomCatAvg(term, sid, cc.id, 'ut');
        add(cc.name + '均分', p, wt);
      }
    }
    return { a3: Math.round(t), d: { aP, qP, uP, cP, comps, raw: t } };
  },

  scoringCalcExam(sid, term, a3) {
    if (!term) return { a1: null, a2: null, total: null, d: null };
    const ec = this.scoringWeightsLocal.exam;
    const aa = term.assessments || [];
    const exA = aa.filter(a => a.type === 'assignment' && (a.scoreCategory || 'none') === 'exam');
    const exQ = aa.filter(a => a.type === 'quiz' && (a.scoreCategory || 'none') === 'exam');
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
      const ccs = (this.currentClass?.customCategories || []);
      for (const cc of ccs) {
        const wt = (w2.customCategories && w2.customCategories[cc.id]) || 0;
        if (wt > 0) {
          const p = this._calcCustomCatAvg(term, sid, cc.id, 'exam') || 0;
          a1 += p * wt / 100;
          a1C.push({ label: cc.name + '均分', value: p, weight: wt, contrib: p * wt / 100 });
        }
      }
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

  // ★ v9: 以真實值排名（標準競賽排名：1,1,3）
  _scoringAssignRanks(rows, valueKey, rankKey) {
    const list = rows
      .filter(r => r[valueKey] !== null && r[valueKey] !== undefined && !isNaN(r[valueKey]))
      .sort((a, b) => b[valueKey] - a[valueKey]);
    let rank = 0;
    let groupValue = null;
    list.forEach((r, i) => {
      if (groupValue === null || Math.abs(r[valueKey] - groupValue) > SCORING_RANK_EPSILON) {
        rank = i + 1;
        groupValue = r[valueKey];
      }
      r[rankKey] = rank;
    });
  },

  // ★ v8: Robust CSV export (proper escaping, CRLF, BOM, elective class column)
  // Called from the grades tab toolbar button.
  exportCSV() {
    if (!this.gradesTerm || !this.gradesSortedStudents.length) { this.addToast('無數據可匯出','warning'); return; }
    const ord = this.gradesOrderedAssessments;
    const stu = this.gradesSortedStudents;
    const isElective = this.isCurrentClassElective;

    const esc = (val) => {
      if (val === null || val === undefined) return '';
      let s = String(val);
      if (/[",\n\r]/.test(s)) {
        s = '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const fmtScore = (eff) => {
      if (eff === null || eff === undefined || isNaN(eff)) return '';
      if (Number.isInteger(eff)) return String(eff);
      return String(Math.round(eff * 100) / 100);
    };

    const lines = [];

    const header = [];
    if (isElective) header.push('班別');
    header.push('學號', '姓名');
    for (const a of ord) header.push(a.name + '(' + a.fullMark + ')');
    lines.push(header.map(esc).join(','));

    for (const s of stu) {
      const row = [];
      if (isElective) row.push(this.getStudentOriginClass(s) || '');
      row.push(s.studentNumber, s.studentName);
      for (const a of ord) {
        row.push(fmtScore(this._getEffScore(a, s.id)));
      }
      lines.push(row.map(esc).join(','));
    }

    const csv = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const cls = this.currentClass;
    const nameParts = [];
    if (cls) {
      if (cls.className) nameParts.push(cls.className);
      if (cls.subject) nameParts.push(cls.subject);
    }
    if (!nameParts.length) nameParts.push('成績');
    if (this.gradesTerm && this.gradesTerm.name) nameParts.push(this.gradesTerm.name);
    link.download = nameParts.join('_') + '.csv';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.addToast('CSV 已匯出', 'success');
  }
};

const ScoringComputed = {
  scoringUTWeightTotal() {
    const w = this.scoringWeightsLocal.ut;
    let sum = (w.assignment||0)+(w.quiz||0)+(w.unifiedTest||0)+(w.classPerformance||0);
    const cc = w.customCategories || {};
    for (const k in cc) sum += (cc[k] || 0);
    return sum;
  },
  scoringA1A2WeightTotal() { return (this.scoringWeightsLocal.exam.a1Ratio||0)+(this.scoringWeightsLocal.exam.a2Ratio||0); },
  scoringA1InternalTotal() {
    const w = this.scoringWeightsLocal.exam.a1Weights;
    let sum = (w.assignment||0)+(w.quiz||0)+(w.unifiedTest||0)+(w.classPerformance||0);
    const cc = w.customCategories || {};
    for (const k in cc) sum += (cc[k] || 0);
    return sum;
  },
  scoringYearlyWeightTotal() { return (this.scoringWeightsLocal.yearly.t1Weight||0)+(this.scoringWeightsLocal.yearly.t2Weight||0); },
  scoringExamWeightTotal() { return this.scoringA1A2WeightTotal; },
  scoringConfigValid() {
    return this.scoringUTWeightTotal === 100 && this.scoringA1A2WeightTotal === 100 &&
      this.scoringA1InternalTotal === this.scoringWeightsLocal.exam.a1Ratio && this.scoringYearlyWeightTotal === 100;
  },
  scoringPassThreshold() {
    if (!this.currentClass) return 50;
    if (this.currentClass.classType === 'elective') return 40;
    const name = (this.currentClass.className||'');
    if (/中[四五六]|[SF]\.?\s*[4-6]/i.test(name) || /^[4-6]\s*[A-Za-z]/i.test(name)) return 40;
    return 50;
  },
  scoringAssignmentsAndQuizzes() {
    if (!this.gradesTerm) return [];
    return (this.gradesTerm.assessments || []).filter(a => a.type === 'assignment' || a.type === 'quiz' || a.type === 'custom')
      .sort((a, b) => {
        const o = { assignment: 0, quiz: 1, custom: 2 };
        if (o[a.type] !== o[b.type]) return o[a.type] - o[b.type];
        return (a.order || 0) - (b.order || 0);
      });
  },
  scoringCustomCategories() { return (this.currentClass?.customCategories || []); },

  // ★ v9: 目前班別 + 學期的歸屬日期設定
  scoringAttrConfig() {
    const cls = this.currentClass;
    const tid = this.gradesTermId;
    if (!cls || !tid) return {};
    return (cls.attributionDates && cls.attributionDates[tid]) || {};
  },

  // ★ v9: 套用前預覽
  scoringAttrPreview() {
    const cfg = this.scoringAttrConfig;
    const res = {
      configured: this._scoringAttrIsConfigured(cfg),
      error: this._scoringAttrValidate(cfg),
      overlap: this._scoringAttrOverlap(cfg),
      ut: 0, exam: 0, none: 0, undated: 0, changed: 0
    };
    if (!res.configured) return res;
    for (const a of this.scoringAssignmentsAndQuizzes) {
      const cat = this._scoringCategoryByDate(a.date, cfg);
      if (cat === null) { res.undated++; continue; }
      res[cat]++;
      if ((a.scoreCategory || 'none') !== cat) res.changed++;
    }
    return res;
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

  // ★ v9: 同時保留「顯示值」（一位小數）及「真實值」(*Raw) 供排名使用
  scoringReportData() {
    if (!this.currentClass) return [];
    const terms = this.currentClass.terms || [];
    const t1 = terms.length > 0 ? terms[0] : null;
    const t2 = terms.length > 1 ? terms[1] : null;
    const w = this.scoringWeightsLocal.yearly;
    const r1d = v => (v !== null && v !== undefined) ? parseFloat(v.toFixed(1)) : null;
    return this.gradesSortedStudents.map(s => {
      const r1 = this.scoringCalcA3(s.id, t1), e1 = this.scoringCalcExam(s.id, t1, r1.a3);
      const r2 = this.scoringCalcA3(s.id, t2), e2 = this.scoringCalcExam(s.id, t2, r2.a3);
      const t1Raw = e1.total;
      const t2Raw = e2.total;
      let ytRaw = null;
      if (t1Raw !== null && t2Raw !== null) ytRaw = t1Raw * w.t1Weight / 100 + t2Raw * w.t2Weight / 100;
      return {
        studentId: s.id, studentNumber: s.studentNumber, studentName: s.studentName,
        t1a3: r1.a3,
        t1ExamTotal: r1d(t1Raw), t1ExamTotalRaw: t1Raw,
        t2a3: r2.a3,
        t2ExamTotal: r1d(t2Raw), t2ExamTotalRaw: t2Raw,
        yearlyTotal: r1d(ytRaw), yearlyTotalRaw: ytRaw,
        rank: null, yearlyRank: null
      };
    });
  },

  // ★ v9: 以真實值（*Raw）排名
  scoringReportRankedData() {
    const data = JSON.parse(JSON.stringify(this.scoringReportData));
    const isT2 = this.gradesTerm && this.currentClass && this.currentClass.terms && this.currentClass.terms.length > 1 && this.gradesTermId === this.currentClass.terms[1].id;
    const termKey = isT2 ? 't2ExamTotalRaw' : 't1ExamTotalRaw';
    this._scoringAssignRanks(data, termKey, 'rank');
    this._scoringAssignRanks(data, 'yearlyTotalRaw', 'yearlyRank');
    return data;
  },

  // ★ v9: 依考試 / 全年總分排序時同樣使用真實值
  scoringReportSortedData() {
    const data = [...this.scoringReportRankedData];
    const k = this.scoringReportSortKey, asc = this.scoringReportSortAsc;
    const rawMap = { t1ExamTotal: 't1ExamTotalRaw', t2ExamTotal: 't2ExamTotalRaw', yearlyTotal: 'yearlyTotalRaw' };
    const vk = rawMap[k] || k;
    data.sort((a,b)=>{ let va=a[vk],vb=b[vk]; if(va==null)va=asc?Infinity:-Infinity; if(vb==null)vb=asc?Infinity:-Infinity; if(k==='studentNumber'){va=parseInt(va)||0;vb=parseInt(vb)||0;} return asc?(va<vb?-1:va>vb?1:0):(va>vb?-1:va<vb?1:0); });
    return data;
  },
  scoringReportStats() {
    const data = this.scoringReportRankedData;
    const fields = ['t1a3','t1ExamTotal','t2a3','t2ExamTotal','yearlyTotal'];
    const stats = {};
    const passT = this.scoringPassThreshold;
    for (const f of fields) {
      const vals = data.map(r=>r[f]).filter(v=>v!==null);
      if (!vals.length) { stats[f]={avg:'--',max:'--',min:'--',median:'--',stddev:'--',pass:0,good:0,excellent:0,total:data.length}; continue; }
      const sum=vals.reduce((a,b)=>a+b,0),mean=sum/vals.length;
      const sorted=[...vals].sort((a,b)=>a-b), mid=Math.floor(sorted.length/2);
      const med=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
      const variance=vals.reduce((acc,v)=>acc+(v-mean)**2,0)/vals.length;
      const isInt=f.includes('a3');
      stats[f]={ avg:isInt?String(Math.round(mean)):mean.toFixed(1), max:isInt?String(Math.max(...vals)):Math.max(...vals).toFixed(1), min:isInt?String(Math.min(...vals)):Math.min(...vals).toFixed(1), median:isInt?String(Math.round(med)):med.toFixed(1), stddev:Math.sqrt(variance).toFixed(1), pass:vals.filter(v=>v>=passT).length, good:vals.filter(v=>v>=70).length, excellent:vals.filter(v=>v>=80).length, total:data.length };
    }
    return stats;
  }
};