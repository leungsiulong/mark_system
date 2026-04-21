// ================================================================
// Analysis Module (v1 — class/student/cross-year analysis with Chart.js)
// ================================================================
const AnalysisMethods = {
  // ---------- Tab / state ----------
  analysisSetTab(tab) {
    this.analysisSubTab = tab;
    this.$nextTick(() => setTimeout(() => this.analysisRenderAllCharts(), 80));
  },

  analysisSortOverview(key) {
    if (this.analysisOverviewSortKey === key) this.analysisOverviewSortAsc = !this.analysisOverviewSortAsc;
    else { this.analysisOverviewSortKey = key; this.analysisOverviewSortAsc = true; }
  },

  analysisSortRanking(key) {
    if (this.analysisRankingSortKey === key) this.analysisRankingSortAsc = !this.analysisRankingSortAsc;
    else {
      this.analysisRankingSortKey = key;
      this.analysisRankingSortAsc = (key === 'studentNumber' || key === 'yearlyRank');
    }
  },

  analysisSortStudentScores(key) {
    if (this.analysisStudentSortKey === key) this.analysisStudentSortAsc = !this.analysisStudentSortAsc;
    else { this.analysisStudentSortKey = key; this.analysisStudentSortAsc = (key !== 'diff'); }
  },

  analysisSelectStudent(sid) {
    this.analysisStudentId = sid || null;
    this.$nextTick(() => setTimeout(() => this.analysisRenderAllCharts(), 80));
  },

  analysisSetDistributionKey(key) {
    this.analysisDistributionKey = key;
    this.$nextTick(() => this.analysisRenderDistribution());
  },

  analysisToggleTrendStudent(sid) {
    const idx = this.analysisTrendSelectedStudents.indexOf(sid);
    if (idx >= 0) this.analysisTrendSelectedStudents.splice(idx, 1);
    else {
      if (this.analysisTrendSelectedStudents.length >= 5) {
        this.addToast('最多只能選擇 5 位學生', 'warning');
        return;
      }
      this.analysisTrendSelectedStudents.push(sid);
    }
    this.$nextTick(() => this.analysisRenderTrend());
  },

  analysisClearTrendStudents() {
    this.analysisTrendSelectedStudents = [];
    this.$nextTick(() => this.analysisRenderTrend());
  },

  analysisSelectCrossYearStudent(gs) {
    this.analysisCrossYearStudent = gs;
    this.analysisCrossYearSearchQuery = '';
    this.$nextTick(() => setTimeout(() => this.analysisRenderCrossYearTrend(), 80));
  },

  analysisClearCrossYearStudent() {
    this.analysisDestroyChart('crossYearTrend');
    this.analysisCrossYearStudent = null;
  },

  // ---------- Chart management ----------
  analysisDestroyChart(key) {
    if (!this._analysisCharts) { this._analysisCharts = {}; return; }
    if (this._analysisCharts[key]) {
      try { this._analysisCharts[key].destroy(); } catch (e) {}
      delete this._analysisCharts[key];
    }
  },

  analysisDestroyAllCharts() {
    if (!this._analysisCharts) { this._analysisCharts = {}; return; }
    for (const k in this._analysisCharts) {
      try { this._analysisCharts[k].destroy(); } catch (e) {}
    }
    this._analysisCharts = {};
  },

  analysisRenderAllCharts() {
    if (typeof Chart === 'undefined') return;
    if (this.currentView !== 'analysis') return;
    this.analysisDestroyAllCharts();
    if (this.analysisSubTab === 'class') {
      if (!this.currentClass) return;
      this.analysisRenderDistribution();
      this.analysisRenderTrend();
      this.analysisRenderCategoryCompare();
    } else if (this.analysisSubTab === 'student') {
      if (!this.analysisSelectedStudent) return;
      this.analysisRenderStudentRadar();
      this.analysisRenderStudentCompare();
      this.analysisRenderStudentTrend();
    } else if (this.analysisSubTab === 'crossYear') {
      if (!this.analysisCrossYearStudent) return;
      this.analysisRenderCrossYearTrend();
    }
  },

  analysisRenderDistribution() {
    this.analysisDestroyChart('distribution');
    const canvas = this.$refs.distributionCanvas;
    if (!canvas || typeof Chart === 'undefined') return;
    const data = this.analysisDistributionData;
    if (!data) return;
    const colors = ['#ef4444','#f87171','#fb923c','#fbbf24','#eab308','#facc15','#84cc16','#22c55e','#10b981','#059669'];
    if (!this._analysisCharts) this._analysisCharts = {};
    this._analysisCharts.distribution = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: '學生人數',
          data: data.counts,
          backgroundColor: colors,
          borderColor: colors,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ctx.parsed.y + ' 人' } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 }, title: { display: true, text: '學生人數' } },
          x: { title: { display: true, text: '分數區間 (百分制)' } }
        }
      }
    });
  },

  analysisRenderTrend() {
    this.analysisDestroyChart('trend');
    const canvas = this.$refs.trendCanvas;
    if (!canvas || typeof Chart === 'undefined') return;
    const data = this.analysisTrendData;
    if (!data || !data.labels.length) return;
    const datasets = [
      { label: '班級平均', data: data.avg, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', borderWidth: 3, tension: 0.2, pointRadius: 5 },
      { label: '班級最高', data: data.max, borderColor: '#10b981', backgroundColor: 'transparent', borderWidth: 2, borderDash: [6,4], tension: 0.2, pointRadius: 3 },
      { label: '班級最低', data: data.min, borderColor: '#ef4444', backgroundColor: 'transparent', borderWidth: 2, borderDash: [6,4], tension: 0.2, pointRadius: 3 }
    ];
    const stuColors = ['#8b5cf6','#ec4899','#f59e0b','#06b6d4','#84cc16'];
    data.students.forEach((s, i) => {
      datasets.push({
        label: s.name, data: s.data,
        borderColor: stuColors[i], backgroundColor: 'transparent',
        borderWidth: 1.5, tension: 0.2, pointRadius: 3
      });
    });
    if (!this._analysisCharts) this._analysisCharts = {};
    this._analysisCharts.trend = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: data.labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 15, font: { size: 11 } } } },
        scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: '分數' } } }
      }
    });
  },

  analysisRenderCategoryCompare() {
    this.analysisDestroyChart('categoryCompare');
    const canvas = this.$refs.categoryCompareCanvas;
    if (!canvas || typeof Chart === 'undefined') return;
    const data = this.analysisCategoryCompareData;
    if (!data || !data.datasets.length) return;
    if (!this._analysisCharts) this._analysisCharts = {};
    this._analysisCharts.categoryCompare = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: { labels: data.labels, datasets: data.datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: '平均分 (百分制)' } } }
      }
    });
  },

  analysisRenderStudentRadar() {
    this.analysisDestroyChart('studentRadar');
    const canvas = this.$refs.studentRadarCanvas;
    if (!canvas || typeof Chart === 'undefined') return;
    const data = this.analysisStudentRadarData;
    if (!data) return;
    if (!this._analysisCharts) this._analysisCharts = {};
    this._analysisCharts.studentRadar = new Chart(canvas.getContext('2d'), {
      type: 'radar',
      data: {
        labels: data.labels,
        datasets: [
          { label: data.studentName, data: data.studentValues, borderColor: '#2563eb', backgroundColor: 'rgba(59,130,246,0.3)', pointBackgroundColor: '#2563eb', borderWidth: 2, pointRadius: 4 },
          { label: '班級平均', data: data.classValues, borderColor: '#6b7280', backgroundColor: 'rgba(156,163,175,0.25)', pointBackgroundColor: '#6b7280', borderWidth: 2, borderDash: [5,5], pointRadius: 4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 20 } } }
      }
    });
  },

  analysisRenderStudentCompare() {
    this.analysisDestroyChart('studentCompare');
    const canvas = this.$refs.studentCompareCanvas;
    if (!canvas || typeof Chart === 'undefined') return;
    const data = this.analysisStudentCompareData;
    if (!data || !data.labels.length) return;
    if (!this._analysisCharts) this._analysisCharts = {};
    this._analysisCharts.studentCompare = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          { label: '學生分數', data: data.studentValues, backgroundColor: '#3b82f6', borderColor: '#2563eb', borderWidth: 1 },
          { label: '班級平均', data: data.classValues, backgroundColor: '#9ca3af', borderColor: '#6b7280', borderWidth: 1 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: '分數 (百分制)' } } }
      }
    });
  },

  analysisRenderStudentTrend() {
    this.analysisDestroyChart('studentTrend');
    const canvas = this.$refs.studentTrendCanvas;
    if (!canvas || typeof Chart === 'undefined') return;
    const data = this.analysisStudentTrendData;
    if (!data || !data.labels.length) return;
    if (!this._analysisCharts) this._analysisCharts = {};
    this._analysisCharts.studentTrend = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          { label: data.studentName, data: data.studentValues, borderColor: '#2563eb', backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 3, tension: 0.2, pointRadius: 5 },
          { label: '班級平均', data: data.classValues, borderColor: '#9ca3af', backgroundColor: 'transparent', borderDash: [5,5], borderWidth: 2, tension: 0.2, pointRadius: 4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              afterLabel: (ctx) => {
                if (ctx.datasetIndex !== 0) return null;
                const cv = ctx.chart.data.datasets[1].data[ctx.dataIndex];
                const sv = ctx.parsed.y;
                if (cv === null || sv === null) return null;
                const d = sv - cv;
                return '差距：' + (d > 0 ? '+' : '') + d.toFixed(1);
              }
            }
          }
        },
        scales: { y: { beginAtZero: true, max: 100 } }
      }
    });
  },

  analysisRenderCrossYearTrend() {
    this.analysisDestroyChart('crossYearTrend');
    const canvas = this.$refs.crossYearTrendCanvas;
    if (!canvas || typeof Chart === 'undefined') return;
    const data = this.analysisCrossYearTrend;
    if (!data || !data.labels.length) return;
    if (!this._analysisCharts) this._analysisCharts = {};
    this._analysisCharts.crossYearTrend = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: '分數', data: data.values,
          borderColor: '#2563eb', backgroundColor: 'rgba(59,130,246,0.15)',
          borderWidth: 3, tension: 0.2, pointRadius: 5, fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => '分數：' + (ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) : '—') } }
        },
        scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: '分數' } } }
      }
    });
  },

  // ---------- Helpers ----------
  _analysisGetTimePoints() {
    if (!this.currentClass) return [];
    const terms = this.currentClass.terms || [];
    const points = [];
    if (terms[0]) points.push({ key: 't1a3', label: terms[0].name + ' 統測', termIdx: 0, type: 'a3' });
    if (terms[0]) points.push({ key: 't1exam', label: terms[0].name + ' 考試', termIdx: 0, type: 'exam' });
    if (terms[1]) points.push({ key: 't2a3', label: terms[1].name + ' 統測', termIdx: 1, type: 'a3' });
    if (terms[1]) points.push({ key: 't2exam', label: terms[1].name + ' 考試', termIdx: 1, type: 'exam' });
    return points;
  },

  _analysisStudentAtPoint(student, point) {
    if (!this.currentClass || !point) return null;
    const term = this.currentClass.terms[point.termIdx];
    if (!term) return null;
    const r3 = this.scoringCalcA3(student.id, term);
    if (point.type === 'a3') return r3.a3;
    const e = this.scoringCalcExam(student.id, term, r3.a3);
    return e.total !== null ? parseFloat(e.total.toFixed(1)) : null;
  },

  _analysisRankingAtPoint(point) {
    if (!this.currentClass) return new Map();
    const scores = [];
    for (const s of this.currentStudents) {
      const v = this._analysisStudentAtPoint(s, point);
      if (v !== null) scores.push({ id: s.id, value: v });
    }
    scores.sort((a, b) => b.value - a.value);
    const ranks = new Map();
    let lastValue = null, lastRank = 0;
    scores.forEach((x, i) => {
      if (x.value !== lastValue) { lastRank = i + 1; lastValue = x.value; }
      ranks.set(x.id, lastRank);
    });
    return ranks;
  },

  _analysisAvgTwo(a1, a2, sid) {
    const vals = [];
    const v1 = this._calcSinglePct(a1, sid);
    const v2 = this._calcSinglePct(a2, sid);
    if (v1 !== null) vals.push(v1);
    if (v2 !== null) vals.push(v2);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  },

  // Cross-year calculation using class's own scoreConfig
  _analysisComputeForClass(cls, stu) {
    if (!cls || !stu) return { t1a3: null, t1Exam: null, t2a3: null, t2Exam: null, yearlyTotal: null };
    const sc = cls.scoreConfig || {};
    const w = sc.ut || {};
    const ec = sc.exam || {};
    const yw = sc.yearly || { t1Weight: 40, t2Weight: 60 };
    const terms = cls.terms || [];

    const getEff = (a, sid) => {
      const v = (a.scores || {})[sid];
      if (v == null) return null;
      if (typeof v === 'object') return Math.min((v.base || 0) + (v.bonus || 0), a.fullMark);
      const n = parseFloat(v);
      return isNaN(n) ? null : Math.min(n, a.fullMark);
    };
    const calcAvgPct = (as, sid) => {
      let sS = 0, fS = 0;
      for (const a of as) { const v = getEff(a, sid); if (v !== null) { sS += v; fS += a.fullMark; } }
      return fS > 0 ? sS / fS * 100 : null;
    };
    const calcSinglePct = (a, sid) => {
      if (!a) return null;
      const v = getEff(a, sid);
      return v === null ? null : v / a.fullMark * 100;
    };

    const calcA3 = (term) => {
      if (!term) return null;
      const aa = term.assessments || [];
      const utA = aa.filter(a => a.type === 'assignment' && (a.scoreCategory || 'none') === 'ut');
      const utQ = aa.filter(a => a.type === 'quiz' && (a.scoreCategory || 'none') === 'ut');
      const utI = aa.find(a => a.type === 'unified_test');
      const cpI = aa.find(a => a.type === 'class_performance' && a.period !== 'exam');
      if ((w.unifiedTest || 0) > 0 && utI && calcSinglePct(utI, stu.id) === null) return null;
      let t = 0;
      const addIfW = (wt, v) => { if ((wt || 0) > 0) t += (v ?? 0) * wt / 100; };
      addIfW(w.assignment, calcAvgPct(utA, stu.id));
      addIfW(w.quiz, calcAvgPct(utQ, stu.id));
      addIfW(w.unifiedTest, calcSinglePct(utI, stu.id));
      addIfW(w.classPerformance, calcSinglePct(cpI, stu.id));
      for (const cc of (cls.customCategories || [])) {
        const wt = (w.customCategories && w.customCategories[cc.id]) || 0;
        if (wt > 0) {
          const list = aa.filter(x => x.type === 'custom' && x.customCategoryId === cc.id && (x.scoreCategory || 'none') === 'ut');
          addIfW(wt, calcAvgPct(list, stu.id));
        }
      }
      return Math.round(t);
    };

    const calcExam = (term, a3) => {
      if (!term) return null;
      const aa = term.assessments || [];
      const exA = aa.filter(a => a.type === 'assignment' && (a.scoreCategory || 'none') === 'exam');
      const exQ = aa.filter(a => a.type === 'quiz' && (a.scoreCategory || 'none') === 'exam');
      const exI = aa.find(a => a.type === 'exam');
      const cpI = aa.find(a => a.type === 'class_performance' && a.period === 'exam');
      const eP = calcSinglePct(exI, stu.id);
      let a1 = null;
      const w2 = ec.a1Weights || {};
      if (a3 !== null) {
        a1 = 0;
        a1 += (calcAvgPct(exA, stu.id) ?? 0) * (w2.assignment || 0) / 100;
        a1 += (calcAvgPct(exQ, stu.id) ?? 0) * (w2.quiz || 0) / 100;
        a1 += a3 * (w2.unifiedTest || 0) / 100;
        a1 += (calcSinglePct(cpI, stu.id) ?? 0) * (w2.classPerformance || 0) / 100;
        for (const cc of (cls.customCategories || [])) {
          const wt = (w2.customCategories && w2.customCategories[cc.id]) || 0;
          if (wt > 0) {
            const list = aa.filter(x => x.type === 'custom' && x.customCategoryId === cc.id && (x.scoreCategory || 'none') === 'exam');
            a1 += (calcAvgPct(list, stu.id) || 0) * wt / 100;
          }
        }
      }
      let a2 = null;
      if ((ec.a2Ratio || 0) > 0 && exI && eP !== null) a2 = eP * ec.a2Ratio / 100;
      if ((ec.a2Ratio || 0) > 0 && exI && eP === null) return null;
      let total = null;
      if (a1 !== null && a2 !== null) total = a1 + a2;
      else if (a1 !== null && (!exI || ec.a2Ratio === 0)) total = a1;
      else if (a2 !== null && ec.a1Ratio === 0) total = a2;
      return total;
    };

    const t1a3 = calcA3(terms[0]);
    const t1Exam = calcExam(terms[0], t1a3);
    const t2a3 = calcA3(terms[1]);
    const t2Exam = calcExam(terms[1], t2a3);
    let yt = null;
    if (t1Exam !== null && t2Exam !== null) {
      yt = parseFloat((t1Exam * (yw.t1Weight || 40) / 100 + t2Exam * (yw.t2Weight || 60) / 100).toFixed(1));
    }
    return {
      t1a3,
      t1Exam: t1Exam !== null ? parseFloat(t1Exam.toFixed(1)) : null,
      t2a3,
      t2Exam: t2Exam !== null ? parseFloat(t2Exam.toFixed(1)) : null,
      yearlyTotal: yt
    };
  }
};

