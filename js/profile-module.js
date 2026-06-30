// ================================================================
// Profile / Auth Module (v2 — 多老師 Profile 登入)
//   - 第一個帳戶 = 管理員；管理員可新增/管理其他老師帳戶
//   - 密碼由每位老師首次登入時自行設定（SHA-256 雜湊後儲存）
//   - 每位老師擁有獨立的班別 / 學生 / 成績 / 設定（透過 db Proxy 範圍隔離）
//   - ★ v28: 選擇帳戶後自動聚焦密碼欄；載入帳戶深色模式偏好
// ================================================================
const ProfileMethods = {

  // ---------- 密碼雜湊 ----------
  async _hashPassword(pw) {
    try {
      const enc = new TextEncoder();
      const data = enc.encode(String(pw));
      const buf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // 非安全環境（無 crypto.subtle）時的退化雜湊，避免崩潰
      let h = 0; const s = String(pw);
      for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
      return 'fallback_' + h;
    }
  },

  // ---------- 載入帳戶清單 ----------
  async loadProfiles() {
    this.profilesLoading = true;
    this.profileError = '';
    try {
      const snap = await __realDb.collection('profiles').get();
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      arr.sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name || '').localeCompare(String(b.name || '')));
      this.profiles = arr;
    } catch (e) {
      console.error('load profiles failed', e);
      this.profileError = '無法載入帳戶資料：' + e.message;
      this.profiles = [];
    }
    this.profilesLoading = false;
    this.authStep = this.profiles.length === 0 ? 'createAdmin' : 'select';
  },

  // ---------- 頭像樣式 ----------
  _profileGradient(profile) {
    const map = {
      blue: ['#2563eb', '#3b82f6'], indigo: ['#4f46e5', '#6366f1'], violet: ['#7c3aed', '#8b5cf6'],
      pink: ['#db2777', '#ec4899'], rose: ['#e11d48', '#fb7185'], red: ['#dc2626', '#ef4444'],
      orange: ['#ea580c', '#f97316'], amber: ['#d97706', '#f59e0b'], emerald: ['#059669', '#10b981'],
      teal: ['#0d9488', '#14b8a6'], cyan: ['#0891b2', '#06b6d4'], slate: ['#475569', '#64748b']
    };
    return map[profile && profile.color] || map.blue;
  },
  profileAvatarStyle(profile) {
    const g = this._profileGradient(profile);
    return { background: 'linear-gradient(135deg,' + g[0] + ',' + g[1] + ')' };
  },
  profileInitial(profile) {
    const n = ((profile && profile.name) || '').trim();
    return n ? n.charAt(0).toUpperCase() : '?';
  },

  // ---------- ★ v28: 步驟切換完成後自動聚焦密碼欄 ----------
  // 由 <transition @after-enter> 觸發，確保元素已實際插入 DOM 後才 focus，
  // 解決原本 $nextTick 在 out-in 過場動畫尚未完成時 ref 仍不存在的問題。
  onAuthStepEntered() {
    this.$nextTick(() => {
      const el = this.$refs.authPwInput;
      if (el && typeof el.focus === 'function') {
        try { el.focus(); el.select && el.select(); } catch (e) { /* ignore */ }
      }
    });
  },

  // ---------- 選擇 / 驗證流程 ----------
  selectProfileToLogin(profile) {
    this.authSelectedProfile = profile;
    this.authPasswordInput = '';
    this.authPasswordConfirm = '';
    this.authError = '';
    this.authStep = profile.passwordSet ? 'enterPassword' : 'setPassword';
    // 即時嘗試聚焦（若已立即渲染）；過場動畫情況交由 onAuthStepEntered 保險處理
    this.$nextTick(() => { if (this.$refs.authPwInput) this.$refs.authPwInput.focus(); });
  },

  backToProfileSelect() {
    this.authStep = 'select';
    this.authSelectedProfile = null;
    this.authPasswordInput = '';
    this.authPasswordConfirm = '';
    this.authError = '';
  },

  async submitSetPassword() {
    const pw = this.authPasswordInput, pw2 = this.authPasswordConfirm;
    if (!pw || pw.length < 4) { this.authError = '密碼至少需 4 個字元'; return; }
    if (pw !== pw2) { this.authError = '兩次輸入的密碼不一致'; return; }
    this.authProcessing = true; this.authError = '';
    try {
      const hash = await this._hashPassword(pw);
      await __realDb.collection('profiles').doc(this.authSelectedProfile.id)
        .set({ passwordHash: hash, passwordSet: true }, { merge: true });
      this.authSelectedProfile.passwordHash = hash;
      this.authSelectedProfile.passwordSet = true;
      const p = this.profiles.find(x => x.id === this.authSelectedProfile.id);
      if (p) { p.passwordHash = hash; p.passwordSet = true; }
      await this._enterProfile(this.authSelectedProfile);
    } catch (e) {
      this.authError = '設定密碼失敗：' + e.message;
      this.authProcessing = false;
    }
  },

  async submitEnterPassword() {
    const pw = this.authPasswordInput;
    if (!pw) { this.authError = '請輸入密碼'; return; }
    this.authProcessing = true; this.authError = '';
    try {
      const hash = await this._hashPassword(pw);
      if (hash !== this.authSelectedProfile.passwordHash) {
        this.authError = '密碼錯誤，請重試';
        this.authProcessing = false;
        this.authPasswordInput = '';
        this.$nextTick(() => { if (this.$refs.authPwInput) this.$refs.authPwInput.focus(); });
        return;
      }
      await this._enterProfile(this.authSelectedProfile);
    } catch (e) {
      this.authError = '登入失敗：' + e.message;
      this.authProcessing = false;
    }
  },

  async submitCreateAdmin() {
    const name = (this.profileFormName || '').trim();
    const pw = this.authPasswordInput, pw2 = this.authPasswordConfirm;
    if (!name) { this.authError = '請輸入您的名稱'; return; }
    if (!pw || pw.length < 4) { this.authError = '密碼至少需 4 個字元'; return; }
    if (pw !== pw2) { this.authError = '兩次輸入的密碼不一致'; return; }
    this.authProcessing = true; this.authError = '';
    try {
      const hash = await this._hashPassword(pw);
      const ref = __realDb.collection('profiles').doc();
      const data = {
        name, role: 'admin', color: this.profileFormColor || 'blue',
        passwordHash: hash, passwordSet: true, order: 0, createdAt: Date.now()
      };
      await ref.set(data);
      const profile = { id: ref.id, ...data };
      this.profiles.push(profile);
      await this._enterProfile(profile);
    } catch (e) {
      this.authError = '建立管理員帳戶失敗：' + e.message;
      this.authProcessing = false;
    }
  },

  // ---------- 進入系統（設定範圍 + 載入資料） ----------
  async _enterProfile(profile) {
    __setProfileScope(profile.id);
    this.currentProfileId = profile.id;
    this.currentProfile = profile;
    this.authProcessing = false;
    this.appState = 'app';
    this.loading = true;
    this.loadingText = '正在載入 ' + profile.name + ' 的數據...';
    try {
      await this.loadAllData();
      this.applyThemeTokens();
      this.initScoringWeights();

      // ★ v28: 載入此帳戶的深色模式偏好並套用（每位老師獨立儲存）
      try {
        const sdoc = await db.collection('settings').doc('main').get();
        if (sdoc && sdoc.exists) {
          const sd = sdoc.data() || {};
          this.darkMode = !!sd.darkMode;
        } else {
          this.darkMode = false;
        }
      } catch (e) { /* ignore — 無偏好時維持淺色 */ }
      this.applyDarkMode();

    } catch (e) {
      console.error('load data after profile failed', e);
      this.addToast('載入數據失敗：' + e.message, 'error');
    }
    this.loading = false;
  },

  // ---------- 切換帳戶（重新整理確保完全乾淨） ----------
  logoutProfile() {
    __setProfileScope(null);
    try {
      // 切回淺色，避免回到登入閘前殘留深色 class（登入閘本身有獨立深色風格）
      this.darkMode = false;
      this.applyDarkMode();
    } catch (e) { /* ignore */ }
    try {
      window.location.reload();
    } catch (e) {
      // fallback：軟重設
      this.currentProfileId = null;
      this.currentProfile = null;
      this.academicYears = [];
      this.globalStudents = [];
      this.currentAcademicYearId = null;
      this.currentClassId = null;
      this.currentView = 'home';
      this.settingsNav = [];
      this.profileMenuOpen = false;
      this.appState = 'profileGate';
      this.authStep = this.profiles.length ? 'select' : 'createAdmin';
      this.authSelectedProfile = null;
      this.authPasswordInput = '';
      this.authPasswordConfirm = '';
    }
  },

  isCurrentProfileAdmin() {
    return !!(this.currentProfile && this.currentProfile.role === 'admin');
  },

  // ---------- 管理員：帳戶管理 ----------
  openAddProfileModal() {
    this.openModal('addProfile', { name: '', color: 'blue', role: 'teacher' });
  },

  async addProfileConfirm() {
    const name = (this.modalData.name || '').trim();
    if (!name) { this.addToast('請輸入老師名稱', 'warning'); return; }
    try {
      const maxOrder = this.profiles.reduce((m, p) => Math.max(m, p.order || 0), 0);
      const ref = __realDb.collection('profiles').doc();
      const data = {
        name, role: this.modalData.role === 'admin' ? 'admin' : 'teacher',
        color: this.modalData.color || 'blue',
        passwordHash: null, passwordSet: false,
        order: maxOrder + 1, createdAt: Date.now()
      };
      await ref.set(data);
      this.profiles.push({ id: ref.id, ...data });
      this.closeModal();
      this.addToast('已新增老師「' + name + '」，該老師首次登入時自行設定密碼', 'success');
    } catch (e) {
      this.addToast('新增失敗：' + e.message, 'error');
    }
  },

  openEditProfileModal(profile) {
    this.openModal('editProfile', { id: profile.id, name: profile.name, color: profile.color || 'blue', role: profile.role });
  },

  async updateProfileConfirm() {
    const name = (this.modalData.name || '').trim();
    if (!name) { this.addToast('請輸入老師名稱', 'warning'); return; }
    try {
      await __realDb.collection('profiles').doc(this.modalData.id)
        .set({ name, color: this.modalData.color || 'blue' }, { merge: true });
      const p = this.profiles.find(x => x.id === this.modalData.id);
      if (p) { p.name = name; p.color = this.modalData.color || 'blue'; }
      if (this.currentProfile && this.currentProfile.id === this.modalData.id) {
        this.currentProfile.name = name;
        this.currentProfile.color = this.modalData.color || 'blue';
      }
      this.closeModal();
      this.addToast('已更新帳戶資料', 'success');
    } catch (e) {
      this.addToast('更新失敗：' + e.message, 'error');
    }
  },

  confirmResetProfilePassword(profile) {
    this.openModal('profileResetPwConfirm', {
      id: profile.id,
      message: '確定要重設「' + profile.name + '」的密碼嗎？',
      submessage: '重設後該老師下次登入時需重新設定新密碼。管理員無法直接查看或指定其密碼。'
    });
  },

  async resetProfilePassword(profileId) {
    await __realDb.collection('profiles').doc(profileId)
      .set({ passwordHash: null, passwordSet: false }, { merge: true });
    const p = this.profiles.find(x => x.id === profileId);
    if (p) { p.passwordHash = null; p.passwordSet = false; }
    this.addToast('已重設密碼', 'success');
  },

  confirmDeleteProfile(profile) {
    if (profile.id === this.currentProfileId) { this.addToast('無法刪除目前登入中的帳戶', 'warning'); return; }
    if (profile.role === 'admin') {
      const adminCount = this.profiles.filter(p => p.role === 'admin').length;
      if (adminCount <= 1) { this.addToast('必須至少保留一位管理員', 'warning'); return; }
    }
    this.openModal('profileDeleteConfirm', {
      id: profile.id,
      message: '確定要刪除老師「' + profile.name + '」帳戶嗎？',
      submessage: '此操作僅移除帳戶本身（不會自動清除該老師名下已建立的成績資料），請謹慎操作。'
    });
  },

  async deleteProfile(profileId) {
    await __realDb.collection('profiles').doc(profileId).delete();
    this.profiles = this.profiles.filter(p => p.id !== profileId);
    this.addToast('已刪除帳戶', 'success');
  },

  // ---------- 修改自己的密碼 ----------
  openChangePasswordModal() {
    this.openModal('changePassword', { oldPw: '', newPw: '', newPw2: '' });
  },

  async changePasswordConfirm() {
    const { oldPw, newPw, newPw2 } = this.modalData;
    if (!newPw || newPw.length < 4) { this.addToast('新密碼至少需 4 個字元', 'warning'); return; }
    if (newPw !== newPw2) { this.addToast('兩次輸入的新密碼不一致', 'warning'); return; }
    try {
      const oldHash = await this._hashPassword(oldPw || '');
      if (this.currentProfile.passwordSet && oldHash !== this.currentProfile.passwordHash) {
        this.addToast('目前密碼錯誤', 'error'); return;
      }
      const newHash = await this._hashPassword(newPw);
      await __realDb.collection('profiles').doc(this.currentProfileId)
        .set({ passwordHash: newHash, passwordSet: true }, { merge: true });
      this.currentProfile.passwordHash = newHash;
      this.currentProfile.passwordSet = true;
      const p = this.profiles.find(x => x.id === this.currentProfileId);
      if (p) { p.passwordHash = newHash; p.passwordSet = true; }
      this.closeModal();
      this.addToast('密碼已更新', 'success');
    } catch (e) {
      this.addToast('更新失敗：' + e.message, 'error');
    }
  }
};

const ProfileComputed = {
  profileColorOptions() {
    return [
      { key: 'blue', label: '藍' }, { key: 'indigo', label: '靛' }, { key: 'violet', label: '紫' },
      { key: 'pink', label: '粉' }, { key: 'rose', label: '玫瑰' }, { key: 'red', label: '紅' },
      { key: 'orange', label: '橙' }, { key: 'amber', label: '琥珀' }, { key: 'emerald', label: '綠' },
      { key: 'teal', label: '青' }, { key: 'cyan', label: '天藍' }, { key: 'slate', label: '灰' }
    ];
  },
  sortedProfiles() {
    return [...this.profiles].sort((a, b) =>
      (a.order || 0) - (b.order || 0) || String(a.name || '').localeCompare(String(b.name || '')));
  }
};