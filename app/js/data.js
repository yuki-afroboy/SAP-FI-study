/* =========================================================
   SAP FI 学習プラットフォーム : マスタ／設定データ
   実機で試せない「設定 → 挙動」の因果を再現するための定義。
   ここの値はユーザーが画面から書き換えられる（＝IMG のつもり）。
   ========================================================= */

var SEED = {};
if (typeof window !== "undefined") window.SEED = SEED;

/* ---------- 会計期間（OB52 相当） ---------- */
SEED.periodControl = {
  fiscalYear: 2026,
  openFrom: 1,
  openTo: 12,
  note: '転記日付がオープン期間外ならエラー。実機の OB52 に相当する。'
};

/* ---------- 番号範囲（FBN1 相当） ---------- */
SEED.numberRanges = {
  '01': { from: 1000000000, to: 1099999999, current: 1000000000, ext: false },
  '18': { from: 1800000000, to: 1899999999, current: 1800000000, ext: false },
  '19': { from: 1900000000, to: 1999999999, current: 1900000000, ext: false },
  '15': { from: 1500000000, to: 1599999999, current: 1500000000, ext: false }
};

/* ---------- 伝票タイプ（OBA7 相当） ---------- */
SEED.docTypes = {
  SA: { text: '総勘定元帳伝票', range: '01', accountTypes: ['S','A'],
        refRequired: false, headerTextRequired: false, negativePosting: false,
        hint: '最も汎用的な振替伝票。得意先／仕入先は転記できない設定が一般的。' },
  AB: { text: '振替伝票（全般）', range: '01', accountTypes: ['S','A','D','K'],
        refRequired: false, headerTextRequired: false, negativePosting: false,
        hint: '全勘定タイプを許可。何でも通るぶん、統制は弱い。' },
  KR: { text: '仕入先請求', range: '19', accountTypes: ['K','S','A'],
        refRequired: true, headerTextRequired: false, negativePosting: false,
        hint: '参照番号必須。実務では請求書番号を入れさせ、二重計上を防ぐ。' },
  KZ: { text: '仕入先支払', range: '15', accountTypes: ['K','S'],
        refRequired: false, headerTextRequired: false, negativePosting: false,
        hint: '支払処理（F110／F-53）が生成する伝票タイプ。' },
  DR: { text: '得意先請求', range: '18', accountTypes: ['D','S'],
        refRequired: true, headerTextRequired: false, negativePosting: false,
        hint: 'SD からの請求連動でも使われる。' },
  DZ: { text: '入金', range: '15', accountTypes: ['D','S'],
        refRequired: false, headerTextRequired: false, negativePosting: false,
        hint: '入金消込（F-28）が生成する。' }
};

