// ================================================================
// Settings Module (v2 — 計分模板新增「科目 / 級別」欄位；批次1)
//   第六輪 批次1：系統設定完善
// ================================================================
const SettingsMethods = {

  // ---------- 共用：預設滿分（非課業類型使用） ----------
  getDefaultFullMark() {
    const dfm = parseInt(this.settings && this.settings.defaultFullMark);
    return (!isNaN(dfm) && dfm > 0) ? dfm : 100;
  },

  // ================================================================
  //  1. 基本設定
  // ================================================================
  onBasicSettingsChange() {
    if (this._basicSettingsTimer) clearTimeout(this._basicSettingsTimer);
    this._basicSettingsTimer = setTimeout(() => this._saveBasicSettings(), 800);
  },

  async _saveBasicSettings() {
    const dfm = parseInt(this.settings.defaultFullMark);
    const payload = {
      schoolName: (this.settings.schoolName || '').toString().trim(),
      teacherName: (this.settings.teacherName || '').toString().trim(),
      defaultFullMark: (!isNaN(dfm) && dfm > 0) ? dfm : 100
    };
    try {
      await db.collection('settings').doc('main').set(payload, { merge: true });
      this.settingsSaveStatus = 'saved';
      setTimeout(() => { if (this.settingsSaveStatus === 'saved') this.settingsSaveStatus = ''; }, 2000);
    } catch (e) { console.error('save basic settings failed', e); this.addToast('儲存失敗：' + e.message, 'error'); }
  },

  // ================================================================
  //  2. 學期日期
  // ================================================================
  onTermDatesChange() {
    if (this._termDatesTimer) clearTimeout(this._termDatesTimer);
    this._termDatesTimer = setTimeout(() => this._saveTermDates(), 600);
  },

  async _saveTermDates() {
    const td = this.settings.termDates || {};
    const payload = {
      t1Start: td.t1Start || '', t1End: td.t1End || '',
      t2Start: td.t2Start || '', t2End: td.t2End || ''
    };
    try {
      await db.collection('settings').doc('main').set({ termDates: payload }, { merge: true });
      this.settingsSaveStatus = 'saved';
      setTimeout(() => { if (this.settingsSaveStatus === 'saved') this.settingsSaveStatus = ''; }, 2000);
    } catch (e) { console.error('save term dates failed', e); this.addToast('儲存失敗：' + e.message, 'error'); }
  },

  // 依 settings.termDates 解析日期所屬學期 index（0=上學期 / 1=下學期）；無法判斷回傳 null
  _resolveTermIndexByDates(td, date) {
    if (!td) return null;
    const toDate = (s) => {
      if (!s) return null;
      const parts = String(s).split('-');
      if (parts.length < 3) return null;
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return isNaN(d.getTime()) ? null : d;
    };
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const t1s = toDate(td.t1Start), t1e = toDate(td.t1End);
    const t2s = toDate(td.t2Start), t2e = toDate(td.t2End);
    // 完全未設定 → 交回月份規則
    if (!t1s && !t1e && !t2s && !t2e) return null;

    const inRange = (s, e) => {
      if (s && e) return target >= s && target <= e;
      if (s && !e) return target >= s;
      if (!s && e) return target <= e;
      return false;
    };
    if ((t1s || t1e) && inRange(t1s, t1e)) return 0;
    if ((t2s || t2e) && inRange(t2s, t2e)) return 1;

    // 落在範圍之外時，用分界點推斷
    if (t2s && target < t2s) return 0;
    if (t2s && target >= t2s) return 1;
    if (t1e && target <= t1e) return 0;
    if (t1e && target > t1e) return 1;

    return null;
  },

  // ================================================================
  //  3. 計分模板
  // ================================================================
  goToTemplatesSettings() {
    this.currentView = 'settings';
    this.settingsNav = [{ key: 'templates', label: '計分模板' }];
  },

  // ★ 新增：可選擇的級別（小一-小六、中一-中六）
  getTemplateLevelOptions() {
    return ['小一', '小二', '小三', '小四', '小五', '小六', '中一', '中二', '中三', '中四', '中五', '中六'];
  },

  _blankTemplateData() {
    return {
      name: '',
      subject: '',         // ★ 新增：適用科目（可選）
      level: '',           // ★ 新增：適用級別（可選）
      _useNewSubject: false,
      ut: { assignment: 20, quiz: 20, unifiedTest: 40, classPerformance: 20 },
      exam: { a1Ratio: 30, a2Ratio: 70, a1Weights: { assignment: 6, quiz: 6, unifiedTest: 12, classPerformance: 6 } },
      yearly: { t1Weight: 40, t2Weight: 60 }
    };
  },

  openAddTemplateModal() { this.openModal('addTemplate', this._blankTemplateData()); },

  openEditTemplateModal(tpl) {
    this.openModal('editTemplate', {
      id: tpl.id,
      name: tpl.name,
      subject: tpl.subject || '',   // ★ 載入既有值
      level: tpl.level || '',       // ★ 載入既有值
      _useNewSubject: false,
      ut: {
        assignment: tpl.ut.assignment, quiz: tpl.ut.quiz,
        unifiedTest: tpl.ut.unifiedTest, classPerformance: tpl.ut.classPerformance
      },
      exam: {
        a1Ratio: tpl.exam.a1Ratio, a2Ratio: tpl.exam.a2Ratio,
        a1Weights: {
          assignment: tpl.exam.a1Weights.assignment, quiz: tpl.exam.a1Weights.quiz,
          unifiedTest: tpl.exam.a1Weights.unifiedTest, classPerformance: tpl.exam.a1Weights.classPerformance
        }
      },
      yearly: { t1Weight: tpl.yearly.t1Weight, t2Weight: tpl.yearly.t2Weight }
    });
  },

  _buildTemplateFromModal() {
    const m = this.modalData;
    const num = (v) => { const n = parseInt(v); return isNaN(n) ? 0 : n; };
    return {
      name: (m.name || '').trim(),
      subject: (m.subject || '').toString().trim(),  // ★ 寫入科目
      level: (m.level || '').toString().trim(),      // ★ 寫入級別
      ut: {
        assignment: num(m.ut.assignment), quiz: num(m.ut.quiz),
        unifiedTest: num(m.ut.unifiedTest), classPerformance: num(m.ut.classPerformance)
      },
      exam: {
        a1Ratio: num(m.exam.a1Ratio), a2Ratio: num(m.exam.a2Ratio),
        a1Weights: {
          assignment: num(m.exam.a1Weights.assignment), quiz: num(m.exam.a1Weights.quiz),
          unifiedTest: num(m.exam.a1Weights.unifiedTest), classPerformance: num(m.exam.a1Weights.classPerformance)
        }
      },
      yearly: { t1Weight: num(m.yearly.t1Weight), t2Weight: num(m.yearly.t2Weight) }
    };
  },

  async addTemplateConfirm() {
    if (!(this.modalData.name || '').trim()) { this.addToast('請輸入模板名稱', 'warning'); return; }
    if (!this.templateModalValid) { this.addToast('請修正權重設定後再儲存', 'warning'); return; }
    const tpl = this._buildTemplateFromModal();
    tpl.id = 'tpl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    if (!this.settings.templates) this.settings.templates = [];
    this.settings.templates.push(tpl);
    await this._saveTemplates();
    this.closeModal();
    this.addToast('已新增模板「' + tpl.name + '」', 'success');
  },

  async updateTemplateConfirm() {
    if (!(this.modalData.name || '').trim()) { this.addToast('請輸入模板名稱', 'warning'); return; }
    if (!this.templateModalValid) { this.addToast('請修正權重設定後再儲存', 'warning'); return; }
    const list = this.settings.templates || [];
    const idx = list.findIndex(t => t.id === this.modalData.id);
    if (idx < 0) { this.addToast('找不到模板', 'error'); return; }
    const tpl = this._buildTemplateFromModal();
    tpl.id = this.modalData.id;
    list.splice(idx, 1, tpl);
    await this._saveTemplates();
    this.closeModal();
    this.addToast('已更新模板「' + tpl.name + '」', 'success');
  },

  async duplicateTemplate(tpl) {
    const copy = JSON.parse(JSON.stringify(tpl));
    copy.id = 'tpl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    copy.name = tpl.name + ' (副本)';
    if (!this.settings.templates) this.settings.templates = [];
    this.settings.templates.push(copy);
    await this._saveTemplates();
    this.addToast('已複製模板「' + tpl.name + '」', 'success');
  },

  confirmDeleteTemplate(tpl) {
    this.openModal('deleteConfirm', {
      target: 'template', id: tpl.id,
      message: '確定要刪除模板「' + tpl.name + '」嗎？',
      submessage: '此操作無法復原（不影響已套用至班別的權重）。'
    });
  },

  async deleteTemplate(id) {
    this.settings.templates = (this.settings.templates || []).filter(t => t.id !== id);
    await this._saveTemplates();
    this.addToast('已刪除模板', 'success');
  },

  async _saveTemplates() {
    try {
      await db.collection('settings').doc('main').set({ templates: this.settings.templates || [] }, { merge: true });
    } catch (e) { console.error('save templates failed', e); this.addToast('儲存模板失敗：' + e.message, 'error'); }
  },

  // ---------- 套用模板（總分計算 → 計分設定） ----------
  requestApplyTemplate(tpl) {
    this.scoringApplyMenuOpen = false;
    this.openModal('applyTemplateConfirm', { templateId: tpl.id, templateName: tpl.name });
  },

  async applyTemplateConfirm() {
    const tpl = (this.settings.templates || []).find(t => t.id === this.modalData.templateId);
    if (!tpl) { this.addToast('找不到模板', 'error'); return; }
    this.applyScoringTemplate(tpl);
    this.closeModal();
  },

  applyScoringTemplate(tpl) {
    if (!this.currentClass) { this.addToast('請先選擇班別', 'warning'); return; }
    // 保留各班別現有的自訂類別權重（模板不含 customCategories）
    const curUtCC = { ...((this.scoringWeightsLocal.ut && this.scoringWeightsLocal.ut.customCategories) || {}) };
    const curExamCC = { ...((this.scoringWeightsLocal.exam && this.scoringWeightsLocal.exam.a1Weights && this.scoringWeightsLocal.exam.a1Weights.customCategories) || {}) };
    this.scoringWeightsLocal = {
      ut: {
        assignment: tpl.ut.assignment || 0, quiz: tpl.ut.quiz || 0,
        unifiedTest: tpl.ut.unifiedTest || 0, classPerformance: tpl.ut.classPerformance || 0,
        customCategories: curUtCC
      },
      exam: {
        a1Ratio: tpl.exam.a1Ratio || 0, a2Ratio: tpl.exam.a2Ratio || 0,
        a1Weights: {
          assignment: tpl.exam.a1Weights.assignment || 0, quiz: tpl.exam.a1Weights.quiz || 0,
          unifiedTest: tpl.exam.a1Weights.unifiedTest || 0, classPerformance: tpl.exam.a1Weights.classPerformance || 0,
          customCategories: curExamCC
        }
      },
      yearly: { t1Weight: tpl.yearly.t1Weight || 0, t2Weight: tpl.yearly.t2Weight || 0 }
    };
    // scoringWeightsLocal 的 deep watcher 會觸發既有自動儲存（合計合法才寫入）
    const hasCC = Object.keys(curUtCC).length > 0 || Object.keys(curExamCC).length > 0;
    this.addToast('已套用模板「' + tpl.name + '」' + (hasCC ? '（自訂類別權重已保留，請檢查合計）' : ''), 'success');
  }
};

