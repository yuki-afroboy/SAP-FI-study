/* =========================================================
   UI レイヤ
   ========================================================= */
(function () {
  'use strict';

  var S = STORE, view = 'home', cfg = null, flashTimer = null;
  var lastImportMsg = '', lastImportOk = false;

  function deep(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function opts(obj, sel, fmt) {
    return Object.keys(obj).map(function (k) {
      var label = fmt ? fmt(k, obj[k]) : (k + ' ' + (obj[k].text || obj[k]));
      return '<option value="' + esc(k) + '"' + (k === sel ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }
  /* 生成したファイルを利用者に渡す。
     Artifact ビューアでは downloads ケイパビリティ経由でしか渡せず、
     GitHub Pages やローカルでは通常のダウンロードで渡せる。両方に対応する。 */
  function saveFile(name, text) {
    var p;
    try {
      p = (window.claude && typeof window.claude.use === 'function')
        ? window.claude.use('downloads') : Promise.resolve(null);
    } catch (e) { p = Promise.resolve(null); }
    return p.then(function (dl) {
      if (dl) {
        return dl.save({ filename: name, data: text }).then(
          function () { flash('保存しました'); },
          function (e) {
            flash(e && e.code === 'declined' ? 'キャンセルしました'
              : 'この画面では保存できません。テキストをコピーしてください');
          });
      }
      var blob = new Blob([text], { type: 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      flash('ダウンロードしました');
    }, function () { flash('保存できませんでした。テキストをコピーしてください'); });
  }

  function flash(msg) {
    var d = document.getElementById('flash');
    d.textContent = msg; d.style.display = 'block';
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { d.style.display = 'none'; }, 2600);
  }

  /* ---------- 設定のロード ---------- */
  function loadCfg() {
    var saved = S.state().cfg;
    cfg = saved ? saved : deep(SEED);
    /* シード側に増えた定義を取り込む（前方互換） */
    Object.keys(SEED).forEach(function (k) { if (!(k in cfg)) cfg[k] = deep(SEED[k]); });
    cfg.companyCode = cfg.companyCode || '1000';
  }
  function persistCfg() { S.saveCfg(cfg); }
  function resetCfg() { cfg = deep(SEED); cfg.companyCode = '1000'; persistCfg(); }

  /* ---------- ラボの状態 ---------- */
  var lab = {
    header: { docType: 'SA', postingDate: S.today(), docDate: S.today(), currency: 'JPY', reference: '', headerText: '' },
    lines: [
      { pk: '40', account: '610000', partner: '', amount: '11000', taxCode: '', taxIncl: false, fields: {} },
      { pk: '50', account: '113100', partner: '', amount: '11000', taxCode: '', taxIncl: false, fields: {} }
    ],
    result: null, missionId: null, missionMsg: null
  };

  /* =========================================================
     ホーム
     ========================================================= */
  function renderHome() {
    var st = S.state(), lp = S.levelProgress();
    var scopedDrills = S.inScope(DRILLS);
    var due = S.dueDrills(scopedDrills).length;
    var weekMissions = MISSIONS.filter(function (m) { return m.week === st.week; });
    var weekDone = weekMissions.filter(function (m) { return st.missions[m.id] && st.missions[m.id].done; }).length;
    var doneM = MISSIONS.filter(function (m) { return st.missions[m.id] && st.missions[m.id].done; }).length;
    var wk = SEED.weeks.filter(function (w) { return w.w === st.week; })[0] || SEED.weeks[0];

    var banner = '';
    if (!S.storage.ok) {
      banner = '<div class="card" style="border-color:var(--err)">' +
        '<h2 style="color:var(--err)">⚠ この画面では進捗が保存されません</h2>' +
        '<p class="small">ブラウザの保存領域を使えませんでした（' + esc(S.storage.reason) + '）。' +
        'このまま学習しても、閉じた時点で XP・ミッション・ドリルの記録が消えます。</p>' +
        '<p class="small"><b>対処：</b>下の「進捗データ（復元用）」をコピーして保管し、次回は「復元」から貼り戻してください。' +
        '毎回それをやるのは現実的でないので、恒久的には GitHub Pages 版か、リポジトリを clone してローカルで ' +
        '<span class="mono">app/index.html</span> を開く運用に切り替えることを勧めます。</p></div>';
    } else if (!S.storage.persisted) {
      banner = '<div class="card" style="border-color:var(--warn)">' +
        '<p class="small"><b>保存領域は使えています。</b>この画面での記録は初回なので、次に開いたときに残っているかを確認してください。' +
        '残っていなければ、下の「進捗データ」を保管する運用に切り替えます。</p></div>';
    }

    var stats = banner + '<div class="card"><div class="grid g3">' +
      '<div class="stat"><b>Lv.' + S.level() + '</b><span>レベル</span></div>' +
      '<div class="stat"><b>' + st.xp + '</b><span>累計 XP</span></div>' +
      '<div class="stat"><b>' + st.streak.count + '</b><span>連続学習日数（最長 ' + st.streak.best + '）</span></div>' +
      '<div class="stat"><b>' + doneM + '/' + MISSIONS.length + '</b><span>ミッション達成</span></div>' +
      '</div>' +
      '<div class="bar" style="margin-top:.5rem"><i style="width:' + lp.pct + '%"></i></div>' +
      '<div class="small muted" style="text-align:right">次のレベルまで ' + Math.max(0, lp.next - st.xp) + ' XP</div>' +
      '</div>';

    var todo = '<div class="card">' +
      '<div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;margin-bottom:.5rem">' +
      '<h2 style="margin:0">今週：W' + st.week + '　' + esc(wk.t) + '</h2>' +
      '<span style="flex:1"></span>' +
      '<label class="f" style="margin:0">学習中の週</label>' +
      '<select data-week="1" style="width:auto">' + SEED.weeks.map(function (w) {
        return '<option value="' + w.w + '"' + (w.w === st.week ? ' selected' : '') + '>W' + w.w + ' ' + esc(w.t) + '</option>';
      }).join('') + '</select></div>' +
      '<p class="small muted">到達目標：' + esc(wk.g) + '</p>' +
      '<ul class="small">' +
      '<li>今週のミッション：<b>' + weekDone + ' / ' + weekMissions.length + ' 達成</b>' +
      (weekMissions.length ? '（<a href="#" data-nav="missions">見る</a>）' : '（この週はラボ課題なし。実機ハンズオン中心）') + '</li>' +
      '<li>復習期限のドリル：<b>' + due + ' 問</b>' + (due ? '（<a href="#" data-nav="drill">解く</a>）' : '（なし。よく回っています）') + '</li>' +
      '<li>転記ラボで設定をいじって挙動の差を観察する（<a href="#" data-nav="lab">開く</a>）</li>' +
      '</ul>' +
      '<p class="small muted">出題範囲は W1〜W' + st.week + '。まだ学んでいない週の論点は出しません。' +
      '週を進めると出題範囲とミッションが増えます。</p></div>';

    var tree = '<div class="card"><h2>カリキュラム（12週）</h2>' +
      '<p class="small muted">各週の到達目標。習熟度は下の自己評価と連動させて更新します。</p><div class="tree">' +
      SEED.weeks.map(function (w) {
        var lv = st.mastery[w.d] || 0;
        return '<div class="node' + (lv >= 3 ? ' done' : '') + '">' +
          '<div class="w">W' + w.w + ' / ' + w.d + '</div>' +
          '<div class="t">' + esc(w.t) + '</div>' +
          '<div class="small muted" style="margin-top:.3rem">' + esc(w.g) + '</div></div>';
      }).join('') + '</div></div>';

    var mastery = '<div class="card"><h2>習熟度マップ（自己評価）</h2>' +
      '<p class="small muted">0=知らない / 1=手順書があればできる / 2=一人でできる / 3=設定と挙動の因果を説明できる / 4=設計判断ができる</p>' +
      Object.keys(S.DOMAINS).map(function (k) {
        var v = st.mastery[k] || 0;
        return '<div class="field" style="display:flex;gap:.75rem;align-items:center">' +
          '<div style="flex:1"><b class="small">' + k + '</b> <span class="small">' + esc(S.DOMAINS[k]) + '</span>' +
          '<div class="bar"><i style="width:' + (v * 25) + '%"></i></div></div>' +
          '<select data-mastery="' + k + '" style="width:auto">' +
          [0, 1, 2, 3, 4].map(function (n) { return '<option value="' + n + '"' + (n === v ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
          '</select></div>';
      }).join('') + '</div>';

    var exportCard = '<div class="card"><h2>進捗データ（復元用）</h2>' +
      '<p class="small muted">この JSON が進捗の実体です。<span class="mono">progress/state.json</span> としてコミットしておけば、' +
      '環境が変わっても、記録が消えても、いつでもここに戻れます。</p>' +
      '<textarea id="stateOut" rows="6" readonly class="mono" style="font-size:.72rem">' + esc(S.exportState()) + '</textarea>' +
      '<div style="display:flex;gap:.5rem;margin:.5rem 0;flex-wrap:wrap">' +
      '<button class="btn sm" data-act="save-state">state.json として保存</button>' +
      '<button class="btn ghost sm" data-act="copy-state">コピー</button></div>' +
      '<h3 style="margin-top:1rem">復元</h3>' +
      '<p class="small muted">保管しておいた JSON を貼り付けて復元します。現在の進捗は上書きされます。</p>' +
      '<textarea id="stateIn" rows="3" class="mono" style="font-size:.72rem" placeholder="ここに進捗データを貼り付ける"></textarea>' +
      '<div style="margin-top:.5rem"><button class="btn sm" data-act="import-state">復元する</button></div>' +
      (lastImportMsg ? '<div class="msg ' + (lastImportOk ? 'ok' : 'err') + '">' + esc(lastImportMsg) + '</div>' : '') +
      '</div>' +
      '<div class="card"><h2>学習ログ（週次レビュー用）</h2>' +
      '<p class="small muted">読みやすい形の要約。<span class="mono">progress/YYYY-MM-DD.md</span> としてコミットします。</p>' +
      '<textarea rows="8" readonly class="mono" style="font-size:.75rem">' + esc(exportText()) + '</textarea>' +
      '<div style="display:flex;gap:.5rem;margin-top:.5rem;flex-wrap:wrap">' +
      '<button class="btn sm" data-act="save-log">.md として保存</button>' +
      '<button class="btn ghost sm" data-act="reset-all">進捗をリセット</button></div></div>';

    return stats + todo + tree + mastery + exportCard;
  }

  function exportText() {
    var st = S.state();
    var l = ['# 学習ログ ' + S.today(), '',
      '- 学習中の週: W' + st.week,
      '- レベル: ' + S.level() + '（XP ' + st.xp + '）',
      '- 連続学習日数: ' + st.streak.count + '（最長 ' + st.streak.best + '）', '',
      '## 習熟度'];
    Object.keys(S.DOMAINS).forEach(function (k) { l.push('- ' + k + ' ' + S.DOMAINS[k] + ': Lv' + (st.mastery[k] || 0)); });
    l.push('', '## ミッション');
    MISSIONS.forEach(function (m) {
      l.push('- [' + (st.missions[m.id] && st.missions[m.id].done ? 'x' : ' ') + '] ' + m.id + ' ' + m.title);
    });
    l.push('', '## ドリル成績');
    DRILLS.forEach(function (q) {
      var c = st.drills[q.id];
      if (c && c.reps) l.push('- ' + q.id + ': ' + c.ok + '/' + c.reps + ' 正答、次回 ' + c.due);
    });
    return l.join('\n');
  }

  /* =========================================================
     転記ラボ
     ========================================================= */
  function lineAcctType(ln) {
    var pk = cfg.postingKeys[ln.pk];
    return pk ? pk.acctType : 'S';
  }
  function lineGL(ln) {
    var t = lineAcctType(ln);
    if (t === 'D' || t === 'K') {
      var bp = cfg.partners[ln.partner];
      return bp ? cfg.glAccounts[bp.recon] : null;
    }
    return cfg.glAccounts[ln.account] || null;
  }

  function renderLine(ln, i) {
    var pk = cfg.postingKeys[ln.pk];
    var at = lineAcctType(ln);
    var gl = lineGL(ln);
    var isBP = (at === 'D' || at === 'K');

    var acctSel;
    if (isBP) {
      var ps = {};
      Object.keys(cfg.partners).forEach(function (k) { if (cfg.partners[k].type === at) ps[k] = cfg.partners[k]; });
      acctSel = '<label class="f">取引先</label><select data-line="' + i + '" data-k="partner">' +
        '<option value="">-- 選択 --</option>' + opts(ps, ln.partner) + '</select>' +
        (gl ? '<div class="small muted">→ 調整勘定 ' + esc(cfg.partners[ln.partner].recon) + ' ' + esc(gl.text) + '</div>' : '');
    } else {
      acctSel = '<label class="f">G/L 勘定</label><select data-line="' + i + '" data-k="account">' +
        '<option value="">-- 選択 --</option>' + opts(cfg.glAccounts, ln.account) + '</select>' +
        (gl ? '<div class="small muted">FSG ' + esc(gl.fsg) + '　' + (gl.autoOnly ? '<span class="tag req">自動転記のみ</span>' : '') +
          (gl.recon ? '<span class="tag req">調整勘定</span>' : '') +
          (gl.taxCat ? '<span class="tag">税カテゴリ ' + esc(gl.taxCat) + '</span>' : '') + '</div>' : '');
    }

    /* 項目ステータスの合成結果 */
    var fsHtml = '', supList = [];
    if (pk && gl) {
      var fs = ENGINE.resolveFieldStatus(cfg, ln.pk, gl.fsg);
      fsHtml = Object.keys(fs).map(function (f) {
        var st = fs[f], label = cfg.fieldLabels[f];
        var origin = ln.pk + ':' + ENGINE.FS_LABEL[st.pk] + ' × ' + gl.fsg + ':' + ENGINE.FS_LABEL[st.fsg] + ' → ';
        if (st.conflict) {
          return '<div class="field"><label class="f">' + esc(label) +
            ' <span class="tag req">設定矛盾</span></label><div class="small" style="color:var(--err)">' +
            esc(origin) + 'エラー</div></div>';
        }
        if (st.value === 'sup') { supList.push(label + '（' + origin + '抑止）'); return ''; }
        var val = (ln.fields || {})[f] || '';
        var ctl;
        var maps = { costCenter: cfg.costCenters, profitCenter: cfg.profitCenters,
                     paymentTerms: cfg.paymentTerms, paymentMethod: cfg.paymentMethods };
        if (maps[f]) {
          ctl = '<select data-line="' + i + '" data-field="' + f + '"><option value="">--</option>' +
            Object.keys(maps[f]).map(function (k) {
              return '<option value="' + esc(k) + '"' + (k === val ? ' selected' : '') + '>' + esc(k + ' ' + maps[f][k]) + '</option>';
            }).join('') + '</select>';
        } else {
          ctl = '<input data-line="' + i + '" data-field="' + f + '" value="' + esc(val) + '">';
        }
        return '<div class="field"><label class="f">' + esc(label) +
          (st.value === 'req' ? ' <span class="tag req">必須</span>' : ' <span class="tag">任意</span>') +
          '</label>' + ctl + '<div class="small muted" style="font-size:.68rem">' + esc(origin + ENGINE.FS_LABEL[st.value]) + '</div></div>';
      }).join('');
    }

    var taxable = gl && (gl.taxCat || isBP);
    return '<div class="line">' +
      '<div class="line-head"><span class="no">明細 ' + (i + 1) + '</span>' +
      (pk ? '<span class="tag ' + (pk.dc === 'D' ? 'ok' : '') + '">' + (pk.dc === 'D' ? '借方' : '貸方') + '</span><span class="tag">勘定タイプ ' + pk.acctType + '</span>' : '') +
      '<span style="flex:1"></span>' +
      (lab.lines.length > 2 ? '<button class="btn ghost sm" data-act="del-line" data-line="' + i + '">削除</button>' : '') +
      '</div>' +
      '<div class="grid g3">' +
      '<div><label class="f">転記キー</label><select data-line="' + i + '" data-k="pk">' + opts(cfg.postingKeys, ln.pk) + '</select></div>' +
      '<div>' + acctSel + '</div>' +
      '<div><label class="f">金額</label><input data-line="' + i + '" data-k="amount" value="' + esc(ln.amount) + '" inputmode="decimal"></div>' +
      '<div><label class="f">税コード</label><select data-line="' + i + '" data-k="taxCode"><option value="">--</option>' +
        opts(cfg.taxCodes, ln.taxCode) + '</select>' +
        (!taxable && ln.taxCode ? '<div class="small" style="color:var(--warn)">この勘定は税カテゴリ未設定</div>' : '') +
        '<label class="small" style="display:flex;gap:.3rem;align-items:center;margin-top:.25rem">' +
        '<input type="checkbox" data-line="' + i + '" data-k="taxIncl" style="width:auto"' + (ln.taxIncl ? ' checked' : '') + '> 税込金額として入力</label></div>' +
      '</div>' +
      (fsHtml ? '<div style="margin-top:.6rem"><div class="small muted">入力項目（転記キー × 勘定 FSG の合成結果）</div><div class="fs-grid">' + fsHtml + '</div></div>' : '') +
      (supList.length ? '<div class="small muted" style="margin-top:.4rem">抑止された項目：' + esc(supList.join(' / ')) + '</div>' : '') +
      '</div>';
  }

  function renderResult() {
    var r = lab.result;
    if (!r) return '';
    var out = '';

    if (lab.missionMsg) {
      out += '<div class="msg ' + (lab.missionMsg.pass ? 'ok' : 'warn') + '"><b>ミッション判定：</b>' + esc(lab.missionMsg.text) + '</div>';
    }

    if (!r.ok) {
      out += r.errors.map(function (e) {
        return '<div class="msg err"><b class="mono">' + esc(e.code) + '</b> ' + esc(e.msg) +
          (e.hint ? '<span class="hint">💡 ' + esc(e.hint) + '</span>' : '') + '</div>';
      }).join('');
    } else {
      out += '<div class="msg ok"><b>転記されました。</b> 伝票番号 <span class="mono">' + esc(r.belnr) + '</span></div>';
    }
    (r.warnings || []).forEach(function (w) { out += '<div class="msg warn">' + esc(w) + '</div>'; });

    if (r.ok) {
      out += '<h3 style="margin-top:1rem">BKPF（ヘッダ）</h3><div class="tblwrap"><table><tr>' +
        Object.keys(r.bkpf).map(function (k) { return '<th>' + k + '</th>'; }).join('') + '</tr><tr>' +
        Object.keys(r.bkpf).map(function (k) { return '<td class="mono">' + esc(r.bkpf[k]) + '</td>'; }).join('') + '</tr></table></div>';

      var cols = ['BUZEI', 'BSCHL', 'KOART', 'HKONT', 'LIFNR', 'KUNNR', 'SHKZG', 'WRBTR', 'MWSKZ', 'KOSTL', 'PRCTR', 'SGTXT', 'AUTO'];
      out += '<h3 style="margin-top:1rem">BSEG（明細）</h3><div class="tblwrap"><table><tr>' +
        cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr>' +
        r.bseg.map(function (b) {
          return '<tr' + (b.AUTO ? ' class="auto"' : '') + '>' + cols.map(function (c) {
            return '<td class="mono' + (c === 'WRBTR' ? ' num' : '') + '">' + esc(b[c]) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</table></div>';

      var ac = ['RLDNR', 'RBUKRS', 'GJAHR', 'BELNR', 'DOCLN', 'RACCT', 'DRCRK', 'HSL', 'RCNTR', 'PRCTR'];
      out += '<h3 style="margin-top:1rem">ACDOCA（Universal Journal）</h3><div class="tblwrap"><table><tr>' +
        ac.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr>' +
        r.acdoca.map(function (a) {
          return '<tr>' + ac.map(function (c) { return '<td class="mono' + (c === 'HSL' ? ' num' : '') + '">' + esc(a[c]) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</table></div>';
    }

    if (r.trace && r.trace.length) {
      out += '<h3 style="margin-top:1rem">なぜこの挙動になったか（設定トレース）</h3>' +
        '<ol class="trace">' + r.trace.map(function (t) {
          return '<li><span class="t-set">' + esc(t.setting) + '</span><span class="t-tcode">' + esc(t.tcode) + '</span><br>' +
            '<span class="muted">' + esc(t.effect) + '</span></li>';
        }).join('') + '</ol>';
    }
    return '<div class="card">' + out + '</div>';
  }

  function renderLab() {
    var h = lab.header;
    var m = lab.missionId ? MISSIONS.filter(function (x) { return x.id === lab.missionId; })[0] : null;

    var missionBar = m ? '<div class="card" style="border-color:var(--accent)">' +
      '<div class="small muted">挑戦中のミッション</div><h3>' + esc(m.id + ' ' + m.title) + '</h3>' +
      '<p class="small">' + esc(m.brief) + '</p>' +
      '<details><summary>ヒント</summary><p class="small muted">' + esc(m.hint) + '</p></details>' +
      '<button class="btn ghost sm" data-act="mission-clear" style="margin-top:.4rem">解除</button></div>' : '';

    return missionBar +
      '<div class="card"><h2>伝票ヘッダ</h2><div class="grid g3">' +
      '<div><label class="f">伝票タイプ</label><select data-h="docType">' + opts(cfg.docTypes, h.docType) + '</select>' +
        '<div class="small muted">' + esc(cfg.docTypes[h.docType] ? cfg.docTypes[h.docType].hint : '') + '</div></div>' +
      '<div><label class="f">転記日付</label><input type="date" data-h="postingDate" value="' + esc(h.postingDate) + '"></div>' +
      '<div><label class="f">伝票日付</label><input type="date" data-h="docDate" value="' + esc(h.docDate) + '"></div>' +
      '<div><label class="f">参照番号' + (cfg.docTypes[h.docType] && cfg.docTypes[h.docType].refRequired ? ' <span class="tag req">必須</span>' : '') +
        '</label><input data-h="reference" value="' + esc(h.reference) + '"></div>' +
      '<div><label class="f">ヘッダテキスト</label><input data-h="headerText" value="' + esc(h.headerText) + '"></div>' +
      '<div><label class="f">通貨</label><input data-h="currency" value="' + esc(h.currency) + '"></div>' +
      '</div></div>' +
      '<div class="card"><h2>明細</h2>' + lab.lines.map(renderLine).join('') +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem">' +
      '<button class="btn ghost sm" data-act="add-line">明細を追加</button>' +
      '<button class="btn" data-act="post">転記する</button>' +
      '<button class="btn ghost sm" data-act="load-preset" data-preset="ap">例：仕入先請求</button>' +
      '<button class="btn ghost sm" data-act="load-preset" data-preset="ar">例：得意先請求</button>' +
      '</div></div>' + renderResult();
  }

  /* =========================================================
     IMG（設定）
     ========================================================= */
  function renderIMG() {
    var out = '<div class="card"><h2>IMG（設定）</h2>' +
      '<p class="small muted">ここを変えると、転記ラボの挙動とフォームがその場で変わります。実機のサンドボックスでは検証できない「設定 → 挙動」の因果を、ここで確認してください。</p>' +
      '<button class="btn ghost sm" data-act="reset-cfg">設定を初期値に戻す</button></div>';

    /* 期間 */
    var pc = cfg.periodControl;
    out += '<div class="card"><h3>会計期間管理 <span class="t-tcode mono">OB52</span></h3><div class="grid g3">' +
      '<div><label class="f">会計年度</label><input data-cfg="periodControl.fiscalYear" value="' + pc.fiscalYear + '"></div>' +
      '<div><label class="f">オープン開始期間</label><input data-cfg="periodControl.openFrom" value="' + pc.openFrom + '"></div>' +
      '<div><label class="f">オープン終了期間</label><input data-cfg="periodControl.openTo" value="' + pc.openTo + '"></div>' +
      '</div></div>';

    /* 伝票タイプ */
    out += '<div class="card"><h3>伝票タイプ <span class="t-tcode mono">OBA7</span></h3><div class="tblwrap"><table>' +
      '<tr><th>タイプ</th><th>名称</th><th>番号範囲</th><th>許可勘定タイプ</th><th>参照番号必須</th></tr>' +
      Object.keys(cfg.docTypes).map(function (k) {
        var d = cfg.docTypes[k];
        return '<tr><td class="mono">' + k + '</td><td>' + esc(d.text) + '</td><td class="mono">' + esc(d.range) + '</td>' +
          '<td>' + ['S', 'D', 'K', 'A'].map(function (t) {
            return '<label class="small" style="margin-right:.5rem"><input type="checkbox" style="width:auto" data-dt="' + k + '" data-at="' + t + '"' +
              (d.accountTypes.indexOf(t) >= 0 ? ' checked' : '') + '> ' + t + '</label>';
          }).join('') + '</td>' +
          '<td><input type="checkbox" style="width:auto" data-dt="' + k + '" data-ref="1"' + (d.refRequired ? ' checked' : '') + '></td></tr>';
      }).join('') + '</table></div>' +
      '<p class="small muted">勘定タイプ：S=総勘定元帳／D=得意先／K=仕入先／A=資産</p></div>';

    /* 項目ステータス */
    var fields = Object.keys(cfg.fieldLabels);
    function fsTable(title, tcode, src, attr) {
      return '<div class="card"><h3>' + title + ' <span class="t-tcode mono">' + tcode + '</span></h3><div class="tblwrap"><table>' +
        '<tr><th>キー</th>' + fields.map(function (f) { return '<th>' + esc(cfg.fieldLabels[f]) + '</th>'; }).join('') + '</tr>' +
        Object.keys(src).map(function (k) {
          return '<tr><td class="mono">' + k + '<br><span class="small muted">' + esc(src[k].text) + '</span></td>' +
            fields.map(function (f) {
              var v = src[k].fs[f] || 'opt';
              return '<td><select data-' + attr + '="' + k + '" data-f="' + f + '" style="min-width:74px">' +
                ['req', 'opt', 'sup'].map(function (o) {
                  return '<option value="' + o + '"' + (o === v ? ' selected' : '') + '>' + ENGINE.FS_LABEL[o] + '</option>';
                }).join('') + '</select></td>';
            }).join('') + '</tr>';
        }).join('') + '</table></div></div>';
    }
    out += fsTable('転記キーの項目ステータス', 'OB41', cfg.postingKeys, 'pkfs');
    out += fsTable('項目ステータスグループ', 'OBC4', cfg.fieldStatusGroups, 'fsg');

    /* G/L 勘定 */
    out += '<div class="card"><h3>G/L 勘定マスタ <span class="t-tcode mono">FS00</span></h3><div class="tblwrap"><table>' +
      '<tr><th>勘定</th><th>名称</th><th>FSG</th><th>税カテゴリ</th><th>自動転記のみ</th><th>調整勘定</th></tr>' +
      Object.keys(cfg.glAccounts).map(function (k) {
        var g = cfg.glAccounts[k];
        return '<tr><td class="mono">' + k + '</td><td>' + esc(g.text) + '</td>' +
          '<td><select data-gl="' + k + '" data-p="fsg" style="min-width:80px">' +
            Object.keys(cfg.fieldStatusGroups).map(function (f) {
              return '<option value="' + f + '"' + (f === g.fsg ? ' selected' : '') + '>' + f + '</option>';
            }).join('') + '</select></td>' +
          '<td><select data-gl="' + k + '" data-p="taxCat" style="min-width:60px">' +
            ['', '+', '-'].map(function (t) { return '<option value="' + t + '"' + (t === g.taxCat ? ' selected' : '') + '>' + (t || '--') + '</option>'; }).join('') +
            '</select></td>' +
          '<td><input type="checkbox" style="width:auto" data-gl="' + k + '" data-p="autoOnly"' + (g.autoOnly ? ' checked' : '') + '></td>' +
          '<td class="mono">' + esc(g.recon || '') + '</td></tr>';
      }).join('') + '</table></div></div>';

    /* 税コード */
    out += '<div class="card"><h3>税コード <span class="t-tcode mono">FTXP / OB40</span></h3><div class="tblwrap"><table>' +
      '<tr><th>コード</th><th>名称</th><th>税率(%)</th><th>方向</th><th>自動転記勘定</th></tr>' +
      Object.keys(cfg.taxCodes).map(function (k) {
        var t = cfg.taxCodes[k];
        return '<tr><td class="mono">' + k + '</td><td>' + esc(t.text) + '</td>' +
          '<td><input data-tax="' + k + '" data-p="rate" value="' + t.rate + '" style="width:70px"></td>' +
          '<td>' + (t.dir === 'input' ? '仕入' : '売上') + '</td><td class="mono">' + esc(t.account || '') + '</td></tr>';
      }).join('') + '</table></div></div>';

    return out;
  }

  /* =========================================================
     ドリル
     ========================================================= */
  var quiz = { queue: [], idx: 0, answered: null, mode: 'due' };

  function startQuiz(mode) {
    quiz.mode = mode;
    var scoped = S.inScope(DRILLS);
    quiz.queue = (mode === 'all' ? scoped.slice() : S.dueDrills(scoped)).sort(function () { return Math.random() - 0.5; });
    quiz.idx = 0; quiz.answered = null;
  }

  function renderDrill() {
    if (!quiz.queue.length && quiz.idx === 0) {
      var scoped = S.inScope(DRILLS);
      var due = S.dueDrills(scoped).length;
      return '<div class="card"><h2>ドリル</h2>' +
        '<p class="small muted">間隔反復で出題します。正解すると次の出題が先送りされ、間違えると翌日また出ます。</p>' +
        '<p>復習期限：<b>' + due + ' 問</b>／出題範囲 ' + scoped.length + ' 問（W1〜W' + S.state().week + '）' +
        (DRILLS.length > scoped.length ? '　<span class="muted">／ 未開放 ' + (DRILLS.length - scoped.length) + ' 問</span>' : '') + '</p>' +
        '<button class="btn" data-act="quiz-start" data-mode="due"' + (due ? '' : ' disabled') + '>期限の問題を解く</button> ' +
        '<button class="btn ghost" data-act="quiz-start" data-mode="all">範囲内から全問解く</button></div>';
    }
    if (quiz.idx >= quiz.queue.length) {
      return '<div class="card"><h2>お疲れさまでした</h2><p>' + quiz.queue.length + ' 問を解きました。</p>' +
        '<button class="btn" data-act="quiz-reset">戻る</button></div>';
    }
    var q = quiz.queue[quiz.idx];
    var out = '<div class="card"><div class="small muted">' + (quiz.idx + 1) + ' / ' + quiz.queue.length +
      '　W' + q.week + '　' + esc(S.DOMAINS[q.domain] || q.domain) + '　<span class="mono">' + q.id + '</span></div>' +
      '<h2 style="margin-top:.4rem">' + esc(q.q) + '</h2>';

    if (q.type === 'mc') {
      out += q.choices.map(function (c, i) {
        var cls = '';
        if (quiz.answered != null) {
          if (i === q.a) cls = ' right';
          else if (i === quiz.answered) cls = ' wrong';
        }
        return '<button class="quiz-choice' + cls + '" data-act="quiz-answer" data-i="' + i + '"' +
          (quiz.answered != null ? ' disabled' : '') + '>' + esc(c) + '</button>';
      }).join('');
    } else {
      out += '<p class="small muted">自分の言葉で答えてから「解説を見る」を押し、自己採点してください。</p>' +
        '<textarea rows="5" id="openAns" placeholder="ここに書いてから解説を開く"></textarea>' +
        (quiz.answered == null ? '<div style="margin-top:.5rem"><button class="btn" data-act="quiz-reveal">解説を見る</button></div>' : '');
    }

    if (quiz.answered != null) {
      out += '<div class="msg ' + (quiz.answered === q.a || q.type === 'open' ? 'ok' : 'err') + '" style="margin-top:.8rem">' +
        '<b>解説</b><br>' + esc(q.ex) + '</div>';
      if (q.type === 'open') {
        out += '<div style="display:flex;gap:.5rem"><button class="btn" data-act="quiz-self" data-ok="1">言えた</button>' +
          '<button class="btn ghost" data-act="quiz-self" data-ok="0">言えなかった</button></div>';
      } else {
        out += '<button class="btn" data-act="quiz-next">次へ</button>';
      }
    }
    return out + '</div>';
  }

  /* =========================================================
     ミッション一覧
     ========================================================= */
  function missionCard(m, st, dim) {
    var done = st.missions[m.id] && st.missions[m.id].done;
    return '<div class="mission' + (done ? ' done' : '') + '"' + (dim ? ' style="opacity:.55"' : '') + '>' +
      '<div class="small muted">W' + m.week + '　' + esc(S.DOMAINS[m.domain] || '') + '　' + m.xp + ' XP' +
      (m.flag === 'core' ? ' <span class="tag core">核心課題</span>' : '') +
      (done ? ' <span class="tag ok">達成済</span>' : '') + '</div>' +
      '<h3>' + esc(m.id + ' ' + m.title) + '</h3>' +
      '<p class="small">' + esc(m.brief) + '</p>' +
      (done ? '<details><summary>この課題で学んだこと</summary><p class="small muted">' + esc(m.lesson) + '</p></details>' : '') +
      '<button class="btn sm" data-act="mission-take" data-id="' + m.id + '">転記ラボで挑戦</button>' +
      '</div>';
  }

  function renderMissions() {
    var st = S.state();
    var byWeek = {};
    MISSIONS.forEach(function (m) { (byWeek[m.week] = byWeek[m.week] || []).push(m); });
    var weeks = Object.keys(byWeek).map(Number).sort(function (a, b) { return a - b; });

    var out = '<div class="card"><h2>ミッション</h2>' +
      '<p class="small">課題を選ぶと転記ラボに設定され、転記のたびに達成判定されます。</p>' +
      '<p class="small muted"><b>ID は作成順であって学習順ではありません。</b>' +
      'カリキュラム上の週で並べています。まず「今週」の課題から進めてください。</p></div>';

    var now = weeks.filter(function (w) { return w === st.week; });
    var past = weeks.filter(function (w) { return w < st.week; });
    var future = weeks.filter(function (w) { return w > st.week; });

    function section(title, ws, dim, note) {
      if (!ws.length) return '';
      return '<h2 style="margin:1.2rem 0 .5rem">' + title + '</h2>' +
        (note ? '<p class="small muted">' + note + '</p>' : '') +
        ws.map(function (w) {
          var wk = SEED.weeks.filter(function (x) { return x.w === w; })[0];
          return '<div class="small muted" style="margin:.6rem 0 .3rem">W' + w + '　' + esc(wk ? wk.t : '') + '</div>' +
            byWeek[w].map(function (m) { return missionCard(m, st, dim); }).join('');
        }).join('');
    }

    out += section('今週の課題', now, false, '');
    if (!now.length) {
      out += '<div class="card"><p class="small">W' + st.week + ' にラボ課題はありません。' +
        'この週は実機ハンズオンと講義が中心です（<span class="mono">hands-on/</span> を参照）。</p></div>';
    }
    out += section('復習できる課題（学習済みの週）', past, false, '');
    out += section('この先の課題', future, true,
      'まだ学んでいない論点です。先に解いても構いませんが、解説の意味が取りづらいはずです。');
    return out;
  }

  /* =========================================================
     レンダリング & イベント
     ========================================================= */
  function render() {
    var st = S.state();
    document.getElementById('hud').innerHTML =
      '<span class="chip">Lv <b>' + S.level() + '</b></span>' +
      '<span class="chip">XP <b>' + st.xp + '</b></span>' +
      '<span class="chip">🔥 <b>' + st.streak.count + '</b></span>';
    Array.prototype.forEach.call(document.querySelectorAll('nav button'), function (b) {
      b.classList.toggle('active', b.dataset.nav === view);
    });
    var v = document.getElementById('view');
    v.innerHTML = view === 'home' ? renderHome()
      : view === 'lab' ? renderLab()
      : view === 'img' ? renderIMG()
      : view === 'drill' ? renderDrill()
      : renderMissions();
    window.scrollTo({ top: 0 });
  }

  function num(v, d) { var n = parseInt(v, 10); return isNaN(n) ? d : n; }

  function doPost() {
    var lines = lab.lines.map(function (l) {
      return { pk: l.pk, account: l.account, partner: l.partner, amount: Number(l.amount) || 0,
               taxCode: l.taxCode, taxIncl: !!l.taxIncl, fields: l.fields || {} };
    });
    var r = ENGINE.post(cfg, JSON.parse(JSON.stringify(lab.header)), lines);
    lab.result = r;
    lab.missionMsg = null;

    if (r.ok) {
      persistCfg();
      S.recordDoc({ belnr: r.belnr, at: new Date().toISOString(), type: lab.header.docType });
      if (!S.state().docs.some(function (d) { return d.belnr !== r.belnr; }) || true) S.addXP(5, '転記成功');
    }

    if (lab.missionId) {
      var m = MISSIONS.filter(function (x) { return x.id === lab.missionId; })[0];
      var res = m.check({ result: r, cfg: cfg, header: lab.header, lines: lines });
      if (res.pass) {
        var first = S.completeMission(m.id, m.xp);
        lab.missionMsg = { pass: true, text: '達成！ ' + (first ? '+' + m.xp + ' XP　' : '（達成済み）') + m.lesson };
        if (first) flash('ミッション達成 +' + m.xp + ' XP');
      } else {
        lab.missionMsg = { pass: false, text: res.msg };
      }
    }
    render();
  }

  function preset(kind) {
    if (kind === 'ap') {
      lab.header = { docType: 'KR', postingDate: S.today(), docDate: S.today(), currency: 'JPY', reference: 'INV-0001', headerText: '' };
      lab.lines = [
        { pk: '31', account: '', partner: 'V-1001', amount: '11000', taxCode: '', taxIncl: false, fields: { text: '部材仕入', paymentTerms: 'N030' } },
        { pk: '40', account: '500000', partner: '', amount: '10000', taxCode: 'V1', taxIncl: false, fields: { text: '部材仕入' } }
      ];
    } else {
      lab.header = { docType: 'DR', postingDate: S.today(), docDate: S.today(), currency: 'JPY', reference: 'SO-0001', headerText: '' };
      lab.lines = [
        { pk: '01', account: '', partner: 'C-2001', amount: '11000', taxCode: '', taxIncl: false, fields: { text: '製品売上', paymentTerms: 'N030' } },
        { pk: '50', account: '400000', partner: '', amount: '10000', taxCode: 'A1', taxIncl: false, fields: { text: '製品売上', profitCenter: 'PC1000' } }
      ];
    }
    lab.result = null;
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-nav],[data-act]');
    if (!t) return;
    if (t.dataset.nav) { e.preventDefault(); view = t.dataset.nav; render(); return; }
    var a = t.dataset.act;

    if (a === 'add-line') { lab.lines.push({ pk: '40', account: '', partner: '', amount: '', taxCode: '', taxIncl: false, fields: {} }); render(); }
    else if (a === 'del-line') { lab.lines.splice(+t.dataset.line, 1); render(); }
    else if (a === 'post') { doPost(); }
    else if (a === 'load-preset') { preset(t.dataset.preset); render(); }
    else if (a === 'reset-cfg') { if (confirm('設定を初期値に戻します。よろしいですか？')) { resetCfg(); flash('設定を初期化しました'); render(); } }
    else if (a === 'save-state') { saveFile('state.json', S.exportState()); }
    else if (a === 'save-log') { saveFile('study-log-' + S.today() + '.md', exportText()); }
    else if (a === 'copy-state') {
      var ta = document.getElementById('stateOut');
      ta.select();
      var done = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(function () { flash('コピーしました'); }, function () {});
        done = true;
      }
      if (!done) { try { document.execCommand('copy'); flash('コピーしました'); } catch (e) { flash('全選択しました。手動でコピーしてください'); } }
    }
    else if (a === 'import-state') {
      var src = document.getElementById('stateIn').value;
      var r = S.importState(src);
      lastImportMsg = r.msg; lastImportOk = r.ok;
      if (r.ok) { loadCfg(); flash('復元しました'); }
      render();
    }
    else if (a === 'reset-all') { if (confirm('進捗（XP・ミッション・ドリル成績・設定）をすべて消去します。よろしいですか？')) { S.reset(); loadCfg(); flash('リセットしました'); render(); } }
    else if (a === 'mission-take') { lab.missionId = t.dataset.id; lab.result = null; lab.missionMsg = null; view = 'lab'; render(); }
    else if (a === 'mission-clear') { lab.missionId = null; lab.missionMsg = null; render(); }
    else if (a === 'quiz-start') { startQuiz(t.dataset.mode); render(); }
    else if (a === 'quiz-reset') { quiz = { queue: [], idx: 0, answered: null, mode: 'due' }; render(); }
    else if (a === 'quiz-answer') {
      var q = quiz.queue[quiz.idx];
      quiz.answered = +t.dataset.i;
      var ok = quiz.answered === q.a;
      S.gradeDrill(q.id, ok);
      S.addXP(ok ? 5 : 1, 'ドリル ' + q.id);
      render();
    }
    else if (a === 'quiz-reveal') { quiz.answered = -1; render(); }
    else if (a === 'quiz-self') {
      var q2 = quiz.queue[quiz.idx];
      var ok2 = t.dataset.ok === '1';
      S.gradeDrill(q2.id, ok2);
      S.addXP(ok2 ? 8 : 2, 'ドリル ' + q2.id);
      quiz.idx++; quiz.answered = null; render();
    }
    else if (a === 'quiz-next') { quiz.idx++; quiz.answered = null; render(); }
  });

  /* 入力：select / checkbox は再描画、text は状態更新のみ */
  function readControl(el) {
    var d = el.dataset;
    if (d.h) { lab.header[d.h] = el.value; return false; }
    if (d.line != null && d.k) {
      var ln = lab.lines[+d.line];
      ln[d.k] = (el.type === 'checkbox') ? el.checked : el.value;
      if (d.k === 'pk') { ln.account = ''; ln.partner = ''; }
      return d.k !== 'amount';
    }
    if (d.line != null && d.field) {
      lab.lines[+d.line].fields[d.field] = el.value;
      return false;
    }
    if (d.mastery) { S.setMastery(d.mastery, +el.value); return true; }
    if (d.week) { S.setWeek(+el.value); return true; }
    if (d.cfg) {
      var path = d.cfg.split('.');
      cfg[path[0]][path[1]] = num(el.value, cfg[path[0]][path[1]]);
      persistCfg(); return false;
    }
    if (d.dt) {
      var dt = cfg.docTypes[d.dt];
      if (d.at) {
        var i = dt.accountTypes.indexOf(d.at);
        if (el.checked && i < 0) dt.accountTypes.push(d.at);
        if (!el.checked && i >= 0) dt.accountTypes.splice(i, 1);
      } else if (d.ref) dt.refRequired = el.checked;
      persistCfg(); return false;
    }
    if (d.pkfs) { cfg.postingKeys[d.pkfs].fs[d.f] = el.value; persistCfg(); return false; }
    if (d.fsg) { cfg.fieldStatusGroups[d.fsg].fs[d.f] = el.value; persistCfg(); return false; }
    if (d.gl) {
      var g = cfg.glAccounts[d.gl];
      g[d.p] = (el.type === 'checkbox') ? el.checked : el.value;
      persistCfg(); return false;
    }
    if (d.tax) { cfg.taxCodes[d.tax].rate = num(el.value, cfg.taxCodes[d.tax].rate); persistCfg(); return false; }
    return false;
  }

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el.dataset) return;
    var needRender = readControl(el);
    if (el.tagName === 'SELECT' || el.type === 'checkbox' || needRender) render();
  });
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.dataset && (el.dataset.line != null || el.dataset.h)) {
      readControl(el);
    }
  });

  /* 起動 */
  loadCfg();
  S.touchStreak();
  render();
})();
