/* =========================================================
   ミッション：達成条件つきの実践課題。
   「設定を変えたら挙動が変わる」を自分の手で起こさせるのが狙い。
   check(ctx) の ctx = { result, cfg, header, lines }
   ========================================================= */
(function (root) {
  'use strict';

  function has(bseg, acct, sh, amt) {
    return bseg.some(function (b) {
      return b.HKONT === acct && (!sh || b.SHKZG === sh) && (amt == null || Number(b.WRBTR) === amt);
    });
  }
  function errHas(res, code) {
    return (res.errors || []).some(function (e) { return e.code === code; });
  }

  root.MISSIONS = [
    {
      id: 'M01', week: 3, domain: 'A-1', xp: 30,
      title: '原価センタの壁',
      brief: '旅費交通費 610000 に 11,000 を計上し、普通預金 113100 から支払う SA 伝票を転記してください。',
      hint: '610000 の項目ステータスグループは G004（原価勘定）です。IMG タブで G004 の設定を見て、何が必須かを確かめてから入力してください。',
      lesson: '「原価センタが必須」は勘定マスタ（FS00）の FSG によって決まります。勘定ごとに入力統制を変えられる、というのが FI の基本設計思想です。',
      check: function (c) {
        if (!c.result.ok) return { pass: false, msg: 'まだ転記できていません。' };
        return { pass: has(c.result.bseg, '610000', 'S', 11000) && has(c.result.bseg, '113100', 'H', 11000),
                 msg: '610000 借方 11,000 と 113100 貸方 11,000 の組み合わせが必要です。' };
      }
    },
    {
      id: 'M02', week: 3, domain: 'A-1', xp: 30,
      title: '統制を壊さずに通す',
      brief: '伝票タイプ KR で仕入先 V-1001 への請求を転記してください。ただし OBA7 の「参照番号必須」は外さないこと。',
      hint: '設定を緩めれば通りますが、それは統制の放棄です。要件を満たしたまま通す方法を考えてください。',
      lesson: 'Fit&Gap では「エラーが出た → 設定を緩める」が最も安易な失敗です。その設定が何を守っているかを言えるかどうかが、設計者と操作者の分かれ目です。',
      check: function (c) {
        if (!c.result.ok) return { pass: false, msg: 'まだ転記できていません。' };
        if (!c.cfg.docTypes.KR.refRequired) return { pass: false, msg: 'OBA7 の参照番号必須を外してしまっています。設定を戻してください。' };
        return { pass: c.header.docType === 'KR' && !!c.header.reference,
                 msg: '伝票タイプ KR ＋ 参照番号入力で転記してください。' };
      }
    },
    {
      id: 'M03', week: 4, domain: 'A-4', xp: 40,
      title: '消費税を自動生成させる',
      brief: '仕入高 500000 に税抜 10,000、税コード V1（10%）で計上し、仮払消費税 175000 に 1,000 を自動転記させてください。',
      hint: '税コード欄に V1 を指定します。「税込入力」チェックの有無で、入力した金額の意味が変わります。',
      lesson: '税額行は人が入力するのではなく、税コード（FTXP）と自動転記勘定（OB40）の設定からシステムが生成します。だから 175000 は「自動転記のみ」勘定なのです。',
      check: function (c) {
        if (!c.result.ok) return { pass: false, msg: 'まだ転記できていません。' };
        return { pass: has(c.result.bseg, '175000', 'S', 1000) && has(c.result.bseg, '500000', 'S', 10000),
                 msg: '仕入高 10,000（税抜）と 仮払消費税 1,000（自動）の 2 行が必要です。' };
      }
    },
    {
      id: 'M04', week: 3, domain: 'A-1', xp: 50, flag: 'core',
      title: '【核心】設定を変えて挙動を変える',
      brief: 'SA 伝票では仕入先明細（転記キー 31）が転記できません。IMG タブで OBA7 の「許可勘定タイプ」に K を追加し、SA 伝票で仕入先明細を含む伝票を転記してください。',
      hint: 'まず設定を変えずに転記してエラー DT003 を見てください。次に IMG → 伝票タイプ → SA → 許可勘定タイプ に K を追加します。',
      lesson: 'これが L3 の入口です。「エラーの原因＝どの設定か」を特定し、設定を変えると挙動が変わることを自分の手で確認する。実機のサンドボックスでは検証できない部分を、ここで埋めます。なお実務では SA に K を許可するのは統制上まず却下されます。「できる」と「やるべき」は別だと知ることも設計者の仕事です。',
      check: function (c) {
        if (!c.result.ok) return { pass: false, msg: 'まだ転記できていません。' };
        if (c.header.docType !== 'SA') return { pass: false, msg: '伝票タイプ SA で転記してください。' };
        if (c.cfg.docTypes.SA.accountTypes.indexOf('K') < 0) return { pass: false, msg: 'OBA7 で SA の許可勘定タイプに K を追加してください。' };
        return { pass: c.result.bseg.some(function (b) { return b.KOART === 'K'; }),
                 msg: '仕入先明細（転記キー 21/25/31）を含めてください。' };
      }
    },
    {
      id: 'M05', week: 1, domain: 'A-3', xp: 30,
      title: '期間を締める',
      brief: 'IMG タブで会計期間のオープン範囲を「8 〜 8」に絞り込み、その状態で 8 月付の伝票を転記してください。',
      hint: 'OB52 に相当する設定です。範囲外の月を転記日付にするとどうなるかも試してみてください。',
      lesson: '月次決算で「もう転記させない」を実現するのが期間管理です。締めた後の遡及依頼にどう答えるかは、実務で必ず問われます。',
      check: function (c) {
        if (!c.result.ok) return { pass: false, msg: 'まだ転記できていません。' };
        var p = c.cfg.periodControl;
        return { pass: p.openFrom === 8 && p.openTo === 8, msg: 'オープン期間を 8〜8 に設定してください。' };
      }
    },
    {
      id: 'M06', week: 3, domain: 'A-1', xp: 50, flag: 'core',
      title: '【核心】設定矛盾を自分で起こす',
      brief: 'IMG タブで転記キー 40 の「原価センタ」を抑止に変更し、勘定 610000（FSG G004＝原価センタ必須）へ転記して、エラー FS001 を発生させてください。',
      hint: '転記キー側と勘定 FSG 側の項目ステータスは「リンク」されます。抑止と必須がぶつかると転記できません。',
      lesson: 'これは実プロジェクトで頻発する設定不整合です。原因が OB41 側か OBC4 側か切り分けられれば、調査で強い武器になります。達成後は転記キー 40 の設定を戻しておいてください。',
      check: function (c) {
        return { pass: errHas(c.result, 'FS001'), msg: 'エラー FS001（設定矛盾）を発生させてください。' };
      }
    },
    {
      id: 'M07', week: 7, domain: 'A-2', xp: 40,
      title: '調整勘定は誰が書くのか',
      brief: '得意先請求（伝票タイプ DR、転記キー 01）を転記し、ACDOCA に売掛金 121000 が記帳されることを確認してください。',
      hint: '121000 を明細に直接指定してはいけません。得意先を指定すると、取引先マスタの調整勘定へ自動的に記帳されます。',
      lesson: '債権債務の残高は「取引先マスタの調整勘定」を通じて総勘定元帳に反映されます。この間接性を理解していないと、残高不一致の調査ができません。',
      check: function (c) {
        if (!c.result.ok) return { pass: false, msg: 'まだ転記できていません。' };
        return { pass: c.header.docType === 'DR' && c.result.acdoca.some(function (a) { return a.RACCT === '121000'; }),
                 msg: 'DR 伝票で得意先明細を転記してください。' };
      }
    },
    {
      id: 'M08', week: 4, domain: 'B-1', xp: 25,
      title: '触れない勘定',
      brief: '仮払消費税 175000 を明細に直接指定して転記し、エラー AC004（自動転記のみ）を発生させてください。',
      hint: 'FS00 の「自動転記のみ」チェックが効いています。',
      lesson: '「この勘定に手で入れられない」という問合せは保守でよく来ます。原因が勘定マスタ側の設定だと即答できるかどうかが差になります。',
      check: function (c) {
        return { pass: errHas(c.result, 'AC004'), msg: 'エラー AC004 を発生させてください。' };
      }
    },
    {
      id: 'M09', week: 2, domain: 'A-2', xp: 30,
      title: '利益センタの要求',
      brief: '売上高 400000 を貸方に計上する伝票を転記してください。',
      hint: '400000 の FSG は G029 です。何が必須かを IMG タブで確認してください。',
      lesson: '損益勘定に利益センタを必須にしておくと、S/4HANA では ACDOCA 上で FI と CO の情報が最初から揃います。この「入力時点で管理会計の軸を取る」設計が Universal Journal の考え方です。',
      check: function (c) {
        if (!c.result.ok) return { pass: false, msg: 'まだ転記できていません。' };
        return { pass: c.result.bseg.some(function (b) { return b.HKONT === '400000' && b.SHKZG === 'H' && b.PRCTR; }),
                 msg: '400000 を貸方に、利益センタつきで転記してください。' };
      }
    },
    {
      id: 'M10', week: 5, domain: 'A-2', xp: 35,
      title: '仕入先へ支払う',
      brief: '伝票タイプ KZ で、仕入先 V-1001 への支払（買掛金の消し込み側 借方 ／ 普通預金 貸方）を 11,000 で転記してください。',
      hint: '支払側の転記キーは 25 です。買掛金 211000 は取引先の調整勘定として自動的に選ばれます。',
      lesson: 'F110（支払プログラム）が自動生成するのは、まさにこの形の伝票です。手で作れる人は、F110 が何をしているかを説明できます。',
      check: function (c) {
        if (!c.result.ok) return { pass: false, msg: 'まだ転記できていません。' };
        return { pass: c.header.docType === 'KZ' && has(c.result.bseg, '211000', 'S') && has(c.result.bseg, '113100', 'H'),
                 msg: 'KZ 伝票で 211000 借方・113100 貸方の形にしてください。' };
      }
    }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
