/* =========================================================
   転記エンジン
   SAP FI の伝票転記チェックを簡略再現する。
   最大の狙いは trace[]：どの IMG 設定がその挙動を引き起こしたかを
   毎回明示すること。「設定 → 挙動」の因果を可視化する。
   ========================================================= */
(function (root) {
  'use strict';

  var FS_LABEL = { req: '必須入力', opt: '任意入力', sup: '抑止' };

  /* 転記キー側と勘定 FSG 側の項目ステータスを「リンク」して合成する。
     SAP の実挙動：抑止と必須が衝突すると転記できない（設定矛盾）。 */
  function mergeFS(a, b) {
    if (a === b) return { v: a, conflict: false };
    var pair = [a, b];
    if (pair.indexOf('sup') >= 0 && pair.indexOf('req') >= 0) return { v: 'req', conflict: true };
    if (pair.indexOf('sup') >= 0) return { v: 'sup', conflict: false };
    if (pair.indexOf('req') >= 0) return { v: 'req', conflict: false };
    return { v: 'opt', conflict: false };
  }

  /* 1 明細の全項目について合成後ステータスを返す */
  function resolveFieldStatus(cfg, pkCode, fsgCode) {
    var pk = cfg.postingKeys[pkCode];
    var fsg = cfg.fieldStatusGroups[fsgCode];
    var out = {};
    if (!pk || !fsg) return out;
    Object.keys(cfg.fieldLabels).forEach(function (f) {
      var a = pk.fs[f] || 'opt';
      var b = fsg.fs[f] || 'opt';
      var m = mergeFS(a, b);
      out[f] = { pk: a, fsg: b, value: m.v, conflict: m.conflict };
    });
    return out;
  }

  function money(n) { return Math.round(n * 100) / 100; }

  /* 明細から実際に転記される G/L 勘定を求める。
     得意先／仕入先明細は「取引先マスタの調整勘定」に転記される。 */
  function resolveAccount(cfg, line) {
    var pk = cfg.postingKeys[line.pk];
    if (!pk) return null;
    if (pk.acctType === 'D' || pk.acctType === 'K') {
      var bp = cfg.partners[line.partner];
      return bp ? bp.recon : null;
    }
    return line.account;
  }

  /* ---------------- 本体 ---------------- */
  function post(cfg, header, lines) {
    var errors = [], warnings = [], trace = [];

    function err(code, msg, hint) { errors.push({ code: code, msg: msg, hint: hint || '' }); }
    function tr(setting, tcode, effect) { trace.push({ setting: setting, tcode: tcode, effect: effect }); }

    /* --- 伝票タイプ --- */
    var dt = cfg.docTypes[header.docType];
    if (!dt) { err('DT001', '伝票タイプ ' + header.docType + ' が定義されていません。'); return fail(); }
    tr('伝票タイプ ' + header.docType + '（' + dt.text + '）', 'OBA7',
       '許可勘定タイプ = ' + dt.accountTypes.join('/') + '、番号範囲 = ' + dt.range +
       '、参照番号 = ' + (dt.refRequired ? '必須' : '任意'));

    if (dt.refRequired && !header.reference) {
      err('DT002', '参照番号が未入力です。',
          '伝票タイプ ' + header.docType + ' は OBA7 で「参照番号必須」に設定されています。設定を外せば転記できますが、請求書の二重計上を防ぐ統制が失われます。');
    }

    /* --- 会計期間 --- */
    var d = header.postingDate ? new Date(header.postingDate) : null;
    if (!d || isNaN(d)) { err('PD001', '転記日付が不正です。'); }
    else {
      var period = d.getMonth() + 1, year = d.getFullYear();
      var pc = cfg.periodControl;
      tr('会計期間管理', 'OB52',
         '会計年度 ' + pc.fiscalYear + ' の期間 ' + pc.openFrom + '〜' + pc.openTo + ' がオープン');
      if (year !== pc.fiscalYear || period < pc.openFrom || period > pc.openTo) {
        err('PD002', '転記日付 ' + header.postingDate + ' は締められた期間です（期間 ' + period + '/' + year + '）。',
            'OB52 のオープン期間外。実務では決算締め後の遡及転記でこのエラーに遭遇します。');
      }
      header._period = period;
      header._year = year;
    }

    if (!lines || lines.length < 2) err('LN001', '明細が 2 行以上必要です。');

    /* --- 明細チェック --- */
    var debit = 0, credit = 0;
    var posted = [];
    var autoLines = [];

    (lines || []).forEach(function (ln, i) {
      var no = i + 1;
      var pk = cfg.postingKeys[ln.pk];
      if (!pk) { err('PK001', '[明細' + no + '] 転記キー ' + ln.pk + ' が未定義です。'); return; }

      /* 伝票タイプ × 勘定タイプ */
      if (dt.accountTypes.indexOf(pk.acctType) < 0) {
        err('DT003', '[明細' + no + '] 勘定タイプ ' + pk.acctType + ' は伝票タイプ ' + header.docType + ' では転記できません。',
            'OBA7 の「許可勘定タイプ」による制限。転記キー ' + ln.pk + ' は勘定タイプ ' + pk.acctType + ' 用です。伝票タイプを ' +
            Object.keys(cfg.docTypes).filter(function (k) { return cfg.docTypes[k].accountTypes.indexOf(pk.acctType) >= 0; }).join('/') +
            ' に変えるか、OBA7 で許可勘定タイプを追加します。');
        return;
      }

      var acct = resolveAccount(cfg, ln);
      if (!acct) {
        err('AC001', '[明細' + no + '] 勘定／取引先が未指定です。');
        return;
      }
      var gl = cfg.glAccounts[acct];
      if (!gl) { err('AC002', '[明細' + no + '] G/L 勘定 ' + acct + ' が存在しません。'); return; }

      if (pk.acctType === 'D' || pk.acctType === 'K') {
        tr('取引先 ' + ln.partner + ' の調整勘定', 'BP / FD02・FK02',
           '明細' + no + ' は取引先マスタの調整勘定 ' + acct + '（' + gl.text + '）へ自動転記');
      } else {
        /* 手入力できない勘定の判定 */
        if (gl.recon) {
          err('AC003', '[明細' + no + '] ' + acct + ' は調整勘定のため直接転記できません。',
              'G/L 勘定マスタ（FS00）の「調整勘定の勘定タイプ = ' + gl.recon + '」による制限。得意先／仕入先明細として転記すれば、この勘定へ自動的に記帳されます。');
          return;
        }
        if (gl.autoOnly) {
          err('AC004', '[明細' + no + '] ' + acct + ' は「自動転記のみ」勘定です。手入力できません。',
              'FS00 の「自動転記のみ」チェックによる制限。税額行のようにシステムが生成する場合のみ記帳されます。');
          return;
        }
      }

      /* 項目ステータスの合成 */
      var fs = resolveFieldStatus(cfg, ln.pk, gl.fsg);
      tr('項目ステータス合成（明細' + no + '）', 'OB41 × OBC4',
         '転記キー ' + ln.pk + ' の項目ステータス と 勘定 ' + acct + ' の FSG ' + gl.fsg + ' をリンク');

      Object.keys(fs).forEach(function (f) {
        var st = fs[f], val = (ln.fields || {})[f];
        var label = cfg.fieldLabels[f];
        if (st.conflict) {
          err('FS001', '[明細' + no + '] 項目「' + label + '」の設定が矛盾しています（転記キー側=' +
              FS_LABEL[st.pk] + ' ／ 勘定 FSG 側=' + FS_LABEL[st.fsg] + '）。',
              '抑止と必須は両立できません。OB41（転記キー ' + ln.pk + '）か OBC4（FSG ' + gl.fsg + '）のどちらかを直す必要があります。実プロジェクトで頻出する設定不整合です。');
          return;
        }
        if (st.value === 'req' && !val) {
          err('FS002', '[明細' + no + '] 項目「' + label + '」は必須入力です。',
              '必須の由来：' + (st.pk === 'req' ? '転記キー ' + ln.pk + '（OB41）' : '') +
              (st.pk === 'req' && st.fsg === 'req' ? ' と ' : '') +
              (st.fsg === 'req' ? '勘定 ' + acct + ' の FSG ' + gl.fsg + '（OBC4）' : '') + '。');
        }
        if (st.value === 'sup' && val) {
          err('FS003', '[明細' + no + '] 項目「' + label + '」は抑止されており入力できません。',
              '抑止の由来：' + (st.pk === 'sup' ? '転記キー ' + ln.pk + '（OB41）' : '') +
              (st.pk === 'sup' && st.fsg === 'sup' ? ' と ' : '') +
              (st.fsg === 'sup' ? '勘定 ' + acct + ' の FSG ' + gl.fsg + '（OBC4）' : '') + '。');
        }
      });

      var amt = Number(ln.amount) || 0;
      if (amt <= 0) err('AM001', '[明細' + no + '] 金額は正の数で入力します（貸借は転記キーが決めます）。');

      /* --- 消費税：内税／外税で「入力額の意味」が変わる --- */
      var baseAmt = amt, taxRec = null;
      if (ln.taxCode) {
        var tx = cfg.taxCodes[ln.taxCode];
        if (!tx) {
          err('TX001', '[明細' + no + '] 税コード ' + ln.taxCode + ' が未定義です。');
        } else {
          if (gl.taxCat === '' && pk.acctType === 'S') {
            warnings.push('[明細' + no + '] 勘定 ' + acct + ' には税カテゴリが未設定です（FS00）。実機ではこの勘定に税コードを入力できません。');
          }
          if (tx.rate > 0 && tx.account) {
            var taxAmt;
            if (ln.taxIncl) {
              taxAmt = money(amt * tx.rate / (100 + tx.rate));
              baseAmt = money(amt - taxAmt);
              tr('税額計算：内税（税込金額入力）', 'FB60 の「税額計算」チェック',
                 '明細' + no + '：入力 ' + amt + ' を 税抜 ' + baseAmt + ' ＋ 税 ' + taxAmt + ' に分解');
            } else {
              taxAmt = money(amt * tx.rate / 100);
              baseAmt = amt;
              tr('税額計算：外税（税抜金額入力）', 'FB60 の「税額計算」チェック',
                 '明細' + no + '：入力 ' + amt + ' を税抜とみなし、税 ' + taxAmt + ' を上乗せ');
            }
            taxRec = {
              no: 0, pk: tx.dir === 'input' ? '40' : '50', dc: tx.dir === 'input' ? 'D' : 'C',
              acctType: 'S', account: tx.account, accountText: cfg.glAccounts[tx.account].text,
              partner: '', amount: taxAmt, taxCode: ln.taxCode, fields: {}, auto: true, fsg: '-',
              note: '税コード ' + ln.taxCode + '（' + tx.rate + '%）による自動転記'
            };
            tr('税コード ' + ln.taxCode + ' の自動転記勘定', 'FTXP / OB40',
               tx.account + '（' + cfg.glAccounts[tx.account].text + '）へ ' + taxAmt + ' を自動生成');
          }
        }
      }

      if (pk.dc === 'D') debit += baseAmt; else credit += baseAmt;

      posted.push({
        no: no, pk: ln.pk, dc: pk.dc, acctType: pk.acctType, account: acct,
        accountText: gl.text, partner: ln.partner || '', amount: baseAmt,
        inputAmount: amt, taxCode: ln.taxCode || '', taxIncl: !!ln.taxIncl,
        fields: ln.fields || {}, auto: false, fsg: gl.fsg
      });

      if (taxRec) {
        autoLines.push(taxRec);
        if (taxRec.dc === 'D') debit += taxRec.amount; else credit += taxRec.amount;
      }
    });

    /* --- 貸借バランス --- */
    debit = money(debit); credit = money(credit);
    if (errors.length === 0 && debit !== credit) {
      err('BL001', '貸借が一致しません（借方 ' + debit + ' ／ 貸方 ' + credit + ' ／ 差額 ' + money(debit - credit) + '）。',
          '税コードを使った場合、税額行も貸借に含まれます。内税か外税かで入力すべき金額が変わる点に注意。');
    }

    if (errors.length) return fail();

    /* --- 採番して転記 --- */
    var rng = cfg.numberRanges[dt.range];
    var belnr = String(rng.current);
    rng.current = rng.current + 1;
    tr('番号範囲 ' + dt.range, 'FBN1',
       '伝票番号 ' + belnr + ' を採番（範囲 ' + rng.from + '〜' + rng.to + '）');

    var all = posted.concat(autoLines).map(function (l, i) {
      l.buzei = String(i + 1).padStart(3, '0');
      return l;
    });

    var bkpf = {
      BUKRS: cfg.companyCode || '1000', BELNR: belnr, GJAHR: header._year,
      BLART: header.docType, BLDAT: header.docDate || header.postingDate,
      BUDAT: header.postingDate, MONAT: header._period, WAERS: header.currency || 'JPY',
      XBLNR: header.reference || '', BKTXT: header.headerText || '',
      USNAM: 'LEARNER', TCODE: 'FB01'
    };

    var bseg = all.map(function (l) {
      return {
        BELNR: belnr, BUZEI: l.buzei, BSCHL: l.pk, KOART: l.acctType,
        HKONT: l.account, LIFNR: l.acctType === 'K' ? l.partner : '',
        KUNNR: l.acctType === 'D' ? l.partner : '',
        SHKZG: l.dc === 'D' ? 'S' : 'H', WRBTR: l.amount, MWSKZ: l.taxCode,
        ZUONR: l.fields.assignment || '', SGTXT: l.fields.text || '',
        KOSTL: l.fields.costCenter || '', PRCTR: l.fields.profitCenter || '',
        AUTO: l.auto ? 'X' : ''
      };
    });

    var acdoca = all.map(function (l) {
      return {
        RLDNR: '0L', RBUKRS: bkpf.BUKRS, GJAHR: bkpf.GJAHR, BELNR: belnr, DOCLN: l.buzei,
        RACCT: l.account, DRCRK: l.dc === 'D' ? 'S' : 'H',
        HSL: (l.dc === 'D' ? 1 : -1) * l.amount,
        RCNTR: l.fields.costCenter || '', PRCTR: l.fields.profitCenter || ''
      };
    });

    tr('Universal Journal', 'ACDOCA',
       'S/4HANA では BSEG／総勘定元帳／CO が ACDOCA に一元化される。上の ' + acdoca.length + ' 行が単一の真実。');

    return { ok: true, errors: [], warnings: warnings, trace: trace,
             belnr: belnr, bkpf: bkpf, bseg: bseg, acdoca: acdoca, lines: all };

    function fail() {
      return { ok: false, errors: errors, warnings: warnings, trace: trace };
    }
  }

  root.ENGINE = { post: post, resolveFieldStatus: resolveFieldStatus, mergeFS: mergeFS, FS_LABEL: FS_LABEL };
})(typeof window !== 'undefined' ? window : globalThis);
