// ================================================================
// Grades Module (v10 — drag select, smart copy, hover highlight, set fullMarkS2)
// ================================================================

const GradesMethods = {

  gradesAutoSelectTerm() {
    if (this.currentClass && this.currentClass.terms && this.currentClass.terms.length > 0) {
      if (!this.gradesTermId || !this.currentClass.terms.find(t => t.id === this.gradesTermId)) {
        this.gradesTermId = this._autoSelectTermByDate(this.currentClass, new Date());
      }
    } else {
      this.gradesTermId = null;
    }
  },

  gradesSelectTerm(termId) { this.gradesTermId = termId; this.gradesResetFocus(); },
  gradesSelectTermFromTree(termId) { this.gradesTermId = termId; this.gradesResetFocus(); },

  gradesResetFocus() {
    this.gradesSaveCurrentCell();
    this.gradesFocusRow = -1; this.gradesFocusCol = -1;
    this.gradesEditValue = ''; this.gradesCellOriginalValue = '';
    this.gradesHeaderMenu = null; this.gradesDetailPanel = null;
    this.gradesSelStart = null; this.gradesSelEnd = null;
    this.gradesUndoStack = []; this.gradesHighlightUnenteredCol = -1;
    this.gradesHoverRow = -1;
    this.gradesIsDragging = false;
    this.gradesDragStartCell = null;
  },

  gradesFocusCell(row, col, extend) {
    if (typeof extend === 'object') extend = false;
    if (this._gradesBlurTimer) { clearTimeout(this._gradesBlurTimer); this._gradesBlurTimer = null; }
    const colSpec = this.gradesOrderedColumns[col];
    if (colSpec && colSpec.readOnly) {
      return;
    }
    const isSameCell = (row === this.gradesFocusRow && col === this.gradesFocusCol);
    this.gradesSaveCurrentCell();
    const prevRow = this.gradesFocusRow;
    const prevCol = this.gradesFocusCol;
    this.gradesFocusRow = row; this.gradesFocusCol = col;
    this.gradesHeaderMenu = null; this.gradesDetailPanel = null;
    if (!isSameCell) {
      const stu = this.gradesSortedStudents[row];
      if (stu) {
        const val = this.gradesGetRawScoreForInput(stu.id, col);
        this.gradesEditValue = val !== '' ? String(val) : '';
      } else this.gradesEditValue = '';
      this.gradesCellOriginalValue = this.gradesEditValue;
    }
    if (extend) {
      if (!this.gradesSelStart) this.gradesSelStart = { row: prevRow >= 0 ? prevRow : row, col: prevCol >= 0 ? prevCol : col };
      this.gradesSelEnd = { row, col };
    } else { this.gradesSelStart = { row, col }; this.gradesSelEnd = { row, col }; }
    this.$nextTick(() => {
      const input = this.$refs.gradesEditInput;
      const el = Array.isArray(input) ? input[0] : input;
      if (el) {
        if (document.activeElement !== el) el.focus({ preventScroll: true });
        if (!isSameCell) { try { el.select(); } catch (e) {} }
      }
    });
  },

  // ★ v14: Mouse down handler – initiates drag selection or shift+click extend
  gradesOnCellMouseDown(ri, ci, ev) {
    if (ev.button !== 0) return; // left click only
    // If clicking inside the active edit input, let the input handle it natively
    if (this.gradesFocusRow === ri && this.gradesFocusCol === ci && ev.target && ev.target.tagName === 'INPUT') {
      return;
    }
    ev.preventDefault();
    const col = this.gradesOrderedColumns[ci];
    if (!col) return;

    // Shift+click: extend selection from current focus to clicked cell (no drag)
    if (ev.shiftKey && this.gradesFocusRow >= 0 && this.gradesFocusCol >= 0) {
      this.gradesSelStart = { row: this.gradesFocusRow, col: this.gradesFocusCol };
      this.gradesSelEnd = { row: ri, col: ci };
      return;
    }

    // Initiate drag selection
    this.gradesIsDragging = true;
    this.gradesDragStartCell = { row: ri, col: ci };

    if (col.readOnly) {
      // For readonly cells: clear focus, set selection only
      this.gradesSaveCurrentCell();
      this.gradesFocusRow = -1; this.gradesFocusCol = -1;
      this.gradesEditValue = ''; this.gradesCellOriginalValue = '';
      this.gradesSelStart = { row: ri, col: ci };
      this.gradesSelEnd = { row: ri, col: ci };
    } else {
      this.gradesFocusCell(ri, ci);
    }
  },

  gradesParseInputValue(str, colSpec) {
    const s = String(str || '').trim();
    if (s === '') return { ok: true, value: null };
    if (s.includes('+')) {
      const parts = s.split('+').map(p => p.trim());
      if (parts.length === 2) {
        const base = parseFloat(parts[0]);
        const bonus = parseFloat(parts[1]);
        if (!isNaN(base) && !isNaN(bonus)) {
          const a = colSpec && colSpec.assessment;
          if (a && a.type === 'quiz') return { ok: true, value: { base, bonus } };
          return { ok: true, value: base + bonus };
        }
      }
      return { ok: false };
    }
    const n = parseFloat(s);
    if (isNaN(n)) return { ok: false };
    return { ok: true, value: n };
  },

  gradesSaveCurrentCell() {
    if (this.gradesFocusRow < 0 || this.gradesFocusCol < 0) return;
    const stu = this.gradesSortedStudents[this.gradesFocusRow];
    const colSpec = this.gradesOrderedColumns[this.gradesFocusCol];
    if (!stu || !colSpec || colSpec.readOnly) return;
    const parsed = this.gradesParseInputValue(this.gradesEditValue, colSpec);
    if (!parsed.ok) return;
    const oldVal = this.gradesGetRawScoreForInput(stu.id, this.gradesFocusCol);
    const oldValParsed = oldVal === '' ? null : oldVal;
    const sameVal = JSON.stringify(parsed.value) === JSON.stringify(oldValParsed);
    if (sameVal) return;
    this.gradesWriteCell(this.gradesFocusRow, this.gradesFocusCol, parsed.value);
    this.gradesPushUndo({ type:'single', row:this.gradesFocusRow, col:this.gradesFocusCol, oldValue:oldValParsed, newValue:parsed.value });
  },

  gradesGetRawScoreForInput(studentId, ci) {
    const col = this.gradesOrderedColumns[ci];
    if (!col) return '';
    const a = col.assessment;
    if (col.colType === 'simple') {
      const v = (a.scores || {})[studentId];
      if (v == null) return '';
      if (typeof v === 'object') return v.base + '+' + v.bonus;
      return v;
    }
    if (col.colType === 'subitem') {
      const sub = ((a.subItemScores || {})[studentId] || {})[col.subItemId];
      return sub == null ? '' : sub;
    }
    if (col.colType === 'exam-set1' || col.colType === 'exam-set2') {
      const rec = (a.adjustedScores || {})[studentId] || {};
      const k = col.colType === 'exam-set1' ? 'set1' : 'set2';
      return rec[k] == null ? '' : rec[k];
    }
    if (col.colType === 'paper') {
      const v = ((a.paperScores || {})[studentId] || {})[col.paperId];
      return v == null ? '' : v;
    }
    if (col.colType === 'paper-set1' || col.colType === 'paper-set2') {
      const rec = ((a.paperScores || {})[studentId] || {})[col.paperId] || {};
      const k = col.colType === 'paper-set1' ? 'set1' : 'set2';
      return rec[k] == null ? '' : rec[k];
    }
    return '';
  },

  // ★ v14: Returns the pure numeric value for clipboard (no formula, no asterisk)
  gradesGetCopyValue(studentId, ci) {
    const col = this.gradesOrderedColumns[ci];
    if (!col) return '';
    const a = col.assessment;

    // Simple cells (assignment, quiz, etc.) – use effective (capped) value
    if (col.colType === 'simple') {
      const eff = this._getEffScore(a, studentId);
      if (eff === null || eff === undefined) return '';
      return Number.isInteger(eff) ? String(eff) : parseFloat(eff).toFixed(1);
    }

    // Read-only computed totals – return the computed score directly
    if (col.colType === 'subitem-total' || col.colType === 'exam-adjusted-total' ||
        col.colType === 'paper-total' || col.colType === 'exam-papers-total') {
      const v = (a.scores || {})[studentId];
      if (v == null) return '';
      return Number.isInteger(v) ? String(v) : parseFloat(v).toFixed(1);
    }

    // Sub-item / paper / set1 / set2 inputs – return raw numeric input
    const raw = this.gradesGetRawScoreForInput(studentId, ci);
    return raw === '' || raw == null ? '' : String(raw);
  },

  gradesWriteCell(row, col, value) {
    const stu = this.gradesSortedStudents[row];
    const colSpec = this.gradesOrderedColumns[col];
    if (!stu || !colSpec) return null;
    const a = colSpec.assessment;
    if (colSpec.colType === 'simple') {
      if (!a.scores) a.scores = {};
      if (value == null) delete a.scores[stu.id];
      else a.scores[stu.id] = value;
    }
    else if (colSpec.colType === 'subitem') {
      if (!a.subItemScores) a.subItemScores = {};
      if (!a.subItemScores[stu.id]) a.subItemScores[stu.id] = {};
      if (value == null) delete a.subItemScores[stu.id][colSpec.subItemId];
      else a.subItemScores[stu.id][colSpec.subItemId] = value;
      this._gradesRecomputeSubItemTotal(a, stu.id);
    }
    else if (colSpec.colType === 'exam-set1' || colSpec.colType === 'exam-set2') {
      if (!a.adjustedScores) a.adjustedScores = {};
      if (!a.adjustedScores[stu.id]) a.adjustedScores[stu.id] = {};
      const otherKey = colSpec.colType === 'exam-set1' ? 'set2' : 'set1';
      const thisKey = colSpec.colType === 'exam-set1' ? 'set1' : 'set2';
      if (value == null) delete a.adjustedScores[stu.id][thisKey];
      else {
        a.adjustedScores[stu.id][thisKey] = value;
        delete a.adjustedScores[stu.id][otherKey];
      }
      this._gradesRecomputeExamAdjustedTotal(a, stu.id);
    }
    else if (colSpec.colType === 'paper') {
      if (!a.paperScores) a.paperScores = {};
      if (!a.paperScores[stu.id]) a.paperScores[stu.id] = {};
      if (value == null) delete a.paperScores[stu.id][colSpec.paperId];
      else a.paperScores[stu.id][colSpec.paperId] = value;
      this._gradesRecomputePaperTotal(a, stu.id);
    }
    else if (colSpec.colType === 'paper-set1' || colSpec.colType === 'paper-set2') {
      if (!a.paperScores) a.paperScores = {};
      if (!a.paperScores[stu.id]) a.paperScores[stu.id] = {};
      if (!a.paperScores[stu.id][colSpec.paperId]) a.paperScores[stu.id][colSpec.paperId] = {};
      const rec = a.paperScores[stu.id][colSpec.paperId];
      const otherKey = colSpec.colType === 'paper-set1' ? 'set2' : 'set1';
      const thisKey = colSpec.colType === 'paper-set1' ? 'set1' : 'set2';
      if (value == null) delete rec[thisKey];
      else { rec[thisKey] = value; delete rec[otherKey]; }
      this._gradesRecomputePaperTotal(a, stu.id);
    }
    this.gradesSaveAssessmentDebounced(a);
    return value;
  },

  _gradesRecomputeSubItemTotal(a, sid) {
    const sis = a.subItems || [];
    const rec = (a.subItemScores || {})[sid] || {};
    let any = false, sum = 0;
    for (const si of sis) {
      const v = rec[si.id];
      if (v != null && v !== '') { sum += parseFloat(v) || 0; any = true; }
    }
    if (!a.scores) a.scores = {};
    if (any) a.scores[sid] = Math.min(sum, a.fullMark || sum);
    else delete a.scores[sid];
  },

  // ★ v14: Updated signature to accept independent fullMark for Set 1 and Set 2
  // Behavior: Set 2 raw score is converted to Set 1 scale via ratio, then multiplier and cap applied.
  // Backward compatible: when fullMarkS2 omitted/null, defaults to fullMarkS1 → identical to original logic.
  _gradesApplyAdjusted(setVal, set, multiplier, passingScore, fullMarkS1, fullMarkS2) {
    if (setVal == null) return null;
    const v = parseFloat(setVal);
    if (isNaN(v)) return null;
    if (set === 1) return Math.min(v, fullMarkS1);
    const fmS2 = (fullMarkS2 != null && !isNaN(fullMarkS2) && fullMarkS2 > 0) ? fullMarkS2 : fullMarkS1;
    const inSet1Scale = (v / fmS2) * fullMarkS1;       // convert to S1 scale
    const adj = inSet1Scale * (multiplier / 100);      // apply multiplier
    const cap = passingScore != null ? passingScore : fullMarkS1;
    return Math.min(adj, cap, fullMarkS1);
  },

  _gradesRecomputeExamAdjustedTotal(a, sid) {
    const rec = (a.adjustedScores || {})[sid] || {};
    let final = null;
    const mult = a.adjustedMultiplier || 80;
    const pass = a.passingScore != null ? a.passingScore : (a.fullMark * 0.5);
    const fmS1 = a.fullMark;
    const fmS2 = (a.fullMarkS2 != null && !isNaN(a.fullMarkS2) && a.fullMarkS2 > 0) ? a.fullMarkS2 : a.fullMark;
    if (rec.set1 != null && rec.set1 !== '') final = Math.min(parseFloat(rec.set1), fmS1);
    else if (rec.set2 != null && rec.set2 !== '') final = this._gradesApplyAdjusted(rec.set2, 2, mult, pass, fmS1, fmS2);
    if (!a.scores) a.scores = {};
    if (final !== null) a.scores[sid] = final;
    else delete a.scores[sid];
  },

  _gradesRecomputePaperTotal(a, sid) {
    const papers = a.papers || [];
    const rec = (a.paperScores || {})[sid] || {};
    if (papers.length === 0) return;
    let totalWeight = 0, weightedSum = 0, hasAny = false;
    const mult = a.adjustedMultiplier || 80;
    const pass = a.passingScore != null ? a.passingScore : (a.fullMark * 0.5);
    for (const p of papers) totalWeight += (p.weight || 0);
    if (totalWeight <= 0) totalWeight = papers.length;
    for (const p of papers) {
      const pw = (p.weight || (100 / papers.length)) / totalWeight;
      let paperFinal = null;
      const pFmS1 = p.fullMark;
      const pFmS2 = (p.fullMarkS2 != null && !isNaN(p.fullMarkS2) && p.fullMarkS2 > 0) ? p.fullMarkS2 : p.fullMark;
      if (a.hasAdjustedPaper) {
        const pr = rec[p.id] || {};
        if (pr.set1 != null && pr.set1 !== '') paperFinal = Math.min(parseFloat(pr.set1), pFmS1);
        else if (pr.set2 != null && pr.set2 !== '') {
          const pPass = (pFmS1 * (pass / a.fullMark));
          paperFinal = this._gradesApplyAdjusted(pr.set2, 2, mult, pPass, pFmS1, pFmS2);
        }
      } else {
        const v = rec[p.id];
        if (v != null && v !== '') paperFinal = Math.min(parseFloat(v), p.fullMark);
      }
      if (paperFinal !== null) {
        const pct = paperFinal / pFmS1;
        weightedSum += pct * pw * a.fullMark;
        hasAny = true;
      }
    }
    if (!a.scores) a.scores = {};
    if (hasAny) a.scores[sid] = parseFloat(weightedSum.toFixed(2));
    else delete a.scores[sid];
  },

  gradesIsCellInSelection(row, col) {
    if (!this.gradesSelStart || !this.gradesSelEnd) return false;
    const b = this.gradesGetSelectionBounds();
    if (!b) return false;
    return row >= b.minRow && row <= b.maxRow && col >= b.minCol && col <= b.maxCol;
  },

  gradesGetSelectionBounds() {
    const maxR = this.gradesSortedStudents.length - 1;
    const maxC = this.gradesOrderedColumns.length - 1;
    if (maxR < 0 || maxC < 0) return null;
    if (this.gradesSelStart && this.gradesSelEnd) {
      return {
        minRow: Math.max(0, Math.min(this.gradesSelStart.row, this.gradesSelEnd.row)),
        maxRow: Math.min(maxR, Math.max(this.gradesSelStart.row, this.gradesSelEnd.row)),
        minCol: Math.max(0, Math.min(this.gradesSelStart.col, this.gradesSelEnd.col)),
        maxCol: Math.min(maxC, Math.max(this.gradesSelStart.col, this.gradesSelEnd.col))
      };
    }
    if (this.gradesFocusRow >= 0 && this.gradesFocusCol >= 0) {
      return { minRow:this.gradesFocusRow, maxRow:this.gradesFocusRow, minCol:this.gradesFocusCol, maxCol:this.gradesFocusCol };
    }
    return null;
  },

  gradesIsMultiSelection() {
    const b = this.gradesGetSelectionBounds();
    if (!b) return false;
    return (b.maxRow - b.minRow > 0) || (b.maxCol - b.minCol > 0);
  },

  gradesDeselect() {
    this.gradesSaveCurrentCell();
    this.gradesFocusRow = -1; this.gradesFocusCol = -1;
    this.gradesEditValue = ''; this.gradesCellOriginalValue = '';
    this.gradesHeaderMenu = null; this.gradesDetailPanel = null;
    this.gradesSelStart = null; this.gradesSelEnd = null;
    this.$nextTick(() => { if (this.$refs.gradesWrapper) this.$refs.gradesWrapper.focus({ preventScroll: true }); });
  },

  gradesOnCellBlur() {
    this._gradesBlurTimer = setTimeout(() => {
      this._gradesBlurTimer = null;
      const wrapper = this.$refs.gradesWrapper;
      if (wrapper && !wrapper.contains(document.activeElement)) this.gradesSaveCurrentCell();
    }, 150);
  },

  gradesGetDisplayScore(studentId, ci) {
    const col = this.gradesOrderedColumns[ci];
    if (!col) return '';
    const a = col.assessment;
    if (col.colType === 'simple') {
      const v = (a.scores || {})[studentId];
      if (v == null) return '';
      if (typeof v === 'object') {
        const total = (v.base || 0) + (v.bonus || 0);
        return total + '*';
      }
      if (a.type === 'quiz' && parseFloat(v) > a.fullMark) return v + '*';
      return v;
    }
    if (col.colType === 'subitem') {
      const sub = ((a.subItemScores || {})[studentId] || {})[col.subItemId];
      return sub == null ? '' : sub;
    }
    if (col.colType === 'subitem-total') {
      const v = (a.scores || {})[studentId];
      return v == null ? '' : (Number.isInteger(v) ? v : parseFloat(v).toFixed(1));
    }
    if (col.colType === 'exam-set1' || col.colType === 'exam-set2') {
      const rec = (a.adjustedScores || {})[studentId] || {};
      const k = col.colType === 'exam-set1' ? 'set1' : 'set2';
      return rec[k] == null ? '' : rec[k];
    }
    if (col.colType === 'exam-adjusted-total') {
      const v = (a.scores || {})[studentId];
      return v == null ? '' : parseFloat(v).toFixed(1);
    }
    if (col.colType === 'paper') {
      const v = ((a.paperScores || {})[studentId] || {})[col.paperId];
      return v == null ? '' : v;
    }
    if (col.colType === 'paper-set1' || col.colType === 'paper-set2') {
      const rec = ((a.paperScores || {})[studentId] || {})[col.paperId] || {};
      const k = col.colType === 'paper-set1' ? 'set1' : 'set2';
      return rec[k] == null ? '' : rec[k];
    }
    if (col.colType === 'paper-total' || col.colType === 'exam-papers-total') {
      const v = (a.scores || {})[studentId];
      return v == null ? '' : parseFloat(v).toFixed(1);
    }
    return '';
  },

  gradesGetBonusTooltip(studentId, ci) {
    const col = this.gradesOrderedColumns[ci];
    if (!col || col.colType !== 'simple') return null;
    const a = col.assessment;
    const v = (a.scores || {})[studentId];
    if (v == null) return null;
    if (typeof v === 'object') {
      return '卷面分：' + v.base + '\nBonus：' + v.bonus + '\n合計：' + ((v.base || 0) + (v.bonus || 0)) + '\n計算時封頂：' + a.fullMark;
    }
    if (a.type === 'quiz' && parseFloat(v) > a.fullMark) {
      return '得分：' + v + '\n超過滿分 ' + a.fullMark + '\n計算時封頂：' + a.fullMark;
    }
    return null;
  },

  // ★ v14: Mouse enter handler – combined hover row tracking, drag selection extension, tooltip
  gradesOnCellMouseEnter(ev, ri, ci) {
    // Track hover row (for highlighting student row)
    this.gradesHoverRow = ri;

    // Drag selection extension
    if (this.gradesIsDragging && this.gradesDragStartCell) {
      this.gradesSelStart = {
        row: this.gradesDragStartCell.row,
        col: this.gradesDragStartCell.col
      };
      this.gradesSelEnd = { row: ri, col: ci };
    }

    // Bonus tooltip (existing)
    const stu = this.gradesSortedStudents[ri];
    if (!stu) return;
    const tip = this.gradesGetBonusTooltip(stu.id, ci);
    if (tip && !this.gradesIsDragging) {
      const r = ev.currentTarget.getBoundingClientRect();
      this.scoringTooltip = { text: tip, x: r.left + r.width / 2, y: r.top - 8 };
    }
  },

  gradesOnCellMouseLeave() { this.scoringTooltip = null; },

  gradesCellClass(ri, ci, studentId) {
    let cls = 'grades-cell';
    const col = this.gradesOrderedColumns[ci];
    if (!col) return cls;
    const isFocused = this.gradesFocusRow === ri && this.gradesFocusCol === ci;
    const isSelected = this.gradesIsCellInSelection(ri, ci);
    if (isFocused) cls += ' cell-focused';
    else if (isSelected) cls += ' cell-selected';
    if (col.readOnly) cls += ' cell-readonly';
    const disp = this.gradesGetDisplayScore(studentId, ci);
    const rawScore = col.colType === 'simple' ? (col.assessment.scores || {})[studentId] : null;
    if (col.colType === 'simple' && typeof rawScore === 'object' && rawScore !== null) cls += ' cell-bonus';
    else if (col.colType === 'simple' && col.assessment.type === 'quiz' && parseFloat(rawScore) > col.fullMark) cls += ' cell-bonus';
    if (disp !== '' && col.colType !== 'simple' || (col.colType === 'simple' && disp !== '')) {
      let numForCheck;
      if (col.colType === 'simple' && typeof rawScore === 'object') numForCheck = Math.min((rawScore.base||0)+(rawScore.bonus||0), col.fullMark);
      else if (col.colType === 'simple') numForCheck = Math.min(parseFloat(rawScore), col.fullMark);
      else { const v = this.gradesGetDisplayScore(studentId, ci); numForCheck = parseFloat(v); }
      if (!isNaN(numForCheck)) {
        if (numForCheck < 0) cls += ' cell-warning';
        if (this.gradesShowFailHighlight && col.fullMark > 0 && !col.readOnly) {
          if ((numForCheck / col.fullMark) * 100 < this.gradesEffectiveFailPercent) cls += ' cell-fail';
        } else if (this.gradesShowFailHighlight && col.readOnly && (col.colType === 'subitem-total' || col.colType === 'exam-adjusted-total' || col.colType === 'paper-total' || col.colType === 'exam-papers-total')) {
          if (col.fullMark > 0 && (numForCheck / col.fullMark) * 100 < this.gradesEffectiveFailPercent) cls += ' cell-fail';
        }
      }
    }
    if (this.gradesHighlightUnenteredCol === ci && (disp === '' || disp == null)) cls += ' cell-unentered';
    return cls;
  },

  gradesGroupHeaderStyle(gk, customColorKey) {
    if (gk === 'custom' && customColorKey) {
      const c = CUSTOM_CAT_COLORS.find(c => c.key === customColorKey) || CUSTOM_CAT_COLORS[0];
      return { backgroundColor: c.bg, color: c.text, borderColor: c.border };
    }
    const map = {
      assignment:   { backgroundColor:'#DBEAFE', color:'#1E40AF', borderColor:'#93C5FD' },
      quiz:         { backgroundColor:'#DCFCE7', color:'#166534', borderColor:'#86EFAC' },
      cp_ut:        { backgroundColor:'#F3E8FF', color:'#6B21A8', borderColor:'#C4B5FD' },
      unified_test: { backgroundColor:'#FFEDD5', color:'#9A3412', borderColor:'#FDBA74' },
      cp_exam:      { backgroundColor:'#F3E8FF', color:'#6B21A8', borderColor:'#C4B5FD' },
      exam:         { backgroundColor:'#FEE2E2', color:'#991B1B', borderColor:'#FCA5A5' }
    };
    return map[gk] || { backgroundColor:'#F3F4F6', color:'#374151', borderColor:'#D1D5DB' };
  },

  gradesAssessmentHeaderStyle(ci) {
    const col = this.gradesOrderedColumns[ci];
    if (!col) return {};
    const a = col.assessment;
    if (a.type === 'custom' && a.customCategoryId) {
      const cat = (this.currentClass?.customCategories || []).find(c => c.id === a.customCategoryId);
      if (cat) {
        const cc = CUSTOM_CAT_COLORS.find(c => c.key === cat.colorKey) || CUSTOM_CAT_COLORS[0];
        return { backgroundColor: cc.headerBg, color: cc.text };
      }
    }
    const gk = a.type === 'class_performance' ? ('cp_' + (a.period || 'ut')) : a.type;
    const map = {
      assignment:   { backgroundColor:'#EFF6FF', color:'#1D4ED8' },
      quiz:         { backgroundColor:'#F0FDF4', color:'#15803D' },
      cp_ut:        { backgroundColor:'#FAF5FF', color:'#7C3AED' },
      unified_test: { backgroundColor:'#FFF7ED', color:'#C2410C' },
      cp_exam:      { backgroundColor:'#FAF5FF', color:'#7C3AED' },
      exam:         { backgroundColor:'#FEF2F2', color:'#B91C1C' }
    };
    return map[gk] || { backgroundColor:'#F9FAFB', color:'#374151' };
  },

  gradesFormatDate(dateStr) {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length >= 3) return parseInt(parts[2]) + '/' + parseInt(parts[1]) + '/' + parts[0];
    return dateStr;
  },

  gradesToggleUnenteredHighlight(ci) { this.gradesHighlightUnenteredCol = this.gradesHighlightUnenteredCol === ci ? -1 : ci; },

  gradesSetFailPercent(val) {
    if (val === null || val === '' || val === undefined) this.gradesFailPercent = null;
    else { const n = parseFloat(val); this.gradesFailPercent = isNaN(n) ? null : n; }
  },

  gradesShowAssessmentDetail(idx, event) {
    if (!event) return;
    event.stopPropagation();
    const col = this.gradesOrderedColumns[idx];
    if (!col) return;
    const a = col.assessment;
    const rect = event.currentTarget.getBoundingClientRect();
    const pW = Math.min(320, window.innerWidth - 16), pH = 380;
    let x, y;
    if (window.innerWidth < 640) { x = Math.max(8, (window.innerWidth - pW) / 2); y = Math.min(rect.bottom + 8, window.innerHeight - pH - 16); }
    else { x = rect.left + rect.width / 2 - pW / 2; y = rect.bottom + 8; }
    if (x + pW > window.innerWidth - 8) x = window.innerWidth - pW - 8;
    if (x < 8) x = 8;
    if (y + pH > window.innerHeight - 8) y = rect.top - pH - 8;
    if (y < 8) y = 8;
    this.gradesDetailPanel = { assessmentId: a.id, idx, x, y };

    // ★ v14: Initialize Set 1/2 fullMark inline edit value when applicable
    this.$nextTick(() => {
      const info = this.gradesDetailPanelColInfo;
      this.gradesDetailEditFullMark = info ? String(info.currentFullMark) : '';
    });
  },

  gradesCloseDetailPanel() { this.gradesDetailPanel = null; this.gradesDetailEditFullMark = ''; },

  gradesEditAssessmentFromDetail() {
    if (!this.gradesDetailPanel) return;
    const a = (this.gradesTerm?.assessments || []).find(a => a.id === this.gradesDetailPanel.assessmentId);
    if (!a) return;
    this.gradesDetailPanel = null;
    this.openModal('editAssessment', {
      assessmentId: a.id,
      type: a.type,
      name: a.name,
      fullMark: a.fullMark,
      date: a.date || '',
      notes: a.notes || '',
      hasSubItems: a.hasSubItems || false,
      subItems: a.hasSubItems ? JSON.parse(JSON.stringify(a.subItems || [])) : [],
      hasAdjustedPaper: a.hasAdjustedPaper || false,
      adjustedMultiplier: a.adjustedMultiplier != null ? a.adjustedMultiplier : 80,
      passingScore: a.passingScore != null ? a.passingScore : 50,
      // ★ v14: Carry fullMarkS2
      fullMarkS2: a.fullMarkS2 != null ? a.fullMarkS2 : '',
      hasMultiplePapers: a.hasMultiplePapers || false,
      papers: a.hasMultiplePapers ? JSON.parse(JSON.stringify(a.papers || [])) : [],
      yearId: this.currentAcademicYearId,
      classId: this.currentClassId,
      termId: this.gradesTermId
    });
  },

  gradesDeleteAssessmentFromDetail() {
    if (!this.gradesDetailPanel) return;
    const a = (this.gradesTerm?.assessments || []).find(a => a.id === this.gradesDetailPanel.assessmentId);
    if (!a) return;
    this.gradesDetailPanel = null;
    this.openModal('deleteConfirm', { target:'assessment', yearId:this.currentAcademicYearId, classId:this.currentClassId, termId:this.gradesTermId, id:a.id, message:'確定要刪除「'+a.name+'」嗎？', submessage:'該項目的所有分數數據也將被刪除。' });
  },

  // ★ v14: Save the inline-edited Set fullMark and recompute totals
  async gradesSaveSetFullMark() {
    const info = this.gradesDetailPanelColInfo;
    if (!info) return;
    const newFm = parseFloat(this.gradesDetailEditFullMark);
    if (isNaN(newFm) || newFm <= 0) {
      this.addToast('請輸入有效的總分（>0）', 'warning');
      return;
    }
    const a = this.gradesOrderedAssessments.find(x => x.id === info.assessmentId);
    if (!a) return;
    const updateData = {};

    if (info.scope === 'exam') {
      // Top-level adjusted exam (no multi-paper)
      if (info.setKey === 's1') {
        a.fullMark = newFm;
        updateData.fullMark = newFm;
      } else {
        a.fullMarkS2 = newFm;
        updateData.fullMarkS2 = newFm;
      }
      // Recompute every student's adjusted total
      if (a.adjustedScores) {
        for (const sid in a.adjustedScores) {
          this._gradesRecomputeExamAdjustedTotal(a, sid);
        }
      }
      updateData.scores = a.scores || {};
    } else if (info.scope === 'paper') {
      const paper = (a.papers || []).find(p => p.id === info.paperId);
      if (!paper) return;
      if (info.setKey === 's1') {
        paper.fullMark = newFm;
      } else {
        paper.fullMarkS2 = newFm;
      }
      updateData.papers = a.papers;
      if (a.paperScores) {
        for (const sid in a.paperScores) {
          this._gradesRecomputePaperTotal(a, sid);
        }
      }
      updateData.scores = a.scores || {};
    }

    try {
      await db.collection('academicYears').doc(this.currentAcademicYearId)
        .collection('classes').doc(this.currentClassId)
        .collection('terms').doc(this.gradesTermId)
        .collection('assessments').doc(a.id)
        .update(updateData);
      this.addToast('已更新總分（已重新計算所有學生分數）', 'success');
      this.gradesDetailPanel = null;
      this.gradesDetailEditFullMark = '';
    } catch (e) {
      this.addToast('儲存失敗：' + e.message, 'error');
    }
  },

  gradesPushUndo(entry) {
    this.gradesUndoStack.push(entry);
    if (this.gradesUndoStack.length > 50) this.gradesUndoStack.shift();
  },

  gradesUndo() {
    if (this.gradesUndoStack.length === 0) { this.addToast('沒有可復原的操作','warning'); return; }
    this.gradesFocusRow = -1; this.gradesFocusCol = -1;
    const entry = this.gradesUndoStack.pop();
    if (entry.type === 'single') { this.gradesWriteCell(entry.row, entry.col, entry.oldValue); this.gradesFocusCell(entry.row, entry.col); }
    else if (entry.type === 'batch') {
      for (let i = entry.changes.length - 1; i >= 0; i--) { const c = entry.changes[i]; this.gradesWriteCell(c.row, c.col, c.oldValue); }
      if (entry.changes.length > 0) this.gradesFocusCell(entry.changes[0].row, entry.changes[0].col);
    }
    this.addToast('已復原操作','success');
  },

  // ★ v14: Smart copy – outputs only pure numeric values (no "10+2" formula, no "20*" asterisk)
  gradesHandleCopy(e) {
    e.preventDefault();
    // Save any pending edit so the copied value reflects latest changes
    this.gradesSaveCurrentCell();
    const bounds = this.gradesGetSelectionBounds();
    if (!bounds) return;
    const textRows = [];
    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      const cols = [];
      for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
        const stu = this.gradesSortedStudents[r];
        const val = stu ? this.gradesGetCopyValue(stu.id, c) : '';
        cols.push(val);
      }
      textRows.push(cols.join('\t'));
    }
    e.clipboardData.setData('text/plain', textRows.join('\n'));
    this.addToast('已複製 ' + ((bounds.maxRow-bounds.minRow+1)*(bounds.maxCol-bounds.minCol+1)) + ' 個儲存格','success');
  },

  gradesHandlePaste(e) {
    e.preventDefault();
    if (this.gradesFocusRow < 0 || this.gradesFocusCol < 0) return;
    const text = e.clipboardData.getData('text');
    if (!text || !text.trim()) return;
    this.gradesSaveCurrentCell();
    const pasteData = text.trim().split(/\r?\n/).map(line => line.split('\t'));
    const totalRows = this.gradesSortedStudents.length;
    const totalCols = this.gradesOrderedColumns.length;
    const changes = [];
    for (let r = 0; r < pasteData.length; r++) {
      const targetRow = this.gradesFocusRow + r;
      if (targetRow >= totalRows) break;
      for (let c = 0; c < pasteData[r].length; c++) {
        const targetCol = this.gradesFocusCol + c;
        if (targetCol >= totalCols) break;
        const colSpec = this.gradesOrderedColumns[targetCol];
        if (!colSpec || colSpec.readOnly) continue;
        const cellVal = pasteData[r][c].trim();
        const parsed = this.gradesParseInputValue(cellVal, colSpec);
        if (!parsed.ok) continue;
        const oldVal = this.gradesGetRawScoreForInput(this.gradesSortedStudents[targetRow].id, targetCol);
        const oldValParsed = oldVal === '' ? null : oldVal;
        this.gradesWriteCell(targetRow, targetCol, parsed.value);
        changes.push({ row:targetRow, col:targetCol, oldValue:oldValParsed, newValue:parsed.value });
      }
    }
    if (changes.length > 0) { this.gradesPushUndo({ type:'batch', changes }); this.addToast('已貼上 '+changes.length+' 個儲存格','success'); }
    const stu = this.gradesSortedStudents[this.gradesFocusRow];
    if (stu) { const val = this.gradesGetRawScoreForInput(stu.id, this.gradesFocusCol); this.gradesEditValue = val !== '' ? String(val) : ''; this.gradesCellOriginalValue = this.gradesEditValue; }
  },

  gradesClearSelection() {
    const bounds = this.gradesGetSelectionBounds();
    if (!bounds) return;
    const changes = [];
    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
        const colSpec = this.gradesOrderedColumns[c];
        if (!colSpec || colSpec.readOnly) continue;
        const stu = this.gradesSortedStudents[r];
        if (!stu) continue;
        const cur = this.gradesGetRawScoreForInput(stu.id, c);
        if (cur === '') continue;
        const oldVal = cur;
        this.gradesWriteCell(r, c, null);
        changes.push({ row:r, col:c, oldValue:oldVal, newValue:null });
      }
    }
    if (changes.length > 0) {
      if (changes.length === 1) this.gradesPushUndo({ type:'single', ...changes[0] });
      else this.gradesPushUndo({ type:'batch', changes });
    }
    if (this.gradesFocusRow >= 0 && this.gradesFocusCol >= 0) { this.gradesEditValue = ''; this.gradesCellOriginalValue = ''; }
  },

  gradesHandleKeydown(e) {
    const tR = this.gradesSortedStudents.length;
    const tC = this.gradesOrderedColumns.length;
    if (!tR || !tC) return;
    if (this.gradesFocusRow < 0 || this.gradesFocusCol < 0) {
      if (tR > 0 && tC > 0) {
        let fc = 0;
        while (fc < tC && this.gradesOrderedColumns[fc].readOnly) fc++;
        if (fc < tC) this.gradesFocusCell(0, fc);
      }
      return;
    }
    const isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && (e.key === 'c' || e.key === 'C')) return;
    if (isCtrl && (e.key === 'v' || e.key === 'V')) return;
    if (isCtrl && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); this.gradesSaveCurrentCell(); this.gradesUndo(); return; }
    if (isCtrl && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); this.gradesSaveCurrentCell(); this.gradesSelStart={row:0,col:0}; this.gradesSelEnd={row:tR-1,col:tC-1}; this.gradesFocusRow=0; this.gradesFocusCol=0; return; }
    const moveCol = (delta) => {
      let c = this.gradesFocusCol + delta;
      while (c >= 0 && c < tC && this.gradesOrderedColumns[c].readOnly) c += delta;
      return (c < 0 || c >= tC) ? this.gradesFocusCol : c;
    };
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); if (this.gradesFocusRow > 0) this.gradesFocusCell(this.gradesFocusRow-1, this.gradesFocusCol, e.shiftKey); break;
      case 'ArrowDown': e.preventDefault(); if (this.gradesFocusRow < tR-1) this.gradesFocusCell(this.gradesFocusRow+1, this.gradesFocusCol, e.shiftKey); break;
      case 'ArrowLeft': e.preventDefault(); { const c = moveCol(-1); if (c !== this.gradesFocusCol) this.gradesFocusCell(this.gradesFocusRow, c, e.shiftKey); } break;
      case 'ArrowRight': e.preventDefault(); { const c = moveCol(1); if (c !== this.gradesFocusCol) this.gradesFocusCell(this.gradesFocusRow, c, e.shiftKey); } break;
      case 'Enter': e.preventDefault(); if (e.shiftKey) { if (this.gradesFocusRow>0) this.gradesFocusCell(this.gradesFocusRow-1,this.gradesFocusCol); } else { if (this.gradesFocusRow<tR-1) this.gradesFocusCell(this.gradesFocusRow+1,this.gradesFocusCol); else this.gradesSaveCurrentCell(); } break;
      case 'Tab': e.preventDefault(); if (e.shiftKey) { const c = moveCol(-1); if (c !== this.gradesFocusCol) this.gradesFocusCell(this.gradesFocusRow, c); } else { const c = moveCol(1); if (c !== this.gradesFocusCol) this.gradesFocusCell(this.gradesFocusRow, c); else this.gradesSaveCurrentCell(); } break;
      case 'Delete': e.preventDefault(); this.gradesClearSelection(); break;
      case 'Backspace': if (this.gradesIsMultiSelection()) { e.preventDefault(); this.gradesClearSelection(); } break;
      case 'Escape': e.preventDefault(); if (this.gradesDetailPanel) { this.gradesDetailPanel=null; break; } if (this.gradesHighlightUnenteredCol>=0) { this.gradesHighlightUnenteredCol=-1; break; } if (this.gradesEditValue!==this.gradesCellOriginalValue) this.gradesEditValue=this.gradesCellOriginalValue||''; else this.gradesDeselect(); break;
      case 'F2': e.preventDefault(); this.$nextTick(()=>{ const input=this.$refs.gradesEditInput; const el=Array.isArray(input)?input[0]:input; if(el){try{el.setSelectionRange(el.value.length,el.value.length);}catch(ex){}} }); break;
      default:
        if (/^[0-9.+\-]$/.test(e.key) && !isCtrl) {} else if (e.key.length === 1 && !isCtrl) e.preventDefault(); break;
    }
  },

  gradesSaveAssessmentDebounced(assessment) {
    const key = assessment.id;
    if (this.gradesSaveTimers[key]) clearTimeout(this.gradesSaveTimers[key]);
    this.gradesSavingCells = { ...this.gradesSavingCells, [key]: true };
    this.gradesSaveTimers[key] = setTimeout(async () => {
      try {
        const updateData = { scores: assessment.scores || {} };
        if (assessment.hasSubItems) updateData.subItemScores = assessment.subItemScores || {};
        if (assessment.type === 'exam' && assessment.hasAdjustedPaper && !assessment.hasMultiplePapers) updateData.adjustedScores = assessment.adjustedScores || {};
        if (assessment.type === 'exam' && assessment.hasMultiplePapers) updateData.paperScores = assessment.paperScores || {};
        await db.collection('academicYears').doc(this.currentAcademicYearId)
          .collection('classes').doc(this.currentClassId)
          .collection('terms').doc(this.gradesTermId)
          .collection('assessments').doc(assessment.id)
          .update(updateData);
        const c = { ...this.gradesSavingCells }; delete c[key]; this.gradesSavingCells = c;
      } catch (err) {
        const c = { ...this.gradesSavingCells }; delete c[key]; this.gradesSavingCells = c;
        this.addToast('保存失敗：' + err.message, 'error');
      }
    }, 300);
  },

  gradesToggleHeaderMenu(idx, event) { this.gradesShowAssessmentDetail(idx, event); },

  gradesEditAssessmentProp(idx) {
    const col = this.gradesOrderedColumns[idx];
    const a = col ? col.assessment : null;
    if (!a) return;
    this.gradesHeaderMenu = null; this.gradesDetailPanel = null;
    this.openModal('editAssessment', {
      assessmentId: a.id,
      type: a.type,
      name: a.name,
      fullMark: a.fullMark,
      date: a.date || '',
      notes: a.notes || '',
      hasSubItems: a.hasSubItems || false,
      subItems: a.hasSubItems ? JSON.parse(JSON.stringify(a.subItems || [])) : [],
      hasAdjustedPaper: a.hasAdjustedPaper || false,
      adjustedMultiplier: a.adjustedMultiplier != null ? a.adjustedMultiplier : 80,
      passingScore: a.passingScore != null ? a.passingScore : 50,
      fullMarkS2: a.fullMarkS2 != null ? a.fullMarkS2 : '',
      hasMultiplePapers: a.hasMultiplePapers || false,
      papers: a.hasMultiplePapers ? JSON.parse(JSON.stringify(a.papers || [])) : [],
      yearId: this.currentAcademicYearId,
      classId: this.currentClassId,
      termId: this.gradesTermId
    });
  },

  gradesDeleteAssessment(idx) {
    const col = this.gradesOrderedColumns[idx];
    const a = col ? col.assessment : null;
    if (!a) return;
    this.gradesHeaderMenu = null; this.gradesDetailPanel = null;
    this.openModal('deleteConfirm', { target:'assessment', yearId:this.currentAcademicYearId, classId:this.currentClassId, termId:this.gradesTermId, id:a.id, message:'確定要刪除「'+a.name+'」嗎？', submessage:'該項目的所有分數數據也將被刪除。' });
  },

  gradesScrollToColumn(assessmentId) {
    const ord = this.gradesOrderedColumns;
    const idx = ord.findIndex(c => c.assessment.id === assessmentId);
    if (idx < 0) return;
    this.gradesHighlightCol = idx;
    this.$nextTick(() => {
      const wrapper = this.$refs.gradesWrapper;
      const el = wrapper && wrapper.querySelector ? wrapper.querySelector('[data-acol="'+idx+'"]') : document.querySelector('[data-acol="'+idx+'"]');
      if (el) el.scrollIntoView({ behavior:'smooth', inline:'center', block:'nearest' });
      setTimeout(() => { this.gradesHighlightCol = -1; }, 1500);
    });
  },

  gradesModalAddSubItem() {
    if (!this.modalData.subItems) this.modalData.subItems = [];
    this.modalData.subItems.push({ id: 'new_' + Date.now() + '_' + Math.random().toString(36).substr(2,4), name: '', fullMark: 10 });
  },
  gradesModalRemoveSubItem(idx) { if (this.modalData.subItems) this.modalData.subItems.splice(idx, 1); },
  gradesModalAddPaper() {
    if (!this.modalData.papers) this.modalData.papers = [];
    const n = this.modalData.papers.length + 1;
    this.modalData.papers.push({
      id: 'new_' + Date.now() + '_' + Math.random().toString(36).substr(2,4),
      name: '卷' + n,
      fullMark: 50,
      fullMarkS2: '', // ★ v14
      weight: 50
    });
    const avg = Math.round(100 / this.modalData.papers.length);
    this.modalData.papers.forEach((p, i, arr) => { p.weight = i === arr.length - 1 ? 100 - avg * (arr.length - 1) : avg; });
  },
  gradesModalRemovePaper(idx) {
    if (this.modalData.papers) {
      this.modalData.papers.splice(idx, 1);
      const n = this.modalData.papers.length;
      if (n > 0) {
        const avg = Math.round(100 / n);
        this.modalData.papers.forEach((p, i, arr) => { p.weight = i === arr.length - 1 ? 100 - avg * (arr.length - 1) : avg; });
      }
    }
  }
};

