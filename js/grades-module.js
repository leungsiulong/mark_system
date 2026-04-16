// ================================================================
// Grades Module - Methods & Computed (v4 — scoreCategory badges)
// ================================================================

const GradesMethods = {

  gradesAutoSelectTerm() {
    if (this.currentClass && this.currentClass.terms && this.currentClass.terms.length > 0) {
      if (!this.gradesTermId || !this.currentClass.terms.find(t => t.id === this.gradesTermId))
        this.gradesTermId = this.currentClass.terms[0].id;
    } else {
      this.gradesTermId = null;
    }
  },

  gradesSelectTerm(termId) {
    this.gradesTermId = termId;
    this.gradesResetFocus();
  },

  gradesSelectTermFromTree(termId) {
    this.gradesTermId = termId;
    this.gradesResetFocus();
  },

  gradesResetFocus() {
    this.gradesSaveCurrentCell();
    this.gradesFocusRow = -1;
    this.gradesFocusCol = -1;
    this.gradesEditValue = '';
    this.gradesCellOriginalValue = '';
    this.gradesHeaderMenu = null;
    this.gradesDetailPanel = null;
    this.gradesSelStart = null;
    this.gradesSelEnd = null;
    this.gradesUndoStack = [];
    this.gradesHighlightUnenteredCol = -1;
  },

  gradesFocusCell(row, col, extend) {
    if (typeof extend === 'object') extend = false;
    if (this._gradesBlurTimer) { clearTimeout(this._gradesBlurTimer); this._gradesBlurTimer = null; }
    const isSameCell = (row === this.gradesFocusRow && col === this.gradesFocusCol);
    this.gradesSaveCurrentCell();
    const prevRow = this.gradesFocusRow;
    const prevCol = this.gradesFocusCol;
    this.gradesFocusRow = row;
    this.gradesFocusCol = col;
    this.gradesHeaderMenu = null;
    this.gradesDetailPanel = null;
    if (!isSameCell) {
      const stu = this.gradesSortedStudents[row];
      if (stu) {
        const val = this.gradesGetScore(stu.id, col);
        this.gradesEditValue = val !== '' ? String(val) : '';
      } else { this.gradesEditValue = ''; }
      this.gradesCellOriginalValue = this.gradesEditValue;
    }
    if (extend) {
      if (!this.gradesSelStart) {
        this.gradesSelStart = { row: prevRow >= 0 ? prevRow : row, col: prevCol >= 0 ? prevCol : col };
      }
      this.gradesSelEnd = { row, col };
    } else {
      this.gradesSelStart = { row, col };
      this.gradesSelEnd = { row, col };
    }
    this.$nextTick(() => {
      const input = this.$refs.gradesEditInput;
      const el = Array.isArray(input) ? input[0] : input;
      if (el) {
        if (document.activeElement !== el) el.focus({ preventScroll: true });
        if (!isSameCell) { try { el.select(); } catch (e) {} }
      }
    });
  },

  gradesSaveCurrentCell() {
    if (this.gradesFocusRow < 0 || this.gradesFocusCol < 0) return;
    const stu = this.gradesSortedStudents[this.gradesFocusRow];
    const assessment = this.gradesOrderedAssessments[this.gradesFocusCol];
    if (!stu || !assessment) return;
    const val = (this.gradesEditValue || '').trim();
    let numVal = null;
    if (val !== '') { numVal = parseFloat(val); if (isNaN(numVal)) return; }
    if (!assessment.scores) assessment.scores = {};
    const prev = assessment.scores[stu.id];
    const prevVal = (prev !== undefined && prev !== null) ? prev : null;
    if (prevVal === numVal) return;
    if (prevVal === null && numVal === null) return;
    if (numVal !== null) assessment.scores[stu.id] = numVal;
    else delete assessment.scores[stu.id];
    this.gradesPushUndo({ type:'single', row:this.gradesFocusRow, col:this.gradesFocusCol, studentId:stu.id, assessmentId:assessment.id, oldValue:prevVal, newValue:numVal });
    this.gradesSaveAssessmentDebounced(assessment);
  },

  gradesIsCellInSelection(row, col) {
    if (!this.gradesSelStart || !this.gradesSelEnd) return false;
    const b = this.gradesGetSelectionBounds();
    if (!b) return false;
    return row >= b.minRow && row <= b.maxRow && col >= b.minCol && col <= b.maxCol;
  },

  gradesGetSelectionBounds() {
    const maxR = this.gradesSortedStudents.length - 1;
    const maxC = this.gradesOrderedAssessments.length - 1;
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

  gradesGetScore(studentId, ci) {
    const a = this.gradesOrderedAssessments[ci];
    if (!a) return '';
    const v = (a.scores || {})[studentId];
    return (v !== undefined && v !== null) ? v : '';
  },

  gradesSetCellValue(row, col, value) {
    const stu = this.gradesSortedStudents[row];
    const assessment = this.gradesOrderedAssessments[col];
    if (!stu || !assessment) return null;
    if (!assessment.scores) assessment.scores = {};
    const prev = assessment.scores[stu.id];
    const oldVal = (prev !== undefined && prev !== null) ? prev : null;
    if (value !== null && value !== undefined) assessment.scores[stu.id] = value;
    else delete assessment.scores[stu.id];
    this.gradesSaveAssessmentDebounced(assessment);
    return oldVal;
  },

  gradesCellClass(ri, ci, studentId, assessment) {
    let cls = 'grades-cell';
    const isFocused = this.gradesFocusRow === ri && this.gradesFocusCol === ci;
    const isSelected = this.gradesIsCellInSelection(ri, ci);
    if (isFocused) cls += ' cell-focused';
    else if (isSelected) cls += ' cell-selected';
    const score = this.gradesGetScore(studentId, ci);
    if (score !== '') {
      const num = parseFloat(score);
      if (!isNaN(num)) {
        if (num > (assessment.fullMark || 100) || num < 0) cls += ' cell-warning';
        if (this.gradesShowFailHighlight) {
          const fm = assessment.fullMark || 100;
          if ((num / fm) * 100 < this.gradesEffectiveFailPercent) cls += ' cell-fail';
        }
      }
    }
    if (this.gradesHighlightUnenteredCol === ci && score === '') cls += ' cell-unentered';
    return cls;
  },

  gradesGroupColor(gk) {
    return { assignment:'bg-blue-50 text-blue-700', quiz:'bg-green-50 text-green-700', cp_ut:'bg-purple-50 text-purple-700', unified_test:'bg-orange-50 text-orange-700', cp_exam:'bg-purple-50 text-purple-700', exam:'bg-red-50 text-red-700' }[gk] || 'bg-gray-50';
  },

  gradesGroupHeaderStyle(gk) {
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
    const a = this.gradesOrderedAssessments[ci];
    if (!a) return {};
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

  gradesToggleUnenteredHighlight(ci) {
    this.gradesHighlightUnenteredCol = this.gradesHighlightUnenteredCol === ci ? -1 : ci;
  },

  gradesSetFailPercent(val) {
    if (val === null || val === '' || val === undefined) this.gradesFailPercent = null;
    else { const n = parseFloat(val); this.gradesFailPercent = isNaN(n) ? null : n; }
  },

  gradesShowAssessmentDetail(idx, event) {
    if (!event) return;
    event.stopPropagation();
    const a = this.gradesOrderedAssessments[idx];
    if (!a) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pW = 320, pH = 320;
    let x, y;
    if (window.innerWidth < 640) { x = Math.max(8, (window.innerWidth - pW) / 2); y = Math.min(rect.bottom + 8, window.innerHeight - pH - 16); }
    else { x = rect.left + rect.width / 2 - pW / 2; y = rect.bottom + 8; }
    if (x + pW > window.innerWidth - 8) x = window.innerWidth - pW - 8;
    if (x < 8) x = 8;
    if (y + pH > window.innerHeight - 8) y = rect.top - pH - 8;
    if (y < 8) y = 8;
    this.gradesDetailPanel = { assessmentId: a.id, idx, x, y };
  },

  gradesCloseDetailPanel() { this.gradesDetailPanel = null; },

  gradesEditAssessmentFromDetail() {
    if (!this.gradesDetailPanel) return;
    const a = this.gradesOrderedAssessments.find(a => a.id === this.gradesDetailPanel.assessmentId);
    if (!a) return;
    this.gradesDetailPanel = null;
    this.openModal('editAssessment', { assessmentId:a.id, name:a.name, fullMark:a.fullMark, date:a.date||'', notes:a.notes||'', yearId:this.currentAcademicYearId, classId:this.currentClassId, termId:this.gradesTermId });
  },

  gradesDeleteAssessmentFromDetail() {
    if (!this.gradesDetailPanel) return;
    const a = this.gradesOrderedAssessments.find(a => a.id === this.gradesDetailPanel.assessmentId);
    if (!a) return;
    this.gradesDetailPanel = null;
    this.openModal('deleteConfirm', { target:'assessment', yearId:this.currentAcademicYearId, classId:this.currentClassId, termId:this.gradesTermId, id:a.id, message:'確定要刪除「'+a.name+'」嗎？', submessage:'該項目的所有分數數據也將被刪除。' });
  },

  gradesPushUndo(entry) {
    this.gradesUndoStack.push(entry);
    if (this.gradesUndoStack.length > 50) this.gradesUndoStack.shift();
  },

  gradesUndo() {
    if (this.gradesUndoStack.length === 0) { this.addToast('沒有可復原的操作','warning'); return; }
    this.gradesFocusRow = -1; this.gradesFocusCol = -1;
    const entry = this.gradesUndoStack.pop();
    if (entry.type === 'single') { this._gradesRestoreCell(entry); this.gradesFocusCell(entry.row, entry.col); }
    else if (entry.type === 'batch') {
      for (let i = entry.changes.length - 1; i >= 0; i--) this._gradesRestoreCell(entry.changes[i]);
      if (entry.changes.length > 0) this.gradesFocusCell(entry.changes[0].row, entry.changes[0].col);
    }
    this.addToast('已復原操作','success');
  },

  _gradesRestoreCell(change) {
    const assessment = this.gradesOrderedAssessments[change.col];
    const stu = this.gradesSortedStudents[change.row];
    if (!assessment || !stu) return;
    if (!assessment.scores) assessment.scores = {};
    if (change.oldValue !== null && change.oldValue !== undefined) assessment.scores[stu.id] = change.oldValue;
    else delete assessment.scores[stu.id];
    this.gradesSaveAssessmentDebounced(assessment);
  },

  gradesHandleCopy(e) {
    e.preventDefault();
    const bounds = this.gradesGetSelectionBounds();
    if (!bounds) return;
    const textRows = [];
    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      const cols = [];
      for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
        if (r === this.gradesFocusRow && c === this.gradesFocusCol) cols.push(this.gradesEditValue || '');
        else { const stu = this.gradesSortedStudents[r]; const val = stu ? this.gradesGetScore(stu.id, c) : ''; cols.push(val !== '' ? String(val) : ''); }
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
    const totalCols = this.gradesOrderedAssessments.length;
    const changes = [];
    for (let r = 0; r < pasteData.length; r++) {
      const targetRow = this.gradesFocusRow + r;
      if (targetRow >= totalRows) break;
      for (let c = 0; c < pasteData[r].length; c++) {
        const targetCol = this.gradesFocusCol + c;
        if (targetCol >= totalCols) break;
        const cellVal = pasteData[r][c].trim();
        let numVal = null;
        if (cellVal !== '') { numVal = parseFloat(cellVal); if (isNaN(numVal)) continue; }
        const stu = this.gradesSortedStudents[targetRow];
        const oldVal = this.gradesSetCellValue(targetRow, targetCol, numVal);
        changes.push({ row:targetRow, col:targetCol, studentId:stu.id, assessmentId:this.gradesOrderedAssessments[targetCol].id, oldValue:oldVal, newValue:numVal });
      }
    }
    if (changes.length > 0) { this.gradesPushUndo({ type:'batch', changes }); this.addToast('已貼上 '+changes.length+' 個儲存格','success'); }
    const stu = this.gradesSortedStudents[this.gradesFocusRow];
    if (stu) { const val = this.gradesGetScore(stu.id, this.gradesFocusCol); this.gradesEditValue = val !== '' ? String(val) : ''; this.gradesCellOriginalValue = this.gradesEditValue; }
  },

  gradesClearSelection() {
    const bounds = this.gradesGetSelectionBounds();
    if (!bounds) return;
    const changes = [];
    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
        const stu = this.gradesSortedStudents[r];
        if (!stu) continue;
        const assessment = this.gradesOrderedAssessments[c];
        if (!assessment) continue;
        if (this.gradesGetScore(stu.id, c) === '') continue;
        const oldVal = this.gradesSetCellValue(r, c, null);
        changes.push({ row:r, col:c, studentId:stu.id, assessmentId:assessment.id, oldValue:oldVal, newValue:null });
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
    const tC = this.gradesOrderedAssessments.length;
    if (!tR || !tC) return;
    if (this.gradesFocusRow < 0 || this.gradesFocusCol < 0) { if (tR > 0 && tC > 0) this.gradesFocusCell(0, 0); return; }
    const isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && (e.key === 'c' || e.key === 'C')) return;
    if (isCtrl && (e.key === 'v' || e.key === 'V')) return;
    if (isCtrl && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); this.gradesSaveCurrentCell(); this.gradesUndo(); return; }
    if (isCtrl && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); this.gradesSaveCurrentCell(); this.gradesSelStart={row:0,col:0}; this.gradesSelEnd={row:tR-1,col:tC-1}; this.gradesFocusRow=0; this.gradesFocusCol=0; return; }
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); if (this.gradesFocusRow > 0) this.gradesFocusCell(this.gradesFocusRow-1, this.gradesFocusCol, e.shiftKey); break;
      case 'ArrowDown': e.preventDefault(); if (this.gradesFocusRow < tR-1) this.gradesFocusCell(this.gradesFocusRow+1, this.gradesFocusCol, e.shiftKey); break;
      case 'ArrowLeft': e.preventDefault(); if (this.gradesFocusCol > 0) this.gradesFocusCell(this.gradesFocusRow, this.gradesFocusCol-1, e.shiftKey); break;
      case 'ArrowRight': e.preventDefault(); if (this.gradesFocusCol < tC-1) this.gradesFocusCell(this.gradesFocusRow, this.gradesFocusCol+1, e.shiftKey); break;
      case 'Enter': e.preventDefault(); if (e.shiftKey) { if (this.gradesFocusRow>0) this.gradesFocusCell(this.gradesFocusRow-1,this.gradesFocusCol); } else { if (this.gradesFocusRow<tR-1) this.gradesFocusCell(this.gradesFocusRow+1,this.gradesFocusCol); else this.gradesSaveCurrentCell(); } break;
      case 'Tab': e.preventDefault(); if (e.shiftKey) { if (this.gradesFocusCol>0) this.gradesFocusCell(this.gradesFocusRow,this.gradesFocusCol-1); } else { if (this.gradesFocusCol<tC-1) this.gradesFocusCell(this.gradesFocusRow,this.gradesFocusCol+1); else this.gradesSaveCurrentCell(); } break;
      case 'Delete': e.preventDefault(); this.gradesClearSelection(); break;
      case 'Backspace': if (this.gradesIsMultiSelection()) { e.preventDefault(); this.gradesClearSelection(); } break;
      case 'Escape': e.preventDefault(); if (this.gradesDetailPanel) { this.gradesDetailPanel=null; break; } if (this.gradesHighlightUnenteredCol>=0) { this.gradesHighlightUnenteredCol=-1; break; } if (this.gradesEditValue!==this.gradesCellOriginalValue) this.gradesEditValue=this.gradesCellOriginalValue||''; else this.gradesDeselect(); break;
      case 'F2': e.preventDefault(); this.$nextTick(()=>{ const input=this.$refs.gradesEditInput; const el=Array.isArray(input)?input[0]:input; if(el){try{el.setSelectionRange(el.value.length,el.value.length);}catch(ex){}} }); break;
      default: if (/^[0-9.\-]$/.test(e.key) && !isCtrl) {} else if (e.key.length === 1 && !isCtrl) e.preventDefault(); break;
    }
  },

  gradesSaveAssessmentDebounced(assessment) {
    const key = assessment.id;
    if (this.gradesSaveTimers[key]) clearTimeout(this.gradesSaveTimers[key]);
    this.gradesSavingCells = { ...this.gradesSavingCells, [key]: true };
    this.gradesSaveTimers[key] = setTimeout(async () => {
      try {
        await db.collection('academicYears').doc(this.currentAcademicYearId)
          .collection('classes').doc(this.currentClassId)
          .collection('terms').doc(this.gradesTermId)
          .collection('assessments').doc(assessment.id)
          .update({ scores: assessment.scores || {} });
        const c = { ...this.gradesSavingCells }; delete c[key]; this.gradesSavingCells = c;
      } catch (err) {
        const c = { ...this.gradesSavingCells }; delete c[key]; this.gradesSavingCells = c;
        this.addToast('保存失敗：' + err.message, 'error');
      }
    }, 300);
  },

  gradesToggleHeaderMenu(idx, event) { this.gradesShowAssessmentDetail(idx, event); },

  gradesEditAssessmentProp(idx) {
    const a = this.gradesOrderedAssessments[idx];
    this.gradesHeaderMenu = null; this.gradesDetailPanel = null;
    this.openModal('editAssessment', { assessmentId:a.id, name:a.name, fullMark:a.fullMark, date:a.date||'', notes:a.notes||'', yearId:this.currentAcademicYearId, classId:this.currentClassId, termId:this.gradesTermId });
  },

  gradesDeleteAssessment(idx) {
    const a = this.gradesOrderedAssessments[idx];
    this.gradesHeaderMenu = null; this.gradesDetailPanel = null;
    this.openModal('deleteConfirm', { target:'assessment', yearId:this.currentAcademicYearId, classId:this.currentClassId, termId:this.gradesTermId, id:a.id, message:'確定要刪除「'+a.name+'」嗎？', submessage:'該項目的所有分數數據也將被刪除。' });
  },

  getTermOrderedAssessments(term) {
    const all = term.assessments || [];
    const g = { assignment:[], quiz:[], cp_ut:[], unified_test:[], cp_exam:[], exam:[] };
    for (const a of all) {
      if (a.type === 'class_performance') (a.period === 'exam' ? g.cp_exam : g.cp_ut).push(a);
      else if (g[a.type]) g[a.type].push(a);
    }
    for (const k in g) g[k].sort((a, b) => (a.order || 0) - (b.order || 0));
    return [...g.assignment, ...g.quiz, ...g.cp_ut, ...g.unified_test, ...g.cp_exam, ...g.exam];
  },

  gradesScrollToColumn(assessmentId) {
    const ord = this.gradesOrderedAssessments;
    const idx = ord.findIndex(a => a.id === assessmentId);
    if (idx < 0) return;
    this.gradesHighlightCol = idx;
    this.$nextTick(() => {
      const wrapper = this.$refs.gradesWrapper;
      const el = wrapper && wrapper.querySelector ? wrapper.querySelector('[data-acol="'+idx+'"]') : document.querySelector('[data-acol="'+idx+'"]');
      if (el) el.scrollIntoView({ behavior:'smooth', inline:'center', block:'nearest' });
      setTimeout(() => { this.gradesHighlightCol = -1; }, 1500);
    });
  }
};