/* ---------- 転記キー（OB41 相当） ---------- */
/* fs = 転記キー側の項目ステータス。勘定側 FSG と「リンク」して合成される。 */
SEED.postingKeys = {
  '40': { text: '総勘定元帳 借方', dc: 'D', acctType: 'S',
          fs: { text:'opt', assignment:'opt', costCenter:'opt', profitCenter:'opt',
                paymentTerms:'sup', paymentMethod:'sup', businessArea:'opt', quantity:'opt' } },
  '50': { text: '総勘定元帳 貸方', dc: 'C', acctType: 'S',
          fs: { text:'opt', assignment:'opt', costCenter:'opt', profitCenter:'opt',
                paymentTerms:'sup', paymentMethod:'sup', businessArea:'opt', quantity:'opt' } },
  '01': { text: '得意先 請求', dc: 'D', acctType: 'D',
          fs: { text:'opt', assignment:'opt', costCenter:'sup', profitCenter:'sup',
                paymentTerms:'opt', paymentMethod:'opt', businessArea:'opt', quantity:'sup' } },
  '11': { text: '得意先 貸方記入', dc: 'C', acctType: 'D',
          fs: { text:'opt', assignment:'opt', costCenter:'sup', profitCenter:'sup',
                paymentTerms:'opt', paymentMethod:'opt', businessArea:'opt', quantity:'sup' } },
  '15': { text: '得意先 入金', dc: 'C', acctType: 'D',
          fs: { text:'opt', assignment:'opt', costCenter:'sup', profitCenter:'sup',
                paymentTerms:'sup', paymentMethod:'opt', businessArea:'opt', quantity:'sup' } },
  '21': { text: '仕入先 借方記入', dc: 'D', acctType: 'K',
          fs: { text:'opt', assignment:'opt', costCenter:'sup', profitCenter:'sup',
                paymentTerms:'opt', paymentMethod:'opt', businessArea:'opt', quantity:'sup' } },
  '25': { text: '仕入先 支払', dc: 'D', acctType: 'K',
          fs: { text:'opt', assignment:'opt', costCenter:'sup', profitCenter:'sup',
                paymentTerms:'sup', paymentMethod:'opt', businessArea:'opt', quantity:'sup' } },
  '31': { text: '仕入先 請求', dc: 'C', acctType: 'K',
          fs: { text:'opt', assignment:'opt', costCenter:'sup', profitCenter:'sup',
                paymentTerms:'opt', paymentMethod:'opt', businessArea:'opt', quantity:'sup' } },
  '70': { text: '資産 借方', dc: 'D', acctType: 'A',
          fs: { text:'opt', assignment:'opt', costCenter:'sup', profitCenter:'sup',
                paymentTerms:'sup', paymentMethod:'sup', businessArea:'opt', quantity:'opt' } },
  '75': { text: '資産 貸方', dc: 'C', acctType: 'A',
          fs: { text:'opt', assignment:'opt', costCenter:'sup', profitCenter:'sup',
                paymentTerms:'sup', paymentMethod:'sup', businessArea:'opt', quantity:'opt' } }
};

/* ---------- 項目ステータスグループ（OBC4 相当） ---------- */
SEED.fieldStatusGroups = {
  G001: { text: '一般（税勘定なし）',
          fs: { text:'req', assignment:'opt', costCenter:'opt', profitCenter:'opt',
                paymentTerms:'sup', paymentMethod:'sup', businessArea:'opt', quantity:'opt' } },
  G004: { text: '原価勘定',
          fs: { text:'req', assignment:'opt', costCenter:'req', profitCenter:'opt',
                paymentTerms:'sup', paymentMethod:'sup', businessArea:'opt', quantity:'sup' } },
  G005: { text: '銀行勘定（消込あり）',
          fs: { text:'opt', assignment:'req', costCenter:'sup', profitCenter:'sup',
                paymentTerms:'sup', paymentMethod:'opt', businessArea:'opt', quantity:'sup' } },
  G029: { text: '売上勘定',
          fs: { text:'req', assignment:'opt', costCenter:'sup', profitCenter:'req',
                paymentTerms:'sup', paymentMethod:'sup', businessArea:'opt', quantity:'opt' } },
  G067: { text: '調整勘定／自動転記のみ',
          fs: { text:'opt', assignment:'opt', costCenter:'sup', profitCenter:'sup',
                paymentTerms:'opt', paymentMethod:'opt', businessArea:'opt', quantity:'sup' } }
};

SEED.fieldLabels = {
  text: '明細テキスト', assignment: '割当', costCenter: '原価センタ',
  profitCenter: '利益センタ', paymentTerms: '支払条件', paymentMethod: '支払方法',
  businessArea: '事業領域', quantity: '数量'
};

/* ---------- G/L 勘定マスタ（FS00 相当） ---------- */
SEED.glAccounts = {
  '113100': { text:'普通預金', type:'S', fsg:'G005', openItem:true,  taxCat:'',  autoOnly:false, recon:'' },
  '121000': { text:'売掛金（調整勘定）', type:'S', fsg:'G067', openItem:false, taxCat:'', autoOnly:true, recon:'D' },
  '175000': { text:'仮払消費税', type:'S', fsg:'G067', openItem:false, taxCat:'-', autoOnly:true, recon:'' },
  '175010': { text:'仮受消費税', type:'S', fsg:'G067', openItem:false, taxCat:'+', autoOnly:true, recon:'' },
  '211000': { text:'買掛金（調整勘定）', type:'S', fsg:'G067', openItem:false, taxCat:'', autoOnly:true, recon:'K' },
  '400000': { text:'売上高', type:'S', fsg:'G029', openItem:false, taxCat:'+', autoOnly:false, recon:'' },
  '500000': { text:'仕入高', type:'S', fsg:'G001', openItem:false, taxCat:'-', autoOnly:false, recon:'' },
  '610000': { text:'旅費交通費', type:'S', fsg:'G004', openItem:false, taxCat:'-', autoOnly:false, recon:'' },
  '620000': { text:'支払手数料', type:'S', fsg:'G004', openItem:false, taxCat:'-', autoOnly:false, recon:'' },
  '999999': { text:'未処理勘定', type:'S', fsg:'G001', openItem:true, taxCat:'', autoOnly:false, recon:'' }
};