const GradesComputed = {
  gradesReady() { return !!(this.currentAcademicYear && this.currentClass); },
  gradesTerm() { if (!this.currentClass || !this.gradesTermId) return null; return (this.currentClass.terms || []).find(t => t.id === this.gradesTermId) || null; },
  gradesOrderedAssessments() {
    const term = this.gradesTerm; if (!term) return [];
    const all = term.assessments || [];
    const grouped = { assignment: [], quiz: [] };
    const customGroups = {};
    grouped.cp_ut = []; grouped.unified_test = []; grouped.cp_exam = []; grouped.exam = [];
    for (const a of all) {
      if (a.type === 'class_performance') { (a.period === 'exam' ? grouped.cp_exam : grouped.cp_ut).push(a); }
      else if (a.type === 'custom') {
        const cid = a.customCategoryId || '__none__';
        if (!customGroups[cid]) customGroups[cid] = [];
        customGroups[cid].push(a);
      }
      else if (grouped[a.type]) grouped[a.type].push(a);
    }
    for (const k in grouped) grouped[k].sort((a, b) => (a.order || 0) - (b.order || 0));
    for (const k in customGroups) customGroups[k].sort((a, b) => (a.order || 0) - (b.order || 0));
    const customCats = (this.currentClass?.customCategories || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const result = [...grouped.assignment, ...grouped.quiz];
    for (const cc of customCats) { if (customGroups[cc.id]) result.push(...customGroups[cc.id]); }
    result.push(...grouped.cp_ut, ...grouped.unified_test, ...grouped.cp_exam, ...grouped.exam);
    return result;
  },

  gradesOrderedColumns() {
    const assessments = this.gradesOrderedAssessments;
    const cols = [];
    for (const a of assessments) {
      cols.push(...this._buildColumnsForAssessment(a));
    }
    cols.forEach((c, i) => c.colIdx = i);
    return cols;
  },

  gradesAssessmentHeaders() {
    const cols = this.gradesOrderedColumns;
    const headers = [];
    let i = 0;
    while (i < cols.length) {
      const a = cols[i].assessment;
      let j = i;
      while (j < cols.length && cols[j].assessment.id === a.id) j++;
      headers.push({ assessment: a, colspan: j - i, startCol: i });
      i = j;
    }
    return headers;
  },

  gradesColumnGroups() {
    const cols = this.gradesOrderedColumns;
    if (!cols.length) return [];
    const labels = { assignment:'課業', quiz:'小測', cp_ut:'課堂表現(統測)', unified_test:'統測', cp_exam:'課堂表現(考試)', exam:'考試' };
    const groups = []; let last = null, lastCC = null;
    for (let i = 0; i < cols.length; i++) {
      const a = cols[i].assessment;
      let gk, gLabel, customColorKey = null;
      if (a.type === 'custom') {
        const cat = (this.currentClass?.customCategories || []).find(c => c.id === a.customCategoryId);
        gk = 'custom';
        gLabel = cat ? cat.name : '自訂類別';
        customColorKey = cat ? cat.colorKey : 'teal';
        const ccId = a.customCategoryId;
        if (gk === last && ccId === lastCC) groups[groups.length-1].colspan++;
        else { groups.push({ key: gk, label: gLabel, colspan: 1, startIdx: i, customColorKey, customCategoryId: ccId }); last = gk; lastCC = ccId; }
      } else {
        gk = a.type === 'class_performance' ? ('cp_' + (a.period || 'ut')) : a.type;
        if (gk !== last || lastCC !== null) { groups.push({ key: gk, label: labels[gk] || gk, colspan: 1, startIdx: i }); last = gk; lastCC = null; }
        else groups[groups.length-1].colspan++;
      }
    }
    return groups;
  },

  gradesNeedsRow4() {
    return this.gradesOrderedColumns.some(c => c.colType === 'paper-set1' || c.colType === 'paper-set2');
  },

  gradesRow3Headers() {
    const cols = this.gradesOrderedColumns;
    const needsR4 = this.gradesNeedsRow4;
    const result = [];
    let i = 0;
    while (i < cols.length) {
      const c = cols[i];
      if (c.colType === 'paper-set1' || c.colType === 'paper-set2') {
        let j = i;
        while (j < cols.length && cols[j].assessment.id === c.assessment.id && cols[j].paperId === c.paperId) j++;
        const paper = (c.assessment.papers || []).find(p => p.id === c.paperId);
        let lbl = paper ? paper.name : '卷';
        if (paper) {
          const fmS1 = paper.fullMark;
          const fmS2 = (paper.fullMarkS2 != null && !isNaN(paper.fullMarkS2) && paper.fullMarkS2 > 0) ? paper.fullMarkS2 : null;
          if (fmS2 && fmS2 !== fmS1) lbl += ' (S1:' + fmS1 + ' / S2:' + fmS2 + ')';
          else lbl += ' (' + fmS1 + ')';
        }
        result.push({ label: lbl, colspan: j - i, rowspan: 1, startCol: i, colSpec: c });
        i = j;
      } else if (c.colType === 'paper' || c.colType === 'paper-total' || c.colType === 'exam-papers-total') {
        result.push({ label: c.label + (c.fullMark && c.colType === 'paper' ? ' (' + c.fullMark + ')' : ''), colspan: 1, rowspan: needsR4 ? 2 : 1, startCol: i, colSpec: c });
        i++;
      } else if (c.colType === 'subitem' || c.colType === 'subitem-total') {
        result.push({ label: c.label + (c.fullMark && c.colType === 'subitem' ? ' (' + c.fullMark + ')' : ''), colspan: 1, rowspan: needsR4 ? 2 : 1, startCol: i, colSpec: c });
        i++;
      } else if (c.colType === 'exam-set1' || c.colType === 'exam-set2') {
        const baseLabel = c.colType === 'exam-set1' ? 'Set 1' : 'Set 2';
        result.push({ label: baseLabel + ' (' + c.fullMark + ')', colspan: 1, rowspan: needsR4 ? 2 : 1, startCol: i, colSpec: c });
        i++;
      } else if (c.colType === 'exam-adjusted-total') {
        result.push({ label: '總分', colspan: 1, rowspan: needsR4 ? 2 : 1, startCol: i, colSpec: c });
        i++;
      } else {
        result.push({ label: this.gradesFormatDate(c.assessment.date), colspan: 1, rowspan: needsR4 ? 2 : 1, startCol: i, colSpec: c });
        i++;
      }
    }
    return result;
  },

  gradesRow4Cells() {
    const cols = this.gradesOrderedColumns;
    const result = [];
    for (const c of cols) {
      if (c.colType === 'paper-set1') result.push({ label: 'Set 1 (' + c.fullMark + ')', colSpec: c });
      else if (c.colType === 'paper-set2') result.push({ label: 'Set 2 (' + c.fullMark + ')', colSpec: c });
    }
    return result;
  },

  gradesHasUT() { return this.gradesOrderedAssessments.some(a => a.type === 'unified_test'); },
  gradesHasExam() { return this.gradesOrderedAssessments.some(a => a.type === 'exam'); },

  gradesSortedStudents() {
    const arr = [...this.currentStudents];
    const isElective = this.currentClass && this.currentClass.classType === 'elective';
    if (isElective) {
      arr.sort((a, b) => {
        const ca = this._findStudentOriginClass(this.currentAcademicYearId, a) || '';
        const cb = this._findStudentOriginClass(this.currentAcademicYearId, b) || '';
        const cn = ca.localeCompare(cb);
        if (cn !== 0) return cn;
        return (parseInt(a.studentNumber)||0) - (parseInt(b.studentNumber)||0);
      });
      return arr;
    }
    arr.sort((a, b) => (parseInt(a.studentNumber)||0)-(parseInt(b.studentNumber)||0));
    return arr;
  },

  gradesStatsData() {
    const cols = this.gradesOrderedColumns;
    const stu = this.gradesSortedStudents;
    const total = stu.length;
    const result = [];
    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci];
      const vals = [];
      for (const s of stu) {
        const disp = this.gradesGetDisplayScore(s.id, ci);
        if (disp === '' || disp == null) continue;
        let n;
        if (col.colType === 'simple') {
          const rawV = (col.assessment.scores || {})[s.id];
          if (typeof rawV === 'object' && rawV !== null) n = Math.min((rawV.base||0)+(rawV.bonus||0), col.fullMark);
          else n = Math.min(parseFloat(rawV), col.fullMark);
        } else {
          n = parseFloat(String(disp).replace('*',''));
        }
        if (!isNaN(n)) vals.push(n);
      }
      if (!vals.length) { result.push({ avg:'—', max:'—', min:'—', median:'—', stddev:'—', count:'0/'+total }); continue; }
      const sum = vals.reduce((a,b)=>a+b,0);
      const mean = sum/vals.length;
      const sorted = [...vals].sort((a,b)=>a-b);
      const mid = Math.floor(sorted.length/2);
      const med = sorted.length%2 ? String(sorted[mid]) : ((sorted[mid-1]+sorted[mid])/2).toFixed(1);
      const variance = vals.reduce((acc,v)=>acc+Math.pow(v-mean,2),0)/vals.length;
      result.push({ avg:mean.toFixed(1), max:String(Math.max(...vals)), min:String(Math.min(...vals)), median:String(med), stddev:Math.sqrt(variance).toFixed(1), count:vals.length+'/'+total });
    }
    return result;
  },
  gradesDetailAssessment() { if (!this.gradesDetailPanel) return null; return this.gradesOrderedAssessments.find(a => a.id === this.gradesDetailPanel.assessmentId) || null; },
  gradesDetailPanelStyle() { if (!this.gradesDetailPanel) return {}; const w=Math.min(320,window.innerWidth-16); return { position:'fixed', top:this.gradesDetailPanel.y+'px', left:this.gradesDetailPanel.x+'px', zIndex:9999, width:w+'px' }; },

  // ★ v14: Returns info for the Set 1/Set 2 column being viewed (null otherwise)
  gradesDetailPanelColInfo() {
    if (!this.gradesDetailPanel) return null;
    const col = this.gradesOrderedColumns[this.gradesDetailPanel.idx];
    if (!col) return null;
    if (col.colType === 'exam-set1' || col.colType === 'exam-set2') {
      const isS1 = col.colType === 'exam-set1';
      const a = col.assessment;
      const cur = isS1 ? a.fullMark : ((a.fullMarkS2 != null && !isNaN(a.fullMarkS2)) ? a.fullMarkS2 : a.fullMark);
      return {
        scope: 'exam',
        setKey: isS1 ? 's1' : 's2',
        setLabel: isS1 ? 'Set 1（正常卷）' : 'Set 2（調適卷）',
        currentFullMark: cur,
        assessmentId: a.id,
        paperName: null
      };
    }
    if (col.colType === 'paper-set1' || col.colType === 'paper-set2') {
      const isS1 = col.colType === 'paper-set1';
      const a = col.assessment;
      const paper = (a.papers || []).find(p => p.id === col.paperId);
      if (!paper) return null;
      const cur = isS1 ? paper.fullMark : ((paper.fullMarkS2 != null && !isNaN(paper.fullMarkS2)) ? paper.fullMarkS2 : paper.fullMark);
      return {
        scope: 'paper',
        setKey: isS1 ? 's1' : 's2',
        setLabel: isS1 ? 'Set 1（正常卷）' : 'Set 2（調適卷）',
        currentFullMark: cur,
        assessmentId: a.id,
        paperId: paper.id,
        paperName: paper.name
      };
    }
    return null;
  },

  gradesAutoFailPercent() {
    if (!this.currentClass) return 50;
    if (this.currentClass.classType === 'elective') return 40;
    const name = (this.currentClass.className||'');
    if (/中[四五六]|[SF]\.?\s*[4-6]/i.test(name)||/^[4-6]\s*[A-Za-z]/i.test(name)) return 40;
    return 50;
  },
  gradesEffectiveFailPercent() { if (this.gradesFailPercent !== null && this.gradesFailPercent !== '' && !isNaN(parseFloat(this.gradesFailPercent))) return parseFloat(this.gradesFailPercent); return this.gradesAutoFailPercent; },

  gradesModalSubItemsTotal() {
    if (!this.modalData || !this.modalData.subItems) return 0;
    return this.modalData.subItems.reduce((s, si) => s + (parseInt(si.fullMark) || 0), 0);
  },
  gradesModalPapersWeightTotal() {
    if (!this.modalData || !this.modalData.papers) return 0;
    return this.modalData.papers.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0);
  }
};