const GradesComputed = {
  gradesReady() { return !!(this.currentAcademicYear && this.currentClass); },
  gradesTerm() { if (!this.currentClass || !this.gradesTermId) return null; return (this.currentClass.terms || []).find(t => t.id === this.gradesTermId) || null; },
  gradesOrderedAssessments() {
    const term = this.gradesTerm; if (!term) return [];
    const all = term.assessments || [];
    const g = { assignment:[], quiz:[], cp_ut:[], unified_test:[], cp_exam:[], exam:[] };
    for (const a of all) { if (a.type==='class_performance') (a.period==='exam'?g.cp_exam:g.cp_ut).push(a); else if (g[a.type]) g[a.type].push(a); }
    for (const k in g) g[k].sort((a, b) => (a.order||0)-(b.order||0));
    return [...g.assignment, ...g.quiz, ...g.cp_ut, ...g.unified_test, ...g.cp_exam, ...g.exam];
  },
  gradesColumnGroups() {
    const ord = this.gradesOrderedAssessments; if (!ord.length) return [];
    const labels = { assignment:'課業', quiz:'小測', cp_ut:'課堂表現(統測)', unified_test:'統測', cp_exam:'課堂表現(考試)', exam:'考試' };
    const groups = []; let last = null;
    for (let i = 0; i < ord.length; i++) {
      const a = ord[i];
      const gk = a.type === 'class_performance' ? ('cp_' + (a.period || 'ut')) : a.type;
      if (gk !== last) { groups.push({ key:gk, label:labels[gk]||gk, colspan:1, startIdx:i }); last = gk; }
      else groups[groups.length-1].colspan++;
    }
    return groups;
  },
  gradesHasUT() { return this.gradesOrderedAssessments.some(a => a.type === 'unified_test'); },
  gradesHasExam() { return this.gradesOrderedAssessments.some(a => a.type === 'exam'); },
  gradesSortedStudents() {
    const arr = [...this.currentStudents];
    arr.sort((a, b) => (parseInt(a.studentNumber)||0)-(parseInt(b.studentNumber)||0));
    return arr;
  },
  gradesStatsData() {
    const ord = this.gradesOrderedAssessments;
    const stu = this.gradesSortedStudents;
    const total = stu.length;
    const result = [];
    for (let ci = 0; ci < ord.length; ci++) {
      const sc = ord[ci].scores || {};
      const vals = [];
      for (const s of stu) { const v = sc[s.id]; if (v != null && v !== '') { const n = parseFloat(v); if (!isNaN(n)) vals.push(n); } }
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
  gradesDetailPanelStyle() { if (!this.gradesDetailPanel) return {}; return { position:'fixed', top:this.gradesDetailPanel.y+'px', left:this.gradesDetailPanel.x+'px', zIndex:9999, width:'320px' }; },
  gradesAutoFailPercent() { if (!this.currentClass) return 50; const name=(this.currentClass.className||''); if (/中[四五六]|[SF]\.?\s*[4-6]/i.test(name)||/^[4-6]\s*[A-Za-z]/i.test(name)) return 40; return 50; },
  gradesEffectiveFailPercent() { if (this.gradesFailPercent !== null && this.gradesFailPercent !== '' && !isNaN(parseFloat(this.gradesFailPercent))) return parseFloat(this.gradesFailPercent); return this.gradesAutoFailPercent; }
};