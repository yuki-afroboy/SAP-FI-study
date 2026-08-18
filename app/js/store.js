/* =========================================================
   進捗ストア：XP・レベル・連続学習日数・間隔反復・設定の永続化
   すべて localStorage。エクスポートしてリポジトリに残せる。
   ========================================================= */
(function (root) {
  'use strict';
  var KEY = 'sapfi.v1';

  var DOMAINS = {
    'A-1': 'GL・組織構造・伝票制御',
    'A-2': 'AP/AR と購買・販売連携',
    'A-3': '月次・年次決算プロセス',
    'A-4': 'AA固定資産・銀行・日本固有',
    'B-1': '不具合調査・テーブル読解',
    'B-2': 'Fit&Gap 設計判断'
  };

  var LEVELS = [0, 100, 250, 480, 800, 1250, 1850, 2600, 3550, 4700, 6100];

  function today() { return new Date().toISOString().slice(0, 10); }
  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function blank() {
    return {
      week: 1,
      xp: 0,
      streak: { last: '', count: 0, best: 0 },
      missions: {},
      drills: {},
      mastery: { 'A-1': 0, 'A-2': 0, 'A-3': 0, 'A-4': 0, 'B-1': 0, 'B-2': 0 },
      cfg: null,
      docs: [],
      log: []
    };
  }

  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      var o = JSON.parse(raw);
      var b = blank();
      Object.keys(b).forEach(function (k) { if (!(k in o)) o[k] = b[k]; });
      return o;
    } catch (e) { return blank(); }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function touchStreak() {
    var t = today();
    if (state.streak.last === t) return false;
    if (state.streak.last === addDays(t, -1)) state.streak.count += 1;
    else state.streak.count = 1;
    state.streak.last = t;
    if (state.streak.count > state.streak.best) state.streak.best = state.streak.count;
    save();
    return true;
  }

  function addXP(n, why) {
    state.xp += n;
    state.log.unshift({ at: new Date().toISOString(), xp: n, why: why });
    state.log = state.log.slice(0, 200);
    touchStreak();
    save();
    return n;
  }

  function level() {
    var lv = 1;
    for (var i = 0; i < LEVELS.length; i++) if (state.xp >= LEVELS[i]) lv = i + 1;
    return lv;
  }
  function levelProgress() {
    var lv = level();
    var cur = LEVELS[lv - 1] || 0;
    var next = LEVELS[lv] != null ? LEVELS[lv] : cur;
    if (next === cur) return { cur: cur, next: next, pct: 100 };
    return { cur: cur, next: next, pct: Math.round((state.xp - cur) / (next - cur) * 100) };
  }

  /* ---------- 間隔反復（SM-2 簡略版） ---------- */
  function drillCard(id) {
    if (!state.drills[id]) {
      state.drills[id] = { ease: 2.3, interval: 0, due: today(), reps: 0, ok: 0, ng: 0 };
    }
    return state.drills[id];
  }
  function dueDrills(all) {
    var t = today();
    return all.filter(function (q) { return drillCard(q.id).due <= t; });
  }
  function gradeDrill(id, correct) {
    var c = drillCard(id);
    c.reps += 1;
    if (correct) {
      c.ok += 1;
      c.ease = Math.min(2.8, c.ease + 0.1);
      c.interval = c.interval === 0 ? 1 : (c.interval === 1 ? 3 : Math.round(c.interval * c.ease));
    } else {
      c.ng += 1;
      c.ease = Math.max(1.3, c.ease - 0.25);
      c.interval = 0;
    }
    c.due = addDays(today(), c.interval);
    save();
    return c;
  }

  function completeMission(id, xp) {
    if (state.missions[id] && state.missions[id].done) return false;
    state.missions[id] = { done: true, at: new Date().toISOString() };
    addXP(xp, 'ミッション ' + id + ' 達成');
    return true;
  }

  function setMastery(k, v) { state.mastery[k] = v; save(); }
  function setWeek(n) { state.week = Math.max(1, Math.min(12, n)); save(); }
  /* 学習済みの週までを出題範囲とする。未学習の論点を先に出さない。 */
  function inScope(items) {
    return items.filter(function (x) { return (x.week || 1) <= state.week; });
  }
  function recordDoc(d) { state.docs.unshift(d); state.docs = state.docs.slice(0, 50); save(); }
  function saveCfg(cfg) { state.cfg = cfg; save(); }
  function reset() { state = blank(); save(); }

  root.STORE = {
    state: function () { return state; },
    save: save, addXP: addXP, level: level, levelProgress: levelProgress,
    touchStreak: touchStreak, drillCard: drillCard, dueDrills: dueDrills,
    gradeDrill: gradeDrill, completeMission: completeMission,
    setMastery: setMastery, setWeek: setWeek, inScope: inScope,
    recordDoc: recordDoc, saveCfg: saveCfg, reset: reset,
    today: today, DOMAINS: DOMAINS, LEVELS: LEVELS
  };
})(typeof window !== 'undefined' ? window : globalThis);