const AnalysisComputed = {
  analysisReady() { return !!(this.currentAcademicYear && this.currentClass); },

  analysisSelectedStudent() {
    if (!this.analysisStudentId) return null;
    return this.currentStudents.find(s => s.id === this.analysisStudentId) || null;
  },

  // ============= CLASS ANALYSIS =============

  analysisClassOverviewData() {
    if (!this.gradesTerm || !this.currentClass) return { rows: [], semester: null };
    const assessments = this.gradesTerm.assessments || [];
    const students = this.currentStudents;
    if (!students.length) return { rows: [], semester: null };
    const passT = this.scoringPassThreshold;
    const rows = [];
    for (const a of assessments) {
      const scores = [];
      for (const s of students) {
        const v = this._getEffScore(a, s.id);
        if (v !== null && !isNaN(v)) scores.push(v);
      }
      let avg=null,median=null,max=null,min=null,stddev=null,passRate=0,excellentRate=0;
      if (scores.length) {
        const sum = scores.reduce((x, y) => x + y, 0);
        avg = sum / scores.length;
        const sorted = [...scores].sort((x, y) => x - y);
        const mid = Math.floor(sorted.length / 2);
        median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        const variance = scores.reduce((acc, v) => acc + (v - avg) ** 2, 0) / scores.length;
        stddev = Math.sqrt(variance);
        max = Math.max(...scores); min = Math.min(...scores);
        passRate = scores.filter(v => (v / a.fullMark * 100) >= passT).length / scores.length * 100;
        excellentRate = scores.filter(v => (v / a.fullMark * 100) >= 80).length / scores.length * 100;
      }
      rows.push({
        id: a.id, name: a.name, type: a.type, typeLabel: this.assessmentLabel(a.type),
        fullMark: a.fullMark, avg, median, max, min, stddev,
        passRate, excellentRate, count: scores.length, total: students.length
      });
    }
    const key = this.analysisOverviewSortKey;
    const asc = this.analysisOverviewSortAsc;
    if (key) {
      rows.sort((a, b) => {
        let va = a[key], vb = b[key];
        if (va === null || va === undefined) return asc ? 1 : -1;
        if (vb === null || vb === undefined) return asc ? -1 : 1;
        if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        return asc ? va - vb : vb - va;
      });
    }
    // Semester summary
    const examScores = [];
    for (const s of students) {
      const r3 = this.scoringCalcA3(s.id, this.gradesTerm);
      const e = this.scoringCalcExam(s.id, this.gradesTerm, r3.a3);
      if (e.total !== null) examScores.push(e.total);
    }
    let semester = null;
    if (examScores.length) {
      const sum = examScores.reduce((x, y) => x + y, 0);
      const mean = sum / examScores.length;
      const sorted = [...examScores].sort((x, y) => x - y);
      const mid = Math.floor(sorted.length / 2);
      const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      const variance = examScores.reduce((acc, v) => acc + (v - mean) ** 2, 0) / examScores.length;
      semester = {
        name: '學期考試總分', avg: mean, median: med,
        max: Math.max(...examScores), min: Math.min(...examScores), stddev: Math.sqrt(variance),
        passRate: examScores.filter(v => v >= passT).length / examScores.length * 100,
        excellentRate: examScores.filter(v => v >= 80).length / examScores.length * 100,
        count: examScores.length, total: students.length
      };
    }
    return { rows, semester };
  },

  analysisDistributionOptions() {
    const opts = [
      { key: '__exam', label: '考試總分 (總分/百分制)' },
      { key: '__a3', label: 'A3 統測總分' }
    ];
    if (!this.gradesTerm) return opts;
    for (const a of (this.gradesTerm.assessments || [])) {
      opts.push({ key: a.id, label: a.name + ' (' + this.assessmentLabel(a.type) + ')' });
    }
    return opts;
  },

  analysisDistributionData() {
    if (!this.gradesTerm || !this.currentStudents.length) return null;
    const key = this.analysisDistributionKey || '__exam';
    const students = this.currentStudents;
    const scores = [];
    let sourceLabel = '';
    if (key === '__a3') {
      sourceLabel = 'A3 統測總分';
      for (const s of students) {
        const r = this.scoringCalcA3(s.id, this.gradesTerm);
        if (r.a3 !== null) scores.push(r.a3);
      }
    } else if (key === '__exam') {
      sourceLabel = '考試總分';
      for (const s of students) {
        const r3 = this.scoringCalcA3(s.id, this.gradesTerm);
        const e = this.scoringCalcExam(s.id, this.gradesTerm, r3.a3);
        if (e.total !== null) scores.push(e.total);
      }
    } else {
      const a = (this.gradesTerm.assessments || []).find(x => x.id === key);
      if (!a) return null;
      sourceLabel = a.name;
      for (const s of students) {
        const v = this._getEffScore(a, s.id);
        if (v !== null) scores.push(v / a.fullMark * 100);
      }
    }
    const labels = ['0-9','10-19','20-29','30-39','40-49','50-59','60-69','70-79','80-89','90-100'];
    const bins = new Array(10).fill(0);
    for (const v of scores) {
      let idx = Math.floor(v / 10);
      if (idx > 9) idx = 9; if (idx < 0) idx = 0;
      bins[idx]++;
    }
    let mean = 0, median = 0, stddev = 0;
    if (scores.length) {
      mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const sorted = [...scores].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      stddev = Math.sqrt(scores.reduce((acc, v) => acc + (v - mean) ** 2, 0) / scores.length);
    }
    return { labels, counts: bins, mean, median, stddev, sourceLabel, total: scores.length };
  },

  analysisTrendData() {
    if (!this.currentClass) return null;
    const points = this._analysisGetTimePoints();
    if (!points.length) return null;
    const students = this.currentStudents;
    const avg = [], max = [], min = [];
    for (const p of points) {
      const vals = [];
      for (const s of students) {
        const v = this._analysisStudentAtPoint(s, p);
        if (v !== null) vals.push(v);
      }
      if (vals.length) {
        avg.push(parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)));
        max.push(parseFloat(Math.max(...vals).toFixed(1)));
        min.push(parseFloat(Math.min(...vals).toFixed(1)));
      } else { avg.push(null); max.push(null); min.push(null); }
    }
    const studentLines = [];
    for (const sid of this.analysisTrendSelectedStudents) {
      const s = students.find(x => x.id === sid);
      if (!s) continue;
      const data = points.map(p => {
        const v = this._analysisStudentAtPoint(s, p);
        return v !== null ? parseFloat(v.toFixed(1)) : null;
      });
      studentLines.push({ id: sid, name: s.studentName, data });
    }
    return { labels: points.map(p => p.label), avg, max, min, students: studentLines };
  },

  analysisCategoryCompareData() {
    if (!this.currentClass) return null;
    const terms = this.currentClass.terms || [];
    const students = this.currentStudents;
    const labels = ['課業均分', '小測均分', '統測分', '考試分', '課堂表現'];
    const datasets = [];
    const colors = ['#3b82f6', '#10b981'];
    for (let i = 0; i < Math.min(terms.length, 2); i++) {
      const term = terms[i];
      const aa = term.assessments || [];
      const allA = aa.filter(a => a.type === 'assignment');
      const allQ = aa.filter(a => a.type === 'quiz');
      const utI = aa.find(a => a.type === 'unified_test');
      const exI = aa.find(a => a.type === 'exam');
      const cpUt = aa.find(a => a.type === 'class_performance' && a.period !== 'exam');
      const cpEx = aa.find(a => a.type === 'class_performance' && a.period === 'exam');
      const cats = [[], [], [], [], []];
      for (const s of students) {
        let v;
        v = this._calcAvgPct(allA, s.id); if (v !== null) cats[0].push(v);
        v = this._calcAvgPct(allQ, s.id); if (v !== null) cats[1].push(v);
        v = this._calcSinglePct(utI, s.id); if (v !== null) cats[2].push(v);
        v = this._calcSinglePct(exI, s.id); if (v !== null) cats[3].push(v);
        v = this._analysisAvgTwo(cpUt, cpEx, s.id); if (v !== null) cats[4].push(v);
      }
      const avgOf = arr => arr.length ? parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : null;
      datasets.push({
        label: term.name, data: cats.map(avgOf),
        backgroundColor: colors[i], borderColor: colors[i], borderWidth: 1
      });
    }
    return { labels, datasets };
  },

  analysisRankingTableData() {
    if (!this.currentClass) return [];
    const points = this._analysisGetTimePoints();
    if (!points.length) return [];
    const students = this.currentStudents;
    const w = this.scoringWeightsLocal.yearly;
    const pointRanks = points.map(p => this._analysisRankingAtPoint(p));
    const data = [];
    for (const s of students) {
      const row = { studentId: s.id, studentNumber: s.studentNumber, studentName: s.studentName };
      points.forEach((p, i) => {
        row[p.key] = this._analysisStudentAtPoint(s, p);
        row[p.key + 'Rank'] = pointRanks[i].get(s.id) || null;
      });
      let yt = null;
      if (row.t1exam !== null && row.t2exam !== null) {
        yt = parseFloat((row.t1exam * w.t1Weight / 100 + row.t2exam * w.t2Weight / 100).toFixed(1));
      }
      row.yearlyTotal = yt;
      const firstRank = row[points[0].key + 'Rank'];
      const lastRank = row[points[points.length - 1].key + 'Rank'];
      row.rankTrend = (firstRank && lastRank) ? firstRank - lastRank : null;
      data.push(row);
    }
    const ytd = data.filter(r => r.yearlyTotal !== null).sort((a, b) => b.yearlyTotal - a.yearlyTotal);
    let lastV = null, lastR = 0;
    ytd.forEach((r, i) => {
      if (r.yearlyTotal !== lastV) { lastR = i + 1; lastV = r.yearlyTotal; }
      r.yearlyRank = lastR;
    });
    const key = this.analysisRankingSortKey;
    const asc = this.analysisRankingSortAsc;
    data.sort((a, b) => {
      let va = a[key], vb = b[key];
      if (va === null || va === undefined) return asc ? 1 : -1;
      if (vb === null || vb === undefined) return asc ? -1 : 1;
      if (key === 'studentNumber') { va = parseInt(va) || 0; vb = parseInt(vb) || 0; }
      if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
      return asc ? va - vb : vb - va;
    });
    return data;
  },

  // ============= STUDENT ANALYSIS =============

  analysisStudentOverview() {
    const s = this.analysisSelectedStudent;
    if (!s || !this.currentClass) return null;
    const points = this._analysisGetTimePoints();
    const pointInfo = [];
    const students = this.currentStudents;
    for (const p of points) {
      const v = this._analysisStudentAtPoint(s, p);
      const vals = [];
      for (const stu of students) {
        const cv = this._analysisStudentAtPoint(stu, p);
        if (cv !== null) vals.push(cv);
      }
      pointInfo.push({
        label: p.label, value: v,
        classAvg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
      });
    }
    const w = this.scoringWeightsLocal.yearly;
    const t1exam = pointInfo[1] ? pointInfo[1].value : null;
    const t2exam = pointInfo[3] ? pointInfo[3].value : null;
    let yearly = null;
    if (t1exam !== null && t2exam !== null) {
      yearly = parseFloat((t1exam * w.t1Weight / 100 + t2exam * w.t2Weight / 100).toFixed(1));
    }
    let yearlyRank = null, validCount = 0;
    if (yearly !== null) {
      const allY = [];
      for (const stu of students) {
        const t1 = this._analysisStudentAtPoint(stu, points[1]);
        const t2 = this._analysisStudentAtPoint(stu, points[3]);
        if (t1 !== null && t2 !== null) {
          allY.push({ id: stu.id, v: t1 * w.t1Weight / 100 + t2 * w.t2Weight / 100 });
        }
      }
      validCount = allY.length;
      allY.sort((a, b) => b.v - a.v);
      let lv = null, lr = 0;
      for (let i = 0; i < allY.length; i++) {
        if (allY[i].v !== lv) { lr = i + 1; lv = allY[i].v; }
        if (allY[i].id === s.id) { yearlyRank = lr; break; }
      }
    }
    return {
      student: s, points: pointInfo, yearly, yearlyRank,
      totalStudents: students.length, validYearlyCount: validCount
    };
  },

  analysisStudentScoresTable() {
    const s = this.analysisSelectedStudent;
    if (!s || !this.currentClass) return [];
    const terms = this.currentClass.terms || [];
    const rows = [];
    for (const term of terms) {
      for (const a of (term.assessments || [])) {
        const stuV = this._getEffScore(a, s.id);
        const stuPct = stuV !== null ? stuV / a.fullMark * 100 : null;
        const vals = [];
        for (const stu of this.currentStudents) {
          const v = this._getEffScore(a, stu.id);
          if (v !== null) vals.push(v / a.fullMark * 100);
        }
        const classPct = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        rows.push({
          id: a.id, name: a.name, type: a.type, typeLabel: this.assessmentLabel(a.type),
          fullMark: a.fullMark, termName: term.name,
          studentScore: stuV, studentPct: stuPct, classAvgPct: classPct,
          diff: (stuPct !== null && classPct !== null) ? stuPct - classPct : null
        });
      }
    }
    const key = this.analysisStudentSortKey;
    const asc = this.analysisStudentSortAsc;
    if (key) {
      rows.sort((a, b) => {
        let va = a[key], vb = b[key];
        if (va === null || va === undefined) return asc ? 1 : -1;
        if (vb === null || vb === undefined) return asc ? -1 : 1;
        if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        return asc ? va - vb : vb - va;
      });
    }
    return rows;
  },

  analysisStudentRadarData() {
    const s = this.analysisSelectedStudent;
    if (!s || !this.gradesTerm) return null;
    const labels = ['課業平均', '小測平均', '統測分', '考試分', '課堂表現'];
    const aa = this.gradesTerm.assessments || [];
    const allA = aa.filter(a => a.type === 'assignment');
    const allQ = aa.filter(a => a.type === 'quiz');
    const utI = aa.find(a => a.type === 'unified_test');
    const exI = aa.find(a => a.type === 'exam');
    const cpUt = aa.find(a => a.type === 'class_performance' && a.period !== 'exam');
    const cpEx = aa.find(a => a.type === 'class_performance' && a.period === 'exam');
    const extractors = [
      (sid) => this._calcAvgPct(allA, sid),
      (sid) => this._calcAvgPct(allQ, sid),
      (sid) => this._calcSinglePct(utI, sid),
      (sid) => this._calcSinglePct(exI, sid),
      (sid) => this._analysisAvgTwo(cpUt, cpEx, sid)
    ];
    const studentValues = extractors.map(fn => {
      const v = fn(s.id);
      return v !== null ? parseFloat(v.toFixed(1)) : 0;
    });
    const classValues = [];
    for (const fn of extractors) {
      const vals = [];
      for (const stu of this.currentStudents) {
        const v = fn(stu.id);
        if (v !== null) vals.push(v);
      }
      classValues.push(vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : 0);
    }
    return { labels, studentName: s.studentName, studentValues, classValues };
  },

  analysisStudentCompareData() {
    const s = this.analysisSelectedStudent;
    if (!s || !this.gradesTerm) return null;
    const labels = [], studentValues = [], classValues = [];
    for (const a of (this.gradesTerm.assessments || [])) {
      const stuV = this._getEffScore(a, s.id);
      const stuPct = stuV !== null ? stuV / a.fullMark * 100 : null;
      const vals = [];
      for (const stu of this.currentStudents) {
        const v = this._getEffScore(a, stu.id);
        if (v !== null) vals.push(v / a.fullMark * 100);
      }
      const classPct = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      labels.push(a.name);
      studentValues.push(stuPct !== null ? parseFloat(stuPct.toFixed(1)) : null);
      classValues.push(classPct !== null ? parseFloat(classPct.toFixed(1)) : null);
    }
    return { labels, studentValues, classValues };
  },

  analysisStudentTrendData() {
    const s = this.analysisSelectedStudent;
    if (!s || !this.currentClass) return null;
    const points = this._analysisGetTimePoints();
    const studentValues = [], classValues = [];
    for (const p of points) {
      const v = this._analysisStudentAtPoint(s, p);
      studentValues.push(v !== null ? parseFloat(v.toFixed(1)) : null);
      const vals = [];
      for (const stu of this.currentStudents) {
        const cv = this._analysisStudentAtPoint(stu, p);
        if (cv !== null) vals.push(cv);
      }
      classValues.push(vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : null);
    }
    return {
      labels: points.map(p => p.label),
      studentName: s.studentName, studentValues, classValues
    };
  },

  analysisStudentStrengths() {
    const radar = this.analysisStudentRadarData;
    if (!radar) return null;
    const strengths = [], weaknesses = [];
    for (let i = 0; i < radar.labels.length; i++) {
      const diff = radar.studentValues[i] - radar.classValues[i];
      if (diff > 5) {
        strengths.push({
          category: radar.labels[i],
          value: radar.studentValues[i], classAvg: radar.classValues[i],
          diff: parseFloat(diff.toFixed(1))
        });
      } else if (diff < -5) {
        weaknesses.push({
          category: radar.labels[i],
          value: radar.studentValues[i], classAvg: radar.classValues[i],
          diff: parseFloat(diff.toFixed(1))
        });
      }
    }
    const trend = this.analysisStudentTrendData;
    const trendNotes = [];
    if (trend) {
      const points = this._analysisGetTimePoints();
      const ranks = points.map(p => this._analysisRankingAtPoint(p));
      const sid = this.analysisSelectedStudent.id;
      for (let i = 1; i < trend.labels.length; i++) {
        const prev = trend.studentValues[i - 1];
        const curr = trend.studentValues[i];
        if (prev !== null && curr !== null) {
          const diff = curr - prev;
          if (Math.abs(diff) >= 3) {
            const prevR = ranks[i - 1].get(sid);
            const currR = ranks[i].get(sid);
            let rankStr = '';
            if (prevR && currR) {
              const rd = prevR - currR;
              if (rd > 0) rankStr = '，排名上升 ' + rd + ' 位';
              else if (rd < 0) rankStr = '，排名下降 ' + Math.abs(rd) + ' 位';
              else rankStr = '，排名不變';
            }
            trendNotes.push({
              from: trend.labels[i - 1], to: trend.labels[i],
              diff: parseFloat(diff.toFixed(1)), rankStr
            });
          }
        }
      }
    }
    return { strengths, weaknesses, trendNotes };
  },

  // ============= CROSS-YEAR ANALYSIS =============

  analysisCrossYearSearchResults() {
    const q = (this.analysisCrossYearSearchQuery || '').trim();
    if (!q) return [];
    return (this.globalStudents || []).filter(g => g.name && g.name.includes(q)).slice(0, 20);
  },

  analysisCrossYearResults() {
    const gs = this.analysisCrossYearStudent;
    if (!gs) return [];
    const records = gs.records || [];
    const results = [];
    for (const rec of records) {
      const year = this.academicYears.find(y => y.id === rec.academicYearId);
      if (!year) continue;
      const cls = year.classes.find(c => c.id === rec.classId);
      if (!cls) continue;
      const stu = cls.students.find(s => s.globalStudentId === gs.id);
      if (!stu) continue;
      // Skip base regular classes (no terms / no grades)
      if (cls.classType === 'regular' && (!cls.terms || cls.terms.length === 0)) continue;
      const snap = this._analysisComputeForClass(cls, stu);
      let yearlyRank = null;
      const totalInClass = cls.students.length;
      if (snap.yearlyTotal !== null) {
        const allY = [];
        for (const clsStu of cls.students) {
          const clsSnap = this._analysisComputeForClass(cls, clsStu);
          if (clsSnap.yearlyTotal !== null) allY.push({ id: clsStu.id, v: clsSnap.yearlyTotal });
        }
        allY.sort((a, b) => b.v - a.v);
        let lv = null, lr = 0;
        for (let i = 0; i < allY.length; i++) {
          if (allY[i].v !== lv) { lr = i + 1; lv = allY[i].v; }
          if (allY[i].id === stu.id) { yearlyRank = lr; break; }
        }
      }
      results.push({
        yearId: year.id, yearName: year.name,
        classId: cls.id, className: cls.className,
        subject: cls.subject || '', classType: cls.classType,
        studentNumber: stu.studentNumber, studentName: stu.studentName,
        ...snap, yearlyRank, totalInClass
      });
    }
    results.sort((a, b) => a.yearName.localeCompare(b.yearName));
    return results;
  },

  analysisCrossYearTrend() {
    const results = this.analysisCrossYearResults;
    if (!results.length) return null;
    const labels = [], values = [];
    for (const r of results) {
      if (r.t1a3 !== null) { labels.push(r.yearName + ' T1 統測'); values.push(r.t1a3); }
      if (r.t1Exam !== null) { labels.push(r.yearName + ' T1 考試'); values.push(r.t1Exam); }
      if (r.t2a3 !== null) { labels.push(r.yearName + ' T2 統測'); values.push(r.t2a3); }
      if (r.t2Exam !== null) { labels.push(r.yearName + ' T2 考試'); values.push(r.t2Exam); }
    }
    return { labels, values };
  },

  analysisCrossYearCompare() {
    const results = this.analysisCrossYearResults;
    if (!results.length) return null;
    const metrics = [
      { key: 'yearlyTotal', label: '全年總分', format: 'fix1' },
      { key: 'yearlyRank', label: '全年排名', format: 'rank' },
      { key: 't1a3', label: 'T1 統測', format: 'int' },
      { key: 't1Exam', label: 'T1 考試總分', format: 'fix1' },
      { key: 't2a3', label: 'T2 統測', format: 'int' },
      { key: 't2Exam', label: 'T2 考試總分', format: 'fix1' }
    ];
    const years = results.map(r => r.yearName);
    const rows = metrics.map(m => {
      const row = { metric: m.label, format: m.format, values: [], trend: null };
      for (const r of results) {
        if (m.key === 'yearlyRank') row.values.push({ value: r.yearlyRank, total: r.totalInClass });
        else row.values.push({ value: r[m.key] });
      }
      const vals = row.values.map(x => x.value).filter(v => v !== null && v !== undefined);
      if (vals.length >= 2) {
        if (m.key === 'yearlyRank') row.trend = vals[0] - vals[vals.length - 1];
        else row.trend = vals[vals.length - 1] - vals[0];
      }
      return row;
    });
    return { years, rows };
  }
};