const SettingsComputed = {
  scoringTemplates() { return (this.settings && this.settings.templates) || []; },

  // ★ 新增：模板級別下拉選項（給 v-for 使用）
  templateLevelOptions() {
    return ['小一', '小二', '小三', '小四', '小五', '小六', '中一', '中二', '中三', '中四', '中五', '中六'];
  },

  templateModalUTTotal() {
    const u = this.modalData && this.modalData.ut;
    if (!u) return 0;
    return (u.assignment || 0) + (u.quiz || 0) + (u.unifiedTest || 0) + (u.classPerformance || 0);
  },
  templateModalA1A2Total() {
    const e = this.modalData && this.modalData.exam;
    if (!e) return 0;
    return (e.a1Ratio || 0) + (e.a2Ratio || 0);
  },
  templateModalA1InternalTotal() {
    const e = this.modalData && this.modalData.exam;
    if (!e || !e.a1Weights) return 0;
    const w = e.a1Weights;
    return (w.assignment || 0) + (w.quiz || 0) + (w.unifiedTest || 0) + (w.classPerformance || 0);
  },
  templateModalYearlyTotal() {
    const y = this.modalData && this.modalData.yearly;
    if (!y) return 0;
    return (y.t1Weight || 0) + (y.t2Weight || 0);
  },
  templateModalValid() {
    if (!this.modalData || !this.modalData.exam) return false;
    return this.templateModalUTTotal === 100 &&
      this.templateModalA1A2Total === 100 &&
      this.templateModalA1InternalTotal === (this.modalData.exam.a1Ratio || 0) &&
      this.templateModalYearlyTotal === 100;
  }
};