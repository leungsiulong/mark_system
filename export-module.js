// ================================================================
// Export Module (v1 — Excel (ExcelJS) + PDF (html2canvas + jsPDF))
//   - 成績輸入：完整還原多層表頭、合併儲存格、課業類別分組、顏色、不合格/加分標示
//   - 總分計算：計算結果表 + 全年總分報表
// ================================================================
const ExportMethods = {

    // ---------- 共用小工具 ----------
    _exportHexToARGB(hex) {
      if (!hex) return null;
      let h = String(hex).replace('#', '').trim();
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      if (h.length !== 6) return null;
      return 'FF' + h.toUpperCase();
    },
  
    _exportFileBaseName() {
      const cls = this.currentClass;
      const parts = [];
      if (cls) {
        if (cls.className) parts.push(cls.className);
        if (cls.subject) parts.push(cls.subject);
      }
      if (!parts.length) parts.push('成績');
      if (this.gradesTerm && this.gradesTerm.name) parts.push(this.gradesTerm.name);
      return parts.join('_');
    },
  
    _exportPdfTitle() {
      const cls = this.currentClass;
      let t = '';
      if (cls) t += cls.className + (cls.subject ? ' - ' + cls.subject : '');
      if (this.gradesTerm) t += '　' + this.gradesTerm.name;
      t += '　成績表';
      return t;
    },
  
    _exportTriggerDownload(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  
    _exportAssertLibs(needExcel, needPdf) {
      if (needExcel && typeof ExcelJS === 'undefined') { this.addToast('Excel 套件尚未載入', 'error'); return false; }
      if (needPdf && (typeof html2canvas === 'undefined' || !window.jspdf)) { this.addToast('PDF 套件尚未載入', 'error'); return false; }
      return true;
    },
  
    // ============================================================
    //  成績輸入 — 模型建立
    // ============================================================
    _gradesExportAssessmentLabel(a) {
      let t = a.name + ' (' + a.fullMark + ')';
      if (a.type === 'assignment' || a.type === 'quiz' || a.type === 'custom') {
        if (a.scoreCategory === 'ut') t += ' [統測]';
        else if (a.scoreCategory === 'exam') t += ' [考試]';
      }
      return t;
    },
  
    // 建立與畫面一致的多層表頭矩陣（含合併資訊）
    _gradesExportHeaderMatrix() {
      const elective = this.isCurrentClassElective;
      const frozen = [];
      if (elective) frozen.push('班別');
      frozen.push('學號', '姓名');
      const frozenCount = frozen.length;
      const headerRowCount = this.gradesHeaderRowspan;
      const leafCols = this.gradesOrderedColumns;
      const totalCols = frozenCount + leafCols.length;
      const cells = [];
      const gc = (leafStart) => frozenCount + leafStart;
  
      // 凍結直欄（學號 / 姓名 / 班別）跨整個表頭高度
      frozen.forEach((label, i) => {
        cells.push({ r: 0, c: i, rs: headerRowCount, cs: 1, text: label, kind: 'frozenHeader' });
      });
  
      // 第 0 列：群組標題（課業 / 小測 ...）
      for (const g of this.gradesColumnGroups) {
        cells.push({ r: 0, c: gc(g.startIdx), rs: 1, cs: g.colspan, text: g.label, kind: 'group', groupKey: g.key, customColorKey: g.customColorKey });
      }
  
      let baseRow;
      if (this.gradesHasAsgCat) {
        // 第 1 列：課業類別 / 其他評估（rowspan=2）
        for (const seg of this.gradesCategoryRowSegments) {
          if (seg.kind === 'category') {
            cells.push({ r: 1, c: gc(seg.startCol), rs: 1, cs: seg.colspan, text: seg.label, kind: 'asgCat', startCol: seg.startCol });
          } else {
            cells.push({ r: 1, c: gc(seg.startCol), rs: 2, cs: seg.colspan, text: this._gradesExportAssessmentLabel(seg.assessment), kind: 'assessment', startCol: seg.startCol });
          }
        }
        // 第 2 列：課業名稱（含類別序號）
        for (const nh of this.gradesAssignmentNameHeaders) {
          const prefix = nh.count ? '(' + nh.count + ') ' : '';
          cells.push({ r: 2, c: gc(nh.startCol), rs: 1, cs: nh.colspan, text: prefix + this._gradesExportAssessmentLabel(nh.assessment), kind: 'assessment', startCol: nh.startCol });
        }
        baseRow = 3;
      } else {
        // 第 1 列：評估標題
        for (const ah of this.gradesAssessmentHeaders) {
          cells.push({ r: 1, c: gc(ah.startCol), rs: 1, cs: ah.colspan, text: this._gradesExportAssessmentLabel(ah.assessment), kind: 'assessment', startCol: ah.startCol });
        }
        baseRow = 2;
      }
  
      // 日期 / 小項目 / Set 標籤列
      const needsRow4 = this.gradesNeedsRow4;
      for (const h of this.gradesRow3Headers) {
        cells.push({ r: baseRow, c: gc(h.startCol), rs: h.rowspan, cs: h.colspan, text: h.label, kind: 'row3', startCol: h.startCol });
      }
      if (needsRow4) {
        for (const r4 of this.gradesRow4Cells) {
          const ci = r4.colSpec.colIdx;
          cells.push({ r: baseRow + 1, c: gc(ci), rs: 1, cs: 1, text: r4.label, kind: 'row4', startCol: ci });
        }
      }
  
      return { cells, headerRowCount, frozenCount, totalCols, leafCols };
    },
  
    _gradesExportValue(studentId, ci) {
      return this.gradesGetCopyValue(studentId, ci);
    },
  
    _gradesExportColumnRawStats(colValues) {
      const nums = [];
      for (const v of colValues) {
        if (v === '' || v == null) continue;
        const n = parseFloat(String(v).replace('*', ''));
        if (!isNaN(n)) nums.push(n);
      }
      const total = colValues.length;
      if (!nums.length) return { avg: '—', max: '—', min: '—', median: '—', stddev: '—', count: '0/' + total };
      const sum = nums.reduce((a, b) => a + b, 0);
      const mean = sum / nums.length;
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      const variance = nums.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / nums.length;
      const fmt = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1);
      return {
        avg: mean.toFixed(1), max: fmt(Math.max(...nums)), min: fmt(Math.min(...nums)),
        median: fmt(med), stddev: Math.sqrt(variance).toFixed(1), count: nums.length + '/' + total
      };
    },
  
    _gradesExportDataCellFill(col, studentId) {
      const a = col.assessment;
      let fill = null;
      if (col.readOnly) fill = '#FAFAF9';
      if (col.colType === 'simple') {
        const raw = (a.scores || {})[studentId];
        if (typeof raw === 'object' && raw !== null) fill = '#E6E4DF';
        else if (a.type === 'quiz' && raw != null && raw !== '' && parseFloat(raw) > col.fullMark) fill = '#E6E4DF';
      }
      if (this.gradesShowFailHighlight && col.fullMark > 0) {
        let val = null;
        if (col.colType === 'simple') {
          const raw = (a.scores || {})[studentId];
          if (typeof raw === 'object' && raw !== null) val = Math.min((raw.base || 0) + (raw.bonus || 0), col.fullMark);
          else if (raw != null && raw !== '') val = Math.min(parseFloat(raw), col.fullMark);
        } else if (col.readOnly && (col.colType === 'subitem-total' || col.colType === 'exam-adjusted-total' || col.colType === 'paper-total' || col.colType === 'exam-papers-total')) {
          const raw = (a.scores || {})[studentId];
          if (raw != null) val = parseFloat(raw);
        } else {
          const disp = this.gradesGetDisplayScore(studentId, col.colIdx);
          if (disp !== '' && disp != null) val = parseFloat(String(disp).replace('*', ''));
        }
        if (val != null && !isNaN(val) && (val / col.fullMark) * 100 < this.gradesEffectiveFailPercent) fill = '#FEE2E2';
      }
      return fill;
    },
  
    // ============================================================
    //  成績輸入 — Excel 匯出
    // ============================================================
    async exportGradesExcel() {
      this.gradesExportMenuOpen = false;
      if (!this.gradesTerm || !this.gradesSortedStudents.length) { this.addToast('無數據可匯出', 'warning'); return; }
      if (!this._exportAssertLibs(true, false)) return;
      try {
        this.gradesSaveCurrentCell();
        const model = this._gradesExportHeaderMatrix();
        const leafCols = model.leafCols;
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet((this.gradesTerm.name || '成績').substring(0, 28));
        const thin = { style: 'thin', color: { argb: 'FFD1D5DB' } };
        const borderAll = { top: thin, left: thin, bottom: thin, right: thin };
  
        // ---- 表頭 ----
        for (const cell of model.cells) {
          const r1 = cell.r + 1, c1 = cell.c + 1;
          const r2 = cell.r + cell.rs, c2 = cell.c + cell.cs;
          if (cell.rs > 1 || cell.cs > 1) ws.mergeCells(r1, c1, r2, c2);
          let bg = null, color = '#374151';
          if (cell.kind === 'frozenHeader') bg = '#F9FAFB';
          else if (cell.kind === 'group') { const st = this.gradesGroupHeaderStyle(cell.groupKey, cell.customColorKey); bg = st.backgroundColor; color = st.color; }
          else { const st = this.gradesAssessmentHeaderStyle(cell.startCol); bg = st.backgroundColor; color = st.color; }
          const fillArgb = this._exportHexToARGB(bg);
          const fill = fillArgb ? { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } } : null;
          const font = { bold: true, size: 10, color: { argb: this._exportHexToARGB(color) || 'FF374151' } };
          const align = { horizontal: 'center', vertical: 'middle', wrapText: true };
          for (let rr = r1; rr <= r2; rr++) {
            for (let ccc = c1; ccc <= c2; ccc++) {
              const xc = ws.getCell(rr, ccc);
              if (fill) xc.fill = fill;
              xc.font = font; xc.alignment = align; xc.border = borderAll;
            }
          }
          ws.getCell(r1, c1).value = cell.text;
        }
  
        // ---- 資料列 ----
        let rowPtr = model.headerRowCount;
        const colValuesPerLeaf = leafCols.map(() => []);
        for (const s of this.gradesSortedStudents) {
          const er = rowPtr + 1;
          let cc = 1;
          if (this.isCurrentClassElective) { const xc = ws.getCell(er, cc); xc.value = this.getStudentOriginClass(s) || ''; xc.alignment = { horizontal: 'center', vertical: 'middle' }; xc.border = borderAll; xc.font = { size: 10 }; cc++; }
          { const xc = ws.getCell(er, cc); xc.value = s.studentNumber; xc.alignment = { horizontal: 'center', vertical: 'middle' }; xc.border = borderAll; xc.font = { size: 10 }; cc++; }
          { const xc = ws.getCell(er, cc); xc.value = s.studentName; xc.alignment = { horizontal: 'left', vertical: 'middle' }; xc.border = borderAll; xc.font = { size: 10 }; cc++; }
          for (let li = 0; li < leafCols.length; li++) {
            const col = leafCols[li];
            const raw = this._gradesExportValue(s.id, li);
            colValuesPerLeaf[li].push(raw);
            const xc = ws.getCell(er, model.frozenCount + li + 1);
            const num = parseFloat(String(raw).replace('*', ''));
            xc.value = (raw === '' || raw == null) ? null : (!isNaN(num) && String(raw).indexOf('+') < 0 ? num : raw);
            xc.alignment = { horizontal: 'center', vertical: 'middle' };
            xc.border = borderAll;
            xc.font = { size: 10 };
            const argb = this._exportHexToARGB(this._gradesExportDataCellFill(col, s.id));
            if (argb) xc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
          }
          rowPtr++;
        }
  
        // ---- 統計列 ----
        const statRows = [
          { key: 'avg', label: '平均' }, { key: 'max', label: '最高' }, { key: 'min', label: '最低' },
          { key: 'median', label: '中位數' }, { key: 'stddev', label: '標準差' }, { key: 'count', label: '已輸入' }
        ];
        const leafStats = colValuesPerLeaf.map(v => this._gradesExportColumnRawStats(v));
        const statFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
        for (const stat of statRows) {
          const er = rowPtr + 1;
          let cc = 1;
          const styleStat = (xc, isLabel) => { xc.alignment = { horizontal: isLabel ? 'left' : 'center', vertical: 'middle' }; xc.border = borderAll; xc.font = { size: 9, bold: !!isLabel, color: { argb: 'FF6B7280' } }; xc.fill = statFill; };
          if (this.isCurrentClassElective) { const xc = ws.getCell(er, cc); xc.value = ''; styleStat(xc, false); cc++; }
          { const xc = ws.getCell(er, cc); xc.value = ''; styleStat(xc, false); cc++; }
          { const xc = ws.getCell(er, cc); xc.value = stat.label; styleStat(xc, true); cc++; }
          for (let li = 0; li < leafCols.length; li++) {
            const xc = ws.getCell(er, model.frozenCount + li + 1);
            xc.value = leafStats[li][stat.key];
            styleStat(xc, false);
          }
          rowPtr++;
        }
  
        // ---- 欄寬 + 凍結窗格 ----
        let wcol = 1;
        if (this.isCurrentClassElective) { ws.getColumn(wcol).width = 10; wcol++; }
        ws.getColumn(wcol).width = 7; wcol++;
        ws.getColumn(wcol).width = 12; wcol++;
        for (let li = 0; li < leafCols.length; li++) ws.getColumn(model.frozenCount + li + 1).width = 9;
        ws.views = [{ state: 'frozen', xSplit: model.frozenCount, ySplit: model.headerRowCount }];
  
        const buf = await wb.xlsx.writeBuffer();
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        this._exportTriggerDownload(blob, this._exportFileBaseName() + '.xlsx');
        this.addToast('Excel 已匯出', 'success');
      } catch (e) {
        console.error(e);
        this.addToast('Excel 匯出失敗：' + e.message, 'error');
      }
    },
  
    // ============================================================
    //  PDF — 以畫面表格擷取（完整保留合併格 / 顏色 / 中文）
    // ============================================================
    _prepareCloneForCapture(clone) {
      clone.querySelectorAll('input').forEach(inp => {
        const span = document.createElement('span');
        span.textContent = inp.value || '';
        if (inp.parentNode) inp.parentNode.replaceChild(span, inp);
      });
      clone.style.minWidth = '0';
      clone.querySelectorAll('.frozen-sn,.frozen-name,.frozen-class,.stats-frozen-sn,.stats-frozen-name,.stats-frozen-class,thead,.sn-col,.name-col').forEach(el => {
        el.style.position = 'static';
        el.style.left = 'auto';
        el.style.top = 'auto';
      });
      clone.querySelectorAll('.cell-focused,.cell-selected,.cell-unentered,.col-highlight').forEach(el => {
        el.classList.remove('cell-focused', 'cell-selected', 'cell-unentered', 'col-highlight');
      });
    },
  
    async _exportTableToPDF(tableEl, baseName, title) {
      const clone = tableEl.cloneNode(true);
      this._prepareCloneForCapture(clone);
      const holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:-100000px;top:0;background:#ffffff;padding:16px;display:inline-block;z-index:-1;';
      if (title) {
        const tdiv = document.createElement('div');
        tdiv.style.cssText = "font-size:18px;font-weight:bold;color:#1f2937;margin-bottom:12px;font-family:'Microsoft JhengHei','Segoe UI',sans-serif;";
        tdiv.textContent = title + '　(' + new Date().toLocaleDateString('zh-HK') + ')';
        holder.appendChild(tdiv);
      }
      holder.appendChild(clone);
      document.body.appendChild(holder);
      await new Promise(r => setTimeout(r, 60));
      let canvas;
      try {
        canvas = await html2canvas(holder, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true, windowWidth: holder.scrollWidth + 60 });
      } finally {
        document.body.removeChild(holder);
      }
      const { jsPDF } = window.jspdf;
      const imgW = canvas.width, imgH = canvas.height;
      const orientation = imgW >= imgH ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const usableW = pageW - margin * 2;
      const ratio = usableW / imgW;
      const slicePx = Math.max(1, Math.floor((pageH - margin * 2) / ratio));
      let y = 0, first = true;
      while (y < imgH) {
        const sliceH = Math.min(slicePx, imgH - y);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = imgW;
        pageCanvas.height = sliceH;
        const ctx = pageCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, imgW, sliceH);
        ctx.drawImage(canvas, 0, y, imgW, sliceH, 0, 0, imgW, sliceH);
        const data = pageCanvas.toDataURL('image/jpeg', 0.92);
        if (!first) pdf.addPage();
        pdf.addImage(data, 'JPEG', margin, margin, usableW, sliceH * ratio);
        y += sliceH;
        first = false;
      }
      pdf.save(baseName + '.pdf');
    },
  
    async exportGradesPDF() {
      this.gradesExportMenuOpen = false;
      if (!this.gradesTerm || !this.gradesSortedStudents.length) { this.addToast('無數據可匯出', 'warning'); return; }
      if (!this._exportAssertLibs(false, true)) return;
      this.addToast('正在產生 PDF，請稍候...', 'info');
      this.gradesSaveCurrentCell();
      this.gradesDeselect();
      this.gradesHighlightUnenteredCol = -1;
      await new Promise(r => this.$nextTick(r));
      const wrapper = this.$refs.gradesWrapper;
      const tableEl = wrapper ? wrapper.querySelector('table.grades-table') : null;
      if (!tableEl) { this.addToast('找不到成績表', 'error'); return; }
      try {
        await this._exportTableToPDF(tableEl, this._exportFileBaseName(), this._exportPdfTitle());
        this.addToast('PDF 已匯出', 'success');
      } catch (e) {
        console.error(e);
        this.addToast('PDF 匯出失敗：' + e.message, 'error');
      }
    },
  
    // ============================================================
    //  總分計算 — 通用 Excel 表格輸出
    // ============================================================
    async _exportRowsToExcel(sheetName, headerDefs, dataMatrix, statMatrix, fileBase) {
      if (!this._exportAssertLibs(true, false)) return;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(String(sheetName || '報表').substring(0, 28));
      const thin = { style: 'thin', color: { argb: 'FFD1D5DB' } };
      const border = { top: thin, left: thin, bottom: thin, right: thin };
      headerDefs.forEach((h, i) => {
        const xc = ws.getCell(1, i + 1);
        xc.value = h.label;
        xc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        xc.border = border;
        xc.font = { bold: true, size: 10, color: { argb: this._exportHexToARGB(h.colorHex) || 'FF374151' } };
        const argb = this._exportHexToARGB(h.fillHex);
        if (argb) xc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
        ws.getColumn(i + 1).width = h.width || 11;
      });
      let r = 2;
      for (const row of dataMatrix) {
        row.forEach((val, i) => {
          const xc = ws.getCell(r, i + 1);
          xc.value = val;
          xc.alignment = { horizontal: 'center', vertical: 'middle' };
          xc.border = border;
          xc.font = { size: 10 };
        });
        r++;
      }
      if (statMatrix && statMatrix.length) {
        const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        for (const row of statMatrix) {
          row.forEach((val, i) => {
            const xc = ws.getCell(r, i + 1);
            xc.value = val;
            xc.alignment = { horizontal: 'center', vertical: 'middle' };
            xc.border = border;
            xc.font = { size: 9, color: { argb: 'FF6B7280' } };
            xc.fill = fill;
          });
          r++;
        }
      }
      ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      this._exportTriggerDownload(blob, fileBase + '.xlsx');
      this.addToast('Excel 已匯出', 'success');
    },
  
    // ---------- 計算結果 ----------
    async exportScoringResultsExcel() {
      this.scoringExportMenuOpen = false;
      const data = this.scoringResultsData;
      if (!data.length) { this.addToast('無數據可匯出', 'warning'); return; }
      const headerDefs = [
        { label: '學號', fillHex: '#F9FAFB', colorHex: '#6B7280', width: 8 },
        { label: '姓名', fillHex: '#F9FAFB', colorHex: '#6B7280', width: 12 },
        { label: '統測課業均', fillHex: '#EFF6FF', colorHex: '#1D4ED8' },
        { label: '統測小測均', fillHex: '#EFF6FF', colorHex: '#1D4ED8' },
        { label: '統測分', fillHex: '#EFF6FF', colorHex: '#1D4ED8' },
        { label: '統測課堂表現', fillHex: '#EFF6FF', colorHex: '#1D4ED8' },
        { label: 'A3 統測總分', fillHex: '#DBEAFE', colorHex: '#1E40AF' },
        { label: '考試課業均', fillHex: '#F0FDF4', colorHex: '#15803D' },
        { label: '考試小測均', fillHex: '#F0FDF4', colorHex: '#15803D' },
        { label: '考試課堂表現', fillHex: '#F0FDF4', colorHex: '#15803D' },
        { label: 'A1 常分', fillHex: '#DCFCE7', colorHex: '#166534' },
        { label: 'A2 考試分', fillHex: '#FEF2F2', colorHex: '#B91C1C' },
        { label: '考試總分', fillHex: '#FEE2E2', colorHex: '#991B1B' }
      ];
      const f1 = v => (v !== null && v !== undefined) ? parseFloat(v.toFixed(1)) : '--';
      const dataMatrix = data.map(r => [
        r.studentNumber, r.studentName,
        f1(r.utAssignAvg), f1(r.utQuizAvg), f1(r.utScore), f1(r.utCpScore),
        r.a3 !== null ? r.a3 : '--',
        f1(r.examAssignAvg), f1(r.examQuizAvg), f1(r.examCpScore),
        f1(r.a1), f1(r.a2), f1(r.examTotal)
      ]);
      const st = this.scoringResultStats;
      const keys = ['utAssignAvg', 'utQuizAvg', 'utScore', 'utCpScore', 'a3', 'examAssignAvg', 'examQuizAvg', 'examCpScore', 'a1', 'a2', 'examTotal'];
      const labelMap = { avg: '平均', max: '最高', min: '最低', median: '中位數' };
      const statMatrix = ['avg', 'max', 'min', 'median'].map(sk => ['', labelMap[sk], ...keys.map(k => st[k] ? st[k][sk] : '--')]);
      const base = (this.currentClass ? this.currentClass.className + (this.currentClass.subject ? '_' + this.currentClass.subject : '') : '計算結果') + (this.gradesTerm ? '_' + this.gradesTerm.name : '') + '_計算結果';
      await this._exportRowsToExcel((this.gradesTerm ? this.gradesTerm.name : '') + '計算結果', headerDefs, dataMatrix, statMatrix, base);
    },
  
    async exportScoringResultsPDF() {
      this.scoringExportMenuOpen = false;
      if (!this.scoringResultsData.length) { this.addToast('無數據可匯出', 'warning'); return; }
      if (!this._exportAssertLibs(false, true)) return;
      this.addToast('正在產生 PDF，請稍候...', 'info');
      await new Promise(r => this.$nextTick(r));
      const tableEl = this.$refs.scoringResultsTable;
      if (!tableEl) { this.addToast('找不到結果表', 'error'); return; }
      const base = (this.currentClass ? this.currentClass.className : '') + (this.gradesTerm ? '_' + this.gradesTerm.name : '') + '_計算結果';
      const title = (this.currentClass ? this.currentClass.className + (this.currentClass.subject ? ' - ' + this.currentClass.subject : '') : '') + '　' + (this.gradesTerm ? this.gradesTerm.name : '') + '　計算結果';
      try { await this._exportTableToPDF(tableEl, base, title); this.addToast('PDF 已匯出', 'success'); }
      catch (e) { console.error(e); this.addToast('PDF 匯出失敗：' + e.message, 'error'); }
    },
  
    // ---------- 全年總分報表 ----------
    async exportScoringReportExcel() {
      this.scoringExportMenuOpen = false;
      const data = this.scoringReportFinalData;
      if (!data.length) { this.addToast('無數據可匯出', 'warning'); return; }
      const headerDefs = [
        { label: '排名', fillHex: '#F9FAFB', colorHex: '#6B7280', width: 6 },
        { label: '班別', fillHex: '#F9FAFB', colorHex: '#6B7280', width: 9 },
        { label: '學號', fillHex: '#F9FAFB', colorHex: '#6B7280', width: 8 },
        { label: '姓名', fillHex: '#F9FAFB', colorHex: '#6B7280', width: 12 },
        { label: 'T1 A3', fillHex: '#EFF6FF', colorHex: '#1D4ED8' },
        { label: 'T1 考試總分', fillHex: '#EFF6FF', colorHex: '#1D4ED8' },
        { label: 'T2 A3', fillHex: '#F0FDF4', colorHex: '#15803D' },
        { label: 'T2 考試總分', fillHex: '#F0FDF4', colorHex: '#15803D' },
        { label: '全年總分', fillHex: '#FFFBEB', colorHex: '#92400E' },
        { label: '全年排名', fillHex: '#FFFBEB', colorHex: '#92400E' }
      ];
      const f1 = v => (v !== null && v !== undefined) ? parseFloat(v.toFixed(1)) : '--';
      const dataMatrix = data.map(r => [
        r.rank ?? '--', r.originClass || '', r.studentNumber, r.studentName,
        r.t1a3 !== null ? r.t1a3 : '--', f1(r.t1ExamTotal),
        r.t2a3 !== null ? r.t2a3 : '--', f1(r.t2ExamTotal),
        f1(r.yearlyTotal), r.yearlyRank ?? '--'
      ]);
      const rs = this.scoringReportStats;
      const map = [['avg', '平均'], ['median', '中位數'], ['max', '最高'], ['min', '最低'], ['stddev', '標準差']];
      const statMatrix = map.map(([sk, label]) => [
        '', '', '', label,
        '', rs.t1ExamTotal ? rs.t1ExamTotal[sk] : '--',
        '', rs.t2ExamTotal ? rs.t2ExamTotal[sk] : '--',
        rs.yearlyTotal ? rs.yearlyTotal[sk] : '--', ''
      ]);
      const base = (this.currentAcademicYear ? this.currentAcademicYear.name + '_' : '') + (this.currentClass ? this.currentClass.className : '') + '_全年總分報表';
      await this._exportRowsToExcel('全年總分報表', headerDefs, dataMatrix, statMatrix, base);
    },
  
    async exportScoringReportPDF() {
      this.scoringExportMenuOpen = false;
      if (!this.scoringReportFinalData.length) { this.addToast('無數據可匯出', 'warning'); return; }
      if (!this._exportAssertLibs(false, true)) return;
      this.addToast('正在產生 PDF，請稍候...', 'info');
      await new Promise(r => this.$nextTick(r));
      const tableEl = this.$refs.scoringReportTable;
      if (!tableEl) { this.addToast('找不到報表', 'error'); return; }
      const base = (this.currentAcademicYear ? this.currentAcademicYear.name + '_' : '') + (this.currentClass ? this.currentClass.className : '') + '_全年總分報表';
      const title = (this.currentAcademicYear ? this.currentAcademicYear.name + '　' : '') + (this.currentClass ? this.currentClass.className + (this.currentClass.subject ? ' - ' + this.currentClass.subject : '') : '') + '　全年總分報表';
      try { await this._exportTableToPDF(tableEl, base, title); this.addToast('PDF 已匯出', 'success'); }
      catch (e) { console.error(e); this.addToast('PDF 匯出失敗：' + e.message, 'error'); }
    }
  };