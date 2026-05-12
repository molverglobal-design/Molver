// ===== LOCAL STORAGE DB =====
      const STORE_KEY = "clothing_store_v1";
      const USERS_KEY = "clothing_store_users_v1";
      const SESSION_KEY = "clothing_store_session_v1";
      const SHEETS_URL_KEY = "clothing_store_sheets_url_v1";
      const DEFAULT_SHEETS_URL = "https://script.google.com/macros/s/AKfycbxR_Dg6D-tcKGc9GLX-sfvY2Fja__jlTpc1SYbnj2YskR0JMTFZUeHhD8e75BORRiOSGA/exec";
      const LAST_SYNC_KEY = "clothing_store_last_sync_v1";
      const CLOUD_VERSION_KEY = "clothing_store_cloud_version_v1";
      const CLIENT_ID_KEY = "clothing_store_client_id_v1";
      const LOCAL_BACKUPS_KEY = "clothing_store_local_daily_backups_v1";
      const ONBOARDING_KEY = "molver_onboarding_seen_v1";

      let DB = {
        items: [],
        customers: [],
        suppliers: [],
        sales: [],
        purchases: [],
        returns: [],
        onlineOrders: [],
        expenses: [],
        activityLog: [],
        archivedRecords: [],
        brandSettings: [],
      };
      let CNT = { item: 1, sale: 1, pur: 1, ret: 1, cust: 1, sup: 1, online: 1, exp: 1 };
      let retFilter = "all",
        invSearch = "";
      let barcodeCart = [];
      let USERS = [];
      let currentUser = null;
      let syncTimer = null;
      let cloudPullTimer = null;
      let cloudBusy = false;
      let decorateTimer = null;
      let tableObserver = null;
      let dashboardMetric = "sales";
      const THEME_KEY = "molver_theme_mode";

      function clientId() {
        let id = localStorage.getItem(CLIENT_ID_KEY);
        if (!id) {
          id = "CL-" + Date.now() + "-" + Math.random().toString(16).slice(2, 8);
          localStorage.setItem(CLIENT_ID_KEY, id);
        }
        return id;
      }

      function createLocalDailyBackup() {
        try {
          const todayKey = new Date().toISOString().slice(0, 10);
          const backups = JSON.parse(localStorage.getItem(LOCAL_BACKUPS_KEY) || "[]");
          if (backups.some((b) => b.date === todayKey)) return;
          backups.unshift({
            date: todayKey,
            createdAt: new Date().toISOString(),
            payload: { DB, CNT, USERS },
          });
          localStorage.setItem(LOCAL_BACKUPS_KEY, JSON.stringify(backups.slice(0, 7)));
        } catch (e) {
          console.warn("Local daily backup skipped", e);
        }
      }

      function exportLocalBackups() {
        const backups = JSON.parse(localStorage.getItem(LOCAL_BACKUPS_KEY) || "[]");
        if (!backups.length) return toast("لا توجد نسخ يومية محلية بعد");
        const blob = new Blob([JSON.stringify(backups, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "molver_local_daily_backups_" + today() + ".json";
        a.click();
        URL.revokeObjectURL(a.href);
        toast("✓ تم تصدير النسخ اليومية المحلية");
      }
      const ROLE_DEFS = {
        owner: { label: "المالك", pages: "all", actions: "all" },
        manager: {
          label: "مدير تشغيل",
          pages: [
            "dashboard",
            "reports",
            "closing",
            "money",
            "alerts",
            "employees",
            "barcode",
            "expenses",
            "inventory",
            "lowstock",
            "stockmoves",
            "sales",
            "purchases",
            "returns",
            "online",
            "shipping",
            "customers",
            "suppliers",
            "activity",
            "archive",
            "brand",
          ],
          actions: [
            "item",
            "sale",
            "barcodeSale",
            "shipping",
            "purchase",
            "return",
            "customer",
            "supplier",
            "delete",
            "print",
            "export",
            "import",
            "syncCloud",
            "connectionSettings",
            "viewProfit",
            "expense",
            "importItems",
            "printLabels",
            "unlockClosing",
            "archive",
            "brand",
            "approveRisk",
          ],
        },
        sales: {
          label: "كاشير / مبيعات",
          pages: [
            "dashboard",
            "alerts",
            "money",
            "expenses",
            "inventory",
            "lowstock",
            "stockmoves",
            "barcode",
            "sales",
            "returns",
            "online",
            "shipping",
            "customers",
          ],
          actions: ["sale", "barcodeSale", "shipping", "return", "customer", "print", "printLabels"],
        },
        stock: {
          label: "مخزون ومشتريات",
          pages: [
            "dashboard",
            "alerts",
            "inventory",
            "lowstock",
            "stockmoves",
            "purchases",
            "shipping",
            "suppliers",
          ],
          actions: ["item", "purchase", "supplier", "expense", "importItems", "printLabels"],
        },
        viewer: {
          label: "مشاهدة فقط",
          pages: [
            "dashboard",
            "reports",
            "closing",
            "money",
            "expenses",
            "inventory",
            "lowstock",
            "stockmoves",
            "barcode",
            "sales",
            "purchases",
            "returns",
            "online",
            "shipping",
            "customers",
            "suppliers",
          ],
          actions: ["print"],
        },
      };
      function defaultUsers() {
        return [{ login: "owner", name: "MOLVER", pin: "1234", role: "owner", pages: "all", actions: "all" }];
      }
      function activeUserName() {
        return currentUser ? `${currentUser.name || currentUser.login} (${currentUser.login})` : "غير مسجل";
      }
      function logActivity(action, target, details = "") {
        DB.activityLog = DB.activityLog || [];
        DB.activityLog.push({
          id: "LOG-" + Date.now(),
          user: activeUserName(),
          action,
          target,
          details,
          date: new Date().toISOString(),
        });
        if (DB.activityLog.length > 1000) DB.activityLog = DB.activityLog.slice(-1000);
        if (document.getElementById("page-activity")?.classList.contains("active")) renderActivity();
      }
      function loadUsers() {
        try {
          USERS = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
        } catch (e) {
          USERS = [];
        }
        if (!USERS.length) {
          USERS = defaultUsers();
          saveUsers();
        }
      }
      function saveUsers() {
        localStorage.setItem(USERS_KEY, JSON.stringify(USERS));
        localStorage.setItem(STORE_KEY, JSON.stringify({ DB, CNT }));
        scheduleCloudSync();
      }
      function roleDef(role) {
        return ROLE_DEFS[role] || ROLE_DEFS.viewer;
      }
      function applyUserPreset(role) {
        const def = roleDef(role);
        const roleEl = document.getElementById("u-role");
        if (roleEl) roleEl.value = role;
        renderPageChecks(def.pages);
        renderActionChecks(def.actions);
        toast("✓ تم تطبيق قالب " + def.label);
      }
      function userPages(user) {
        if (!user) return [];
        if (user.role === "owner" || user.pages === "all") return "all";
        if (Array.isArray(user.pages) && user.pages.length) return user.pages;
        return roleDef(user.role).pages;
      }
      function can(action) {
        if (!currentUser) return false;
        if (currentUser.role === "owner") return true;
        const storedUser = USERS.find((u) => u.login === currentUser.login);
        if (storedUser && Array.isArray(storedUser.actions)) {
          return storedUser.actions.includes(action);
        }
        return (
          (roleDef(currentUser.role).actions === "all" ||
            roleDef(currentUser.role).actions.includes(action))
        );
      }
      function canPage(page) {
        const pages = userPages(currentUser);
        return pages === "all" || pages.includes(page);
      }
      function requireAction(action) {
        if (can(action)) return true;
        toast("⚠ لا تملك صلاحية لهذه العملية");
        return false;
      }

      function appSetting(key, fallback = "") {
        return brandValue("setting_" + key, fallback);
      }

      function setAppSetting(key, value) {
        setBrandValue("setting_" + key, value);
      }

      function lockedClosingDates() {
        try {
          return new Set(JSON.parse(brandValue("lockedClosingDates", "[]")) || []);
        } catch (e) {
          return new Set();
        }
      }

      function isDateLocked(date) {
        return lockedClosingDates().has(String(date || "").slice(0, 10));
      }

      function requireUnlockedDate(date, actionLabel = "تعديل") {
        if (!isDateLocked(date)) return true;
        if (can("unlockClosing")) return confirm(`اليومية ${date} مقفولة. هل تريد ${actionLabel} بصلاحية المالك؟`);
        toast("⚠ اليومية مقفولة ولا يمكن التعديل إلا بصلاحية المالك");
        return false;
      }

      function addTrashRecord(type, refId, title, details, json) {
        DB.archivedRecords = DB.archivedRecords || [];
        DB.archivedRecords.push({
          id: "TRASH-" + Date.now() + "-" + Math.random().toString(16).slice(2, 6),
          type,
          refId,
          title: "سلة المهملات - " + title,
          details,
          json,
          archivedAt: new Date().toISOString(),
        });
      }
      function setAuthMode(mode = "login") {
        const screen = document.getElementById("auth-screen");
        if (!screen) return;
        screen.classList.toggle("auth-logout-mode", mode === "logout");
        screen.classList.toggle("auth-login-mode", mode !== "logout");
        const badge = document.getElementById("auth-mode-badge");
        const title = document.getElementById("auth-title");
        if (badge) badge.textContent = mode === "logout" ? "جلسة مقفولة" : "تسجيل دخول";
        if (title) title.textContent = mode === "logout" ? "ارجع للسيستم" : "افتح ورديتك";
      }
      function selectLoginUser(loginName) {
        const user = USERS.find((u) => u.login === loginName || u.role === loginName);
        document.getElementById("login-user").value = user ? user.login : loginName;
        document.getElementById("login-pin").focus();
      }
      function pressPin(n) {
        const input = document.getElementById("login-pin");
        input.value = String(input.value || "") + n;
        input.focus();
      }
      function clearLoginPin() {
        const input = document.getElementById("login-pin");
        input.value = "";
        input.focus();
      }
      function toggleInputVisibility(inputId, btn) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const visible = input.type !== "text";
        input.type = visible ? "text" : "password";
        if (btn) {
          btn.classList.toggle("is-visible", visible);
          btn.textContent = visible ? "🙈" : "👁";
        }
        input.focus();
      }
      function login() {
        const loginName = document.getElementById("login-user").value.trim();
        const pin = document.getElementById("login-pin").value;
        const user = USERS.find((u) => u.login === loginName && u.pin === pin);
        if (!user) {
          const card = document.querySelector(".auth-card");
          if (card) {
            card.classList.remove("auth-shake");
            void card.offsetWidth;
            card.classList.add("auth-shake");
          }
          return toast("⚠ بيانات الدخول غير صحيحة");
        }
        currentUser = { login: user.login, name: user.name, role: user.role };
        localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
        document.getElementById("auth-screen").classList.add("hidden");
        setAuthMode("login");
        logActivity("تسجيل دخول", "النظام", roleDef(currentUser.role).label);
        saveDB();
        afterLogin();
      }
      function logout() {
        if (currentUser) {
          logActivity("تسجيل خروج", "النظام", activeUserName());
          saveDB();
        }
        stopAutoCloudPull();
        localStorage.removeItem(SESSION_KEY);
        currentUser = null;
        setAuthMode("logout");
        document.getElementById("auth-screen").classList.remove("hidden");
      }
      function restoreSession() {
        try {
          currentUser = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
        } catch (e) {
          currentUser = null;
        }
        if (currentUser && currentUser.login) {
          const stored = USERS.find((u) => u.login === currentUser.login);
          if (stored) currentUser = { login: stored.login, name: stored.name, role: stored.role };
        }
        if (currentUser) {
          document.getElementById("auth-screen").classList.add("hidden");
          afterLogin();
        }
      }
      function afterLogin() {
        document.getElementById("current-user-chip").textContent =
          `${currentUser.name} - ${roleDef(currentUser.role).label}`;
        renderAll();
        showOnboardingOnce();
        if (getSheetsUrl()) setTimeout(() => loadFromCloud(false), 700);
        startAutoCloudPull();
        const active = document.querySelector(".nav-item.active");
        const page = getNavPage(active);
        if (!canPage(page))
          go(
            firstAllowedPage(),
            document.querySelector(
              `.nav-item[onclick*="'${firstAllowedPage()}'"]`,
            ),
          );
      }
      function getNavPage(el) {
        const m =
          el && (el.getAttribute("onclick") || "").match(/go\('([^']+)'/);
        return m ? m[1] : "dashboard";
      }
      function firstAllowedPage() {
        return (
          [
            "dashboard",
            "reports",
            "closing",
            "money",
            "alerts",
            "employees",
            "expenses",
            "inventory",
            "lowstock",
            "stockmoves",
            "sales",
            "barcode",
            "purchases",
            "returns",
            "online",
            "shipping",
            "customers",
            "suppliers",
            "activity",
            "archive",
            "brand",
            "users",
          ].find(canPage) || "dashboard"
        );
      }
      function applyAccessControl() {
        document.querySelectorAll(".nav-item").forEach((n) => {
          const p = getNavPage(n);
          const label = (PAGE_TITLES[p] || n.textContent || "").trim();
          n.dataset.label = label;
          n.title = label;
          n.classList.toggle("hidden", !!currentUser && !canPage(p));
        });
        document
          .querySelectorAll("[data-owner-only]")
          .forEach((el) =>
            el.classList.toggle(
              "hidden",
              !(currentUser && currentUser.role === "owner"),
            ),
          );
        document.querySelectorAll("[data-action]").forEach((el) => {
          const action = el.dataset.action;
          el.classList.toggle("hidden", !!currentUser && action && !can(action));
        });
      }

      function renderPageChecks(selected = "all") {
        const wrap = document.getElementById("u-pages");
        if (!wrap) return;
        const selectedPages = selected === "all" ? Object.keys(PAGE_TITLES) : selected;
        wrap.innerHTML = Object.entries(PAGE_TITLES)
          .map(([id, label]) => `<label class="perm-check"><input type="checkbox" value="${id}" ${selectedPages.includes(id) ? "checked" : ""} /><span>${label}</span></label>`)
          .join("");
      }
      const ACTION_TITLES = {
        item: "إضافة/تعديل الأصناف",
        sale: "المبيعات والأونلاين",
        barcodeSale: "بيع بالباركود",
        shipping: "الشحن والتحصيل",
        purchase: "المشتريات",
        return: "المرتجعات",
        customer: "العملاء",
        supplier: "الموردين",
        delete: "الحذف",
        print: "الطباعة",
        export: "تصدير/نسخ احتياطي",
        import: "استيراد/تحميل",
        syncCloud: "مزامنة الآن",
        connectionSettings: "إعدادات الربط",
        importItems: "استيراد أصناف CSV",
        viewProfit: "مشاهدة الربح",
        expense: "إدارة المصروفات",
        printLabels: "طباعة ليبلات/QR",
        clearStockMoves: "مسح سجل حركة المخزون",
        unlockClosing: "فتح تعديل يومية مقفولة",
        manageUsers: "إدارة المستخدمين",
        archive: "الأرشفة",
        brand: "إعدادات البراند",
        approveRisk: "اعتماد خصم كبير/بيع بخسارة",
      };
      function renderActionChecks(selected = []) {
        const wrap = document.getElementById("u-actions");
        if (!wrap) return;
        const selectedActions = selected === "all" ? Object.keys(ACTION_TITLES) : selected || [];
        const groups = {
          "عمليات البيع": ["sale", "barcodeSale", "shipping", "return", "approveRisk"],
          "المخزون والمشتريات": ["item", "purchase", "supplier", "importItems", "printLabels", "clearStockMoves"],
          "الحسابات": ["customer", "expense", "archive", "brand"],
          "إدارة وتحكم": ["delete", "print", "export", "import", "syncCloud", "connectionSettings", "viewProfit", "unlockClosing", "manageUsers"],
        };
        wrap.innerHTML = Object.entries(groups).map(([group, ids]) => {
          const checks = ids
            .filter((id) => ACTION_TITLES[id])
            .map((id) => `<label class="perm-check"><input type="checkbox" value="${id}" ${selectedActions.includes(id) ? "checked" : ""} /><span>${ACTION_TITLES[id]}</span></label>`)
            .join("");
          return `<div class="perm-group"><div class="perm-group-title">${group}</div><div class="perm-grid">${checks}</div></div>`;
        }).join("");
      }
      function getCheckedPages() {
        const pages = [...document.querySelectorAll("#u-pages input:checked")].map((x) => x.value);
        return pages.length === Object.keys(PAGE_TITLES).length ? "all" : pages;
      }
      function getCheckedActions() {
        return [...document.querySelectorAll("#u-actions input:checked")].map((x) => x.value);
      }
      function openUserModal(loginName = "") {
        if (!requireAction("manageUsers")) return;
        const user = USERS.find((u) => u.login === loginName);
        document.getElementById("u-original-login").value = user ? user.login : "";
        document.getElementById("u-modal-title").textContent = user ? "تعديل مستخدم" : "إضافة مستخدم";
        document.getElementById("u-login").value = user ? user.login : "";
        document.getElementById("u-name").value = user ? user.name : "";
        document.getElementById("u-pin").value = user ? user.pin : "";
        document.getElementById("u-role").value = user ? user.role : "sales";
        renderPageChecks(user ? userPages(user) : roleDef("sales").pages);
        renderActionChecks(user && Array.isArray(user.actions) ? user.actions : roleDef(user ? user.role : "sales").actions);
        openModal("m-user");
      }
      function saveUser() {
        if (!requireAction("manageUsers")) return;
        const original = document.getElementById("u-original-login").value;
        const loginName = document.getElementById("u-login").value.trim();
        const name = document.getElementById("u-name").value.trim();
        const pin = document.getElementById("u-pin").value.trim();
        const role = document.getElementById("u-role").value;
        const pages = getCheckedPages();
        const actions = getCheckedActions();
        if (!loginName || !name || !pin) return toast("⚠ اسم الدخول والاسم والـ PIN مطلوبين");
        if (USERS.some((u) => u.login === loginName && u.login !== original)) return toast("⚠ اسم الدخول موجود بالفعل");
        const payload = { login: loginName, name, pin, role, pages, actions };
        if (original) {
          USERS = USERS.map((u) => (u.login === original ? payload : u));
          if (currentUser && currentUser.login === original) {
            currentUser = { login: payload.login, name: payload.name, role: payload.role };
            localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
          }
        } else {
          USERS.push(payload);
        }
        logActivity(original ? "تعديل مستخدم" : "إضافة مستخدم", loginName, roleDef(role).label);
        saveUsers();
        closeModal("m-user");
        renderUsers();
        afterLogin();
        toast("✓ تم حفظ المستخدم");
      }
      function deleteUser(loginName) {
        if (!requireAction("manageUsers")) return;
        if (currentUser && loginName === currentUser.login) return toast("⚠ لا يمكن حذف المستخدم الحالي");
        if (!confirm("حذف هذا المستخدم؟")) return;
        USERS = USERS.filter((u) => u.login !== loginName);
        logActivity("حذف مستخدم", loginName);
        saveUsers();
        renderUsers();
        toast("✓ تم حذف المستخدم");
      }
      function renderUsers() {
        const tb = document.getElementById("users-table");
        if (!tb) return;
        tb.innerHTML = USERS.map((u) => {
          const pages = userPages(u) === "all" ? "كل الصفحات" : userPages(u).map((p) => PAGE_TITLES[p] || p).join("، ");
          const actions = (Array.isArray(u.actions) ? u.actions : roleDef(u.role).actions === "all" ? Object.keys(ACTION_TITLES) : roleDef(u.role).actions).map((a) => ACTION_TITLES[a] || a).join("، ");
          return `<tr><td><strong>${u.login}</strong></td><td>${u.name}</td><td><span class="badge badge-blue">${roleDef(u.role).label}</span></td><td>${pages}</td><td>${actions}</td><td><div class="btn-group"><button class="btn btn-sm" onclick="openUserModal('${u.login}')">تعديل</button><button class="btn btn-red" onclick="deleteUser('${u.login}')">حذف</button></div></td></tr>`;
        }).join("");
      }

      function saveDB() {
        try {
          localStorage.setItem(STORE_KEY, JSON.stringify({ DB, CNT }));
          createLocalDailyBackup();
          setSyncState(
            "ok",
            getSheetsUrl()
              ? "محفوظ محلياً - بانتظار المزامنة"
              : "محفوظ على الجهاز ✓",
          );
          scheduleCloudSync();
          queueDecorateTables();
        } catch (e) {
          toast("⚠ خطأ في الحفظ");
        }
      }

      function loadDB() {
        try {
          const raw = localStorage.getItem(STORE_KEY);
          if (raw) {
            const saved = JSON.parse(raw);
            DB = {
              items: [],
              customers: [],
              suppliers: [],
              sales: [],
              purchases: [],
              returns: [],
              onlineOrders: [],
              expenses: [],
              activityLog: [],
              archivedRecords: [],
              brandSettings: [],
              ...(saved.DB || {}),
            };
            CNT = {
              item: 1,
              sale: 1,
              pur: 1,
              ret: 1,
              cust: 1,
              sup: 1,
              online: 1,
              exp: 1,
              ...(saved.CNT || {}),
            };
          }
        } catch (e) {}
        setSyncState("ok", "محفوظ على الجهاز ✓");
        renderAll();
      }

      function getSheetsUrl() {
        return localStorage.getItem(SHEETS_URL_KEY) || DEFAULT_SHEETS_URL || "";
      }

      function openSettings() {
        if (currentUser && !requireAction("connectionSettings")) return;
        document.getElementById("gs-url").value = getSheetsUrl();
        const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
        set("set-currency", appSetting("currency", "EGP"));
        set("set-minqty", appSetting("defaultMinQty", "3"));
        set("set-payments", appSetting("paymentMethods", "كاش,فودافون كاش,إنستا باي,فيزا"));
        set("set-shippers", appSetting("shippingCompanies", "داخلي"));
        set("set-label", appSetting("labelSize", "medium"));
        set("set-online-stock", appSetting("onlineStockMode", "save"));
        openModal("m-settings");
      }

      function saveSettings() {
        if (currentUser && !requireAction("connectionSettings")) return;
        const url = document.getElementById("gs-url").value.trim();
        if (url && !url.startsWith("https://script.google.com/"))
          return toast("⚠ رابط Apps Script غير صحيح");
        if (url && url !== DEFAULT_SHEETS_URL) localStorage.setItem(SHEETS_URL_KEY, url);
        else localStorage.removeItem(SHEETS_URL_KEY);
        const val = (id) => document.getElementById(id)?.value.trim() || "";
        setAppSetting("currency", val("set-currency") || "EGP");
        setAppSetting("defaultMinQty", val("set-minqty") || "3");
        setAppSetting("paymentMethods", val("set-payments") || "كاش,فودافون كاش,إنستا باي,فيزا");
        setAppSetting("shippingCompanies", val("set-shippers") || "داخلي");
        setAppSetting("labelSize", val("set-label") || "medium");
        setAppSetting("onlineStockMode", val("set-online-stock") || "save");
        saveDB();
        closeModal("m-settings");
        setSyncState(
          url ? "ok" : "error",
          url ? "جاهز للمزامنة مع Google Sheets" : "الحفظ المحلي فقط",
        );
        toast(url ? "✓ تم حفظ رابط الربط" : "✓ تم تعطيل الربط السحابي");
      }

      function scheduleCloudSync() {
        if (!getSheetsUrl()) return;
        if (navigator.onLine === false) {
          updateConnectionUi();
          return;
        }
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => syncToCloud(false), 1200);
      }

      function canAutoPullCloud() {
        if (!currentUser || !getSheetsUrl()) return false;
        if (document.visibilityState && document.visibilityState !== "visible") return false;
        if (!document.getElementById("auth-screen")?.classList.contains("hidden")) return false;
        if (document.querySelector(".overlay.open")) return false;
        const active = document.activeElement;
        if (active && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)) return false;
        return true;
      }

      function startAutoCloudPull() {
        stopAutoCloudPull();
        if (!getSheetsUrl()) return;
        cloudPullTimer = setInterval(() => {
          if (canAutoPullCloud()) loadFromCloud(false, true);
        }, 20000);
      }

      function stopAutoCloudPull() {
        if (cloudPullTimer) clearInterval(cloudPullTimer);
        cloudPullTimer = null;
      }

      document.addEventListener("visibilitychange", () => {
        if (canAutoPullCloud()) setTimeout(() => loadFromCloud(false, true), 500);
      });

      window.addEventListener("focus", () => {
        if (canAutoPullCloud()) setTimeout(() => loadFromCloud(false, true), 500);
      });

      function updateConnectionUi() {
        const offline = navigator.onLine === false;
        document.getElementById("offline-banner")?.classList.toggle("hidden", !offline);
        const chip = document.getElementById("live-sync-chip");
        if (chip && offline) {
          chip.textContent = "Offline - محفوظ محلياً";
          chip.className = "live-sync-chip offline";
        }
      }

      window.addEventListener("online", () => {
        updateConnectionUi();
        toast("✓ رجع الإنترنت - جاري المزامنة");
        syncToCloud(false);
        setTimeout(() => loadFromCloud(false, true), 2500);
      });

      window.addEventListener("offline", () => {
        updateConnectionUi();
        toast("⚠ أوفلاين - الحفظ مؤقت على الجهاز");
      });

      function repairSync() {
        if (!requireAction("syncCloud")) return;
        if (!getSheetsUrl()) return toast("⚠ لا يوجد رابط Google Sheets");
        if (navigator.onLine === false) return toast("⚠ أنت أوفلاين حالياً");
        setSyncState("syncing", "إصلاح المزامنة: تحميل ودمج...");
        loadFromCloud(false);
        setTimeout(() => {
          setSyncState("syncing", "إصلاح المزامنة: رفع النسخة المدموجة...");
          syncToCloud(true);
        }, 2800);
      }

      function showOnboardingOnce() {
        if (localStorage.getItem(ONBOARDING_KEY)) return;
        localStorage.setItem(ONBOARDING_KEY, "1");
        setTimeout(() => {
          toast("ابدأ سريعاً: اضبط البراند، أضف موظف، أضف صنف، ثم راقب Live sync", 5200);
        }, 900);
      }

      function emptyDB() {
        return {
          items: [],
          customers: [],
          suppliers: [],
          sales: [],
          purchases: [],
          returns: [],
          onlineOrders: [],
          expenses: [],
          activityLog: [],
          archivedRecords: [],
          brandSettings: [],
        };
      }

      function defaultCounters() {
        return { item: 1, sale: 1, pur: 1, ret: 1, cust: 1, sup: 1, online: 1, exp: 1 };
      }

      function rowKey(type, row) {
        if (!row) return "";
        if (type === "items") return row.code || "";
        if (type === "brandSettings") return row.key || "";
        if (type === "users") return row.login || "";
        return row.id || row.code || row.login || row.key || "";
      }

      function rowStamp(row) {
        if (!row) return 0;
        const value = row.updatedAt || row.archivedAt || row.date || row.createdAt || row.savedAt || "";
        const ts = value ? new Date(value).getTime() : 0;
        return Number.isFinite(ts) ? ts : 0;
      }

      function trashKeys(archiveRows) {
        const set = new Set();
        (archiveRows || []).forEach((r) => {
          if (!r || !r.type || !r.refId) return;
          if (String(r.id || "").startsWith("TRASH-")) set.add(`${r.type}:${r.refId}`);
        });
        return set;
      }

      function mergeRows(type, localRows = [], cloudRows = [], deleted = new Set()) {
        const map = new Map();
        [...cloudRows, ...localRows].forEach((row) => {
          const key = rowKey(type, row);
          if (!key) return;
          if (type !== "archivedRecords" && deleted.has(`${type}:${key}`)) return;
          const prev = map.get(key);
          if (!prev || rowStamp(row) >= rowStamp(prev)) map.set(key, row);
        });
        return [...map.values()];
      }

      function mergeCounters(localCnt = {}, cloudCnt = {}) {
        const merged = { ...defaultCounters() };
        Object.keys(merged).forEach((key) => {
          merged[key] = Math.max(+localCnt[key] || 1, +cloudCnt[key] || 1);
        });
        return merged;
      }

      function mergeCloudData(localData, cloudData) {
        const localDB = { ...emptyDB(), ...(localData.DB || {}) };
        const cloudDB = { ...emptyDB(), ...(cloudData.DB || {}) };
        const archive = mergeRows("archivedRecords", localDB.archivedRecords, cloudDB.archivedRecords);
        const deleted = trashKeys(archive);
        const mergedDB = emptyDB();
        Object.keys(mergedDB).forEach((type) => {
          mergedDB[type] = type === "archivedRecords"
            ? archive
            : mergeRows(type, localDB[type], cloudDB[type], deleted);
        });
        return {
          DB: mergedDB,
          CNT: mergeCounters(localData.CNT || {}, cloudData.CNT || {}),
          USERS: mergeRows("users", localData.USERS || [], cloudData.USERS || []),
          meta: cloudData.meta || {},
        };
      }

      function changedInventorySummary(beforeItems, afterItems) {
        const before = new Map((beforeItems || []).map((i) => [i.code, i]));
        const changes = [];
        (afterItems || []).forEach((item) => {
          const old = before.get(item.code);
          if (!old) changes.push(`صنف جديد: ${item.name || item.code}`);
          else if (+old.qty !== +item.qty) changes.push(`${item.name || item.code}: ${old.qty} ← ${item.qty}`);
        });
        return changes.slice(0, 3);
      }

      function dataSignature(db = DB, cnt = CNT, users = USERS) {
        return JSON.stringify({ DB: db, CNT: cnt, USERS: users });
      }

      function loadCloudSnapshot(onDone, onError) {
        const url = getSheetsUrl();
        const cb = "gs_merge_" + Date.now();
        window[cb] = (data) => {
          try {
            onDone(data || {});
          } finally {
            delete window[cb];
            document.getElementById(cb)?.remove();
          }
        };
        const s = document.createElement("script");
        s.id = cb;
        s.src = url + (url.includes("?") ? "&" : "?") + "action=loadAll&callback=" + cb + "&t=" + Date.now();
        s.onerror = () => {
          delete window[cb];
          s.remove();
          if (onError) onError();
        };
        document.body.appendChild(s);
      }

      function postCloudPayload(url, payload, manual) {
        const frameName = "gs_sync_frame";
        let frame = document.getElementById(frameName);
        if (!frame) {
          frame = document.createElement("iframe");
          frame.name = frameName;
          frame.id = frameName;
          frame.className = "hidden";
          document.body.appendChild(frame);
        }
        const form = document.createElement("form");
        form.method = "POST";
        form.action = url;
        form.target = frameName;
        form.className = "hidden";
        const input = document.createElement("input");
        input.name = "payload";
        input.value = JSON.stringify({
          action: "saveAll",
          payload,
          updatedAt: new Date().toISOString(),
        });
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
        form.remove();
        setTimeout(() => {
          const syncMessage = "تم دمج البيانات وإرسالها إلى Google Sheets ✓";
          setSyncState("ok", syncMessage);
          markLastSync();
          if (payload.meta && payload.meta.cloudVersion) localStorage.setItem(CLOUD_VERSION_KEY, payload.meta.cloudVersion);
          if (manual) toast(syncMessage);
          cloudBusy = false;
        }, 1200);
      }

      function syncToCloud(manual = false) {
        if (cloudBusy) return;
        const url = getSheetsUrl();
        if (!url) {
          if (manual) toast("⚠ أضف رابط Google Sheets من زر الربط أولاً");
          return;
        }
        if (navigator.onLine === false) {
          updateConnectionUi();
          if (manual) toast("⚠ أنت أوفلاين. سيتم الرفع عند رجوع الإنترنت");
          return;
        }
        if (manual && currentUser && !can("syncCloud")) {
          if (manual) toast("⚠ لا تملك صلاحية المزامنة");
          return;
        }
        try {
          cloudBusy = true;
          setSyncState("syncing", "جاري دمج بيانات الأجهزة مع Google Sheets...");
          const localData = { DB, CNT, USERS };
          loadCloudSnapshot((cloudData) => {
            const merged = mergeCloudData(localData, cloudData);
            DB = merged.DB;
            CNT = merged.CNT;
            USERS = merged.USERS && merged.USERS.length ? merged.USERS : USERS;
            const payload = {
              DB,
              CNT,
              USERS,
              meta: {
                clientId: clientId(),
                baseCloudVersion: localStorage.getItem(CLOUD_VERSION_KEY) || "",
                cloudVersion: cloudData.meta && cloudData.meta.cloudVersion ? cloudData.meta.cloudVersion : "",
              },
            };
            localStorage.setItem(STORE_KEY, JSON.stringify({ DB, CNT }));
            localStorage.setItem(USERS_KEY, JSON.stringify(USERS));
            renderAll();
            postCloudPayload(url, payload, manual);
          }, () => {
            cloudBusy = false;
            setSyncState("error", "فشل تحميل نسخة الشيت قبل الدمج");
            if (manual) toast("⚠ فشل الدمج. جرّب تحميل من الشيت ثم مزامنة");
          });
        } catch (e) {
          cloudBusy = false;
          setSyncState("error", "فشل الاتصال بـ Google Sheets");
          if (manual) toast("⚠ فشل الاتصال برابط Google Sheets");
        }
      }

      function testSheetsConnection() {
        const url = getSheetsUrl();
        if (!url) return toast("⚠ أضف رابط Google Sheets أولاً");
        const cb = "gs_test_" + Date.now();
        setSyncState("syncing", "جاري اختبار الربط...");
        window[cb] = (data) => {
          try {
            if (data && data.ok) {
              setSyncState("ok", "الربط يعمل ✓");
              markLastSync();
              toast("✓ الربط يعمل وتم تجهيز تبويبات الشيت");
            } else {
              setSyncState("error", "رد غير متوقع من Apps Script");
              toast("⚠ رد غير متوقع من الرابط");
            }
          } finally {
            delete window[cb];
            document.getElementById(cb)?.remove();
          }
        };
        const s = document.createElement("script");
        s.id = cb;
        s.src =
          url +
          (url.includes("?") ? "&" : "?") +
          "action=setup&callback=" +
          cb +
          "&t=" +
          Date.now();
        s.onerror = () => {
          setSyncState("error", "فشل اختبار الربط");
          toast("⚠ الرابط لم يستجب. راجع النشر والصلاحيات");
          delete window[cb];
          s.remove();
        };
        document.body.appendChild(s);
      }

      function loadFromCloud(manual = false, silent = false) {
        if (cloudBusy) return;
        const url = getSheetsUrl();
        if (!url) {
          if (manual) toast("⚠ أضف رابط Google Sheets أولاً");
          return;
        }
        if (navigator.onLine === false) {
          updateConnectionUi();
          if (manual) toast("⚠ أنت أوفلاين حالياً");
          return;
        }
        if (manual && currentUser && !can("import"))
          return toast("⚠ لا تملك صلاحية التحميل");
        const cb = "gs_cb_" + Date.now();
        cloudBusy = true;
        if (!silent) setSyncState("syncing", "جاري التحميل من Google Sheets...");
        window[cb] = (data) => {
          try {
            const beforeItems = DB.items || [];
            const beforeSignature = dataSignature();
            const merged = mergeCloudData({ DB, CNT, USERS }, data || {});
            const afterSignature = dataSignature(merged.DB, merged.CNT, merged.USERS && merged.USERS.length ? merged.USERS : USERS);
            if (silent && beforeSignature === afterSignature) {
              if (data.meta && data.meta.cloudVersion) localStorage.setItem(CLOUD_VERSION_KEY, data.meta.cloudVersion);
              markLastSync();
              return;
            }
            DB = merged.DB;
            CNT = merged.CNT;
            if (merged.USERS && merged.USERS.length) USERS = merged.USERS;
            localStorage.setItem(USERS_KEY, JSON.stringify(USERS));
            if (data.meta && data.meta.cloudVersion) localStorage.setItem(CLOUD_VERSION_KEY, data.meta.cloudVersion);
            localStorage.setItem(STORE_KEY, JSON.stringify({ DB, CNT }));
            renderAll();
            const invChanges = changedInventorySummary(beforeItems, DB.items || []);
            if (silent && invChanges.length) setSyncState("ok", "تم تحديث بيانات من جهاز آخر ✓");
            if (!silent) setSyncState("ok", "تم تحميل ودمج بيانات Google Sheets ✓");
            markLastSync();
            if (manual) toast("✓ تم تحميل ودمج بيانات الشيت");
          } catch (e) {
            if (!silent) setSyncState("error", "تعذر قراءة بيانات الشيت");
            if (manual) toast("⚠ بيانات الشيت غير صحيحة");
          } finally {
            cloudBusy = false;
            delete window[cb];
            document.getElementById(cb)?.remove();
          }
        };
        const s = document.createElement("script");
        s.id = cb;
        s.src =
          url +
          (url.includes("?") ? "&" : "?") +
          "action=loadAll&callback=" +
          cb +
          "&t=" +
          Date.now();
        s.onerror = () => {
          cloudBusy = false;
          if (!silent) setSyncState("error", "فشل تحميل بيانات Google Sheets");
          if (manual) toast("⚠ فشل التحميل من الشيت");
          delete window[cb];
          s.remove();
        };
        document.body.appendChild(s);
      }

      function exportData() {
        if (currentUser && !requireAction("export")) return;
        const blob = new Blob([JSON.stringify({ DB, CNT, USERS, exportedAt: new Date().toISOString() }, null, 2)], {
          type: "application/json",
        });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download =
          "clothing_backup_" + new Date().toISOString().slice(0, 10) + ".json";
        a.click();
        toast("✓ تم تصدير البيانات");
      }

      function importData() {
        if (currentUser && !requireAction("import")) return;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const saved = JSON.parse(ev.target.result);
              DB = {
                items: [],
                customers: [],
                suppliers: [],
                sales: [],
                purchases: [],
                returns: [],
                onlineOrders: [],
                expenses: [],
                activityLog: [],
                ...(saved.DB || {}),
              };
              CNT = {
                item: 1,
                sale: 1,
                pur: 1,
                ret: 1,
                cust: 1,
                sup: 1,
                online: 1,
                exp: 1,
                ...(saved.CNT || {}),
              };
              if (saved.USERS && Array.isArray(saved.USERS)) {
                USERS = saved.USERS;
                localStorage.setItem(USERS_KEY, JSON.stringify(USERS));
              }
              saveDB();
              renderAll();
              toast("✓ تم استيراد البيانات");
            } catch (e) {
              toast("⚠ ملف غير صحيح");
            }
          };
          reader.readAsText(file);
        };
        input.click();
      }

      function parseCsv(text) {
        const rows = [];
        let row = [], cell = "", quoted = false;
        for (let i = 0; i < text.length; i++) {
          const ch = text[i], next = text[i + 1];
          if (ch === '"' && quoted && next === '"') { cell += '"'; i++; continue; }
          if (ch === '"') { quoted = !quoted; continue; }
          if (ch === "," && !quoted) { row.push(cell.trim()); cell = ""; continue; }
          if ((ch === "\n" || ch === "\r") && !quoted) {
            if (ch === "\r" && next === "\n") i++;
            row.push(cell.trim()); cell = "";
            if (row.some(Boolean)) rows.push(row);
            row = [];
            continue;
          }
          cell += ch;
        }
        row.push(cell.trim());
        if (row.some(Boolean)) rows.push(row);
        return rows;
      }

      function importItemsCsv() {
        if (!requireAction("importItems")) return;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".csv,text/csv";
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const rows = parseCsv(ev.target.result);
            if (rows.length < 2) return toast("⚠ ملف CSV فاضي");
            const header = rows[0].map((h) => h.trim().toLowerCase());
            const hasHeader = header.includes("name") || header.includes("code") || header.includes("barcode");
            const keys = hasHeader ? header : ["code","barcode","name","cat","gender","size","color","fabric","qty","minqty","cost","price","notes"];
            const body = hasHeader ? rows.slice(1) : rows;
            let added = 0, updated = 0;
            body.forEach((r) => {
              const obj = {};
              keys.forEach((k, i) => obj[k] = r[i] || "");
              const name = obj.name || obj["اسم"] || obj["اسم الصنف"];
              if (!name) return;
              const code = obj.code || obj["كود"] || "CLO-" + pad(CNT.item++);
              const payload = {
                code,
                barcode: obj.barcode || obj.sku || code,
                name,
                cat: obj.cat || obj.category || obj["الفئة"] || "أخرى",
                gender: obj.gender || obj["الجنس"] || "يونيسيكس",
                size: obj.size || obj["المقاس"] || "M",
                color: obj.color || obj["اللون"] || "",
                fabric: obj.fabric || obj["الخامة"] || "",
                qty: +(obj.qty || obj.quantity || obj["الكمية"] || 0),
                minQty: +(obj.minqty || obj.minqty || obj.min || obj["الحد الأدنى"] || 3),
                cost: +(obj.cost || obj["سعر الشراء"] || 0),
                price: +(obj.price || obj["سعر البيع"] || 0),
                notes: obj.notes || obj["ملاحظات"] || "",
              };
              const existing = DB.items.find((i) => i.code === code || (payload.barcode && i.barcode === payload.barcode));
              if (existing) { Object.assign(existing, payload); updated++; }
              else { DB.items.push(payload); added++; }
            });
            logActivity("استيراد أصناف CSV", "Inventory", `Added ${added}, Updated ${updated}`);
            saveDB(); renderInv(); renderLowStock(); renderDash();
            toast(`✓ تم استيراد ${added} جديد وتحديث ${updated}`);
          };
          reader.readAsText(file, "utf-8");
        };
        input.click();
      }

      document.getElementById("top-date").textContent =
        new Date().toLocaleDateString("ar-EG", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });

      // ===== UI =====
      function formatDateTime(ts) {
        if (!ts) return "—";
        try {
          return new Date(ts).toLocaleString("ar-EG", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        } catch (e) {
          return "—";
        }
      }
      function markLastSync() {
        const ts = new Date().toISOString();
        localStorage.setItem(LAST_SYNC_KEY, ts);
        updateLastSyncLabel();
      }
      function updateLastSyncLabel() {
        const el = document.getElementById("sync-last");
        if (el) el.textContent = "آخر مزامنة: " + formatDateTime(localStorage.getItem(LAST_SYNC_KEY));
      }
      function setSyncState(s, txt) {
        const dot = document.getElementById("sync-dot");
        const el = document.getElementById("sync-txt");
        const chip = document.getElementById("live-sync-chip");
        dot.className =
          "sync-dot" +
          (s === "syncing" ? " syncing" : s === "error" ? " error" : "");
        if (el) el.textContent = txt || (s === "error" ? "حدث خطأ في المزامنة" : "تم تحديث حالة المزامنة");
        if (chip && navigator.onLine !== false) {
          chip.className = "live-sync-chip" + (s === "syncing" ? " syncing" : s === "error" ? " error" : "");
          const last = localStorage.getItem(LAST_SYNC_KEY);
          const ago = last ? Math.max(0, Math.round((Date.now() - new Date(last).getTime()) / 1000)) : null;
          chip.textContent = s === "syncing"
            ? "Live sync - جاري التحديث"
            : s === "error"
              ? "Live sync - يحتاج مراجعة"
              : "Live sync" + (ago !== null ? ` - آخر تحديث ${ago}ث` : "");
        }
        updateConnectionUi();
        updateLastSyncLabel();
      }

      function toast(msg, dur = 2600) {
        const t = document.getElementById("toast");
        if (!t) return;
        const text = String(msg || "").trim() || "تم تنفيذ العملية";
        t.textContent = text;
        t.style.transform = "translateX(-50%) translateY(0)";
        setTimeout(
          () => (t.style.transform = "translateX(-50%) translateY(80px)"),
          dur,
        );
      }

      function decorateMobileTables() {
        document.querySelectorAll(".table-wrap table").forEach((table) => {
          const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());
          table.querySelectorAll("tbody tr").forEach((tr) => {
            [...tr.children].forEach((td, index) => {
              if (!td.getAttribute("data-label")) td.setAttribute("data-label", headers[index] || "");
            });
          });
        });
      }
      function queueDecorateTables() {
        clearTimeout(decorateTimer);
        decorateTimer = setTimeout(decorateMobileTables, 0);
      }
      function setupTableDecorator() {
        const content = document.getElementById("content");
        if (!content || tableObserver || typeof MutationObserver === "undefined") return;
        tableObserver = new MutationObserver(() => queueDecorateTables());
        tableObserver.observe(content, { childList: true, subtree: true });
      }

      function runSystemCheck(silent = false) {
        const checks = [];
        const neg = DB.items.filter((i) => (+i.qty || 0) < 0);
        checks.push({ ok: !neg.length, level: neg.length ? "err" : "ok", text: neg.length ? `أصناف بكميات سالبة: ${neg.length}` : "المخزون بدون كميات سالبة" });
        const low = DB.items.filter((i) => (+i.qty || 0) <= (+i.minQty || 0));
        checks.push({ ok: true, level: low.length ? "warn" : "ok", text: low.length ? `مخزون منخفض: ${low.length} صنف` : "لا توجد تنبيهات مخزون منخفض" });
        const orphanSales = DB.sales.filter((s) => (s.lineItems || []).some((l) => !DB.items.find((i) => i.code === l.code)));
        checks.push({ ok: !orphanSales.length, level: orphanSales.length ? "warn" : "ok", text: orphanSales.length ? `فواتير بها أصناف محذوفة: ${orphanSales.length}` : "تفاصيل الفواتير مرتبطة بالأصناف" });
        const reservedOrders = DB.onlineOrders.filter((o) => o.reserved && ["ملغي", "مرتجع"].includes(o.status));
        checks.push({ ok: !reservedOrders.length, level: reservedOrders.length ? "err" : "ok", text: reservedOrders.length ? `طلبات ملغية ما زالت حاجزة مخزون: ${reservedOrders.length}` : "حجز الأونلاين متسق" });
        const todayMs = new Date(today()).getTime();
        const lateOrders = (DB.onlineOrders || []).filter((o) => !["تم التسليم", "ملغي", "مرتجع"].includes(o.status) && o.date && (todayMs - new Date(o.date).getTime()) / 86400000 >= 2);
        checks.push({ ok: !lateOrders.length, level: lateOrders.length ? "warn" : "ok", text: lateOrders.length ? `طلبات أونلاين محتاجة متابعة: ${lateOrders.length}` : "طلبات الأونلاين تحت السيطرة" });
        const dueCustomers = DB.customers.filter((c) => (+c.balance || 0) > 0);
        checks.push({ ok: !dueCustomers.length, level: dueCustomers.length ? "warn" : "ok", text: dueCustomers.length ? `عملاء عليهم متبقيات: ${dueCustomers.length}` : "لا توجد متبقيات على العملاء" });
        const overdueCollections = (DB.onlineOrders || []).filter((o) => !["تم التسليم", "ملغي", "مرتجع"].includes(o.status) && (+o.due || Math.max(0, (+o.total || 0) - (+o.collectedAmount || +o.paid || 0))) > 0 && o.date && (todayMs - new Date(o.date).getTime()) / 86400000 >= 3);
        checks.push({ ok: !overdueCollections.length, level: overdueCollections.length ? "warn" : "ok", text: overdueCollections.length ? `طلبات لم يتم تحصيلها منذ 3 أيام أو أكثر: ${overdueCollections.length}` : "لا توجد طلبات متأخرة في التحصيل" });
        const lastSync = localStorage.getItem(LAST_SYNC_KEY);
        const syncAge = lastSync ? (Date.now() - new Date(lastSync).getTime()) / 60000 : Infinity;
        checks.push({ ok: !getSheetsUrl() || syncAge < 30, level: getSheetsUrl() && syncAge >= 30 ? "warn" : "ok", text: getSheetsUrl() && syncAge >= 30 ? "آخر مزامنة قديمة. اعمل مزامنة قبل البيع من جهاز جديد" : "حالة المزامنة مناسبة" });
        checks.push({ ok: !!getSheetsUrl(), level: getSheetsUrl() ? "ok" : "warn", text: getSheetsUrl() ? "رابط Google Sheets محفوظ" : "لم يتم حفظ رابط Google Sheets بعد" });
        const el = document.getElementById("system-health");
        if (el) el.innerHTML = checks.map((c) => `<div class="health-item ${c.level}">${c.text}</div>`).join("");
        if (!silent) toast(checks.some((c) => c.level === "err") ? "⚠ الفحص وجد مشاكل تحتاج مراجعة" : "✓ تم فحص النظام");
        queueDecorateTables();
      }

      function runDemoCycle() {
        if (!requireAction("item") || !requireAction("sale") || !requireAction("return") || !requireAction("expense")) return;
        if (!confirm("تشغيل دورة اختبار؟ سيتم إضافة صنف وعميل وبيع وطلب أونلاين ومرتجع ومصروف باسم اختبار دورة.")) return;
        const stamp = Date.now().toString().slice(-6);
        const item = {
          code: "TEST-" + stamp,
          barcode: "MOLVER-" + stamp,
          name: "اختبار دورة MOLVER",
          cat: "تيشيرتات",
          gender: "يونيسيكس",
          size: "M",
          color: "أسود",
          fabric: "قطن",
          qty: 20,
          minQty: 3,
          cost: 100,
          price: 180,
          notes: "بيانات اختبار يمكن حذفها",
        };
        DB.items.push(item);
        const cust = upsertCustomerProfile({
          name: "عميل اختبار " + stamp,
          phone: "010000" + stamp,
          addr: "عنوان اختبار",
          sourceType: "بيع عادي",
          lastSource: "دورة اختبار",
        });
        const saleLine = { code: item.code, name: item.name, size: item.size, color: item.color, qty: 1, price: item.price, sub: item.price, profit: item.price - item.cost };
        applyStockLines([saleLine], -1);
        const sale = { id: "INV-" + pad(CNT.sale++), custId: cust.id, party: cust.name, phone: cust.phone, addr: cust.addr, date: today(), items: saleLine.name + "×1", lineItems: [saleLine], qtyTotal: 1, total: saleLine.sub, paid: saleLine.sub, due: 0, paymentStatus: "مدفوع", profit: saleLine.profit, source: "regular" };
        DB.sales.push(sale);
        const orderLine = { ...saleLine, qty: 2, sub: item.price * 2, profit: (item.price - item.cost) * 2 };
        const order = { id: "ON-" + pad(CNT.online++), custId: cust.id, customerName: cust.name, phone: cust.phone, phone2: "", address: cust.addr, source: "اختبار", paymentMethod: "كاش عند الاستلام", shippingCompany: "داخلي", trackingNo: "", shippingFee: 30, discount: 10, items: orderLine.name + "×2", lineItems: [orderLine], qtyTotal: 2, total: orderLine.sub + 20, paid: 0, due: orderLine.sub + 20, profit: orderLine.profit - 10, status: "جديد", reserved: false, notes: "طلب اختبار", date: today() };
        reserveOnlineStock(order);
        DB.onlineOrders.push(order);
        const ret = { id: "RET-" + pad(CNT.ret++), code: item.code, type: "مبيعات", invId: sale.id, itemName: itemDisplayName(item), qty: 1, price: item.price, total: item.price, reason: "دورة اختبار", notes: "", date: today() };
        applyReturnStock(ret, 1);
        DB.returns.push(ret);
        DB.expenses = DB.expenses || [];
        DB.expenses.push({ id: "EXP-" + pad(CNT.exp++), name: "مصروف اختبار", cat: "أخرى", amount: 25, date: today(), notes: "دورة اختبار" });
        recalcCustomersFromSales();
        logActivity("تشغيل دورة اختبار", item.code, "صنف + بيع + أونلاين + مرتجع + مصروف");
        saveDB();
        renderAll();
        runSystemCheck(true);
        if (getSheetsUrl()) syncToCloud(true);
        toast("✓ تم تشغيل دورة الاختبار بنجاح");
      }

      const PAGE_TITLES = {
        dashboard: "لوحة التحكم",
        reports: "التقارير",
        closing: "تقفيل اليومية",
        money: "تحصيلات معلقة",
        alerts: "التنبيهات",
        employees: "أداء الموظفين",
        expenses: "المصروفات",
        inventory: "أصناف الملابس",
        lowstock: "مخزون منخفض",
        stockmoves: "حركة المخزون",
        sales: "فواتير المبيعات",
        barcode: "بيع بالباركود",
        purchases: "فواتير المشتريات",
        returns: "المرتجعات",
        online: "طلبات الأونلاين",
        shipping: "الشحن والتحصيل",
        customers: "العملاء",
        suppliers: "الموردين",
        activity: "سجل النشاط",
        archive: "الأرشيف",
        brand: "إعدادات البراند",
        users: "المستخدمين والصلاحيات",
      };

      function go(id, el) {
        document.body.classList.remove("mobile-chrome-hidden");
        document.body.classList.remove("mobile-actions-open");
        document
          .querySelectorAll(".page")
          .forEach((p) => p.classList.remove("active"));
        document
          .querySelectorAll(".nav-item")
          .forEach((n) => n.classList.remove("active"));
        document.getElementById("page-" + id).classList.add("active");
        if (el) el.classList.add("active");
        document.getElementById("page-title").textContent = PAGE_TITLES[id];
        if (id === "dashboard") renderDash();
        if (id === "lowstock") renderLowStock();
        if (id === "stockmoves") renderStockMoves();
        if (id === "reports") renderReports();
        if (id === "closing") renderClosing();
        if (id === "money") renderMoney();
        if (id === "alerts") renderAlerts();
        if (id === "employees") renderEmployees();
        if (id === "online") renderOnlineOrders();
        if (id === "barcode") renderBarcodeCart();
        if (id === "shipping") renderShipping();
        if (id === "expenses") renderExpenses();
        if (id === "activity") renderActivity();
        if (id === "archive") renderArchive();
        if (id === "brand") renderBrandSettings();
        queueDecorateTables();
      }

      function toggleMobileActions() {
        document.body.classList.toggle("mobile-actions-open");
      }

      let mobileChromeTicking = false;
      let mobileChromeHidden = false;
      function updateMobileChrome() {
        mobileChromeTicking = false;
        if (!window.matchMedia("(max-width: 900px)").matches) {
          if (mobileChromeHidden) {
            document.body.classList.remove("mobile-chrome-hidden");
            mobileChromeHidden = false;
          }
          return;
        }
        const y = window.scrollY || document.documentElement.scrollTop || 0;
        const shouldHide = mobileChromeHidden ? y > 70 : y > 150;
        if (shouldHide !== mobileChromeHidden) {
          document.body.classList.toggle("mobile-chrome-hidden", shouldHide);
          mobileChromeHidden = shouldHide;
        }
      }

      function initMobileChromeCollapse() {
        const onScroll = () => {
          if (!mobileChromeTicking) {
            mobileChromeTicking = true;
            requestAnimationFrame(updateMobileChrome);
          }
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", updateMobileChrome);
        document.addEventListener("click", (event) => {
          if (!document.body.classList.contains("mobile-actions-open")) return;
          if (event.target.closest(".topbar")) return;
          document.body.classList.remove("mobile-actions-open");
        });
        updateMobileChrome();
      }

      function initMicroInteractions() {
        document.addEventListener("click", (event) => {
          const btn = event.target.closest(".btn, .nav-item, .mobile-actions-toggle");
          if (!btn) return;
          btn.classList.remove("tap-pop");
          void btn.offsetWidth;
          btn.classList.add("tap-pop");
          window.setTimeout(() => btn.classList.remove("tap-pop"), 260);
          if (btn.closest(".topbar-actions") && btn.matches(".btn")) {
            document.body.classList.remove("mobile-actions-open");
          }
        });
      }

      function openModal(id) {
        if (id === "m-return") populateReturnItems();
        document.getElementById(id).classList.add("open");
      }
      function closeModal(id) {
        document.getElementById(id).classList.remove("open");
      }

      ["m-item", "m-cust", "m-sup", "m-sale", "m-pur", "m-return", "m-online", "m-user", "m-settings", "m-expense"].forEach(
        (id) => {
          const el = document.getElementById(id);
          if (el)
            el.addEventListener("click", (e) => {
              if (e.target.id === id) closeModal(id);
            });
        },
      );

      // ===== RENDER =====
      function renderAll() {
        renderInv();
        renderSales();
        renderPur();
        renderReturns();
        renderOnlineOrders();
        renderShipping();
        renderBarcodeCart();
        renderExpenses();
        renderCust();
        renderSup();
        renderDash();
        renderLowStock();
        renderStockMoves();
        renderReports();
        renderClosing();
        renderMoney();
        renderAlerts();
        renderEmployees();
        renderActivity();
        renderArchive();
        applyBrandSettings();
        renderUsers();
        applyAccessControl();
        runSystemCheck(true);
        queueDecorateTables();
      }

      const CAT_ICON = {
        تيشيرتات: "👕",
        بناطيل: "👖",
        فساتين: "👗",
        جاكيتات: "🧥",
        بلوزات: "👚",
        أخرى: "👔",
      };
      const GENDER_BADGE = {
        حريمي: "badge-purple",
        رجالي: "badge-blue",
        "أطفال بنات": "badge-purple",
        "أطفال ولاد": "badge-orange",
        يونيسيكس: "badge-green",
      };

      function applyThemeMode(mode = localStorage.getItem(THEME_KEY) || "pro") {
        document.body.classList.toggle("pro-theme", mode === "pro");
        const btn = document.getElementById("theme-toggle");
        if (btn) btn.textContent = mode === "pro" ? "وضع فاتح" : "وضع احترافي";
      }

      function toggleThemeMode() {
        const next = document.body.classList.contains("pro-theme") ? "light" : "pro";
        localStorage.setItem(THEME_KEY, next);
        applyThemeMode(next);
        renderDashboardChart();
      }

      function setDashboardMetric(metric) {
        dashboardMetric = metric;
        document.querySelectorAll(".dashboard-metric").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.metric === metric);
        });
        renderDashboardChart();
      }

      function lastDays(count) {
        const days = [];
        const now = new Date();
        for (let i = count - 1; i >= 0; i -= 1) {
          const d = new Date(now);
          d.setDate(now.getDate() - i);
          days.push(d.toISOString().slice(0, 10));
        }
        return days;
      }

      function renderDashboardChart() {
        const chart = document.getElementById("dashboard-chart");
        if (!chart) return;
        const days = lastDays(14);
        const rows = days.map((date) => {
          const sales = DB.sales.filter((x) => x.date === date);
          const orders = (DB.onlineOrders || []).filter((x) => String(x.date || x.createdAt || "").slice(0, 10) === date);
          const totalSales = sales.reduce((s, x) => s + (+x.total || 0), 0);
          const profit = sales.reduce((s, x) => s + (+x.profit || 0), 0);
          const value = dashboardMetric === "profit" ? profit : dashboardMetric === "orders" ? orders.length + sales.length : totalSales;
          return { date, value };
        });
        const max = Math.max(...rows.map((x) => x.value), 1);
        const width = 920;
        const height = 260;
        const pad = 26;
        const step = (width - pad * 2) / Math.max(rows.length - 1, 1);
        const points = rows.map((row, index) => {
          const x = pad + index * step;
          const y = height - pad - (row.value / max) * (height - pad * 2);
          return { ...row, x, y };
        });
        const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
        const labels = points
          .filter((_, i) => i % 3 === 0 || i === points.length - 1)
          .map((p) => `<text x="${p.x}" y="${height - 6}" text-anchor="middle">${p.date.slice(5)}</text>`)
          .join("");
        const dots = points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4"><title>${p.date}: ${dashboardMetric === "orders" ? p.value : money(p.value)}</title></circle>`).join("");
        chart.innerHTML = `
          <defs>
            <linearGradient id="dashArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="currentColor" stop-opacity=".35"></stop>
              <stop offset="100%" stop-color="currentColor" stop-opacity=".02"></stop>
            </linearGradient>
          </defs>
          <g class="chart-grid">
            <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}"></line>
            <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"></line>
            <line x1="${pad}" y1="${height / 2}" x2="${width - pad}" y2="${height / 2}"></line>
          </g>
          <polygon class="chart-area" points="${area}"></polygon>
          <polyline class="chart-line" points="${line}"></polyline>
          <g class="chart-dots">${dots}</g>
          <g class="chart-labels">${labels}</g>
        `;
      }

      function renderDash() {
        const totSales = DB.sales.reduce((s, x) => s + +x.total, 0);
        const totPur = DB.purchases.reduce((s, x) => s + +x.total, 0);
        const totRet = DB.returns.reduce((s, x) => s + +x.total, 0);
        const totExp = (DB.expenses || []).reduce((s, x) => s + (+x.amount || 0), 0);
        const lowCount = DB.items.filter((i) => i.qty <= i.minQty).length;
        const profit = DB.sales.reduce((s, x) => s + (+x.profit || 0), 0) - totExp;
        document.getElementById("d-sales").textContent =
          money(totSales);
        document.getElementById("d-pur").textContent =
          money(totPur);
        document.getElementById("d-ret").textContent =
          money(totRet);
        document.getElementById("d-low").textContent = lowCount;
        const profitEl = document.getElementById("d-profit");
        if (profitEl) profitEl.textContent = can("viewProfit") ? money(profit) : "مخفي";
        const openOrders = (DB.onlineOrders || []).filter((o) => !["تم التسليم", "ملغي", "مرتجع"].includes(o.status)).length;
        const dueOrders = (DB.onlineOrders || []).filter((o) => (+o.due || 0) > 0 && o.status !== "ملغي").length;
        const outItems = DB.items.filter((i) => (+i.qty || 0) <= 0).length;
        const liveOpen = document.getElementById("live-open-orders");
        const liveDue = document.getElementById("live-due-orders");
        const liveOut = document.getElementById("live-out-items");
        if (liveOpen) liveOpen.textContent = openOrders.toLocaleString("ar-EG");
        if (liveDue) liveDue.textContent = dueOrders.toLocaleString("ar-EG");
        if (liveOut) liveOut.textContent = outItems.toLocaleString("ar-EG");
        renderDashboardChart();
        const activityTb = document.getElementById("d-activity");
        if (activityTb) {
          const logs = [...(DB.activityLog || [])].reverse().slice(0, 6);
          activityTb.innerHTML = logs.length
            ? logs
                .map((log) => `<tr><td><strong>${log.user || "غير محدد"}</strong></td><td>${log.action || "عملية"}</td><td>${log.details || log.target || "—"}</td><td>${formatDateTime(log.date)}</td></tr>`)
                .join("")
            : '<tr class="empty-row"><td colspan="4">لا توجد عمليات مسجلة بعد</td></tr>';
        }
        const all = [
          ...DB.sales.map((x) => ({ ...x, _type: "مبيعات" })),
          ...DB.purchases.map((x) => ({ ...x, _type: "مشتريات" })),
          ...DB.returns.map((x) => ({
            id: x.id,
            party: x.itemName,
            date: x.date,
            total: x.total,
            _type: "مرتجع",
          })),
        ]
          .slice(-8)
          .reverse();
        const tb = document.getElementById("d-ops");
        if (!all.length) {
          tb.innerHTML =
            '<tr class="empty-row"><td colspan="5">لا توجد عمليات بعد</td></tr>';
          return;
        }
        tb.innerHTML = all
          .map((x) => {
            const badge =
              x._type === "مبيعات"
                ? "badge-green"
                : x._type === "مشتريات"
                  ? "badge-blue"
                  : "badge-orange";
            return `<tr><td><strong>${x.id || "—"}</strong></td><td><span class="badge ${badge}">${x._type}</span></td><td>${x.party || "—"}</td><td>${money(+x.total || 0)}</td><td>${x.date || "—"}</td></tr>`;
          })
          .join("");
      }

      function setReportRange(type) {
        const from = document.getElementById("rep-from");
        const to = document.getElementById("rep-to");
        if (!from || !to) return;
        const now = new Date();
        const iso = (d) => d.toISOString().slice(0, 10);
        if (type === "today") {
          const d = iso(now);
          from.value = d;
          to.value = d;
        } else if (type === "month") {
          from.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
          to.value = iso(now);
        } else {
          from.value = "";
          to.value = "";
        }
        renderReports();
      }

      function saleInRange(sale) {
        const from = document.getElementById("rep-from")?.value;
        const to = document.getElementById("rep-to")?.value;
        if (from && sale.date < from) return false;
        if (to && sale.date > to) return false;
        return true;
      }
      function rowMatches(row, query, fields) {
        const q = String(query || "").trim().toLowerCase();
        if (!q) return true;
        return fields.some((field) => String(row[field] || "").toLowerCase().includes(q));
      }

      function renderReports() {
        if (!document.getElementById("r-sales")) return;
        const q = (document.getElementById("rep-search")?.value || "").trim().toLowerCase();
        const sales = DB.sales.filter(saleInRange).filter((x) => !q || [x.id, x.party, x.date, x.items, x.source].some((v) => String(v || "").toLowerCase().includes(q)));
        const total = sales.reduce((s, x) => s + (+x.total || 0), 0);
        const periodExpenses = (DB.expenses || []).filter((e) => saleInRange({ date: e.date || "" })).reduce((s, e) => s + (+e.amount || 0), 0);
        const profit = sales.reduce((s, x) => s + (+x.profit || 0), 0) - periodExpenses;
        const qty = sales.reduce((s, x) => s + (+x.qtyTotal || 0), 0);
        const onlineSales = sales.filter((x) => x.source === "online");
        const regularSales = sales.filter((x) => x.source !== "online");
        const onlineTotal = onlineSales.reduce((s, x) => s + (+x.total || 0), 0);
        const regularTotal = regularSales.reduce((s, x) => s + (+x.total || 0), 0);
        const ordersInRange = (DB.onlineOrders || []).filter((o) => saleInRange({ date: o.date || "" }));
        document.getElementById("r-sales").textContent =
          money(total);
        document.getElementById("r-profit").textContent =
          can("viewProfit") ? money(profit) : "مخفي";
        document.getElementById("r-count").textContent =
          sales.length.toLocaleString("ar-EG");
        document.getElementById("r-qty").textContent =
          qty.toLocaleString("ar-EG");
        document.getElementById("r-regular").textContent =
          money(regularTotal);
        document.getElementById("r-online").textContent =
          money(onlineTotal);
        document.getElementById("r-orders").textContent =
          ordersInRange.length.toLocaleString("ar-EG");
        const stockCost = DB.items.reduce((s, i) => s + (+i.qty || 0) * (+i.cost || 0), 0);
        const stockSale = DB.items.reduce((s, i) => s + (+i.qty || 0) * (+i.price || 0), 0);
        const stockMargin = stockSale - stockCost;
        const stockCostEl = document.getElementById("r-stock-cost");
        const stockSaleEl = document.getElementById("r-stock-sale");
        const stockMarginEl = document.getElementById("r-stock-margin");
        if (stockCostEl) stockCostEl.textContent = can("viewProfit") ? money(stockCost) : "مخفي";
        if (stockSaleEl) stockSaleEl.textContent = money(stockSale);
        if (stockMarginEl) stockMarginEl.textContent = can("viewProfit") ? money(stockMargin) : "مخفي";

        const itemMap = {};
        sales.forEach((sale) => {
          const lines =
            sale.lineItems && sale.lineItems.length ? sale.lineItems : [];
          lines.forEach((line) => {
            const key = lineDisplayName(line) || "صنف غير محدد";
            if (!itemMap[key])
              itemMap[key] = { name: key, qty: 0, total: 0, profit: 0 };
            itemMap[key].qty += +line.qty || 0;
            itemMap[key].total += +line.sub || 0;
            itemMap[key].profit += +line.profit || 0;
          });
        });
        const itemRows = Object.values(itemMap)
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 10);
        const itemTb = document.getElementById("r-items");
        itemTb.innerHTML = itemRows.length
          ? itemRows
              .map(
                (i) =>
                  `<tr><td>${i.name}</td><td>${i.qty.toLocaleString("ar-EG")}</td><td>${money(i.total)}</td><td>${can("viewProfit") ? money(i.profit) : "مخفي"}</td></tr>`,
              )
              .join("")
          : '<tr class="empty-row"><td colspan="4">لا توجد بيانات في الفترة</td></tr>';

        const invTb = document.getElementById("r-invoices");
        invTb.innerHTML = sales.length
          ? [...sales]
              .reverse()
              .map(
                (x) =>
                  `<tr><td><strong>${x.id}</strong></td><td>${x.party || "نقدي"}</td><td>${x.date || "—"}</td><td>${(+x.qtyTotal || 0).toLocaleString("ar-EG")}</td><td>${money(+x.total || 0)}</td><td>${can("viewProfit") ? money(+x.profit || 0) : "مخفي"}</td></tr>`,
              )
              .join("")
          : '<tr class="empty-row"><td colspan="6">لا توجد فواتير في الفترة</td></tr>';

        const channelMap = {
          "بيع عادي": regularSales,
          "أونلاين": onlineSales,
        };
        const channelTb = document.getElementById("r-channels");
        if (channelTb) {
          channelTb.innerHTML = Object.entries(channelMap)
            .map(([name, rows]) => {
              const rowTotal = rows.reduce((s, x) => s + (+x.total || 0), 0);
              const rowProfit = rows.reduce((s, x) => s + (+x.profit || 0), 0);
              return `<tr><td>${name}</td><td>${rows.length.toLocaleString("ar-EG")}</td><td>${money(rowTotal)}</td><td>${can("viewProfit") ? money(rowProfit) : "مخفي"}</td></tr>`;
            })
            .join("");
        }

        const userMap = {};
        (DB.activityLog || []).forEach((log) => {
          const logDate = String(log.date || "").slice(0, 10);
          if ((document.getElementById("rep-from")?.value && logDate < document.getElementById("rep-from").value) || (document.getElementById("rep-to")?.value && logDate > document.getElementById("rep-to").value)) return;
          const user = log.user || "غير محدد";
          if (!userMap[user]) userMap[user] = { user, count: 0, last: "", date: "" };
          userMap[user].count += 1;
          if (!userMap[user].date || String(log.date || "") > userMap[user].date) {
            userMap[user].last = log.action || "";
            userMap[user].date = log.date || "";
          }
        });
        const userRows = Object.values(userMap).sort((a, b) => b.count - a.count).slice(0, 10);
        const usersTb = document.getElementById("r-users");
        if (usersTb) {
          usersTb.innerHTML = userRows.length
            ? userRows.map((u) => `<tr><td>${u.user}</td><td>${u.count.toLocaleString("ar-EG")}</td><td>${u.last || "—"}</td><td>${formatDateTime(u.date)}</td></tr>`).join("")
            : '<tr class="empty-row"><td colspan="4">لا توجد عمليات في الفترة</td></tr>';
        }

        const empMap = {};
        sales.forEach((sale) => {
          const log = findActivityFor(sale.id, ["إضافة فاتورة", "حفظ فاتورة", "بيع"]);
          const user = (sale.user || (log && log.user) || "غير محدد");
          empMap[user] ||= { user, count: 0, total: 0, profit: 0 };
          empMap[user].count += 1;
          empMap[user].total += +sale.total || 0;
          empMap[user].profit += +sale.profit || 0;
        });
        const empTb = document.getElementById("r-employee-profit");
        if (empTb) {
          const rows = Object.values(empMap).sort((a, b) => b.total - a.total);
          empTb.innerHTML = rows.length
            ? rows.map((r) => `<tr><td>${r.user}</td><td>${r.count.toLocaleString("ar-EG")}</td><td>${money(r.total)}</td><td>${can("viewProfit") ? money(r.profit) : "مخفي"}</td><td>${money(r.count ? r.total / r.count : 0)}</td></tr>`).join("")
            : '<tr class="empty-row"><td colspan="5">لا توجد بيانات في الفترة</td></tr>';
        }
      }

      function findActivityFor(target, hints = []) {
        const t = String(target || "");
        return [...(DB.activityLog || [])].reverse().find((log) => {
          const targetOk = String(log.target || "").includes(t) || String(log.details || "").includes(t);
          const hintOk = !hints.length || hints.some((h) => String(log.action || "").includes(h));
          return targetOk && hintOk;
        });
      }

      function stockMoveKey(row) {
        return [row.type, row.ref, row.code, row.qty].map((x) => String(x || "")).join("::");
      }

      function hiddenStockMoveKeys() {
        try {
          return new Set(JSON.parse(brandValue("stockMovesHiddenKeys", "[]")) || []);
        } catch (e) {
          return new Set();
        }
      }

      function rawStockMoveRows() {
        const rows = [];
        const addLine = (date, type, ref, line, qty, user = "") => {
          if (!line) return;
          rows.push({
            date: date || "",
            type,
            ref,
            code: line.code || "",
            item: lineDisplayName(line) || line.name || line.code || "صنف غير محدد",
            qty: +qty || 0,
            user: user || (findActivityFor(ref) || {}).user || "غير محدد",
          });
        };
        (DB.purchases || []).forEach((pur) => (pur.lineItems || []).forEach((line) => addLine(pur.date, "شراء", pur.id, line, +line.qty || 0)));
        (DB.sales || []).filter((sale) => sale.source !== "online").forEach((sale) => (sale.lineItems || []).forEach((line) => addLine(sale.date, sale.source === "barcode" ? "بيع باركود" : "بيع", sale.id, line, -(+line.qty || 0))));
        (DB.onlineOrders || []).filter((o) => o.reserved && !["ملغي", "مرتجع"].includes(o.status)).forEach((o) => (o.lineItems || []).forEach((line) => addLine(o.date, "حجز أونلاين", o.id, line, -(+line.qty || 0))));
        (DB.returns || []).forEach((ret) => {
          const line = { code: ret.code, name: ret.itemName, qty: ret.qty };
          addLine(ret.date, ret.type === "مشتريات" ? "مرتجع مشتريات" : "مرتجع مبيعات", ret.id, line, ret.type === "مشتريات" ? -(+ret.qty || 0) : (+ret.qty || 0));
        });
        return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.ref).localeCompare(String(a.ref)));
      }

      function stockMoveRows() {
        const hidden = hiddenStockMoveKeys();
        return rawStockMoveRows().filter((row) => !hidden.has(stockMoveKey(row)));
      }

      function renderStockMoves() {
        const tb = document.getElementById("stockmoves-table");
        if (!tb) return;
        const q = String(document.getElementById("stockmoves-search")?.value || "").trim().toLowerCase();
        const rows = stockMoveRows().filter((r) => !q || [r.date, r.type, r.ref, r.item, r.code, r.user].some((v) => String(v || "").toLowerCase().includes(q)));
        const inQty = rows.filter((r) => r.qty > 0).reduce((s, r) => s + r.qty, 0);
        const outQty = Math.abs(rows.filter((r) => r.qty < 0).reduce((s, r) => s + r.qty, 0));
        [["sm-in", inQty], ["sm-out", outQty], ["sm-net", inQty - outQty], ["sm-count", rows.length]].forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.textContent = (+val || 0).toLocaleString("ar-EG"); });
        tb.innerHTML = rows.length
          ? rows.slice(0, 400).map((r) => `<tr><td>${r.date || "—"}</td><td><span class="badge ${r.qty < 0 ? "badge-orange" : "badge-green"}">${r.type}</span></td><td>${r.ref || "—"}</td><td>${r.item}</td><td>${r.code || "—"}</td><td style="font-weight:900;color:${r.qty < 0 ? "var(--orange)" : "var(--green)"}">${r.qty > 0 ? "+" : ""}${r.qty.toLocaleString("ar-EG")}</td><td>${r.user}</td></tr>`).join("")
          : '<tr class="empty-row"><td colspan="7">لا توجد حركة مخزون</td></tr>';
        queueDecorateTables();
      }

      function exportStockMovesCsv() {
        exportRowsCsv("molver_stock_movement_" + today() + ".csv", ["date", "type", "ref", "item", "code", "qty", "user"], stockMoveRows().map((r) => [r.date, r.type, r.ref, r.item, r.code, r.qty, r.user]));
      }

      function clearStockMoves() {
        if (!requireAction("clearStockMoves")) return;
        const rows = stockMoveRows();
        if (!rows.length) return toast("لا توجد حركة مخزون لمسحها");
        if (!confirm("مسح سجل حركة المخزون من العرض؟ لن يتم حذف الفواتير أو المشتريات أو تعديل المخزون.")) return;
        const hidden = hiddenStockMoveKeys();
        rows.forEach((row) => hidden.add(stockMoveKey(row)));
        setBrandValue("stockMovesHiddenKeys", JSON.stringify([...hidden]));
        logActivity("مسح سجل حركة المخزون", "Stock Movement", `${rows.length} حركة`);
        saveDB();
        renderStockMoves();
        toast("✓ تم مسح سجل حركة المخزون من العرض");
      }

      function setClosingToday() {
        const el = document.getElementById("closing-date");
        if (el) el.value = today();
        renderClosing();
      }

      function closingRows(date) {
        const d = date || today();
        const rows = [];
        (DB.sales || []).filter((s) => String(s.date || "").slice(0, 10) === d).forEach((s) => rows.push({ type: s.source === "online" ? "بيع أونلاين" : "بيع", id: s.id, party: s.party, total: +s.total || 0, paid: +s.paid || 0, due: +s.due || 0 }));
        (DB.onlineOrders || []).filter((o) => String(o.date || "").slice(0, 10) === d && !o.saleId).forEach((o) => rows.push({ type: "طلب أونلاين", id: o.id, party: o.customerName, total: +o.total || 0, paid: +o.paid || 0, due: +o.due || 0 }));
        (DB.expenses || []).filter((e) => String(e.date || "").slice(0, 10) === d).forEach((e) => rows.push({ type: "مصروف", id: e.id, party: e.name, total: +e.amount || 0, paid: +e.amount || 0, due: 0, expense: true }));
        return rows;
      }

      function renderClosing() {
        const dateEl = document.getElementById("closing-date");
        if (!dateEl) return;
        if (!dateEl.value) dateEl.value = today();
        const rows = closingRows(dateEl.value);
        const sales = rows.filter((r) => !r.expense).reduce((s, r) => s + r.total, 0);
        const paid = rows.filter((r) => !r.expense).reduce((s, r) => s + r.paid, 0);
        const exp = rows.filter((r) => r.expense).reduce((s, r) => s + r.total, 0);
        const due = rows.filter((r) => !r.expense).reduce((s, r) => s + r.due, 0);
        const open = (DB.onlineOrders || []).filter((o) => !["تم التسليم", "ملغي", "مرتجع"].includes(o.status)).length;
        [["cl-sales", sales], ["cl-paid", paid], ["cl-exp", exp], ["cl-net", paid - exp], ["cl-due", due]].forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.textContent = money(val); });
        const openEl = document.getElementById("cl-open"); if (openEl) openEl.textContent = open.toLocaleString("ar-EG");
        const tb = document.getElementById("closing-table");
        if (tb) tb.innerHTML = rows.length ? rows.map((r) => `<tr><td>${r.type}</td><td><strong>${r.id}</strong></td><td>${r.party || "—"}</td><td>${money(r.total)}</td><td>${money(r.paid)}</td><td>${money(r.due)}</td></tr>`).join("") : '<tr class="empty-row"><td colspan="6">لا توجد عمليات في هذا اليوم</td></tr>';
        queueDecorateTables();
      }

      function lockClosingDay() {
        if (!requireAction("unlockClosing")) return;
        const date = document.getElementById("closing-date")?.value || today();
        const dates = lockedClosingDates();
        dates.add(date);
        setBrandValue("lockedClosingDates", JSON.stringify([...dates]));
        logActivity("قفل يومية", date, "منع التعديل بعد التقفيل");
        saveDB();
        renderClosing();
        toast("✓ تم قفل اليومية");
      }

      function unlockClosingDay() {
        if (!requireAction("unlockClosing")) return;
        const date = document.getElementById("closing-date")?.value || today();
        const dates = lockedClosingDates();
        dates.delete(date);
        setBrandValue("lockedClosingDates", JSON.stringify([...dates]));
        logActivity("فتح يومية", date, "السماح بالتعديل");
        saveDB();
        renderClosing();
        toast("✓ تم فتح اليومية");
      }

      function printClosing() {
        const date = document.getElementById("closing-date")?.value || today();
        const rows = closingRows(date);
        const total = rows.filter((r) => !r.expense).reduce((s, r) => s + r.total, 0);
        const tableRows = rows.map((r) => `<tr><td>${r.type}</td><td>${r.id}</td><td>${money(r.total)}</td><td>${money(r.paid)}</td></tr>`).join("");
        printDocument("تقفيل يومية " + date, [["التاريخ", date], ["عدد العمليات", rows.length], ["إجمالي المبيعات", money(total)]], tableRows, total);
      }

      function moneyRows() {
        const rows = [];
        (DB.onlineOrders || []).filter((o) => (+o.due || 0) > 0 && !["ملغي", "مرتجع"].includes(o.status)).forEach((o) => rows.push({ type: "طلب أونلاين", id: o.id, party: o.customerName, ship: o.shippingCompany || "—", date: o.date, due: +o.due || 0, status: o.status || "—", action: "shipping" }));
        (DB.sales || []).filter((s) => (+s.due || 0) > 0).forEach((s) => rows.push({ type: "فاتورة", id: s.id, party: s.party, ship: "—", date: s.date, due: +s.due || 0, status: s.paymentStatus || "آجل", action: "sales" }));
        return rows.sort((a, b) => b.due - a.due);
      }

      function renderMoney() {
        const tb = document.getElementById("money-table");
        if (!tb) return;
        const q = String(document.getElementById("money-search")?.value || "").trim().toLowerCase();
        const rows = moneyRows().filter((r) => !q || [r.type, r.id, r.party, r.ship, r.status].some((v) => String(v || "").toLowerCase().includes(q)));
        const late = rows.filter((r) => r.date && (Date.now() - new Date(r.date).getTime()) / 86400000 >= 3).length;
        [["money-total", money(rows.reduce((s, r) => s + r.due, 0))], ["money-orders", rows.filter((r) => r.type.includes("أونلاين")).length.toLocaleString("ar-EG")], ["money-sales", rows.filter((r) => r.type === "فاتورة").length.toLocaleString("ar-EG")], ["money-late", late.toLocaleString("ar-EG")]].forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.textContent = val; });
        tb.innerHTML = rows.length
          ? rows.map((r) => `<tr><td>${r.type}</td><td><strong>${r.id}</strong></td><td>${r.party || "—"}</td><td>${r.ship}</td><td>${r.date || "—"}</td><td>${money(r.due)}</td><td><span class="badge ${r.date && (Date.now() - new Date(r.date).getTime()) / 86400000 >= 3 ? "badge-red" : "badge-orange"}">${r.status}</span></td><td><button class="btn btn-sm" onclick="openMoneyRef('${r.action}')">فتح</button></td></tr>`).join("")
          : '<tr class="empty-row"><td colspan="8">لا توجد تحصيلات معلقة</td></tr>';
        queueDecorateTables();
      }

      function openMoneyRef(page) {
        const nav = [...document.querySelectorAll(".nav-item")].find((n) => getNavPage(n) === page);
        go(page, nav);
      }

      function exportMoneyCsv() {
        exportRowsCsv("molver_uncollected_" + today() + ".csv", ["type", "id", "party", "shipping", "date", "due", "status"], moneyRows().map((r) => [r.type, r.id, r.party, r.ship, r.date, r.due, r.status]));
      }

      function exportProfitCsv() {
        const sales = DB.sales.filter(saleInRange);
        exportRowsCsv("molver_profit_" + today() + ".csv", ["id", "date", "customer", "source", "total", "profit", "qty"], sales.map((s) => [s.id, s.date, s.party, s.source || "regular", +s.total || 0, +s.profit || 0, +s.qtyTotal || 0]));
      }

      function renderActivity() {
        const tb = document.getElementById("activity-table");
        if (!tb) return;
        const filterEl = document.getElementById("activity-user-filter");
        const search = String(document.getElementById("activity-search")?.value || "").trim().toLowerCase();
        const logs = [...(DB.activityLog || [])].reverse();
        const users = [...new Set(logs.map((x) => x.user || "غير محدد"))].sort();
        const selected = filterEl ? filterEl.value : "";
        if (filterEl) {
          const old = filterEl.value;
          filterEl.innerHTML = '<option value="">كل المستخدمين</option>' + users.map((u) => `<option value="${u}">${u}</option>`).join("");
          filterEl.value = users.includes(old) ? old : selected;
        }
        const data = logs.filter((log) => {
          const userOk = !filterEl?.value || log.user === filterEl.value;
          const haystack = [log.user, log.action, log.target, log.details, formatDateTime(log.date)].join(" ").toLowerCase();
          return userOk && (!search || haystack.includes(search));
        });
        tb.innerHTML = data.length
          ? data
              .slice(0, 300)
              .map(
                (log) => `<tr>
                  <td>${formatDateTime(log.date)}</td>
                  <td><strong>${log.user || "غير محدد"}</strong></td>
                  <td><span class="badge badge-blue">${log.action || "عملية"}</span></td>
                  <td>${log.target || "—"}</td>
                  <td>${log.details || "—"}</td>
                </tr>`,
              )
              .join("")
          : '<tr class="empty-row"><td colspan="5">لا توجد عمليات مطابقة</td></tr>';
      }

      function exportActivityCsv() {
        const headers = ["time", "user", "action", "target", "details"];
        const rows = (DB.activityLog || []).map((log) => [
          formatDateTime(log.date),
          log.user || "",
          log.action || "",
          log.target || "",
          log.details || "",
        ]);
        const csv = [headers, ...rows]
          .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
          .join("\n");
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "molver_activity_" + today() + ".csv";
        a.click();
        URL.revokeObjectURL(a.href);
        toast("✓ تم تصدير سجل النشاط");
      }

      function clearActivityLog() {
        if (!requireAction("delete")) return;
        if (!confirm("مسح سجل النشاط بالكامل؟")) return;
        DB.activityLog = [];
        logActivity("مسح سجل النشاط", "ActivityLog", activeUserName());
        saveDB();
        renderActivity();
        renderDash();
        toast("✓ تم مسح سجل النشاط");
      }

      function exportRowsCsv(filename, headers, rows) {
        const csv = [headers, ...rows]
          .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
          .join("\n");
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      }

      function daysAgo(date) {
        const d = new Date(date || today());
        return Math.floor((Date.now() - d.getTime()) / 86400000);
      }

      function buildAlerts() {
        const alerts = [];
        DB.items.forEach((i) => {
          if ((+i.qty || 0) <= 0) alerts.push({ level: "err", type: "مخزون", title: "صنف نفد", detail: `${i.name} (${i.size || ""} - ${i.color || ""})`, action: "lowstock" });
          else if ((+i.qty || 0) <= (+i.minQty || 0)) alerts.push({ level: "warn", type: "مخزون", title: "مخزون منخفض", detail: `${i.name}: ${i.qty} متاح`, action: "lowstock" });
        });
        DB.sales.filter((s) => (+s.due || 0) > 0).forEach((s) => alerts.push({ level: daysAgo(s.date) > 3 ? "err" : "warn", type: "تحصيل", title: "فاتورة عليها باقي", detail: `${s.id} - ${s.party} - ${money(s.due)}`, action: "sales" }));
        (DB.onlineOrders || []).forEach((o) => {
          if ((+o.due || 0) > 0 && !["ملغي", "مرتجع"].includes(o.status)) alerts.push({ level: "warn", type: "تحصيل", title: "طلب عليه تحصيل", detail: `${o.id} - ${o.customerName} - ${money(o.due)}`, action: "shipping" });
          if (!["تم التسليم", "ملغي", "مرتجع"].includes(o.status) && daysAgo(o.date) > 3) alerts.push({ level: "err", type: "طلبات", title: "طلب متأخر", detail: `${o.id} - ${o.customerName} - ${o.status}`, action: "online" });
        });
        return alerts;
      }

      function renderAlerts() {
        const list = document.getElementById("alerts-list");
        if (!list) return;
        const alerts = buildAlerts();
        const critical = alerts.filter((a) => a.level === "err").length;
        const out = DB.items.filter((i) => (+i.qty || 0) <= 0).length;
        const due = alerts.filter((a) => a.type === "تحصيل").length;
        const late = alerts.filter((a) => a.title === "طلب متأخر").length;
        [["a-critical", critical], ["a-out", out], ["a-due", due], ["a-orders", late]].forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.textContent = val.toLocaleString("ar-EG"); });
        const badge = document.getElementById("alerts-badge");
        if (badge) {
          badge.textContent = alerts.length > 99 ? "99+" : alerts.length.toLocaleString("ar-EG");
          badge.classList.toggle("hot", critical > 0);
          badge.classList.toggle("empty", alerts.length === 0);
        }
        list.innerHTML = alerts.length ? alerts.map((a) => `<div class="alert-item ${a.level}"><div><strong>${a.title}</strong><span>${a.type} - ${a.detail}</span></div><button class="btn btn-sm" onclick="go('${a.action}', document.querySelector('[onclick*=${a.action}]'))">فتح</button></div>`).join("") : '<div class="health-item ok">لا توجد تنبيهات حالياً</div>';
      }

      function setEmployeeRange(type) {
        const from = document.getElementById("emp-from");
        const to = document.getElementById("emp-to");
        if (!from || !to) return;
        const now = new Date();
        const iso = (d) => d.toISOString().slice(0, 10);
        if (type === "today") { from.value = iso(now); to.value = iso(now); }
        if (type === "month") { from.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`; to.value = iso(now); }
        renderEmployees();
      }

      function employeeRows() {
        const from = document.getElementById("emp-from")?.value || "";
        const to = document.getElementById("emp-to")?.value || "";
        const map = {};
        const add = (user, patch) => {
          const key = user || "غير محدد";
          map[key] ||= { user: key, actions: 0, salesCount: 0, salesTotal: 0, online: 0, returns: 0, last: "" };
          Object.assign(map[key], patch(map[key]));
        };
        (DB.activityLog || []).forEach((log) => {
          const d = String(log.date || "").slice(0, 10);
          if ((from && d < from) || (to && d > to)) return;
          add(log.user, (r) => ({ actions: r.actions + 1, last: !r.last || String(log.date || "") > r.last ? log.date : r.last }));
          if (String(log.action || "").includes("أونلاين")) add(log.user, (r) => ({ online: r.online + 1 }));
          if (String(log.action || "").includes("مرتجع")) add(log.user, (r) => ({ returns: r.returns + 1 }));
        });
        DB.sales.forEach((sale) => {
          const d = sale.date || "";
          if ((from && d < from) || (to && d > to)) return;
          const log = (DB.activityLog || []).find((l) => l.target === sale.id);
          add(log && log.user, (r) => ({ salesCount: r.salesCount + 1, salesTotal: r.salesTotal + (+sale.total || 0) }));
        });
        return Object.values(map).sort((a, b) => b.salesTotal - a.salesTotal || b.actions - a.actions);
      }

      function renderEmployees() {
        const tb = document.getElementById("employees-table");
        if (!tb) return;
        const rows = employeeRows();
        tb.innerHTML = rows.length ? rows.map((r) => `<tr><td><strong>${r.user}</strong></td><td>${r.actions}</td><td>${r.salesCount}</td><td>${money(r.salesTotal)}</td><td>${r.online}</td><td>${r.returns}</td><td>${formatDateTime(r.last)}</td></tr>`).join("") : '<tr class="empty-row"><td colspan="7">لا توجد بيانات في الفترة</td></tr>';
        const timeline = document.getElementById("employee-timeline");
        if (timeline) {
          const from = document.getElementById("emp-from")?.value || "";
          const to = document.getElementById("emp-to")?.value || "";
          const logs = [...(DB.activityLog || [])].reverse().filter((log) => {
            const d = String(log.date || "").slice(0, 10);
            return (!from || d >= from) && (!to || d <= to);
          }).slice(0, 40);
          timeline.innerHTML = logs.length
            ? `<div class="timeline-title">آخر نشاط الموظفين</div>` + logs.map((log) => `<div class="timeline-row"><span>${formatDateTime(log.date)}</span><strong>${log.user || "غير محدد"}</strong><em>${log.action || "عملية"}</em><small>${log.target || ""} ${log.details || ""}</small></div>`).join("")
            : '<div class="timeline-empty">لا يوجد نشاط في الفترة</div>';
        }
      }

      function exportEmployeeCsv() {
        exportRowsCsv("molver_employee_performance_" + today() + ".csv", ["user", "actions", "salesCount", "salesTotal", "online", "returns", "last"], employeeRows().map((r) => [r.user, r.actions, r.salesCount, r.salesTotal, r.online, r.returns, formatDateTime(r.last)]));
      }

      function archiveOldRecords() {
        if (!requireAction("archive")) return;
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
        DB.archivedRecords = DB.archivedRecords || [];
        let count = 0;
        const archiveFrom = (key, label) => {
          const keep = [];
          (DB[key] || []).forEach((row) => {
            const d = new Date(row.date || row.createdAt || row.savedAt || "");
            if (d && !Number.isNaN(d.getTime()) && d < cutoff) {
              DB.archivedRecords.push({ id: "ARC-" + Date.now() + "-" + count, type: key, refId: row.id || "", title: label, details: row.party || row.customerName || row.action || "", json: row, archivedAt: new Date().toISOString() });
              count += 1;
            } else keep.push(row);
          });
          DB[key] = keep;
        };
        archiveFrom("sales", "فاتورة مبيعات");
        archiveFrom("onlineOrders", "طلب أونلاين");
        if (DB.activityLog.length > 600) {
          const old = DB.activityLog.slice(0, DB.activityLog.length - 600);
          DB.activityLog = DB.activityLog.slice(-600);
          old.forEach((row) => DB.archivedRecords.push({ id: "ARC-" + Date.now() + "-" + count++, type: "activityLog", refId: row.id || "", title: "سجل نشاط", details: row.action || "", json: row, archivedAt: new Date().toISOString() }));
        }
        logActivity("أرشفة بيانات", "Archive", `${count} سجل`);
        saveDB(); renderArchive(); renderAll();
        toast(count ? `✓ تم أرشفة ${count} سجل` : "لا توجد سجلات قديمة للأرشفة");
      }

      function renderArchive() {
        const tb = document.getElementById("archive-table");
        if (!tb) return;
        const type = document.getElementById("archive-type")?.value || "";
        const data = [...(DB.archivedRecords || [])].reverse().filter((r) => !type || r.type === type);
        tb.innerHTML = data.length ? data.map((r) => `<tr><td>${formatDateTime(r.archivedAt)}</td><td>${r.title || r.type}</td><td>${r.refId || "—"}</td><td>${r.details || "—"}</td><td>${String(JSON.stringify(r.json || {})).slice(0, 120)}...</td><td><button class="btn btn-sm" onclick="restoreArchive('${r.id}')">استرجاع</button></td></tr>`).join("") : '<tr class="empty-row"><td colspan="6">لا توجد عناصر مؤرشفة</td></tr>';
      }

      function restoreArchive(id) {
        if (!requireAction("archive")) return;
        const rec = (DB.archivedRecords || []).find((r) => r.id === id);
        if (!rec || !rec.json || !Array.isArray(DB[rec.type])) return toast("⚠ لا يمكن استرجاع هذا السجل");
        const recKey = rec.json.id || rec.json.code || rec.json.login || rec.refId;
        if ((DB[rec.type] || []).some((row) => (row.id || row.code || row.login) === recKey)) return toast("⚠ السجل موجود بالفعل");
        if (String(rec.title || "").includes("سلة المهملات")) {
          if (rec.type === "sales" && rec.json.source !== "online" && !applyStockLines(rec.json.lineItems || [], -1)) return;
          if (rec.type === "purchases" && !applyStockLines(rec.json.lineItems || [], 1)) return;
          if (rec.type === "returns" && !applyReturnStock(rec.json, 1)) return;
        }
        DB[rec.type].push(rec.json);
        DB.archivedRecords = DB.archivedRecords.filter((r) => r.id !== id);
        logActivity("استرجاع من الأرشيف", rec.type, rec.refId);
        saveDB(); renderArchive(); renderAll();
        toast("✓ تم الاسترجاع");
      }

      function exportArchiveCsv() {
        exportRowsCsv("molver_archive_" + today() + ".csv", ["archivedAt", "type", "refId", "title", "details"], (DB.archivedRecords || []).map((r) => [formatDateTime(r.archivedAt), r.type, r.refId, r.title, r.details]));
      }

      function brandValue(key, fallback = "") {
        const row = (DB.brandSettings || []).find((x) => x.key === key);
        return row ? row.value : fallback;
      }

      function setBrandValue(key, value) {
        DB.brandSettings = DB.brandSettings || [];
        const row = DB.brandSettings.find((x) => x.key === key);
        if (row) row.value = value;
        else DB.brandSettings.push({ key, value });
      }

      function applyBrandSettings() {
        const name = brandValue("name", "MOLVER");
        document.querySelectorAll(".logo-title").forEach((el) => (el.textContent = name));
        document.documentElement.style.setProperty("--accent", brandValue("accent", "#c17b3f"));
      }

      function renderBrandSettings() {
        const name = brandValue("name", "MOLVER");
        const phone = brandValue("phone", "");
        const address = brandValue("address", "");
        const accent = brandValue("accent", "#c17b3f");
        const note = brandValue("note", "شكراً لتعاملكم معنا");
        [["brand-name", name], ["brand-phone", phone], ["brand-address", address], ["brand-accent", accent], ["brand-note", note]].forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val; });
        const previewName = document.getElementById("brand-preview-name");
        const previewDetails = document.getElementById("brand-preview-details");
        const previewDate = document.getElementById("brand-preview-date");
        if (previewName) previewName.textContent = name;
        if (previewDetails) previewDetails.textContent = [phone, address, note].filter(Boolean).join(" | ");
        if (previewDate) previewDate.textContent = today();
      }

      function saveBrandSettings() {
        if (!requireAction("brand")) return;
        setBrandValue("name", document.getElementById("brand-name").value.trim() || "MOLVER");
        setBrandValue("phone", document.getElementById("brand-phone").value.trim());
        setBrandValue("address", document.getElementById("brand-address").value.trim());
        setBrandValue("accent", document.getElementById("brand-accent").value || "#c17b3f");
        setBrandValue("note", document.getElementById("brand-note").value.trim());
        applyBrandSettings(); renderBrandSettings();
        logActivity("تعديل إعدادات البراند", "Brand", brandValue("name", "MOLVER"));
        saveDB();
        toast("✓ تم حفظ إعدادات البراند");
      }

      function resetBrandSettings() {
        if (!requireAction("brand")) return;
        DB.brandSettings = [];
        applyBrandSettings(); renderBrandSettings(); saveDB();
        toast("✓ تم الرجوع للإعدادات الافتراضية");
      }

      function renderInv() {
        document.getElementById("inv-loading").style.display = "none";
        document.getElementById("inv-wrap").style.display = "";
        const items = invSearch
          ? DB.items.filter(
              (i) => [i.name, i.code, i.barcode, i.cat, i.size, i.color, i.gender].some((v) => String(v || "").includes(invSearch)),
            )
          : DB.items;
        const tb = document.getElementById("inv-table");
        if (!items.length) {
          tb.innerHTML =
            '<tr class="empty-row"><td colspan="10">' +
            (DB.items.length
              ? "لا توجد نتائج"
              : "لا توجد أصناف — ابدأ بإضافة صنف") +
            "</td></tr>";
          return;
        }
        tb.innerHTML = items
          .map((i) => {
            const low = i.qty <= i.minQty;
            const st =
              i.qty === 0
                ? '<span class="badge badge-red">نفد</span>'
                : low
                  ? '<span class="badge badge-orange">منخفض</span>'
                  : '<span class="badge badge-green">متاح</span>';
            const icon = CAT_ICON[i.cat] || "👔";
            return `<tr>
      <td style="font-size:10px;color:var(--text3)">${i.code}${i.barcode ? `<div>${i.barcode}</div>` : ""}</td>
      <td><strong>${i.name}</strong>${i.notes ? `<div style="font-size:10px;color:var(--text3)">${i.notes}</div>` : ""}</td>
      <td>${icon} ${i.cat}</td><td>${i.gender || ""}</td>
      <td><span class="tag-size">${i.size}</span></td>
      <td>${i.color || "—"}</td>
      <td style="${low ? "color:var(--orange);font-weight:700" : ""}"><strong>${i.qty}</strong></td>
      <td>${money(+i.price)}</td>
      <td>${st}</td>
      <td><div class="btn-group"><button class="btn btn-sm" onclick="printItemLabel('${i.code}')">QR</button><button class="btn btn-sm" onclick="openEditItem('${i.code}')">تعديل</button><button class="btn btn-red" onclick="deleteItem('${i.code}')">حذف</button></div></td>
    </tr>`;
          })
          .join("");
      }
      function filterInv(v) {
        invSearch = v;
        renderInv();
      }

      function renderLowStock() {
        const low = DB.items.filter((i) => i.qty <= i.minQty);
        const tb = document.getElementById("low-table");
        if (!low.length) {
          tb.innerHTML =
            '<tr class="empty-row"><td colspan="8" style="color:var(--green)">✓ جميع الأصناف بمخزون كافٍ</td></tr>';
          return;
        }
        tb.innerHTML = low
          .map((i) => {
            const st =
              i.qty === 0
                ? '<span class="badge badge-red">نفد تماماً</span>'
                : '<span class="badge badge-orange">منخفض</span>';
            return `<tr><td style="font-size:10px">${i.code}</td><td>${i.name}</td><td>${i.cat}</td><td><span class="tag-size">${i.size}</span></td><td style="color:var(--orange);font-weight:700">${i.qty}</td><td>${i.minQty}</td><td>${st}</td><td><div class="btn-group"><button class="btn btn-sm" onclick="printItemLabel('${i.code}')">QR</button><button class="btn btn-sm" onclick="openEditItem('${i.code}')">تعديل</button></div></td></tr>`;
          })
          .join("");
      }

      function renderSales() {
        const tb = document.getElementById("sales-table");
        const q = document.getElementById("sales-search")?.value || "";
        const data = DB.sales.filter((x) => rowMatches(x, q, ["id", "party", "phone", "addr", "date", "items", "source"]));
        if (!data.length) {
          tb.innerHTML =
            `<tr class="empty-row"><td colspan="7">${DB.sales.length ? "لا توجد نتائج" : "لا توجد فواتير بعد"}</td></tr>`;
          return;
        }
        tb.innerHTML = [...data]
          .reverse()
          .map(
            (x) => `<tr>
    <td><strong>${x.id}</strong></td><td>${x.party || "نقدي"}</td><td>${x.date}</td>
    <td>${x.qtyTotal} قطعة</td><td>${money(+x.total)}</td>
    <td><span class="badge badge-green">مكتملة</span></td>
    <td><div class="btn-group"><button class="btn btn-sm" onclick="printSale('${x.id}')">طباعة</button><button class="btn btn-sm" onclick="openEditSale('${x.id}')">تعديل</button><button class="btn btn-red" onclick="deleteSale('${x.id}')">حذف</button></div></td></tr>`,
          )
          .join("");
      }

      function renderPur() {
        const tb = document.getElementById("pur-table");
        const q = document.getElementById("pur-search")?.value || "";
        const data = DB.purchases.filter((x) => rowMatches(x, q, ["id", "party", "date", "items"]));
        if (!data.length) {
          tb.innerHTML =
            `<tr class="empty-row"><td colspan="7">${DB.purchases.length ? "لا توجد نتائج" : "لا توجد فواتير بعد"}</td></tr>`;
          return;
        }
        tb.innerHTML = [...data]
          .reverse()
          .map(
            (x) => `<tr>
    <td><strong>${x.id}</strong></td><td>${x.party || "غير محدد"}</td><td>${x.date}</td>
    <td>${x.qtyTotal} قطعة</td><td>${money(+x.total)}</td>
    <td><span class="badge badge-blue">مكتملة</span></td>
    <td><div class="btn-group"><button class="btn btn-sm" onclick="printPurchase('${x.id}')">طباعة</button><button class="btn btn-sm" onclick="openEditPur('${x.id}')">تعديل</button><button class="btn btn-red" onclick="deletePur('${x.id}')">حذف</button></div></td></tr>`,
          )
          .join("");
      }

      function renderExpenses() {
        const tb = document.getElementById("exp-table");
        if (!tb) return;
        const q = document.getElementById("exp-search")?.value || "";
        const data = (DB.expenses || []).filter((e) => rowMatches(e, q, ["id", "name", "cat", "date", "notes"]));
        if (!data.length) {
          tb.innerHTML = `<tr class="empty-row"><td colspan="7">${(DB.expenses || []).length ? "لا توجد نتائج" : "لا توجد مصروفات بعد"}</td></tr>`;
          return;
        }
        tb.innerHTML = [...data].reverse().map((e) => `<tr>
          <td><strong>${e.id}</strong></td><td>${e.name}</td><td>${e.cat || "—"}</td>
          <td>${money(+e.amount || 0)}</td><td>${e.date || "—"}</td><td>${e.notes || "—"}</td>
          <td><div class="btn-group"><button class="btn btn-sm" onclick="printExpense('${e.id}')">طباعة</button><button class="btn btn-sm" onclick="openEditExpense('${e.id}')">تعديل</button><button class="btn btn-red" onclick="deleteExpense('${e.id}')">حذف</button></div></td>
        </tr>`).join("");
      }

      function renderReturns() {
        const tb = document.getElementById("ret-table");
        let data = DB.returns;
        if (retFilter !== "all")
          data = data.filter((r) => r.type === retFilter);
        const q = document.getElementById("ret-search")?.value || "";
        data = data.filter((r) => rowMatches(r, q, ["id", "type", "invId", "itemName", "reason", "date"]));
        if (!data.length) {
          tb.innerHTML =
            `<tr class="empty-row"><td colspan="9">${DB.returns.length ? "لا توجد نتائج" : "لا توجد مرتجعات"}</td></tr>`;
          return;
        }
        tb.innerHTML = [...data]
          .reverse()
          .map((r) => {
            const badge = r.type === "مبيعات" ? "badge-orange" : "badge-purple";
            return `<tr><td><strong>${r.id}</strong></td><td><span class="badge ${badge}">${r.type}</span></td>
      <td>${r.invId || "—"}</td><td>${r.itemName}</td><td>${r.qty}</td>
      <td>${money(+r.total)}</td><td>${r.reason}</td><td>${r.date}</td>
      <td><div class="btn-group"><button class="btn btn-sm" onclick="printReturn('${r.id}')">طباعة</button><button class="btn btn-sm" onclick="openEditReturn('${r.id}')">تعديل</button><button class="btn btn-red" onclick="deleteReturn('${r.id}')">حذف</button></div></td></tr>`;
          })
          .join("");
      }
      function filterReturns(v, el) {
        retFilter = v;
        document
          .querySelectorAll(".ftab")
          .forEach((t) => t.classList.remove("active"));
        el.classList.add("active");
        renderReturns();
      }

      let onlineFilter = "all";
      let editingOnlineId = "";
      function renderOnlineOrders() {
        const tb = document.getElementById("online-table");
        if (!tb) return;
        let data = DB.onlineOrders || [];
        if (onlineFilter !== "all") data = data.filter((o) => o.status === onlineFilter);
        const q = document.getElementById("online-search")?.value || "";
        data = data.filter((o) => rowMatches(o, q, ["id", "customerName", "phone", "phone2", "address", "source", "status", "shippingCompany", "trackingNo"]));
        renderOnlineKanban(data);
        if (!data.length) {
          tb.innerHTML = `<tr class="empty-row"><td colspan="9">${(DB.onlineOrders || []).length ? "لا توجد نتائج" : "لا توجد طلبات أونلاين"}</td></tr>`;
          return;
        }
        tb.innerHTML = [...data].reverse().map((o) => {
          const badge = o.status === "ملغي" ? "badge-red" : o.status === "تم التسليم" ? "badge-green" : o.status === "تم الشحن" ? "badge-blue" : "badge-orange";
          const statusOptions = ["جديد","تم التأكيد","جاري التجهيز","تم الشحن","تم التسليم","مرتجع","ملغي"].map((s)=>`<option ${o.status===s?"selected":""}>${s}</option>`).join("");
          return `<tr>
            <td><strong>${o.id}</strong></td><td>${o.customerName}</td><td>${o.phone}${o.phone2 ? `<div style="font-size:10px;color:var(--text3)">${o.phone2}</div>` : ""}</td><td>${o.source}</td>
            <td>${o.qtyTotal} قطعة</td><td>${money(+o.total || 0)}</td>
            <td><span class="badge ${badge}">${o.status}</span></td><td>${o.shippingCompany || "—"}</td>
            <td><div class="btn-group">
              <select onchange="changeOnlineStatus('${o.id}', this.value)">${statusOptions}</select>
              <button class="btn btn-sm" onclick="printOnlineOrder('${o.id}')">طباعة</button>
              <button class="btn btn-sm" onclick="openEditOnlineOrder('${o.id}')">تعديل</button>
              <button class="btn btn-red" onclick="deleteOnlineOrder('${o.id}')">حذف</button>
            </div></td>
          </tr>`;
        }).join("");
      }

      function renderOnlineKanban(data = DB.onlineOrders || []) {
        const board = document.getElementById("online-kanban");
        if (!board) return;
        const columns = ["جديد", "تم التأكيد", "جاري التجهيز", "تم الشحن", "تم التسليم"];
        board.innerHTML = columns.map((status) => {
          const rows = data.filter((o) => o.status === status).slice(0, 8);
          return `<div class="kanban-col">
            <div class="kanban-head"><span>${status}</span><strong>${rows.length.toLocaleString("ar-EG")}</strong></div>
            ${rows.length ? rows.map((o) => `<button class="kanban-card" onclick="openEditOnlineOrder('${o.id}')">
              <strong>${o.customerName || o.id}</strong>
              <span>${o.id} - ${money(+o.total || 0)}</span>
              <small>${o.shippingCompany || "بدون شركة شحن"} | المتبقي ${money(+o.due || 0)}</small>
            </button>`).join("") : '<div class="kanban-empty">لا توجد طلبات</div>'}
          </div>`;
        }).join("");
      }
      function filterOnline(v, el) {
        onlineFilter = v;
        document.querySelectorAll("#page-online .ftab").forEach((t) => t.classList.remove("active"));
        el.classList.add("active");
        renderOnlineOrders();
      }

      function renderShipping() {
        const tb = document.getElementById("shipping-table");
        if (!tb) return;
        const q = (document.getElementById("ship-search")?.value || "").toLowerCase();
        const rows = (DB.onlineOrders || [])
          .filter((o) => !["Ù…Ù„ØºÙŠ", "Ù…Ø±ØªØ¬Ø¹"].includes(o.status))
          .filter((o) => !q || [o.id, o.customerName, o.phone, o.shippingCompany, o.trackingNo, o.status].some((v) => String(v || "").toLowerCase().includes(q)));
        if (!rows.length) {
          tb.innerHTML = '<tr class="empty-row"><td colspan="9">لا توجد طلبات شحن</td></tr>';
          return;
        }
        tb.innerHTML = rows.reverse().map((o) => {
          const cid = o.id.replace(/[^a-zA-Z0-9_-]/g, "_");
          const collected = +o.collectedAmount || +o.paid || 0;
          const collectionStatus = o.collectionStatus || (collected >= (+o.total || 0) ? "تم التحصيل" : "لم يتم التحصيل");
          return `<tr>
            <td><strong>${o.id}</strong></td><td>${o.customerName}<div style="font-size:10px;color:var(--text3)">${o.phone || ""}</div></td>
            <td>${o.shippingCompany || "—"}</td><td>${o.trackingNo || "—"}</td><td><span class="badge badge-blue">${o.status || "—"}</span></td>
            <td>${money(+o.total || 0)}</td>
            <td><input id="ship-amount-${cid}" type="number" min="0" value="${collected}" style="width:95px;padding:5px;border:1px solid var(--border2);border-radius:var(--r-sm)" /></td>
            <td><select id="ship-status-${cid}"><option ${collectionStatus==="لم يتم التحصيل"?"selected":""}>لم يتم التحصيل</option><option ${collectionStatus==="جزئي"?"selected":""}>جزئي</option><option ${collectionStatus==="تم التحصيل"?"selected":""}>تم التحصيل</option></select></td>
            <td><div class="btn-group"><button class="btn btn-sm" onclick="saveOrderCollection('${o.id}')">حفظ</button><button class="btn btn-sm" onclick="printOnlineOrder('${o.id}')">طباعة</button><button class="btn btn-sm" onclick="openEditOnlineOrder('${o.id}')">تعديل</button></div></td>
          </tr>`;
        }).join("");
      }

      function saveOrderCollection(id) {
        if (!requireAction("shipping")) return;
        const order = (DB.onlineOrders || []).find((o) => o.id === id);
        if (!order) return toast("⚠ الطلب غير موجود");
        const cid = id.replace(/[^a-zA-Z0-9_-]/g, "_");
        const collected = +document.getElementById("ship-amount-" + cid).value || 0;
        const collectionStatus = document.getElementById("ship-status-" + cid).value;
        order.collectedAmount = collected;
        order.collectionStatus = collectionStatus;
        order.collectionDate = today();
        order.paid = collected;
        order.due = Math.max(0, (+order.total || 0) - collected);
        if (order.saleId) {
          const sale = DB.sales.find((s) => s.id === order.saleId);
          if (sale) {
            sale.paid = collected;
            sale.due = order.due;
            sale.paymentStatus = order.due > 0 ? "جزئي" : "مدفوع";
          }
        }
        recalcCustomersFromSales();
        logActivity("تحديث تحصيل شحن", id, `${collectionStatus} - ${money(collected)}`);
        saveDB();
        renderShipping();
        renderOnlineOrders();
        renderSales();
        renderCust();
        toast("✓ تم تحديث التحصيل");
      }

      function findItemByBarcode(value) {
        const v = String(value || "").trim().toLowerCase();
        if (!v) return null;
        return DB.items.find((i) => [i.code, i.barcode].some((x) => String(x || "").trim().toLowerCase() === v));
      }

      function addBarcodeScan() {
        if (!requireAction("barcodeSale")) return;
        const input = document.getElementById("bc-input");
        const item = findItemByBarcode(input.value);
        if (!item) return toast("⚠ الكود غير موجود");
        if ((+item.qty || 0) <= 0) return toast("⚠ الصنف نفد من المخزون");
        const existing = barcodeCart.find((x) => x.code === item.code);
        const nextQty = existing ? existing.qty + 1 : 1;
        if ((+item.qty || 0) < nextQty) return toast(`⚠ المتاح من ${item.name}: ${item.qty}`);
        if (existing) existing.qty = nextQty;
        else barcodeCart.push({ code: item.code, barcode: item.barcode || item.code, name: itemDisplayName(item), price: +item.price || 0, cost: +item.cost || 0, qty: 1 });
        input.value = "";
        input.focus();
        renderBarcodeCart();
      }

      function renderBarcodeCart() {
        const tb = document.getElementById("barcode-table");
        if (!tb) return;
        const total = barcodeCart.reduce((s, x) => s + x.qty * x.price, 0);
        document.getElementById("bc-total").textContent = money(total);
        if (!barcodeCart.length) {
          tb.innerHTML = '<tr class="empty-row"><td colspan="6">امسح باركود أو اكتب كود الصنف</td></tr>';
          return;
        }
        tb.innerHTML = barcodeCart.map((x) => `<tr>
          <td>${x.name}</td><td>${x.barcode}</td>
          <td><input type="number" min="1" value="${x.qty}" onchange="setBarcodeQty('${x.code}', this.value)" style="width:70px;padding:5px;border:1px solid var(--border2);border-radius:var(--r-sm)" /></td>
          <td>${money(x.price)}</td><td>${money(x.qty * x.price)}</td>
          <td><button class="btn btn-red" onclick="removeBarcodeLine('${x.code}')">حذف</button></td>
        </tr>`).join("");
      }

      function setBarcodeQty(code, qty) {
        const line = barcodeCart.find((x) => x.code === code);
        const item = findItem(code);
        const q = Math.max(1, +qty || 1);
        if (item && (+item.qty || 0) < q) return toast(`⚠ المتاح من ${item.name}: ${item.qty}`);
        if (line) line.qty = q;
        renderBarcodeCart();
      }

      function removeBarcodeLine(code) {
        barcodeCart = barcodeCart.filter((x) => x.code !== code);
        renderBarcodeCart();
      }

      function clearBarcodeCart() {
        barcodeCart = [];
        renderBarcodeCart();
      }

      function saveBarcodeSale() {
        if (!requireAction("barcodeSale")) return;
        if (!barcodeCart.length) return toast("⚠ أضف صنف واحد على الأقل");
        const items = barcodeCart.map((x) => ({ code: x.code, name: x.name, qty: x.qty, price: x.price, sub: x.qty * x.price, profit: x.qty * (x.price - x.cost) }));
        if (!requireRiskApproval(items, 0)) return;
        if (!applyStockLines(items, -1)) return;
        const total = items.reduce((s, x) => s + x.sub, 0);
        const sale = { id: "INV-" + pad(CNT.sale++), custId: "", party: "نقدي", phone: "", addr: "", date: today(), items: items.map((i) => i.name + "×" + i.qty).join(" | "), lineItems: items, qtyTotal: items.reduce((s, x) => s + x.qty, 0), total, paid: total, due: 0, paymentStatus: "مدفوع", profit: items.reduce((s, x) => s + x.profit, 0), source: "barcode" };
        DB.sales.push(sale);
        logActivity("بيع بالباركود", sale.id, money(total));
        clearBarcodeCart();
        saveDB();
        renderSales(); renderInv(); renderLowStock(); renderDash(); renderReports();
        toast("✓ تم حفظ بيع الباركود " + sale.id);
      }

      function resetOnlineModal() {
        editingOnlineId = "";
        document.getElementById("online-modal-title").textContent = "🌐 طلب أونلاين جديد";
        document.getElementById("online-save-btn").textContent = "حفظ الطلب";
        ["on-name","on-phone","on-phone2","on-addr","on-shipco","on-track","on-notes"].forEach((id)=>document.getElementById(id).value="");
        document.getElementById("on-source").value = "فيسبوك";
        document.getElementById("on-pay").value = "كاش عند الاستلام";
        document.getElementById("on-shipfee").value = 0;
        document.getElementById("on-discount").value = 0;
        document.getElementById("on-paid").value = 0;
        document.getElementById("on-rows").innerHTML = "";
        document.getElementById("on-tot").textContent = money(0);
      }
      function openOnlineModal() {
        if (!requireAction("sale")) return;
        resetOnlineModal();
        openModal("m-online");
        addRow("on");
      }
      function openEditOnlineOrder(id) {
        if (!requireAction("sale")) return;
        const order = DB.onlineOrders.find((o) => o.id === id);
        if (!order) return toast("⚠ الطلب غير موجود");
        if (!requireUnlockedDate(order.date, "تعديل طلب أونلاين")) return;
        if (order.status === "تم التسليم") return toast("⚠ لا يمكن تعديل طلب تم تسليمه");
        resetOnlineModal();
        editingOnlineId = id;
        document.getElementById("online-modal-title").textContent = "تعديل طلب أونلاين " + id;
        document.getElementById("online-save-btn").textContent = "حفظ التعديل";
        document.getElementById("on-name").value = order.customerName || "";
        document.getElementById("on-phone").value = order.phone || "";
        document.getElementById("on-phone2").value = order.phone2 || "";
        document.getElementById("on-addr").value = order.address || "";
        document.getElementById("on-source").value = order.source || "فيسبوك";
        document.getElementById("on-pay").value = order.paymentMethod || "كاش عند الاستلام";
        document.getElementById("on-shipco").value = order.shippingCompany || "";
        document.getElementById("on-shipfee").value = +order.shippingFee || 0;
        document.getElementById("on-discount").value = +order.discount || 0;
        document.getElementById("on-paid").value = +order.paid || 0;
        document.getElementById("on-track").value = order.trackingNo || "";
        document.getElementById("on-notes").value = order.notes || "";
        document.getElementById("on-rows").innerHTML = "";
        (order.lineItems || []).forEach((line) => addInvoiceRowWithData("on", line));
        if (!(order.lineItems || []).length) addRow("on");
        calcOnlineTotal();
        openModal("m-online");
      }
      function collectInvoiceRows(type) {
        const rows = document.getElementById(type + "-rows").querySelectorAll(".inv-row");
        let items = [], total = 0, qtyTotal = 0;
        rows.forEach((r) => {
          const code = r.querySelector("select").value;
          if (!code) return;
          const qty = +r.querySelectorAll("input")[0].value;
          const price = +r.querySelectorAll("input")[1].value;
          const sub = +r.querySelectorAll("input")[2].value;
          const it = DB.items.find((i) => i.code === code);
          if (qty <= 0) return;
          items.push({ code, name: it ? itemDisplayName(it) : code, size: it ? it.size || "" : "", color: it ? it.color || "" : "", qty, price, cost: it ? +it.cost || 0 : 0, sub, profit: sub - ((it ? +it.cost || 0 : 0) * qty) });
          total += sub; qtyTotal += qty;
        });
        return { items, total, qtyTotal };
      }

      function riskySaleNeedsApproval(items, discount = 0) {
        const profit = (items || []).reduce((s, i) => s + (+i.profit || 0), 0) - (+discount || 0);
        const subtotal = (items || []).reduce((s, i) => s + (+i.sub || 0), 0);
        const bigDiscount = subtotal > 0 && (+discount || 0) / subtotal > 0.2;
        return profit < 0 || bigDiscount;
      }

      function requireRiskApproval(items, discount = 0) {
        if (!riskySaleNeedsApproval(items, discount)) return true;
        if (!can("approveRisk")) {
          toast("⚠ العملية فيها خصم كبير أو بيع بخسارة وتحتاج صلاحية اعتماد");
          return false;
        }
        return confirm("هذه العملية فيها خصم كبير أو بيع بخسارة. هل تعتمدها؟");
      }
      function findStockIssue(items) {
        return (items || []).find((line) => {
          const it = DB.items.find((i) => i.code === line.code);
          return !it || (+it.qty || 0) < (+line.qty || 0);
        });
      }
      function saveOnlineOrder() {
        if (!requireAction("sale")) return;
        const existing = editingOnlineId ? DB.onlineOrders.find((o) => o.id === editingOnlineId) : null;
        if (editingOnlineId && !existing) { editingOnlineId = ""; return toast("⚠ الطلب غير موجود"); }
        if (existing && !requireUnlockedDate(existing.date, "تعديل طلب أونلاين")) return;
        if (existing && existing.status === "تم التسليم") return toast("⚠ لا يمكن تعديل طلب تم تسليمه");

        const customerName = document.getElementById("on-name").value.trim();
        const phone = document.getElementById("on-phone").value.trim();
        const phone2 = document.getElementById("on-phone2").value.trim();
        if (!customerName || !phone) return toast("⚠ اسم العميل والهاتف مطلوبين");
        const { items, total, qtyTotal } = collectInvoiceRows("on");
        if (!items.length) return toast("⚠ أضف صنف واحد على الأقل");

        const wasReserved = !!(existing && existing.reserved);
        if (wasReserved) releaseOnlineStock(existing);

        const stockIssue = findStockIssue(items);
        if (stockIssue) {
          if (wasReserved) reserveOnlineStock(existing);
          renderInv(); renderLowStock();
          const it = DB.items.find((i) => i.code === stockIssue.code);
          return toast(`⚠ لا يمكن إنشاء الطلب. المتاح من "${it ? it.name : stockIssue.name}": ${it ? it.qty : 0}`);
        }
        const shippingFee = +document.getElementById("on-shipfee").value || 0;
        const discount = +document.getElementById("on-discount").value || 0;
        if (!requireRiskApproval(items, discount)) {
          if (wasReserved) reserveOnlineStock(existing);
          return;
        }
        const finalTotal = Math.max(0, total + shippingFee - discount);
        const paid = +document.getElementById("on-paid").value || 0;
        const order = {
          id: existing ? existing.id : "ON-" + pad(CNT.online++),
          customerName, phone, phone2,
          address: document.getElementById("on-addr").value,
          source: document.getElementById("on-source").value,
          paymentMethod: document.getElementById("on-pay").value,
          shippingCompany: document.getElementById("on-shipco").value,
          trackingNo: document.getElementById("on-track").value,
          shippingFee, discount,
          items: items.map((i)=>i.name+"×"+i.qty).join(" | "),
          lineItems: items, qtyTotal, total: finalTotal,
          paid, due: Math.max(0, finalTotal - paid),
          profit: items.reduce((s,i)=>s+(+i.profit||0),0) - discount,
          status: existing ? existing.status : "جديد", reserved: false,
          notes: document.getElementById("on-notes").value,
          date: existing ? existing.date : today()
        };
        const shouldReserveOnline = appSetting("onlineStockMode", "save") === "save" || !["جديد"].includes(order.status);
        if (shouldReserveOnline && !["ملغي", "مرتجع"].includes(order.status) && !reserveOnlineStock(order)) {
          if (wasReserved) reserveOnlineStock(existing);
          renderInv(); renderLowStock();
          return;
        }
        const onlineCustomer = upsertCustomerProfile({
          id: existing && existing.custId,
          name: customerName,
          phone,
          phone2,
          addr: order.address,
          sourceType: "أونلاين",
          lastSource: order.source,
        });
        order.custId = onlineCustomer ? onlineCustomer.id : (existing && existing.custId) || "";
        if (existing) Object.assign(existing, order);
        else DB.onlineOrders.push(order);
        editingOnlineId = "";
        logActivity(existing ? "تعديل طلب أونلاين" : "إضافة طلب أونلاين", order.id, `${order.customerName} - ${money(order.total)}`);
        saveDB(); closeModal("m-online"); renderOnlineOrders(); renderInv(); renderLowStock(); renderCust(); renderDash();
        toast(existing ? "✓ تم تعديل الطلب " + order.id : "✓ تم حفظ طلب الأونلاين " + order.id);
      }
      function reserveOnlineStock(order) {
        for (const line of order.lineItems || []) {
          const it = DB.items.find((i) => i.code === line.code);
          if (!it || (+it.qty || 0) < (+line.qty || 0)) { toast(`⚠ الكمية المتاحة من "${it ? it.name : line.name}": ${it ? it.qty : 0}`); return false; }
        }
        (order.lineItems || []).forEach((line) => { const it = DB.items.find((i) => i.code === line.code); if (it) it.qty = (+it.qty || 0) - (+line.qty || 0); });
        order.reserved = true;
        return true;
      }
      function releaseOnlineStock(order) {
        if (!order.reserved) return;
        (order.lineItems || []).forEach((line) => { const it = DB.items.find((i) => i.code === line.code); if (it) it.qty = (+it.qty || 0) + (+line.qty || 0); });
        order.reserved = false;
      }
      function deleteOnlineOrder(id) {
        if (!requireAction("delete")) return;
        const order = DB.onlineOrders.find((o) => o.id === id);
        if (!order) return toast("⚠ الطلب غير موجود");
        if (!requireUnlockedDate(order.date, "حذف طلب أونلاين")) return;
        const delivered = order.status === "تم التسليم";
        const msg = delivered ? "حذف طلب تم تسليمه؟ المخزون لن يرجع لأن البيع اتسجل." : "حذف هذا الطلب؟ أي كمية محجوزة هترجع للمخزون.";
        if (!confirm(msg)) return;
        if (!delivered && order.reserved) releaseOnlineStock(order);
        addTrashRecord("onlineOrders", order.id, "طلب أونلاين", order.customerName || "", order);
        DB.onlineOrders = DB.onlineOrders.filter((o) => o.id !== id);
        if (editingOnlineId === id) editingOnlineId = "";
        logActivity("حذف طلب أونلاين", id, order.customerName || "");
        saveDB(); renderOnlineOrders(); renderInv(); renderLowStock(); renderDash();
        toast("✓ تم حذف الطلب");
      }
      function changeOnlineStatus(id, status) {
        const order = DB.onlineOrders.find((o) => o.id === id);
        if (!order) return;
        const old = order.status;
        if (status === "ملغي" || status === "مرتجع") {
          if (order.reserved) releaseOnlineStock(order);
        } else if (!order.reserved && !reserveOnlineStock(order)) {
          renderOnlineOrders(); renderInv(); renderLowStock();
          return;
        }
        order.status = status;
        if (status === "تم التسليم" && old !== "تم التسليم" && !order.saleId) {
          order.saleId = "INV-" + pad(CNT.sale++);
          DB.sales.push({ id: order.saleId, custId: order.custId || "", party: order.customerName, phone: order.phone || "", addr: order.address || "", date: today(), items: order.items, lineItems: order.lineItems, qtyTotal: order.qtyTotal, total: order.total, paid: +order.paid || 0, due: +order.due || 0, paymentStatus: order.due > 0 ? "جزئي" : "مدفوع", profit: order.profit, source: "online", orderId: order.id });
          recalcCustomersFromSales();
        }
        logActivity("تغيير حالة طلب أونلاين", id, `${old} -> ${status}`);
        saveDB(); renderOnlineOrders(); renderInv(); renderLowStock(); renderSales(); renderCust(); renderDash();
        toast("✓ تم تحديث حالة الطلب");
      }

      function mergeCustomerType(oldType, newType) {
        const parts = String(oldType || "")
          .split("+")
          .map((x) => x.trim())
          .filter(Boolean);
        if (newType && !parts.includes(newType)) parts.push(newType);
        return parts.length ? parts.join(" + ") : "يدوي";
      }

      function findCustomerMatch({ id = "", name = "", phone = "", phone2 = "" }) {
        if (id) return DB.customers.find((c) => c.id === id);
        const p1 = String(phone || "").trim();
        const p2 = String(phone2 || "").trim();
        if (p1 || p2) {
          const found = DB.customers.find((c) => [c.phone, c.phone2].filter(Boolean).some((p) => p === p1 || p === p2));
          if (found) return found;
        }
        const n = String(name || "").trim();
        return n ? DB.customers.find((c) => String(c.name || "").trim() === n) : null;
      }

      function upsertCustomerProfile(data) {
        const name = String(data.name || "").trim();
        const phone = String(data.phone || "").trim();
        const phone2 = String(data.phone2 || "").trim();
        const addr = String(data.addr || "").trim();
        if (!name && !phone && !addr) return null;
        const existing = findCustomerMatch({ id: data.id, name, phone, phone2 });
        const payload = {
          id: existing ? existing.id : "C" + pad(CNT.cust++, 3),
          name: name || (existing && existing.name) || phone || "عميل",
          phone: phone || (existing && existing.phone) || "",
          phone2: phone2 || (existing && existing.phone2) || "",
          addr: addr || (existing && existing.addr) || "",
          sourceType: mergeCustomerType(existing && existing.sourceType, data.sourceType || "يدوي"),
          lastSource: data.lastSource || (existing && existing.lastSource) || "",
          total: existing ? +existing.total || 0 : 0,
          balance: existing ? +existing.balance || 0 : 0,
        };
        if (existing) Object.assign(existing, payload);
        else DB.customers.push(payload);
        return existing || payload;
      }

      function customerTypeBadge(c) {
        const type = c.sourceType || "يدوي";
        const cls = type.includes("أونلاين") && type.includes("بيع عادي") ? "badge-purple" : type.includes("أونلاين") ? "badge-blue" : type.includes("بيع عادي") ? "badge-green" : "badge-accent";
        return `<span class="badge ${cls}">${type}</span>${c.lastSource ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">${c.lastSource}</div>` : ""}`;
      }

      function renderCust() {
        const tb = document.getElementById("cust-table");
        const q = document.getElementById("cust-search")?.value || "";
        const data = DB.customers.filter((c) => rowMatches(c, q, ["id", "name", "phone", "phone2", "addr", "sourceType", "lastSource"]));
        if (!data.length) {
          tb.innerHTML =
            `<tr class="empty-row"><td colspan="8">${DB.customers.length ? "لا توجد نتائج" : "لا يوجد عملاء بعد"}</td></tr>`;
          return;
        }
        tb.innerHTML = data
          .map(
            (c) => `<tr>
    <td style="font-size:10px">${c.id}</td><td>${c.name}</td><td>${c.phone || "—"}${c.phone2 ? `<div style="font-size:10px;color:var(--text3)">${c.phone2}</div>` : ""}</td>
    <td>${c.addr || "—"}</td><td>${customerTypeBadge(c)}</td>
    <td>${money(+c.total)}</td>
    <td><span class="badge ${+c.balance > 0 ? "badge-red" : "badge-green"}">${money(+c.balance)}</span></td>
    <td><div class="btn-group"><button class="btn btn-sm" onclick="openEditCust('${c.id}')">تعديل</button><button class="btn btn-red" onclick="delCust('${c.id}')">حذف</button></div></td></tr>`,
          )
          .join("");
      }

      function renderSup() {
        const tb = document.getElementById("sup-table");
        const q = document.getElementById("sup-search")?.value || "";
        const data = DB.suppliers.filter((s) => rowMatches(s, q, ["id", "name", "phone", "addr"]));
        if (!data.length) {
          tb.innerHTML =
            `<tr class="empty-row"><td colspan="6">${DB.suppliers.length ? "لا توجد نتائج" : "لا يوجد موردين بعد"}</td></tr>`;
          return;
        }
        tb.innerHTML = data
          .map(
            (s) => `<tr>
    <td style="font-size:10px">${s.id}</td><td>${s.name}</td><td>${s.phone || "—"}</td>
    <td>${money(+s.total)}</td>
    <td><span class="badge ${+s.balance > 0 ? "badge-red" : "badge-green"}">${money(+s.balance)}</span></td>
    <td><div class="btn-group"><button class="btn btn-sm" onclick="openEditSup('${s.id}')">تعديل</button><button class="btn btn-red" onclick="delSup('${s.id}')">حذف</button></div></td></tr>`,
          )
          .join("");
      }

      // ===== SAVE OPERATIONS =====
      const pad = (n, p = 4) => String(n).padStart(p, "0");
      const today = () => new Date().toISOString().slice(0, 10);
      function money(value) {
        return (appSetting("currency", "EGP") || "EGP") + " " + (+value || 0).toLocaleString("en-US", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        });
      }

      function clearItemForm() {
        document.getElementById("i-edit-code").value = "";
        document.getElementById("item-modal-title").textContent =
          "👕 إضافة صنف ملابس جديد";
        ["i-name", "i-barcode", "i-color", "i-fabric", "i-notes"].forEach(
          (id) => (document.getElementById(id).value = ""),
        );
        ["i-qty", "i-cost", "i-price"].forEach(
          (id) => (document.getElementById(id).value = 0),
        );
        document.getElementById("i-min").value = +(appSetting("defaultMinQty", "3")) || 3;
      }
      function openEditItem(code) {
        if (!requireAction("item")) return;
        const i = DB.items.find((x) => x.code === code);
        if (!i) return;
        document.getElementById("i-edit-code").value = i.code;
        document.getElementById("item-modal-title").textContent =
          "تعديل صنف: " + i.code;
        document.getElementById("i-name").value = i.name || "";
        document.getElementById("i-barcode").value = i.barcode || "";
        document.getElementById("i-cat").value = i.cat || "أخرى";
        document.getElementById("i-gender").value = i.gender || "يونيسيكس";
        document.getElementById("i-size").value = i.size || "M";
        document.getElementById("i-color").value = i.color || "";
        document.getElementById("i-fabric").value = i.fabric || "";
        document.getElementById("i-qty").value = +i.qty || 0;
        document.getElementById("i-min").value = +i.minQty || 0;
        document.getElementById("i-cost").value = +i.cost || 0;
        document.getElementById("i-price").value = +i.price || 0;
        document.getElementById("i-notes").value = i.notes || "";
        openModal("m-item");
      }
      function saveItem() {
        if (!requireAction("item")) return;
        const name = document.getElementById("i-name").value.trim();
        if (!name) return toast("⚠ اسم الصنف مطلوب");
        const editCode = document.getElementById("i-edit-code").value;
        const code = editCode || "CLO-" + pad(CNT.item++);
        const payload = {
          code,
          barcode: document.getElementById("i-barcode").value.trim() || code,
          name,
          cat: document.getElementById("i-cat").value,
          gender: document.getElementById("i-gender").value,
          size: document.getElementById("i-size").value,
          color: document.getElementById("i-color").value,
          fabric: document.getElementById("i-fabric").value,
          qty: +document.getElementById("i-qty").value,
          minQty: +document.getElementById("i-min").value,
          cost: +document.getElementById("i-cost").value,
          price: +document.getElementById("i-price").value,
          notes: document.getElementById("i-notes").value,
        };
        if (editCode) {
          DB.items = DB.items.map((i) => (i.code === editCode ? payload : i));
        } else {
          DB.items.push(payload);
        }
        logActivity(editCode ? "تعديل صنف" : "إضافة صنف", code, `${name} - كمية ${payload.qty}`);
        saveDB();
        closeModal("m-item");
        clearItemForm();
        renderInv();
        renderDash();
        renderLowStock();
        toast(editCode ? "✓ تم تعديل الصنف " + code : "✓ تم حفظ الصنف " + code);
      }

      function deleteItem(code) {
        if (!requireAction("delete")) return;
        if (!confirm("حذف هذا الصنف؟")) return;
        const item = DB.items.find((i) => i.code === code);
        if (item) addTrashRecord("items", item.code, "صنف", item.name || item.code, item);
        DB.items = DB.items.filter((i) => i.code !== code);
        logActivity("حذف صنف", code, item ? item.name : "");
        saveDB();
        renderInv();
        renderLowStock();
        renderDash();
        toast("✓ تم الحذف");
      }

      function openCustModal() {
        if (!requireAction("customer")) return;
        document.getElementById("c-edit-id").value = "";
        document.getElementById("cust-modal-title").textContent = "👤 إضافة عميل";
        document.getElementById("cust-save-btn").textContent = "حفظ";
        ["c-name", "c-phone", "c-phone2", "c-addr"].forEach((id) => (document.getElementById(id).value = ""));
        openModal("m-cust");
      }

      function openEditCust(id) {
        if (!requireAction("customer")) return;
        const c = DB.customers.find((x) => x.id === id);
        if (!c) return toast("⚠ العميل غير موجود");
        document.getElementById("c-edit-id").value = c.id;
        document.getElementById("cust-modal-title").textContent = "تعديل عميل: " + c.id;
        document.getElementById("cust-save-btn").textContent = "حفظ التعديل";
        document.getElementById("c-name").value = c.name || "";
        document.getElementById("c-phone").value = c.phone || "";
        document.getElementById("c-phone2").value = c.phone2 || "";
        document.getElementById("c-addr").value = c.addr || "";
        openModal("m-cust");
      }

      function saveCust() {
        if (!requireAction("customer")) return;
        const editId = document.getElementById("c-edit-id").value;
        const name = document.getElementById("c-name").value.trim();
        if (!name) return toast("⚠ الاسم مطلوب");
        const existing = editId ? DB.customers.find((c) => c.id === editId) : null;
        const payload = {
          id: existing ? existing.id : "C" + pad(CNT.cust++, 3),
          name,
          phone: document.getElementById("c-phone").value,
          phone2: document.getElementById("c-phone2").value,
          addr: document.getElementById("c-addr").value,
          sourceType: existing ? existing.sourceType || "يدوي" : "يدوي",
          lastSource: existing ? existing.lastSource || "" : "",
          total: existing ? +existing.total || 0 : 0,
          balance: existing ? +existing.balance || 0 : 0,
        };
        if (existing) {
          Object.assign(existing, payload);
          DB.sales.forEach((sale) => { if (sale.custId === existing.id) sale.party = payload.name; });
        } else {
          DB.customers.push(payload);
        }
        logActivity(existing ? "تعديل عميل" : "إضافة عميل", payload.id, payload.name);
        saveDB();
        closeModal("m-cust");
        document.getElementById("c-edit-id").value = "";
        ["c-name", "c-phone", "c-phone2", "c-addr"].forEach((id) => (document.getElementById(id).value = ""));
        renderCust();
        renderSales();
        renderDash();
        toast(existing ? "✓ تم تعديل العميل" : "✓ تم حفظ العميل");
      }
      function delCust(id) {
        if (!requireAction("delete")) return;
        if (!confirm("حذف هذا العميل؟")) return;
        const customer = DB.customers.find((c) => c.id === id);
        if (customer) addTrashRecord("customers", customer.id, "عميل", customer.name || customer.id, customer);
        DB.customers = DB.customers.filter((c) => c.id !== id);
        logActivity("حذف عميل", id, customer ? customer.name : "");
        saveDB();
        renderCust();
        toast("✓ تم الحذف");
      }

      function openSupModal() {
        if (!requireAction("supplier")) return;
        document.getElementById("s-edit-id").value = "";
        document.getElementById("sup-modal-title").textContent = "🏭 إضافة مورد";
        document.getElementById("sup-save-btn").textContent = "حفظ";
        ["s-name", "s-phone", "s-addr"].forEach((id) => (document.getElementById(id).value = ""));
        openModal("m-sup");
      }

      function openEditSup(id) {
        if (!requireAction("supplier")) return;
        const s = DB.suppliers.find((x) => x.id === id);
        if (!s) return toast("⚠ المورد غير موجود");
        document.getElementById("s-edit-id").value = s.id;
        document.getElementById("sup-modal-title").textContent = "تعديل مورد: " + s.id;
        document.getElementById("sup-save-btn").textContent = "حفظ التعديل";
        document.getElementById("s-name").value = s.name || "";
        document.getElementById("s-phone").value = s.phone || "";
        document.getElementById("s-addr").value = s.addr || "";
        openModal("m-sup");
      }

      function saveSup() {
        if (!requireAction("supplier")) return;
        const editId = document.getElementById("s-edit-id").value;
        const name = document.getElementById("s-name").value.trim();
        if (!name) return toast("⚠ الاسم مطلوب");
        const existing = editId ? DB.suppliers.find((s) => s.id === editId) : null;
        const payload = {
          id: existing ? existing.id : "SUP" + pad(CNT.sup++, 3),
          name,
          phone: document.getElementById("s-phone").value,
          addr: document.getElementById("s-addr").value,
          total: existing ? +existing.total || 0 : 0,
          balance: existing ? +existing.balance || 0 : 0,
        };
        if (existing) {
          Object.assign(existing, payload);
          DB.purchases.forEach((pur) => { if (pur.supId === existing.id) pur.party = payload.name; });
        } else {
          DB.suppliers.push(payload);
        }
        logActivity(existing ? "تعديل مورد" : "إضافة مورد", payload.id, payload.name);
        saveDB();
        closeModal("m-sup");
        document.getElementById("s-edit-id").value = "";
        ["s-name", "s-phone", "s-addr"].forEach((id) => (document.getElementById(id).value = ""));
        renderSup();
        renderPur();
        renderDash();
        toast(existing ? "✓ تم تعديل المورد" : "✓ تم حفظ المورد");
      }
      function delSup(id) {
        if (!requireAction("delete")) return;
        if (!confirm("حذف هذا المورد؟")) return;
        const supplier = DB.suppliers.find((s) => s.id === id);
        if (supplier) addTrashRecord("suppliers", supplier.id, "مورد", supplier.name || supplier.id, supplier);
        DB.suppliers = DB.suppliers.filter((s) => s.id !== id);
        logActivity("حذف مورد", id, supplier ? supplier.name : "");
        saveDB();
        renderSup();
        toast("✓ تم الحذف");
      }

      // ===== INVOICE ROWS =====
      function itemDisplayName(item) {
        if (!item) return "";
        const details = [item.size, item.color].filter(Boolean).join(" - ");
        return details ? `${item.name} (${details})` : item.name;
      }

      function lineDisplayName(line) {
        if (!line) return "";
        if (line.name && line.color && !String(line.name).includes(line.color)) {
          return `${line.name} - ${line.color}`;
        }
        return line.name || line.code || "";
      }

      function addRow(type) {
        const container = document.getElementById(type + "-rows");
        const rid = type + "_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
        const opts = DB.items
          .map(
            (i) =>
              `<option value="${i.code}" data-price="${i.price}" data-cost="${i.cost}">${itemDisplayName(i)} — ${i.qty} متاح</option>`,
          )
          .join("");
        const div = document.createElement("div");
        div.className = "inv-row";
        div.id = rid;
        div.innerHTML = `
    <select onchange="onRowItem(this,'${type}','${rid}')">${opts ? '<option value="">-- صنف --</option>' + opts : "<option>لا توجد أصناف</option>"}</select>
    <input type="number" min="1" value="1" onchange="calcRow('${type}','${rid}')" />
    <input type="number" min="0" value="0" id="up_${rid}" onchange="calcRow('${type}','${rid}')" />
    <input type="number" readonly value="0" id="sub_${rid}" />
        <span style="cursor:pointer;color:var(--red);font-size:15px" onclick="document.getElementById('${rid}').remove();calcTotal('${type}')">✕</span>`;
        container.appendChild(div);
        return div;
      }

      function addInvoiceRowWithData(type, line) {
        const row = addRow(type);
        row.querySelector("select").value = line.code || "";
        const inputs = row.querySelectorAll("input");
        inputs[0].value = +line.qty || 1;
        inputs[1].value = +line.price || 0;
        calcRow(type, row.id);
        return row;
      }

      function onRowItem(sel, type, rid) {
        const opt = sel.selectedOptions[0];
        if (!opt.value) return;
        document.getElementById("up_" + rid).value =
          opt.getAttribute(type === "pu" ? "data-cost" : "data-price") || 0;
        calcRow(type, rid);
      }
      function calcRow(type, rid) {
        const row = document.getElementById(rid);
        const qty = +row.querySelectorAll("input")[0].value;
        const price = +row.querySelectorAll("input")[1].value;
        document.getElementById("sub_" + rid).value = (qty * price).toFixed(2);
        calcTotal(type);
      }
      function calcTotal(type) {
        let t = 0;
        document
          .getElementById(type + "-rows")
          .querySelectorAll(".inv-row")
          .forEach((r) => {
            t += +r.querySelectorAll("input")[2].value;
          });
        if (type === "on") {
          const ship = +document.getElementById("on-shipfee").value || 0;
          const discount = +document.getElementById("on-discount").value || 0;
          t = Math.max(0, t + ship - discount);
        }
        document.getElementById(type + "-tot").textContent =
          money(t);
      }

      function calcOnlineTotal() {
        calcTotal("on");
      }

      let editingSaleId = "";
      let editingPurId = "";
      let editingReturnId = "";

      function findItem(code) {
        return DB.items.find((i) => i.code === code);
      }

      function stockIssueFor(lines, multiplier) {
        return (lines || []).find((line) => {
          const delta = (+line.qty || 0) * multiplier;
          const it = findItem(line.code);
          return delta < 0 && (!it || (+it.qty || 0) < Math.abs(delta));
        });
      }

      function applyStockLines(lines, multiplier) {
        const issue = stockIssueFor(lines, multiplier);
        if (issue) {
          const it = findItem(issue.code);
          toast(`⚠ الكمية المتاحة من "${it ? it.name : issue.name}": ${it ? it.qty : 0}`);
          return false;
        }
        (lines || []).forEach((line) => {
          const it = findItem(line.code);
          if (it) it.qty = (+it.qty || 0) + ((+line.qty || 0) * multiplier);
        });
        return true;
      }

      function invoicePartyId(prefix) {
        return document.getElementById(prefix === "sl" ? "sl-cust" : "pu-sup").value;
      }

      function recalcCustomersFromSales() {
        DB.customers.forEach((c) => { c.total = 0; c.balance = 0; });
        DB.sales.forEach((sale) => {
          const cust = sale.custId ? DB.customers.find((c) => c.id === sale.custId) : DB.customers.find((c) => c.name === sale.party);
          if (cust) { cust.total += +sale.total || 0; cust.balance += sale.due !== undefined ? (+sale.due || 0) : (+sale.total || 0); }
        });
      }

      function recalcSuppliersFromPurchases() {
        DB.suppliers.forEach((s) => { s.total = 0; s.balance = 0; });
        DB.purchases.forEach((pur) => {
          const sup = pur.supId ? DB.suppliers.find((s) => s.id === pur.supId) : DB.suppliers.find((s) => s.name === pur.party);
          if (sup) { sup.total += +pur.total || 0; sup.balance += +pur.total || 0; }
        });
      }

      // ===== SALE =====
      function openSaleModal() {
        if (!requireAction("sale")) return;
        editingSaleId = "";
        document.getElementById("sale-modal-title").textContent = "🧾 فاتورة مبيعات جديدة";
        document.getElementById("sale-save-btn").textContent = "حفظ الفاتورة";
        document.getElementById("sl-cust").innerHTML =
          '<option value="">نقدي</option>' +
          DB.customers
            .map((c) => `<option value="${c.id}">${c.name}</option>`)
            .join("");
        document.getElementById("sl-rows").innerHTML = "";
        document.getElementById("sl-date").value = today();
        ["sl-name", "sl-phone", "sl-addr"].forEach((id) => (document.getElementById(id).value = ""));
        document.getElementById("sl-paid").value = 0;
        document.getElementById("sl-pay-status").value = "مدفوع";
        document.getElementById("sl-tot").textContent = money(0);
        openModal("m-sale");
        addRow("sl");
      }

      function onSaleCustomerSelect() {
        const cust = DB.customers.find((c) => c.id === document.getElementById("sl-cust").value);
        if (!cust) {
          ["sl-name", "sl-phone", "sl-addr"].forEach((id) => (document.getElementById(id).value = ""));
          return;
        }
        document.getElementById("sl-name").value = cust.name || "";
        document.getElementById("sl-phone").value = cust.phone || "";
        document.getElementById("sl-addr").value = cust.addr || "";
      }

      function openEditSale(id) {
        if (!requireAction("sale")) return;
        const sale = DB.sales.find((x) => x.id === id);
        if (!sale) return toast("⚠ الفاتورة غير موجودة");
        if (!requireUnlockedDate(sale.date, "تعديل الفاتورة")) return;
        if (sale.source === "online") return toast("⚠ فاتورة أونلاين؛ عدلها من طلبات الأونلاين");
        if (!(sale.lineItems || []).length) return toast("⚠ لا يمكن تعديل فاتورة قديمة بدون تفاصيل الأصناف");
        openSaleModal();
        editingSaleId = id;
        document.getElementById("sale-modal-title").textContent = "تعديل فاتورة مبيعات " + id;
        document.getElementById("sale-save-btn").textContent = "حفظ التعديل";
        document.getElementById("sl-date").value = sale.date || today();
        const custId = sale.custId || (DB.customers.find((c) => c.name === sale.party) || {}).id || "";
        document.getElementById("sl-cust").value = custId;
        const cust = DB.customers.find((c) => c.id === custId);
        document.getElementById("sl-name").value = (cust && cust.name) || sale.party || "";
        document.getElementById("sl-phone").value = (cust && cust.phone) || sale.phone || "";
        document.getElementById("sl-addr").value = (cust && cust.addr) || sale.addr || "";
        document.getElementById("sl-paid").value = +sale.paid || 0;
        document.getElementById("sl-pay-status").value = sale.paymentStatus || "مدفوع";
        document.getElementById("sl-rows").innerHTML = "";
        (sale.lineItems || []).forEach((line) => addInvoiceRowWithData("sl", line));
        calcTotal("sl");
      }

      function saveSale() {
        if (!requireAction("sale")) return;
        const existing = editingSaleId ? DB.sales.find((x) => x.id === editingSaleId) : null;
        if (editingSaleId && !existing) { editingSaleId = ""; return toast("⚠ الفاتورة غير موجودة"); }
        if (existing && !requireUnlockedDate(existing.date, "تعديل الفاتورة")) return;
        const { items, total, qtyTotal: totalQty } = collectInvoiceRows("sl");
        if (!items.length) return toast("⚠ أضف صنف واحد على الأقل");
        if (!requireRiskApproval(items, 0)) return;
        if (existing && !applyStockLines(existing.lineItems || [], 1)) return;
        if (!applyStockLines(items, -1)) {
          if (existing) applyStockLines(existing.lineItems || [], -1);
          return;
        }
        const selectedCustId = document.getElementById("sl-cust").value;
        const saleCustomerName = document.getElementById("sl-name").value.trim();
        const saleCustomerPhone = document.getElementById("sl-phone").value.trim();
        const saleCustomerAddr = document.getElementById("sl-addr").value.trim();
        const selectedCust = DB.customers.find((c) => c.id === selectedCustId);
        const cust = (selectedCustId || saleCustomerName || saleCustomerPhone || saleCustomerAddr)
          ? upsertCustomerProfile({
              id: selectedCustId,
              name: saleCustomerName || (selectedCust && selectedCust.name) || "",
              phone: saleCustomerPhone || (selectedCust && selectedCust.phone) || "",
              addr: saleCustomerAddr || (selectedCust && selectedCust.addr) || "",
              sourceType: "بيع عادي",
              lastSource: "بيع عادي",
            })
          : null;
        const sale = {
          id: existing ? existing.id : "INV-" + pad(CNT.sale++),
          custId: cust ? cust.id : "",
          party: cust ? cust.name : "نقدي",
          phone: cust ? cust.phone : "",
          addr: cust ? cust.addr : "",
          date: document.getElementById("sl-date").value,
          items: items.map((i) => i.name + "×" + i.qty).join(" | "),
          lineItems: items,
          qtyTotal: totalQty,
          total,
          paid: +document.getElementById("sl-paid").value || 0,
          due: Math.max(0, total - (+document.getElementById("sl-paid").value || 0)),
          paymentStatus: document.getElementById("sl-pay-status").value,
          profit: items.reduce((s, i) => s + (+i.profit || 0), 0),
        };
        if (existing) Object.assign(existing, sale);
        else DB.sales.push(sale);
        editingSaleId = "";
        recalcCustomersFromSales();
        logActivity(existing ? "تعديل فاتورة مبيعات" : "إضافة فاتورة مبيعات", sale.id, `${sale.party} - ${money(sale.total)}`);
        saveDB();
        closeModal("m-sale");
        renderSales();
        renderInv();
        renderLowStock();
        renderCust();
        renderDash();
        toast(existing ? "✓ تم تعديل الفاتورة " + sale.id : "✓ تم حفظ الفاتورة " + sale.id);
      }

      function deleteSale(id) {
        if (!requireAction("delete")) return;
        const sale = DB.sales.find((x) => x.id === id);
        if (!sale) return toast("⚠ الفاتورة غير موجودة");
        if (!requireUnlockedDate(sale.date, "حذف الفاتورة")) return;
        const onlineSale = sale.source === "online";
        if (!confirm(onlineSale ? "حذف فاتورة أونلاين من سجل المبيعات؟ المخزون لن يتغير لأن الطلب الأصلي هو اللي حجز الكمية." : "حذف فاتورة المبيعات؟ الكمية هترجع للمخزون.")) return;
        if (!onlineSale) applyStockLines(sale.lineItems || [], 1);
        addTrashRecord("sales", sale.id, "فاتورة مبيعات", `${sale.party || ""} - ${money(sale.total || 0)}`, sale);
        DB.sales = DB.sales.filter((x) => x.id !== id);
        if (editingSaleId === id) editingSaleId = "";
        recalcCustomersFromSales();
        logActivity("حذف فاتورة مبيعات", id, `${sale.party || ""} - ${money(sale.total || 0)}`);
        saveDB();
        renderSales(); renderInv(); renderLowStock(); renderCust(); renderDash();
        toast(onlineSale ? "✓ تم حذف الفاتورة" : "✓ تم حذف الفاتورة ورجوع الكمية");
      }

      function printRowsFrom(lineItems, fallbackText) {
        return lineItems && lineItems.length
          ? lineItems.map((i) => `<tr><td>${lineDisplayName(i)}</td><td>${i.qty}</td><td>${money(+i.price || 0)}</td><td>${money(+i.sub || 0)}</td></tr>`).join("")
          : `<tr><td colspan="4">${fallbackText || "—"}</td></tr>`;
      }

      function printDocument(title, metaRows, rows, total, note = "شكراً لتعاملكم معنا") {
        if (!requireAction("print")) return;
        const root = document.getElementById("print-root");
        root.className = "print-area";
        root.innerHTML = `
    <div class="print-head">
      <div>
        <div class="print-brand">MOLVER</div>
        <div class="print-meta">${title}</div>
      </div>
      <div class="print-meta">${metaRows.map((r) => `<div>${r[0]}: <strong>${r[1] || "—"}</strong></div>`).join("")}</div>
    </div>
    <table>
      <thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="print-total">الإجمالي: ${money(+total || 0)}</div>
    <div class="print-note">${note}</div>`;
        window.print();
        setTimeout(() => {
          root.className = "hidden";
          root.innerHTML = "";
        }, 500);
      }

      function printSale(id) {
        if (!requireAction("print")) return;
        const sale = DB.sales.find((x) => x.id === id);
        if (!sale) return toast("⚠ الفاتورة غير موجودة");
        printDocument("فاتورة مبيعات", [["رقم الفاتورة", sale.id], ["التاريخ", sale.date], ["العميل", sale.party || "نقدي"], ["المدفوع", money(+sale.paid || 0)], ["المتبقي", money(+sale.due || 0)]], printRowsFrom(sale.lineItems, sale.items), sale.total);
      }

      function printPurchase(id) {
        const pur = DB.purchases.find((x) => x.id === id);
        if (!pur) return toast("⚠ الفاتورة غير موجودة");
        printDocument("فاتورة مشتريات", [["رقم الفاتورة", pur.id], ["التاريخ", pur.date], ["المورد", pur.party || "غير محدد"]], printRowsFrom(pur.lineItems, pur.items), pur.total);
      }

      function printReturn(id) {
        const ret = DB.returns.find((x) => x.id === id);
        if (!ret) return toast("⚠ المرتجع غير موجود");
        const rows = `<tr><td>${ret.itemName || ret.code || "—"}</td><td>${ret.qty || 0}</td><td>${money(+ret.price || 0)}</td><td>${money(+ret.total || 0)}</td></tr>`;
        printDocument("إيصال مرتجع", [["رقم المرتجع", ret.id], ["النوع", ret.type], ["الفاتورة الأصلية", ret.invId || "—"], ["التاريخ", ret.date], ["السبب", ret.reason]], rows, ret.total);
      }

      function printOnlineOrder(id) {
        const order = (DB.onlineOrders || []).find((x) => x.id === id);
        if (!order) return toast("⚠ الطلب غير موجود");
        printDocument("طلب أونلاين", [["رقم الطلب", order.id], ["التاريخ", order.date], ["العميل", order.customerName], ["الهاتف", order.phone], ["العنوان", order.address], ["الحالة", order.status], ["المدفوع", money(+order.paid || 0)], ["المتبقي", money(+order.due || 0)]], printRowsFrom(order.lineItems, order.items), order.total, "يرجى مراجعة بيانات الشحن قبل التسليم");
      }

      function printExpense(id) {
        const e = (DB.expenses || []).find((x) => x.id === id);
        if (!e) return toast("⚠ المصروف غير موجود");
        const rows = `<tr><td>${e.name || "—"}</td><td>1</td><td>${money(+e.amount || 0)}</td><td>${money(+e.amount || 0)}</td></tr>`;
        printDocument("إيصال مصروف", [["رقم المصروف", e.id], ["الفئة", e.cat || "—"], ["التاريخ", e.date || "—"], ["ملاحظات", e.notes || "—"]], rows, e.amount);
      }

      function printItemLabel(code) {
        if (!requireAction("printLabels")) return;
        const item = DB.items.find((x) => x.code === code);
        if (!item) return toast("⚠ الصنف غير موجود");
        const copies = Math.max(1, Math.min(60, +(prompt("عدد الاستيكرات لهذا الصنف؟", "1") || 1)));
        const value = item.barcode || item.code;
        const root = document.getElementById("print-root");
        const sticker = () => `
          <div class="label-sticker">
            <img alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=170x170&margin=14&data=${encodeURIComponent(value)}" />
            <div>
              <div class="label-name">${item.name}</div>
              <div class="label-meta">${item.color || ""} ${item.size || ""}</div>
              <div class="label-meta">${money(+item.price || 0)}</div>
              <div class="label-code">${value}</div>
            </div>
          </div>`;
        root.className = "print-area label-sheet";
        root.innerHTML = Array.from({ length: copies }, sticker).join("");
        window.print();
        setTimeout(() => { root.className = "hidden"; root.innerHTML = ""; }, 500);
      }

      function printInventoryLabels() {
        if (!requireAction("printLabels")) return;
        const mode = prompt("اكتب نوع الليبل: small أو medium أو price", appSetting("labelSize", "medium")) || "medium";
        const items = DB.items.filter((i) => (+i.qty || 0) > 0);
        if (!items.length) return toast("⚠ لا توجد أصناف متاحة للطباعة");
        const max = Math.max(1, Math.min(200, +(prompt("أقصى عدد ليبلات؟", "60") || 60)));
        const root = document.getElementById("print-root");
        root.className = "print-area label-sheet label-" + (["small", "price"].includes(mode) ? mode : "medium");
        root.innerHTML = items.slice(0, max).map((item) => {
          const value = item.barcode || item.code;
          return `<div class="label-sticker">
            <img alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=170x170&margin=14&data=${encodeURIComponent(value)}" />
            <div>
              <div class="label-name">${item.name}</div>
              <div class="label-meta">${item.color || ""} ${item.size || ""}</div>
              <div class="label-meta">${mode === "small" ? item.code : money(+item.price || 0)}</div>
              <div class="label-code">${value}</div>
            </div>
          </div>`;
        }).join("");
        logActivity("طباعة ليبلات مخزون", "Inventory", mode);
        window.print();
        setTimeout(() => { root.className = "hidden"; root.innerHTML = ""; }, 500);
      }

      // ===== PURCHASE =====
      function openPurModal() {
        if (!requireAction("purchase")) return;
        editingPurId = "";
        document.getElementById("pur-modal-title").textContent = "🛒 فاتورة مشتريات جديدة";
        document.getElementById("pur-save-btn").textContent = "حفظ الفاتورة";
        document.getElementById("pu-sup").innerHTML =
          '<option value="">غير محدد</option>' +
          DB.suppliers
            .map((s) => `<option value="${s.id}">${s.name}</option>`)
            .join("");
        document.getElementById("pu-rows").innerHTML = "";
        document.getElementById("pu-date").value = today();
        document.getElementById("pu-tot").textContent = money(0);
        openModal("m-pur");
        addRow("pu");
      }

      function openExpenseModal() {
        if (!requireAction("expense")) return;
        document.getElementById("e-edit-id").value = "";
        document.getElementById("expense-modal-title").textContent = "💸 مصروف جديد";
        document.getElementById("e-name").value = "";
        document.getElementById("e-cat").value = "إعلانات";
        document.getElementById("e-amount").value = 0;
        document.getElementById("e-date").value = today();
        document.getElementById("e-notes").value = "";
        openModal("m-expense");
      }
      function openEditExpense(id) {
        if (!requireAction("expense")) return;
        const e = (DB.expenses || []).find((x) => x.id === id);
        if (!e) return toast("⚠ المصروف غير موجود");
        if (!requireUnlockedDate(e.date, "تعديل المصروف")) return;
        openExpenseModal();
        document.getElementById("e-edit-id").value = e.id;
        document.getElementById("expense-modal-title").textContent = "تعديل مصروف " + e.id;
        document.getElementById("e-name").value = e.name || "";
        document.getElementById("e-cat").value = e.cat || "أخرى";
        document.getElementById("e-amount").value = +e.amount || 0;
        document.getElementById("e-date").value = e.date || today();
        document.getElementById("e-notes").value = e.notes || "";
      }
      function saveExpense() {
        if (!requireAction("expense")) return;
        const name = document.getElementById("e-name").value.trim();
        const amount = +document.getElementById("e-amount").value || 0;
        if (!name || amount <= 0) return toast("⚠ اسم المصروف والمبلغ مطلوبين");
        const editId = document.getElementById("e-edit-id").value;
        const existing = editId ? (DB.expenses || []).find((e) => e.id === editId) : null;
        if (existing && !requireUnlockedDate(existing.date, "تعديل المصروف")) return;
        const payload = {
          id: editId || "EXP-" + pad(CNT.exp++),
          name,
          cat: document.getElementById("e-cat").value,
          amount,
          date: document.getElementById("e-date").value || today(),
          notes: document.getElementById("e-notes").value,
        };
        DB.expenses = DB.expenses || [];
        if (editId) DB.expenses = DB.expenses.map((e) => e.id === editId ? payload : e);
        else DB.expenses.push(payload);
        logActivity(editId ? "تعديل مصروف" : "إضافة مصروف", payload.id, `${payload.name} - ${money(payload.amount)}`);
        saveDB(); closeModal("m-expense"); renderExpenses(); renderReports(); renderDash();
        toast(editId ? "✓ تم تعديل المصروف" : "✓ تم حفظ المصروف");
      }
      function deleteExpense(id) {
        if (!requireAction("delete")) return;
        if (!confirm("حذف هذا المصروف؟")) return;
        const exp = (DB.expenses || []).find((e) => e.id === id);
        if (exp && !requireUnlockedDate(exp.date, "حذف المصروف")) return;
        if (exp) addTrashRecord("expenses", exp.id, "مصروف", `${exp.name} - ${money(exp.amount)}`, exp);
        DB.expenses = (DB.expenses || []).filter((e) => e.id !== id);
        logActivity("حذف مصروف", id, exp ? `${exp.name} - ${money(exp.amount)}` : "");
        saveDB(); renderExpenses(); renderReports(); renderDash();
        toast("✓ تم حذف المصروف");
      }

      function openEditPur(id) {
        if (!requireAction("purchase")) return;
        const pur = DB.purchases.find((x) => x.id === id);
        if (!pur) return toast("⚠ الفاتورة غير موجودة");
        if (!requireUnlockedDate(pur.date, "تعديل فاتورة مشتريات")) return;
        if (!(pur.lineItems || []).length) return toast("⚠ لا يمكن تعديل فاتورة قديمة بدون تفاصيل الأصناف");
        openPurModal();
        editingPurId = id;
        document.getElementById("pur-modal-title").textContent = "تعديل فاتورة مشتريات " + id;
        document.getElementById("pur-save-btn").textContent = "حفظ التعديل";
        document.getElementById("pu-date").value = pur.date || today();
        const supId = pur.supId || (DB.suppliers.find((s) => s.name === pur.party) || {}).id || "";
        document.getElementById("pu-sup").value = supId;
        document.getElementById("pu-rows").innerHTML = "";
        (pur.lineItems || []).forEach((line) => addInvoiceRowWithData("pu", line));
        calcTotal("pu");
      }

      function savePur() {
        if (!requireAction("purchase")) return;
        const existing = editingPurId ? DB.purchases.find((x) => x.id === editingPurId) : null;
        if (editingPurId && !existing) { editingPurId = ""; return toast("⚠ الفاتورة غير موجودة"); }
        if (existing && !requireUnlockedDate(existing.date, "تعديل فاتورة مشتريات")) return;
        const { items, total, qtyTotal: totalQty } = collectInvoiceRows("pu");
        if (!items.length) return toast("⚠ أضف صنف واحد على الأقل");
        if (existing && !applyStockLines(existing.lineItems || [], -1)) return;
        applyStockLines(items, 1);
        const supId = document.getElementById("pu-sup").value;
        const sup = DB.suppliers.find((s) => s.id === supId);
        const pur = {
          id: existing ? existing.id : "PUR-" + pad(CNT.pur++),
          supId,
          party: sup ? sup.name : "غير محدد",
          date: document.getElementById("pu-date").value,
          items: items.map((i) => i.name + "×" + i.qty).join(" | "),
          lineItems: items,
          qtyTotal: totalQty,
          total,
        };
        if (existing) Object.assign(existing, pur);
        else DB.purchases.push(pur);
        editingPurId = "";
        recalcSuppliersFromPurchases();
        logActivity(existing ? "تعديل فاتورة مشتريات" : "إضافة فاتورة مشتريات", pur.id, `${pur.party} - ${money(pur.total)}`);
        saveDB();
        closeModal("m-pur");
        renderPur();
        renderInv();
        renderLowStock();
        renderSup();
        renderDash();
        toast(existing ? "✓ تم تعديل الفاتورة " + pur.id : "✓ تم حفظ الفاتورة " + pur.id);
      }

      function deletePur(id) {
        if (!requireAction("delete")) return;
        const pur = DB.purchases.find((x) => x.id === id);
        if (!pur) return toast("⚠ الفاتورة غير موجودة");
        if (!requireUnlockedDate(pur.date, "حذف فاتورة مشتريات")) return;
        if (!(pur.lineItems || []).length) return toast("⚠ لا يمكن حذف فاتورة قديمة بدون تفاصيل الأصناف");
        if (!confirm("حذف فاتورة المشتريات؟ الكمية هتتشال من المخزون.")) return;
        if (!applyStockLines(pur.lineItems || [], -1)) return;
        addTrashRecord("purchases", pur.id, "فاتورة مشتريات", `${pur.party || ""} - ${money(pur.total || 0)}`, pur);
        DB.purchases = DB.purchases.filter((x) => x.id !== id);
        if (editingPurId === id) editingPurId = "";
        recalcSuppliersFromPurchases();
        logActivity("حذف فاتورة مشتريات", id, `${pur.party || ""} - ${money(pur.total || 0)}`);
        saveDB();
        renderPur(); renderInv(); renderLowStock(); renderSup(); renderDash();
        toast("✓ تم حذف فاتورة المشتريات");
      }

      // ===== RETURN =====
      function populateReturnItems() {
        document.getElementById("r-item").innerHTML =
          '<option value="">-- اختر صنف --</option>' +
          DB.items
            .map(
              (i) => `<option value="${i.code}">${itemDisplayName(i)}</option>`,
            )
            .join("");
      }
      function openReturnModal() {
        if (!requireAction("return")) return;
        editingReturnId = "";
        populateReturnItems();
        document.getElementById("return-modal-title").textContent = "🔄 تسجيل مرتجع";
        document.getElementById("return-save-btn").textContent = "تسجيل المرتجع";
        document.getElementById("r-type").value = "مبيعات";
        document.getElementById("r-inv").value = "";
        document.getElementById("r-item").value = "";
        document.getElementById("r-qty").value = 1;
        document.getElementById("r-price").value = 0;
        document.getElementById("r-total").value = 0;
        document.getElementById("r-reason").selectedIndex = 0;
        document.getElementById("r-notes").value = "";
        openModal("m-return");
      }
      function updateReturnType() {
        onReturnItemSelect();
      }
      function onReturnItemSelect() {
        const code = document.getElementById("r-item").value;
        const it = DB.items.find((i) => i.code === code);
        if (!it) return;
        const type = document.getElementById("r-type").value;
        document.getElementById("r-price").value =
          type === "مبيعات" ? it.price : it.cost;
        calcReturn();
      }
      function calcReturn() {
        document.getElementById("r-total").value = (
          +document.getElementById("r-qty").value *
          +document.getElementById("r-price").value
        ).toFixed(2);
      }

      function returnItem(ret) {
        if (!ret) return null;
        return ret.code ? findItem(ret.code) : DB.items.find((i) => ret.itemName === i.name + " (" + i.size + ")");
      }

      function applyReturnStock(ret, direction) {
        const it = returnItem(ret);
        if (!it) { toast("⚠ الصنف غير موجود"); return false; }
        const qty = +ret.qty || 0;
        const delta = ret.type === "مبيعات" ? qty * direction : -qty * direction;
        if (delta < 0 && (+it.qty || 0) < Math.abs(delta)) {
          toast(`⚠ الكمية المتاحة من "${it.name}": ${it.qty}`);
          return false;
        }
        it.qty = (+it.qty || 0) + delta;
        return true;
      }

      function openEditReturn(id) {
        if (!requireAction("return")) return;
        const ret = DB.returns.find((r) => r.id === id);
        if (!ret) return toast("⚠ المرتجع غير موجود");
        if (!requireUnlockedDate(ret.date, "تعديل المرتجع")) return;
        const it = returnItem(ret);
        if (!it) return toast("⚠ لا يمكن تعديل مرتجع قديم بدون صنف معروف");
        openReturnModal();
        editingReturnId = id;
        document.getElementById("return-modal-title").textContent = "تعديل مرتجع " + id;
        document.getElementById("return-save-btn").textContent = "حفظ التعديل";
        document.getElementById("r-type").value = ret.type || "مبيعات";
        document.getElementById("r-inv").value = ret.invId || "";
        document.getElementById("r-item").value = it.code;
        document.getElementById("r-qty").value = +ret.qty || 1;
        document.getElementById("r-price").value = +ret.price || 0;
        document.getElementById("r-total").value = +ret.total || 0;
        document.getElementById("r-reason").value = ret.reason || document.getElementById("r-reason").options[0].value;
        document.getElementById("r-notes").value = ret.notes || "";
      }

      function saveReturn() {
        if (!requireAction("return")) return;
        const existing = editingReturnId ? DB.returns.find((r) => r.id === editingReturnId) : null;
        if (editingReturnId && !existing) { editingReturnId = ""; return toast("⚠ المرتجع غير موجود"); }
        const code = document.getElementById("r-item").value;
        const qty = +document.getElementById("r-qty").value;
        const price = +document.getElementById("r-price").value;
        const total = +document.getElementById("r-total").value;
        const type = document.getElementById("r-type").value;
        if (!code || !qty) return toast("⚠ اختر صنف وكمية");
        const it = DB.items.find((i) => i.code === code);
        if (!it) return;
        if (existing && !applyReturnStock(existing, -1)) return;
        const ret = {
          id: existing ? existing.id : "RET-" + pad(CNT.ret++),
          code,
          type,
          invId: document.getElementById("r-inv").value,
          itemName: itemDisplayName(it),
          qty,
          price,
          total,
          reason: document.getElementById("r-reason").value,
          notes: document.getElementById("r-notes").value,
          date: existing ? existing.date : today(),
        };
        if (!applyReturnStock(ret, 1)) {
          if (existing) applyReturnStock(existing, 1);
          return;
        }
        if (existing) Object.assign(existing, ret);
        else DB.returns.push(ret);
        editingReturnId = "";
        logActivity(existing ? "تعديل مرتجع" : "إضافة مرتجع", ret.id, `${ret.type} - ${money(ret.total)}`);
        saveDB();
        closeModal("m-return");
        renderReturns();
        renderInv();
        renderLowStock();
        renderDash();
        toast(existing ? "✓ تم تعديل المرتجع " + ret.id : "✓ تم تسجيل المرتجع " + ret.id);
      }

      function deleteReturn(id) {
        if (!requireAction("delete")) return;
        const ret = DB.returns.find((r) => r.id === id);
        if (!ret) return toast("⚠ المرتجع غير موجود");
        if (!requireUnlockedDate(ret.date, "حذف المرتجع")) return;
        const itemExists = !!returnItem(ret);
        const message = itemExists
          ? "حذف هذا المرتجع؟ تأثيره هيتعكس على المخزون."
          : "الصنف المرتبط بالمرتجع غير موجود في المخزون. حذف سجل المرتجع فقط بدون تعديل المخزون؟";
        if (!confirm(message)) return;
        if (itemExists && !applyReturnStock(ret, -1)) return;
        addTrashRecord("returns", ret.id, "مرتجع", `${ret.type || ""} - ${money(ret.total || 0)}`, ret);
        DB.returns = DB.returns.filter((r) => r.id !== id);
        if (editingReturnId === id) editingReturnId = "";
        logActivity("حذف مرتجع", id, `${ret.type || ""} - ${money(ret.total || 0)}${itemExists ? "" : " - بدون تعديل مخزون"}`);
        saveDB();
        renderReturns(); renderInv(); renderLowStock(); renderDash();
        toast(itemExists ? "✓ تم حذف المرتجع" : "✓ تم حذف سجل المرتجع فقط");
      }

      document.addEventListener("keydown", (e) => {
        if (document.getElementById("auth-screen")?.classList.contains("hidden")) return;
        if (e.key === "Enter") login();
      });
      setupTableDecorator();
      applyThemeMode();
      initMobileChromeCollapse();
      initMicroInteractions();
      loadUsers();
      loadDB();
      restoreSession();
