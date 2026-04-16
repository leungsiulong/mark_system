// ================================================================
// Static Data Definitions (v4 — new scoreConfig structure)
// ================================================================
const COLOR_THEMES = [
  { name:'經典藍', key:'blue', group:'standard', gradient:['#1e3a5f','#1e40af'], accent:'#2563eb', accentBg:'#eff6ff', text:'#1d4ed8' },
  { name:'靛藍', key:'indigo', group:'standard', gradient:['#312e81','#4338ca'], accent:'#4f46e5', accentBg:'#eef2ff', text:'#4338ca' },
  { name:'紫羅蘭', key:'violet', group:'standard', gradient:['#4c1d95','#6d28d9'], accent:'#7c3aed', accentBg:'#f5f3ff', text:'#6d28d9' },
  { name:'桃紅', key:'pink', group:'standard', gradient:['#831843','#be185d'], accent:'#db2777', accentBg:'#fdf2f8', text:'#be185d' },
  { name:'玫瑰紅', key:'rose', group:'standard', gradient:['#881337','#be123c'], accent:'#e11d48', accentBg:'#fff1f2', text:'#be123c' },
  { name:'棗紅', key:'red', group:'standard', gradient:['#7f1d1d','#b91c1c'], accent:'#dc2626', accentBg:'#fef2f2', text:'#b91c1c' },
  { name:'橙色', key:'orange', group:'standard', gradient:['#7c2d12','#c2410c'], accent:'#ea580c', accentBg:'#fff7ed', text:'#c2410c' },
  { name:'琥珀', key:'amber', group:'standard', gradient:['#78350f','#b45309'], accent:'#d97706', accentBg:'#fffbeb', text:'#b45309' },
  { name:'翠綠', key:'emerald', group:'standard', gradient:['#064e3b','#047857'], accent:'#059669', accentBg:'#ecfdf5', text:'#047857' },
  { name:'青碧', key:'teal', group:'standard', gradient:['#134e4a','#0f766e'], accent:'#0d9488', accentBg:'#f0fdfa', text:'#0f766e' },
  { name:'天藍', key:'cyan', group:'standard', gradient:['#164e63','#0e7490'], accent:'#0891b2', accentBg:'#ecfeff', text:'#0e7490' },
  { name:'石墨', key:'slate', group:'standard', gradient:['#1e293b','#334155'], accent:'#475569', accentBg:'#f8fafc', text:'#334155' },
  { name:'大地棕', key:'earthBrown', group:'earth', gradient:['#3E2723','#5D4037'], accent:'#795548', accentBg:'#EFEBE9', text:'#5D4037' },
  { name:'暖沙', key:'sand', group:'earth', gradient:['#5D4037','#8D6E63'], accent:'#A1887F', accentBg:'#FAF3EE', text:'#6D4C41' },
  { name:'橄欖', key:'olive', group:'earth', gradient:['#33691E','#558B2F'], accent:'#689F38', accentBg:'#F1F8E9', text:'#33691E' },
  { name:'赤陶', key:'terracotta', group:'earth', gradient:['#6D3A0A','#A0522D'], accent:'#BF6836', accentBg:'#FFF3EB', text:'#8B4513' },
  { name:'胡桃木', key:'walnut', group:'earth', gradient:['#2C1810','#4E342E'], accent:'#6D4C41', accentBg:'#F5EDE8', text:'#4E342E' },
  { name:'陶土', key:'clay', group:'earth', gradient:['#4E342E','#795548'], accent:'#8D6E63', accentBg:'#F5F0EB', text:'#5D4037' },
  { name:'苔蘚', key:'moss', group:'earth', gradient:['#2E4A26','#4A6B3F'], accent:'#6B8F5E', accentBg:'#EFF5EC', text:'#3E6B33' },
  { name:'薄荷', key:'mint', group:'soft', gradient:['#00796B','#009688'], accent:'#26A69A', accentBg:'#E0F2F1', text:'#00796B' },
  { name:'薰衣草', key:'lavender', group:'soft', gradient:['#5E35B1','#7E57C2'], accent:'#9575CD', accentBg:'#EDE7F6', text:'#5E35B1' },
  { name:'天空', key:'sky', group:'soft', gradient:['#0277BD','#0288D1'], accent:'#03A9F4', accentBg:'#E1F5FE', text:'#0277BD' },
  { name:'蜜桃', key:'peach', group:'soft', gradient:['#BF5B17','#E67E22'], accent:'#F0932B', accentBg:'#FEF5E7', text:'#CA6F1E' },
  { name:'櫻花', key:'sakura', group:'soft', gradient:['#AD1457','#D81B60'], accent:'#EC407A', accentBg:'#FCE4EC', text:'#C2185B' },
  { name:'森林', key:'forest', group:'soft', gradient:['#1B5E20','#2E7D32'], accent:'#43A047', accentBg:'#E8F5E9', text:'#2E7D32' },
  { name:'海洋', key:'ocean', group:'soft', gradient:['#006064','#00838F'], accent:'#0097A7', accentBg:'#E0F7FA', text:'#00838F' },
  { name:'丁香', key:'lilac', group:'soft', gradient:['#6A1B9A','#8E24AA'], accent:'#AB47BC', accentBg:'#F3E5F5', text:'#7B1FA2' },
  { name:'灰藍', key:'blueGray', group:'soft', gradient:['#37474F','#546E7A'], accent:'#78909C', accentBg:'#ECEFF1', text:'#546E7A' },
  { name:'珊瑚', key:'coral', group:'soft', gradient:['#C62828','#E53935'], accent:'#EF5350', accentBg:'#FFEBEE', text:'#C62828' },
];

