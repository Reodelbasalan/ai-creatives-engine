/* ══════════════════════════════════════════════════════════════════════════
   AdFlow Licences — sidebar page for AI Creatives Engine
   ---------------------------------------------------------------------------
   This whole feature lives in THIS file. index.html only needs one line:

       <script src="/adflow-sidebar.js"></script>

   placed just before </body>. Everything else — the sidebar item, its colour,
   the page container, the iframe, and the admin-only guard — is built here at
   runtime. So when you regenerate index.html, AdFlow is never wiped: you only
   ever need to make sure that one <script> line is still there.

   The dashboard itself is a separate file, /adflow-admin.html. Updating the
   dashboard never touches this file, and updating this file never touches the
   dashboard.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var PAGE = "adflow";
  var SRC = "/adflow-admin.html";
  var TITLE = "AdFlow Licences";

  function build() {
    if (document.getElementById("nav-" + PAGE)) return;   // already built

    // ---- 1. colour, matching the per-ID pattern of the other nav items ----
    if (!document.getElementById("adflow-nav-css")) {
      var st = document.createElement("style");
      st.id = "adflow-nav-css";
      st.textContent =
        "#nav-adflow svg{color:#ffcc00}" +
        "#nav-adflow{color:rgba(255,204,0,0.78)}" +
        "#nav-adflow:hover{color:#ffcc00;background:rgba(255,204,0,0.07)}" +
        "#nav-adflow.active{color:#ffcc00;background:rgba(255,204,0,0.1);border:0.5px solid rgba(255,204,0,0.35);font-weight:600}" +
        "#nav-adflow.active::before{background:#ffcc00;box-shadow:0 0 8px #ffcc00}" +
        "#page-adflow{display:none}#page-adflow.active{display:block}";
      (document.head || document.documentElement).appendChild(st);
    }

    // ---- 2. the sidebar item, right after Social Posting ----
    var anchor = document.getElementById("nav-social")
              || document.getElementById("nav-brand")
              || document.getElementById("nav-extensions");
    if (!anchor || !anchor.parentNode) return;

    var nav = document.createElement("div");
    nav.className = "nav-item admin-only";
    nav.id = "nav-" + PAGE;
    nav.setAttribute("onclick", "showPage('" + PAGE + "')");
    nav.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
      '<path d="M2.6 17.4A2 2 0 002 18.8V21a1 1 0 001 1h3a1 1 0 001-1v-1a1 1 0 011-1h1a1 1 0 001-1v-1a1 1 0 011-1h.2a2 2 0 001.4-.6l.8-.8a6.5 6.5 0 10-4-4z"/>' +
      '<circle cx="16.5" cy="7.5" r="0.6" fill="currentColor" stroke="none"/></svg>' +
      TITLE;
    anchor.parentNode.insertBefore(nav, anchor.nextSibling);

    // ---- 3. the page container, a sibling of the other .page divs ----
    var somePage = document.querySelector(".content > .page") || document.querySelector(".page");
    if (!somePage || !somePage.parentNode) return;

    var page = document.createElement("div");
    page.className = "page";
    page.id = "page-" + PAGE;
    var frame = document.createElement("iframe");
    frame.id = "adflow-frame";
    frame.title = TITLE;
    frame.setAttribute("style",
      "width:100%;height:calc(100vh - 132px);min-height:560px;border:0;" +
      "border-radius:14px;background:#07080a;display:block");
    page.appendChild(frame);
    somePage.parentNode.appendChild(page);

    // ---- 4. behaviour ----
    var loaded = false;

    function open_() {
      // showPage() likely switches pages already. We repeat it because we can't
      // read app.js and it may keep a whitelist of known pages; if it already
      // did the work this is harmless, and if it refused the click still lands.
      var pages = document.querySelectorAll(".content > .page");
      for (var i = 0; i < pages.length; i++) pages[i].classList.remove("active");
      page.classList.add("active");
      var items = document.querySelectorAll(".nav-item");
      for (var j = 0; j < items.length; j++) items[j].classList.remove("active");
      nav.classList.add("active");
      var t = document.getElementById("topbar-title");
      if (t) t.textContent = TITLE;
      if (!loaded) { frame.src = SRC; loaded = true; }   // load once only
    }

    nav.addEventListener("click", function () { setTimeout(open_, 0); });

    if (typeof window.showPage === "function") {
      var origShow = window.showPage;
      window.showPage = function (p) {
        var out = origShow.apply(this, arguments);
        if (p === PAGE) open_();
        return out;
      };
    }

    // ---- admins only ----
    // The item carries class "admin-only", so applyRoleUI() already covers it.
    // This is the extra guard: only when we can POSITIVELY tell the user is not
    // an admin do we hide it and kill the iframe. Role unknown → do nothing, so
    // the item can never vanish on a guess.
    function roleNow() {
      var r = window.currentUserRole;
      if (typeof r === "string" && r) return r.trim().toLowerCase();
      var lbl = document.getElementById("user-role-label");
      if (lbl) {
        var t = (lbl.textContent || "").trim().toLowerCase();
        if (t && t !== "—" && t !== "-") return t;
      }
      return "";
    }
    function sync() {
      var role = roleNow();
      if (!role) return;
      if (role.indexOf("admin") !== -1) { nav.style.removeProperty("display"); return; }
      nav.style.setProperty("display", "none", "important");
      if (page.classList.contains("active")) {
        page.classList.remove("active");
        frame.removeAttribute("src"); loaded = false;
      }
    }
    if (typeof window.applyRoleUI === "function") {
      var origRole = window.applyRoleUI;
      window.applyRoleUI = function () {
        var out = origRole.apply(this, arguments);
        sync();
        return out;
      };
    }
    sync();
    var tries = 0;
    var timer = setInterval(function () {
      sync();
      if (roleNow() || ++tries > 40) clearInterval(timer);
    }, 400);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