GradesMethods._buildColumnsForAssessment = function(a) {
  const cols = [];
  if (a.hasSubItems && a.subItems && a.subItems.length > 0) {
    for (const si of a.subItems) {
      cols.push({
        colKey: a.id + '-si-' + si.id,
        assessment: a,
        subItemId: si.id,
        colType: 'subitem',
        label: si.name,
        fullMark: si.fullMark,
        readOnly: false
      });
    }
    cols.push({
      colKey: a.id + '-si-total',
      assessment: a,
      colType: 'subitem-total',
      label: '總分',
      fullMark: a.fullMark,
      readOnly: true
    });
    return cols;
  }
  if (a.type === 'exam') {
    const hasAdj = a.hasAdjustedPaper;
    const hasMulti = a.hasMultiplePapers && a.papers && a.papers.length > 0;
    if (hasMulti) {
      for (const p of a.papers) {
        if (hasAdj) {
          // ★ v14: Per-paper independent fullMarks for Set 1 and Set 2
          const pFmS1 = p.fullMark;
          const pFmS2 = (p.fullMarkS2 != null && !isNaN(p.fullMarkS2) && p.fullMarkS2 > 0) ? p.fullMarkS2 : p.fullMark;
          cols.push({ colKey: a.id + '-p-' + p.id + '-s1', assessment: a, paperId: p.id, colType: 'paper-set1', label: 'Set 1', fullMark: pFmS1, readOnly: false });
          cols.push({ colKey: a.id + '-p-' + p.id + '-s2', assessment: a, paperId: p.id, colType: 'paper-set2', label: 'Set 2', fullMark: pFmS2, readOnly: false });
        } else {
          cols.push({ colKey: a.id + '-p-' + p.id, assessment: a, paperId: p.id, colType: 'paper', label: p.name, fullMark: p.fullMark, readOnly: false });
        }
      }
      cols.push({ colKey: a.id + '-ptotal', assessment: a, colType: 'exam-papers-total', label: '考試(總分)', fullMark: a.fullMark, readOnly: true });
      return cols;
    }
    if (hasAdj) {
      // ★ v14: Independent fullMarks for Set 1 (= a.fullMark) and Set 2 (= a.fullMarkS2)
      const fmS1 = a.fullMark;
      const fmS2 = (a.fullMarkS2 != null && !isNaN(a.fullMarkS2) && a.fullMarkS2 > 0) ? a.fullMarkS2 : a.fullMark;
      cols.push({ colKey: a.id + '-s1', assessment: a, colType: 'exam-set1', label: 'Set 1', fullMark: fmS1, readOnly: false });
      cols.push({ colKey: a.id + '-s2', assessment: a, colType: 'exam-set2', label: 'Set 2', fullMark: fmS2, readOnly: false });
      cols.push({ colKey: a.id + '-atotal', assessment: a, colType: 'exam-adjusted-total', label: '總分', fullMark: fmS1, readOnly: true });
      return cols;
    }
  }
  cols.push({ colKey: a.id, assessment: a, colType: 'simple', label: a.name, fullMark: a.fullMark, readOnly: false });
  return cols;
};