const ALL_TABS = [
  { key:'home', label:'首頁', icon:'fas fa-home' },
  { key:'grades', label:'成績輸入', icon:'fas fa-table' },
  { key:'scoring', label:'總分計算', icon:'fas fa-calculator' },
  { key:'analysis', label:'數據分析', icon:'fas fa-chart-bar' },
  { key:'settings', label:'設定', icon:'fas fa-cog' }
];

const QUICK_NAV_ITEMS = [
  { key:'grades', label:'成績輸入', icon:'fas fa-keyboard', desc:'輸入和管理學生成績', gradient:['#2563eb','#3b82f6'] },
  { key:'scoring', label:'總分計算', icon:'fas fa-calculator', desc:'設定計分權重和匯出', gradient:['#7c3aed','#8b5cf6'] },
  { key:'analysis', label:'數據分析', icon:'fas fa-chart-line', desc:'查看成績統計和圖表', gradient:['#059669','#10b981'] },
  { key:'yearMgmt', label:'學年班別管理', icon:'fas fa-sitemap', desc:'管理學年、班別及學生', gradient:['#7c3aed','#8b5cf6'] },
  { key:'appearance', label:'外觀設定', icon:'fas fa-palette', desc:'自訂介面主題顏色', gradient:['#db2777','#ec4899'] },
  { key:'export', label:'匯出報告', icon:'fas fa-file-export', desc:'匯出成績報告和統計', gradient:['#ea580c','#f97316'] },
  { key:'ranking', label:'排名查詢', icon:'fas fa-trophy', desc:'查看學生排名數據', gradient:['#d97706','#f59e0b'] },
  { key:'attendance', label:'出席記錄', icon:'fas fa-clipboard-check', desc:'管理學生出席記錄', gradient:['#0891b2','#06b6d4'] },
  { key:'parentComm', label:'家長通訊', icon:'fas fa-comments', desc:'家長溝通記錄', gradient:['#475569','#64748b'] },
];

// ★ v4: Updated score config structure
const DEFAULT_SCORE_CONFIG = {
  ut: { assignment: 20, quiz: 20, unifiedTest: 40, classPerformance: 20 },
  exam: {
    a1Ratio: 30,
    a2Ratio: 70,
    a1Weights: { assignment: 6, quiz: 6, unifiedTest: 12, classPerformance: 6 }
  },
  yearly: { t1Weight: 40, t2Weight: 60 }
};