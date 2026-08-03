/* ==========================================================================
   HomeHero — daily task app for house helpers
   Vanilla JS, localStorage persistence, no backend required.
   ========================================================================== */

(function () {
  "use strict";

  /* ---------------- Constants ---------------- */

  var PERIODS = [
    { id: "morning",   label: "Morning",   emoji: "🌅", startHour: 6,  endHour: 11, reminderMin: 7 * 60 },
    { id: "noon",      label: "Noon",      emoji: "☀️", startHour: 11, endHour: 14, reminderMin: 11 * 60 + 30 },
    { id: "afternoon", label: "Afternoon", emoji: "🌤️", startHour: 14, endHour: 18, reminderMin: 14 * 60 + 30 },
    { id: "night",     label: "Night",     emoji: "🌙", startHour: 18, endHour: 24, reminderMin: 18 * 60 + 30 }
  ];

  var DEFAULT_TASKS = [
    { id: "t1", emoji: "🛏️", title: "Make the beds",        period: "morning" },
    { id: "t2", emoji: "👕", title: "Wash clothes",          period: "morning" },
    { id: "t3", emoji: "🍳", title: "Prepare breakfast",     period: "morning" },
    { id: "t4", emoji: "🍽️", title: "Wash the dishes",      period: "noon" },
    { id: "t5", emoji: "🧹", title: "Sweep the floor",       period: "noon" },
    { id: "t6", emoji: "🧽", title: "Mop the floor",         period: "afternoon" },
    { id: "t7", emoji: "🚽", title: "Clean the toilet",      period: "afternoon" },
    { id: "t8", emoji: "👔", title: "Iron & fold clothes",   period: "afternoon" },
    { id: "t9", emoji: "🍲", title: "Prepare dinner",        period: "night" },
    { id: "t10", emoji: "🗑️", title: "Throw the rubbish",   period: "night" }
  ];

  var EMOJI_CHOICES = ["🧺", "👕", "🧹", "🧽", "🚽", "🍳", "🍲", "🍽️", "🛏️", "🪟", "🌱", "🐕", "🛒", "🗑️", "👔", "🧸", "🚗", "🐟"];

  var ENCOURAGEMENTS = [
    "Let's start! You can do it! 💪",
    "Good job! Keep going! 👍",
    "Wow, so fast! ⚡",
    "Almost there! 🌟",
    "You are a star! ⭐"
  ];

  var STORE = {
    tasks: "hh_tasks_v1",
    log: "hh_log_v1",
    streak: "hh_streak_v1",
    notify: "hh_notify_v1"
  };

  /* ---------------- State ---------------- */

  var tasks = load(STORE.tasks, DEFAULT_TASKS);
  var log = load(STORE.log, {});          // { "2026-08-03": { taskId: {status, reason, remark, at} } }
  var streakInfo = load(STORE.streak, { count: 0, lastDate: null });
  var remindersOn = load(STORE.notify, false);

  var sheetTaskId = null;
  var sheetReason = null;
  var celebrated = false;
  var addEmoji = EMOJI_CHOICES[0];
  var addPeriod = "morning";

  /* ---------------- Storage helpers ---------------- */

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full/blocked */ }
  }

  function todayKey(offsetDays) {
    var d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function todayLog() {
    var key = todayKey();
    if (!log[key]) log[key] = {};
    return log[key];
  }

  function entryFor(taskId) {
    return todayLog()[taskId] || null;
  }

  /* ---------------- Derived state ---------------- */

  function counts() {
    var done = 0, skipped = 0;
    var tl = todayLog();
    tasks.forEach(function (t) {
      var e = tl[t.id];
      if (e && e.status === "done") done++;
      else if (e && e.status === "skipped") skipped++;
    });
    return { done: done, skipped: skipped, total: tasks.length };
  }

  function allActioned(c) {
    return c.total > 0 && c.done + c.skipped === c.total;
  }

  function currentPeriodId() {
    var h = new Date().getHours();
    for (var i = 0; i < PERIODS.length; i++) {
      if (h >= PERIODS[i].startHour && h < PERIODS[i].endHour) return PERIODS[i].id;
    }
    return null; // before 6am
  }

  /* ---------------- Rendering ---------------- */

  var $ = function (id) { return document.getElementById(id); };

  function render() {
    renderGreeting();
    renderHero();
    renderTimeline();
  }

  function renderGreeting() {
    var h = new Date().getHours();
    var g = h < 12 ? "Good morning! 🌅" : h < 18 ? "Good afternoon! ☀️" : "Good evening! 🌙";
    $("greeting-text").textContent = g;
    $("date-text").textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long"
    });
  }

  function renderHero() {
    var c = counts();
    var circumference = 326.7;
    var ratio = c.total ? c.done / c.total : 0;

    $("ring-fill").style.strokeDashoffset = String(circumference * (1 - ratio));
    $("ring-count").textContent = c.done + "/" + c.total;
    $("stat-stars").textContent = "⭐ " + c.done;
    $("stat-streak").textContent = "🔥 " + streakInfo.count;

    var msgIndex = Math.min(
      Math.floor(ratio * (ENCOURAGEMENTS.length - 1)),
      ENCOURAGEMENTS.length - 1
    );
    var msg = c.done === c.total && c.total > 0
      ? "All done! Fantastic! 🎉"
      : ENCOURAGEMENTS[msgIndex];
    $("hero-message").textContent = msg;

    $("hero-card").classList.toggle("all-done", c.done === c.total && c.total > 0);
  }

  function renderTimeline() {
    var container = $("timeline");
    container.innerHTML = "";
    var nowPeriod = currentPeriodId();

    PERIODS.forEach(function (p) {
      var periodTasks = tasks.filter(function (t) { return t.period === p.id; });

      var section = document.createElement("section");
      section.className = "period" + (p.id === nowPeriod ? " now" : "");
      section.id = "period-" + p.id;

      var head = document.createElement("div");
      head.className = "period-head";
      head.innerHTML =
        '<div class="period-dot">' + p.emoji + "</div>" +
        '<div class="period-title">' + p.label + "</div>" +
        (p.id === nowPeriod ? '<div class="now-badge">NOW</div>' : "");
      section.appendChild(head);

      if (periodTasks.length === 0) {
        var empty = document.createElement("div");
        empty.className = "period-empty";
        empty.textContent = "No tasks — free time! 😊";
        section.appendChild(empty);
      }

      periodTasks.forEach(function (t, i) {
        section.appendChild(taskCard(t, i));
      });

      container.appendChild(section);
    });
  }

  function taskCard(task, index) {
    var entry = entryFor(task.id);
    var status = entry ? entry.status : "pending";

    var card = document.createElement("div");
    card.className = "task-card " + (status === "done" ? "done" : status === "skipped" ? "skipped" : "");
    card.style.animationDelay = (index * 0.05) + "s";
    card.dataset.taskId = task.id;

    var statusText = status === "done"
      ? "Done at " + (entry.at || "") + " ✓"
      : status === "skipped"
        ? "Cannot do today"
        : "Not done yet";

    card.innerHTML =
      '<div class="task-main">' +
        '<div class="task-emoji">' + task.emoji + "</div>" +
        '<div class="task-info">' +
          '<div class="task-title">' + escapeHtml(task.title) + "</div>" +
          '<div class="task-status">' + statusText + "</div>" +
          (status === "skipped" && entry.reason
            ? '<div class="reason-chip">💬 ' + escapeHtml(entry.reason + (entry.remark ? " — " + entry.remark : "")) + "</div>"
            : "") +
        "</div>" +
      "</div>" +
      '<div class="task-actions">' +
        '<button class="tick-btn" aria-label="Mark done">' +
          '<svg viewBox="0 0 32 32"><path class="tick-path" d="M7 17 L13 23 L25 9"/></svg>' +
          '<span class="tick-label">' + (status === "done" ? "Done!" : "Done") + "</span>" +
        "</button>" +
        '<button class="cannot-btn">Cannot 😕</button>' +
      "</div>";

    card.querySelector(".tick-btn").addEventListener("click", function (ev) {
      toggleDone(task.id, ev);
    });
    card.querySelector(".cannot-btn").addEventListener("click", function () {
      openSheet(task.id);
    });

    return card;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------------- Actions ---------------- */

  function toggleDone(taskId, ev) {
    var tl = todayLog();
    var entry = tl[taskId];

    if (entry && entry.status === "done") {
      // Undo
      delete tl[taskId];
      save(STORE.log, log);
      render();
      return;
    }

    var now = new Date();
    tl[taskId] = {
      status: "done",
      at: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
    save(STORE.log, log);

    starBurst(ev);
    confettiBurst(ev, 18);
    vibrate(30);
    render();

    maybeCelebrate(550);
  }

  function maybeCelebrate(delay) {
    var c = counts();
    if (allActioned(c) && !celebrated) {
      celebrated = true;
      updateStreak();
      setTimeout(showCelebration, delay);
    }
  }

  function updateStreak() {
    var today = todayKey();
    if (streakInfo.lastDate === today) return;
    streakInfo.count = streakInfo.lastDate === todayKey(-1) ? streakInfo.count + 1 : 1;
    streakInfo.lastDate = today;
    save(STORE.streak, streakInfo);
  }

  /* ---------------- "Cannot do" sheet ---------------- */

  function openSheet(taskId) {
    sheetTaskId = taskId;
    sheetReason = null;
    var task = tasks.find(function (t) { return t.id === taskId; });
    $("sheet-task-title").textContent = task.emoji + " " + task.title;
    $("remark-input").value = "";
    $("sheet-save").disabled = true;
    document.querySelectorAll(".reason-btn").forEach(function (b) { b.classList.remove("selected"); });
    $("sheet-backdrop").hidden = false;
    $("remark-sheet").hidden = false;
  }

  function closeSheet() {
    $("sheet-backdrop").hidden = true;
    $("remark-sheet").hidden = true;
    sheetTaskId = null;
  }

  function saveSkip() {
    if (!sheetTaskId || !sheetReason) return;
    var tl = todayLog();
    tl[sheetTaskId] = {
      status: "skipped",
      reason: sheetReason,
      remark: $("remark-input").value.trim(),
      at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
    save(STORE.log, log);
    closeSheet();
    toast("Message saved. Thank you for telling! 🙏");
    render();
    maybeCelebrate(900);
  }

  /* ---------------- Celebration ---------------- */

  function showCelebration() {
    var c = counts();
    if (c.skipped === 0) {
      $("celebrate-title").textContent = "All tasks done!";
      $("celebrate-sub").textContent = "Amazing work today! 🌟";
    } else {
      $("celebrate-title").textContent = "Day complete!";
      $("celebrate-sub").textContent = c.done + " done ✓ · " + c.skipped + " reported 💬 Thank you for being honest!";
    }
    var stars = "";
    for (var i = 0; i < Math.min(c.done, 10); i++) stars += "⭐";
    $("celebrate-stars").textContent = stars;
    $("celebrate").hidden = false;
    confettiRain();
    vibrate([60, 40, 60]);
  }

  /* ---------------- Star + confetti effects ---------------- */

  function starBurst(ev) {
    if (!ev) return;
    var star = document.createElement("div");
    star.className = "star-float";
    star.textContent = "⭐ +1";
    star.style.left = ev.clientX - 20 + "px";
    star.style.top = ev.clientY - 20 + "px";
    document.body.appendChild(star);
    setTimeout(function () { star.remove(); }, 1000);
  }

  var canvas = $("confetti-canvas");
  var ctx = canvas.getContext("2d");
  var particles = [];
  var rafId = null;
  var COLORS = ["#ff3b30", "#ff9f0a", "#ffd60a", "#34c759", "#007aff", "#af52de"];

  function sizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function confettiBurst(ev, n) {
    sizeCanvas();
    var x = ev ? ev.clientX : canvas.width / 2;
    var y = ev ? ev.clientY : canvas.height / 3;
    for (var i = 0; i < n; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 9,
        vy: -Math.random() * 8 - 2,
        size: Math.random() * 6 + 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        life: 70
      });
    }
    if (!rafId) tick();
  }

  function confettiRain() {
    sizeCanvas();
    for (var i = 0; i < 120; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.5,
        vx: (Math.random() - 0.5) * 2,
        vy: Math.random() * 3 + 2,
        size: Math.random() * 7 + 4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.2,
        life: 220
      });
    }
    if (!rafId) tick();
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter(function (p) { return p.life > 0 && p.y < canvas.height + 30; });
    particles.forEach(function (p) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25;
      p.rot += p.vr;
      p.life--;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });
    if (particles.length) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  /* ---------------- Toast ---------------- */

  var toastTimer = null;

  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  /* ---------------- Reminders ---------------- */

  var firedReminders = {};

  function toggleReminders() {
    if (!("Notification" in window)) {
      toast("This phone cannot show reminders 😢");
      return;
    }
    if (remindersOn) {
      remindersOn = false;
      save(STORE.notify, false);
      toast("Reminders OFF 🔕");
      return;
    }
    Notification.requestPermission().then(function (perm) {
      if (perm === "granted") {
        remindersOn = true;
        save(STORE.notify, true);
        toast("Reminders ON 🔔 I will remind you!");
      } else {
        toast("Please allow notifications in phone settings");
      }
    });
  }

  function checkReminders() {
    if (!remindersOn || !("Notification" in window) || Notification.permission !== "granted") return;
    var now = new Date();
    var minutes = now.getHours() * 60 + now.getMinutes();
    var tl = todayLog();

    PERIODS.forEach(function (p) {
      var fireKey = todayKey() + "-" + p.id;
      if (firedReminders[fireKey]) return;
      if (minutes < p.reminderMin || minutes > p.reminderMin + 5) return;

      var pending = tasks.filter(function (t) {
        return t.period === p.id && !tl[t.id];
      });
      if (pending.length === 0) { firedReminders[fireKey] = true; return; }

      firedReminders[fireKey] = true;
      var first = pending[0];
      new Notification("HomeHero " + p.emoji + " " + p.label + " tasks", {
        body: pending.length + " task(s) to do — start with " + first.emoji + " " + first.title,
        tag: "homehero-" + p.id
      });
    });
  }

  /* ---------------- History (transparency) ---------------- */

  function renderHistory() {
    var body = $("history-body");
    body.innerHTML = "";

    for (var i = 0; i < 7; i++) {
      var key = todayKey(-i);
      var dayLog = log[key] || {};
      var done = 0, remarks = [];

      tasks.forEach(function (t) {
        var e = dayLog[t.id];
        if (e && e.status === "done") done++;
        if (e && e.status === "skipped") {
          remarks.push(t.emoji + " " + t.title + ": " + (e.reason || "") + (e.remark ? " — " + e.remark : ""));
        }
      });

      var total = tasks.length;
      var pct = total ? Math.round((done / total) * 100) : 0;
      var dateLabel = i === 0 ? "Today" : i === 1 ? "Yesterday"
        : new Date(key + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
      var scoreClass = pct === 100 ? "good" : pct > 0 ? "partial" : "none";
      var scoreEmoji = pct === 100 ? "🏆 " : "";

      var el = document.createElement("div");
      el.className = "history-day";
      el.innerHTML =
        '<div class="history-day-head">' +
          "<span>" + dateLabel + "</span>" +
          '<span class="history-score ' + scoreClass + '">' + scoreEmoji + done + "/" + total + "</span>" +
        "</div>" +
        '<div class="history-bar"><div class="history-bar-fill" style="width:' + pct + '%"></div></div>' +
        (remarks.length
          ? '<ul class="history-remarks">' + remarks.map(function (r) {
              return "<li>💬 " + escapeHtml(r) + "</li>";
            }).join("") + "</ul>"
          : "");
      body.appendChild(el);
    }
  }

  /* ---------------- Settings ---------------- */

  function renderSettings() {
    var list = $("settings-task-list");
    list.innerHTML = "";

    tasks.forEach(function (t) {
      var p = PERIODS.find(function (x) { return x.id === t.period; });
      var row = document.createElement("div");
      row.className = "settings-row";
      row.innerHTML =
        '<span class="s-emoji">' + t.emoji + "</span>" +
        '<span class="s-title">' + escapeHtml(t.title) + "</span>" +
        '<span class="s-period">' + p.emoji + " " + p.label + "</span>" +
        '<button class="s-delete" aria-label="Delete task">🗑</button>';
      row.querySelector(".s-delete").addEventListener("click", function () {
        if (confirm("Remove \"" + t.title + "\" from the daily list?")) {
          tasks = tasks.filter(function (x) { return x.id !== t.id; });
          save(STORE.tasks, tasks);
          renderSettings();
          render();
        }
      });
      list.appendChild(row);
    });

    // Emoji picker
    var picker = $("emoji-picker");
    picker.innerHTML = "";
    EMOJI_CHOICES.forEach(function (e) {
      var b = document.createElement("button");
      b.className = "emoji-option" + (e === addEmoji ? " selected" : "");
      b.textContent = e;
      b.addEventListener("click", function () {
        addEmoji = e;
        picker.querySelectorAll(".emoji-option").forEach(function (x) { x.classList.remove("selected"); });
        b.classList.add("selected");
      });
      picker.appendChild(b);
    });

    // Period picker
    var pp = $("period-picker");
    pp.innerHTML = "";
    PERIODS.forEach(function (p) {
      var b = document.createElement("button");
      b.className = "period-option" + (p.id === addPeriod ? " selected" : "");
      b.innerHTML = '<span class="p-emoji">' + p.emoji + "</span>" + p.label;
      b.addEventListener("click", function () {
        addPeriod = p.id;
        pp.querySelectorAll(".period-option").forEach(function (x) { x.classList.remove("selected"); });
        b.classList.add("selected");
      });
      pp.appendChild(b);
    });
  }

  function addTask() {
    var title = $("new-task-title").value.trim();
    if (!title) {
      toast("Please type the task name ✏️");
      return;
    }
    tasks.push({
      id: "t" + Date.now(),
      emoji: addEmoji,
      title: title,
      period: addPeriod
    });
    save(STORE.tasks, tasks);
    $("new-task-title").value = "";
    renderSettings();
    render();
    toast("Task added ✅");
  }

  /* ---------------- Wiring ---------------- */

  function init() {
    render();

    // Sheet
    $("sheet-cancel").addEventListener("click", closeSheet);
    $("sheet-backdrop").addEventListener("click", closeSheet);
    $("sheet-save").addEventListener("click", saveSkip);
    document.querySelectorAll(".reason-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        sheetReason = b.dataset.reason;
        document.querySelectorAll(".reason-btn").forEach(function (x) { x.classList.remove("selected"); });
        b.classList.add("selected");
        $("sheet-save").disabled = false;
      });
    });

    // Celebration
    $("celebrate-close").addEventListener("click", function () {
      $("celebrate").hidden = true;
    });

    // Modals
    $("btn-history").addEventListener("click", function () {
      renderHistory();
      $("history-modal").hidden = false;
    });
    $("btn-settings").addEventListener("click", function () {
      renderSettings();
      $("settings-modal").hidden = false;
    });
    document.querySelectorAll(".modal-close").forEach(function (b) {
      b.addEventListener("click", function () {
        $(b.dataset.close).hidden = true;
      });
    });
    document.querySelectorAll(".modal").forEach(function (m) {
      m.addEventListener("click", function (ev) {
        if (ev.target === m) m.hidden = true;
      });
    });

    // Settings actions
    $("btn-add-task").addEventListener("click", addTask);

    // Reminders
    $("btn-bell").addEventListener("click", toggleReminders);
    setInterval(checkReminders, 60 * 1000);
    checkReminders();

    // Keep "NOW" badge and greeting fresh
    setInterval(function () {
      renderGreeting();
      renderTimeline();
    }, 5 * 60 * 1000);

    // If the day is already complete when opening, don't re-celebrate
    var c = counts();
    celebrated = allActioned(c);

    // Scroll to the current time period for instant orientation
    var nowP = currentPeriodId();
    if (nowP && c.done + c.skipped > 0) {
      var el = $("period-" + nowP);
      if (el) setTimeout(function () {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 400);
    }

    window.addEventListener("resize", sizeCanvas);

    // Offline support for the hosted version (no-op when opened as a file)
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register("sw.js").catch(function () { /* offline-first is best-effort */ });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