/* ---------- 取引先マスタ（BP 相当） ---------- */
SEED.partners = {
  'V-1001': { text:'（架空）部材サプライヤ A', type:'K', recon:'211000', terms:'N030' },
  'V-1002': { text:'（架空）物流サービス B',   type:'K', recon:'211000', terms:'N060' },
  'C-2001': { text:'（架空）販売代理店 X',     type:'D', recon:'121000', terms:'N030' },
  'C-2002': { text:'（架空）量販店 Y',         type:'D', recon:'121000', terms:'N045' }
};

/* ---------- 消費税コード（FTXP 相当） ---------- */
SEED.taxCodes = {
  V0: { text:'課税対象外（仕入）', rate:0,  dir:'input',  account:'' },
  V1: { text:'課税仕入 10%',      rate:10, dir:'input',  account:'175000' },
  V2: { text:'課税仕入 8%（軽減）', rate:8, dir:'input',  account:'175000' },
  A0: { text:'課税対象外（売上）', rate:0,  dir:'output', account:'' },
  A1: { text:'課税売上 10%',      rate:10, dir:'output', account:'175010' }
};

/* ---------- 原価センタ／利益センタ ---------- */
SEED.costCenters   = { 'CC1000':'管理部門', 'CC2000':'営業部門', 'CC3000':'製造部門' };
SEED.profitCenters = { 'PC1000':'国内事業', 'PC2000':'海外事業' };
SEED.paymentTerms  = { 'N000':'即時', 'N030':'月末締め翌月末', 'N045':'45日', 'N060':'60日' };
SEED.paymentMethods= { 'T':'銀行振込', 'B':'手形', 'D':'口座振替' };

/* ---------- カリキュラム（スキルツリー） ---------- */
SEED.weeks = [
  { w:1,  d:'A-1', t:'FI 全体像・組織構造',        g:'会社コード／原価管理領域／元帳／通貨の関係を図示して説明できる' },
  { w:2,  d:'A-1', t:'Universal Journal と GL マスタ', g:'ACDOCA 一元化の意味と、勘定マスタの各項目が何に効くかを説明できる' },
  { w:3,  d:'A-1', t:'伝票制御①（構造）',           g:'伝票タイプ・転記キー・項目ステータスの三者関係を設計できる' },
  { w:4,  d:'A-1', t:'伝票制御②（自動処理）',       g:'自動転記・為替換算・振替・消込の仕組みを説明できる' },
  { w:5,  d:'A-2', t:'AP（債務）',                  g:'仕入先マスタ・請求計上・支払プログラム F110 を一人称で回せる' },
  { w:6,  d:'A-2', t:'MM-FI 連携',                  g:'発注〜入庫〜請求照合の仕訳と GR/IR・価格差異を説明できる' },
  { w:7,  d:'A-2', t:'AR（債権）と SD-FI',          g:'得意先マスタ・請求・入金消込・販売連動を説明できる' },
  { w:8,  d:'A-4', t:'AA（固定資産）',              g:'償却領域・資産クラス・取得／除却／償却実行を説明・実行できる' },
  { w:9,  d:'A-4', t:'銀行会計・日本固有',          g:'支払方法・銀行勘定・消費税・インボイス制度を説明できる' },
  { w:10, d:'A-3', t:'月次・年次決算',              g:'決算プロセス全体を一人称で回し、CO 連携まで説明できる' },
  { w:11, d:'B-1', t:'不具合調査',                  g:'伝票番号から原因を切り分ける調査ルートを確立する' },
  { w:12, d:'B-2', t:'統合演習（Fit&Gap）',         g:'設計判断と根拠を文書化し、レビューに耐える' }
];
