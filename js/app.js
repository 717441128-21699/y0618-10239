/* ========================================================================
 * 应用主逻辑 (app.js) — 核心 + 前半部分视图
 * 视图渲染、交互、业务流程
 * ====================================================================== */

const VIEW_TITLES = {
    dashboard: "工作台", inventory: "库存管理", inbound: "入库管理",
    outbound: "出库领用", expiry: "效期预警", purchase: "采购申请",
    coldchain: "冷链监控", check: "盘点管理", analysis: "趋势分析",
};

const App = {
    currentView: "dashboard",
    charts: {},
    state: { expiryFilter: "all", invSearch: "", invCat: "" },

    init() {
        DB.load();
        this.bindNav();
        this.bindTopbar();
        this.renderCurrentDate();
        this.updateBadges();
        this.navigate("dashboard");
        this.startColdChainSimulation();
    },

    bindNav() {
        document.querySelectorAll(".nav-item").forEach(el => {
            el.addEventListener("click", () => this.navigate(el.dataset.view));
        });
    },
    bindTopbar() {
        document.getElementById("toggleSidebar").addEventListener("click", () => {
            document.getElementById("sidebar").classList.toggle("collapsed");
        });
        document.getElementById("alertBell").addEventListener("click", () => this.navigate("expiry"));
    },
    navigate(view) {
        this.currentView = view;
        document.querySelectorAll(".nav-item").forEach(el => {
            el.classList.toggle("active", el.dataset.view === view);
        });
        document.getElementById("viewTitle").textContent = VIEW_TITLES[view] || view;
        const content = document.getElementById("content");
        content.innerHTML = "";
        Object.values(this.charts).forEach(c => { try { c.destroy(); } catch (e) {} });
        this.charts = {};
        const fn = this.views[view];
        if (fn) fn.call(this);
        content.scrollTop = 0;
    },
    renderCurrentDate() {
        const d = new Date();
        const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
        document.getElementById("currentDate").textContent =
            `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${week}`;
    },
    updateBadges() {
        const ex = BIZ.expiryStats();
        document.getElementById("badge-expiry").textContent = (ex.critical + ex.warning) || "";
        const pending = DB.filter("purchaseRequests", p => p.status === "待审批").length;
        document.getElementById("badge-purchase").textContent = pending || "";
        const alarms = BIZ.coldChainAlarms().length;
        const bc = document.getElementById("badge-cold");
        bc.textContent = alarms || "";
        bc.classList.toggle("badge-danger", alarms > 0);
        document.getElementById("alertDot").hidden = !(ex.critical > 0 || alarms > 0);
    },

    openModal(title, bodyHtml, footerHtml, size) {
        document.getElementById("modalTitle").textContent = title;
        document.getElementById("modalBody").innerHTML = bodyHtml;
        const modal = document.getElementById("modal");
        modal.classList.toggle("lg", size === "lg");
        let footer = modal.querySelector(".modal-footer");
        if (footerHtml) {
            if (!footer) { footer = document.createElement("div"); footer.className = "modal-footer"; modal.appendChild(footer); }
            footer.innerHTML = footerHtml; footer.style.display = "flex";
        } else if (footer) { footer.style.display = "none"; }
        document.getElementById("modalOverlay").classList.add("show");
    },
    closeModal() { document.getElementById("modalOverlay").classList.remove("show"); },
    toast(msg, type = "success") {
        const icon = { success: "fa-circle-check", error: "fa-circle-xmark", warning: "fa-triangle-exclamation", info: "fa-circle-info" }[type] || "fa-circle-check";
        const el = document.createElement("div");
        el.className = `toast ${type}`;
        el.innerHTML = `<i class="fas ${icon}"></i><span>${msg}</span>`;
        document.getElementById("toastContainer").appendChild(el);
        setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateX(120%)"; setTimeout(() => el.remove(), 300); }, 2800);
    },
    alarm(msg) {
        document.getElementById("alarmText").textContent = msg;
        document.getElementById("alarmToast").classList.add("show");
        setTimeout(() => document.getElementById("alarmToast").classList.remove("show"), 6000);
    },
    empty(icon, text) { return `<div class="empty"><i class="fas ${icon}"></i><p>${text}</p></div>`; },
    emptyCell(icon, text, span) { return `<tr><td colspan="${span}"><div class="empty" style="padding:30px"><i class="fas ${icon}"></i><p>${text}</p></div></td></tr>`; },

    startColdChainSimulation() {
        setInterval(() => {
            const coldBatches = DB.all("batches").filter(b => { const it = BIZ.getItem(b.itemId); return it && it.isColdChain && b.quantity > 0; });
            let alarmed = false;
            coldBatches.forEach(b => {
                const it = BIZ.getItem(b.itemId);
                let temp = (it.tempMin + it.tempMax) / 2 + (Math.random() * 2 - 1);
                if (b.id === "B-011") temp = it.tempMax + 1 + Math.random() * 2;
                const status = temp < it.tempMin ? "warning" : temp > it.tempMax ? "alarm" : "normal";
                DB.insert("tempLogs", { id: uid("TMP"), itemId: b.itemId, batchId: b.id, batchNo: b.batchNo, temperature: +temp.toFixed(1), timestamp: nowStr(), status });
                if (status === "alarm") alarmed = true;
            });
            coldBatches.forEach(b => {
                const logs = DB.filter("tempLogs", t => t.batchId === b.id).sort((a, c) => c.timestamp.localeCompare(a.timestamp));
                if (logs.length > 30) { const keep = new Set(logs.slice(0, 30).map(l => l.id)); DB.data.tempLogs = DB.data.tempLogs.filter(l => l.batchId !== b.id || keep.has(l.id)); }
            });
            DB.save();
            this.updateBadges();
            if (alarmed) { const alarm = BIZ.coldChainAlarms()[0]; if (alarm) this.alarm(`冷链告警：${alarm.item.name}（${alarm.batch.batchNo}）当前温度 ${alarm.temp.temperature}°C，超出存储范围！`); }
            if (this.currentView === "coldchain") {
                Object.values(this.charts).forEach(c => { try { c.destroy(); } catch (e) {} });
                this.charts = {};
                this.views.coldchain.call(this);
            }
        }, 20000);
    },

    views: {
        /* ---------- 工作台 ---------- */
        dashboard() {
            const items = DB.all("items"), batches = DB.all("batches");
            const ex = BIZ.expiryStats(), coldAlarms = BIZ.coldChainAlarms(), lowStock = BIZ.lowStockItems();
            const totalValue = batches.reduce((s, b) => s + b.quantity * (b.price || 0), 0);
            document.getElementById("content").innerHTML = `
            <div class="grid grid-4" style="margin-bottom:18px">
                <div class="kpi"><div class="kpi-icon teal"><i class="fas fa-boxes-stacked"></i></div>
                    <div><div class="kpi-label">在库物品品类</div><div class="kpi-value">${items.length}</div>
                    <div class="kpi-sub">活跃批次 ${batches.filter(b=>b.quantity>0).length} 个</div></div></div>
                <div class="kpi"><div class="kpi-icon blue"><i class="fas fa-coins"></i></div>
                    <div><div class="kpi-label">库存总价值</div><div class="kpi-value">${fmtMoney(totalValue)}</div>
                    <div class="kpi-sub up"><i class="fas fa-arrow-up"></i> 含冷链药品</div></div></div>
                <div class="kpi"><div class="kpi-icon amber"><i class="fas fa-hourglass-half"></i></div>
                    <div><div class="kpi-label">效期预警批次</div><div class="kpi-value text-warning">${ex.critical + ex.warning}</div>
                    <div class="kpi-sub">${ex.critical} 个临期30天 · ${ex.expired} 个已过期</div></div></div>
                <div class="kpi"><div class="kpi-icon red"><i class="fas fa-temperature-half"></i></div>
                    <div><div class="kpi-label">冷链温度告警</div><div class="kpi-value text-danger">${coldAlarms.length}</div>
                    <div class="kpi-sub">需立即处理</div></div></div>
            </div>
            <div class="grid grid-2" style="margin-bottom:18px">
                <div class="card">
                    <div class="card-head"><h3><i class="fas fa-triangle-exclamation text-warning"></i>低库存预警</h3>
                        <span class="tag tag-amber">${lowStock.length} 项</span></div>
                    <div class="card-body" style="padding:6px 18px">
                        ${lowStock.length ? lowStock.map(x => `
                            <div class="stat-row">
                                <div><span class="fw-700">${x.item.name}</span> <span class="muted">${x.item.spec}</span>
                                    ${x.item.isColdChain ? '<span class="tag tag-blue" style="margin-left:4px">冷链</span>' : ''}</div>
                                <div><span class="text-danger fw-700">${x.stock}</span> <span class="muted">/ ${x.item.safetyStock} ${x.item.unit}</span>
                                    <button class="btn btn-sm btn-primary" style="margin-left:8px" onclick="App.quickPurchase('${x.item.id}')">采购</button></div>
                            </div>`).join("") : App.empty("fa-check-circle", "所有物品库存充足")}
                    </div>
                </div>
                <div class="card">
                    <div class="card-head"><h3><i class="fas fa-hourglass-half text-warning"></i>效期预警</h3>
                        <button class="btn btn-sm btn-ghost" onclick="App.navigate('expiry')">查看全部 <i class="fas fa-arrow-right"></i></button></div>
                    <div class="card-body" style="padding:6px 18px">${App._expiryMiniList()}</div>
                </div>
            </div>
            <div class="grid grid-2">
                <div class="card">
                    <div class="card-head"><h3><i class="fas fa-temperature-half"></i>冷链实时状态</h3>
                        <button class="btn btn-sm btn-ghost" onclick="App.navigate('coldchain')">监控详情 <i class="fas fa-arrow-right"></i></button></div>
                    <div class="card-body">${App._coldMiniList()}</div>
                </div>
                <div class="card">
                    <div class="card-head"><h3><i class="fas fa-clock-rotate-left"></i>最近出入库活动</h3></div>
                    <div class="card-body" style="padding:0"><div class="timeline" style="padding:16px 18px 4px">${App._recentActivity()}</div></div>
                </div>
            </div>`;
        },
        _expiryMiniList() {
            const list = DB.all("batches").filter(b => b.quantity > 0 && daysToToday(b.expiryDate) <= 90).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)).slice(0, 5);
            if (!list.length) return this.empty("fa-check-circle", "暂无临期库存");
            return list.map(b => { const it = BIZ.getItem(b.itemId), st = BIZ.batchStatus(b);
                return `<div class="stat-row"><div><span class="fw-700">${it.name}</span> <span class="muted">${b.batchNo}</span></div><span class="tag ${st.cls}">${st.label}</span></div>`; }).join("");
        },
        _coldMiniList() {
            const coldItems = DB.all("batches").filter(b => { const it = BIZ.getItem(b.itemId); return it && it.isColdChain && b.quantity > 0; });
            if (!coldItems.length) return this.empty("fa-snowflake", "无冷链批次");
            return coldItems.slice(0, 5).map(b => {
                const it = BIZ.getItem(b.itemId), t = BIZ.latestTemp(b.id);
                const cls = !t ? "temp-normal" : t.status === "alarm" ? "temp-alarm" : t.status === "warning" ? "temp-warn" : "temp-normal";
                const stat = !t ? "—" : t.status === "alarm" ? "超温告警" : t.status === "warning" ? "低温预警" : "正常";
                const colorCls = cls === "temp-alarm" ? "text-danger" : cls === "temp-warn" ? "text-warning" : "text-success";
                const tagCls = cls === "temp-alarm" ? "tag-red" : cls === "temp-warn" ? "tag-amber" : "tag-green";
                return `<div class="stat-row"><div><span class="fw-700">${it.name}</span> <span class="muted">${b.batchNo}</span><br><span class="muted" style="font-size:11px">存储 ${it.tempMin}~${it.tempMax}°C</span></div>
                    <div style="text-align:right"><span class="temp-value ${colorCls}">${t ? t.temperature : "—"}</span><span class="muted">°C</span><br><span class="tag ${tagCls}" style="margin-top:2px">${stat}</span></div></div>`;
            }).join("");
        },
        _recentActivity() {
            const ins = DB.all("inboundRecords").slice(0, 3).map(r => ({ ...r, type: "in" }));
            const outs = DB.all("outboundRecords").slice(0, 3).map(r => ({ ...r, type: "out" }));
            const all = [...ins, ...outs].sort((a, b) => (b.inboundDate || b.outboundDate).localeCompare(a.inboundDate || a.outboundDate)).slice(0, 6);
            if (!all.length) return this.empty("fa-clock", "暂无活动");
            return all.map(r => {
                const it = BIZ.getItem(r.itemId), isIn = r.type === "in";
                const date = isIn ? r.inboundDate : r.outboundDate;
                const icon = isIn ? "fa-arrow-down" : "fa-arrow-up", color = isIn ? "var(--success)" : "var(--info)";
                const extra = !isIn && r.patient && r.patient !== "—" ? ` · <span class="muted">患者: ${r.patient}</span>` : "";
                const dept = !isIn ? ` · <span class="muted">${r.department}</span>` : ` · <span class="muted">${(BIZ.getSupplier(r.supplier) || {}).name || ""}</span>`;
                return `<div class="timeline-item"><div class="t-time">${fmtDate(date)} · ${isIn ? "入库" : "出库"}</div>
                    <div class="t-text"><i class="fas ${icon}" style="color:${color};margin-right:4px"></i><strong>${it.name}</strong> · 批号 ${r.batchNo} · ${r.quantity} ${it.unit}${extra}${dept}</div></div>`;
            }).join("");
        },
        quickPurchase(itemId) {
            const it = BIZ.getItem(itemId), stock = BIZ.itemStock(itemId);
            const qty = Math.ceil((it.safetyStock - stock) * 1.5);
            DB.insert("purchaseRequests", { id: BIZ.genPurchaseNo(), itemId, quantity: qty, reason: `库存低于安全线(${stock}<${it.safetyStock})，系统快速申请`, status: "待审批", requestDate: todayStr(), operator: "张药剂师", expectedDate: addDays(todayStr(), 5) });
            this.toast(`已为「${it.name}」生成采购申请`, "success");
            this.updateBadges();
            this.navigate("purchase");
        },

        /* ---------- 库存管理 ---------- */
        inventory() {
            document.getElementById("content").innerHTML = `
            <div class="toolbar">
                <div class="search"><i class="fas fa-search"></i><input type="text" id="invSearch" placeholder="搜索物品名称/编码..." value="${this.state.invSearch}"></div>
                <select id="invCat" style="max-width:140px">
                    <option value="">全部类别</option>
                    <option value="耗材" ${this.state.invCat === "耗材" ? "selected" : ""}>耗材</option>
                    <option value="药品" ${this.state.invCat === "药品" ? "selected" : ""}>药品</option>
                </select>
                <button class="btn" onclick="App.openMovementQuery()"><i class="fas fa-stream"></i> 库存流水查询</button>
                <div class="spacer"></div>
                <span class="muted">共 ${DB.all("items").length} 个品类</span>
            </div>
            <div class="card"><div class="table-wrap"><table class="data">
                <thead><tr><th>物品编码</th><th>物品名称</th><th>规格</th><th>类别</th><th>存储条件</th><th>当前库存</th><th>安全库存</th><th>批次</th><th>库存状态</th><th>操作</th></tr></thead>
                <tbody id="invBody">${this._invRows(this._filteredItems())}</tbody>
            </table></div></div>`;
            document.getElementById("invSearch").addEventListener("input", e => { this.state.invSearch = e.target.value; document.getElementById("invBody").innerHTML = this._invRows(this._filteredItems()); });
            document.getElementById("invCat").addEventListener("change", e => { this.state.invCat = e.target.value; document.getElementById("invBody").innerHTML = this._invRows(this._filteredItems()); });
        },
        _filteredItems() {
            const s = this.state.invSearch.toLowerCase();
            return DB.all("items").filter(it => (!s || it.name.toLowerCase().includes(s) || it.id.toLowerCase().includes(s)) && (!this.state.invCat || it.category === this.state.invCat));
        },
        _invRows(items) {
            if (!items.length) return this.emptyCell("fa-box-open", "未找到匹配物品", 10);
            return items.map(it => {
                const stock = BIZ.itemStock(it.id), batchCount = DB.filter("batches", b => b.itemId === it.id && b.quantity > 0).length;
                const low = stock < it.safetyStock;
                const status = stock === 0 ? '<span class="tag tag-red">缺货</span>' : low ? '<span class="tag tag-amber">偏低</span>' : '<span class="tag tag-green">充足</span>';
                const storage = it.isColdChain ? `<span class="tag tag-blue"><i class="fas fa-snowflake"></i> ${it.storageType} ${it.tempMin}~${it.tempMax}°C</span>` : `<span class="tag tag-gray">${it.storageType}</span>`;
                return `<tr><td>${it.id}</td><td><strong>${it.name}</strong></td><td>${it.spec}</td>
                    <td><span class="tag ${it.category === "药品" ? "tag-teal" : "tag-gray"}">${it.category}</span></td><td>${storage}</td>
                    <td><span class="fw-700 ${low ? "text-danger" : ""}">${stock}</span> ${it.unit}</td><td>${it.safetyStock} ${it.unit}</td>
                    <td>${batchCount}</td><td>${status}</td><td><button class="btn btn-sm btn-ghost" onclick="App.showItemDetail('${it.id}')"><i class="fas fa-eye"></i> 详情</button></td></tr>`;
            }).join("");
        },
        showItemDetail(itemId) {
            const it = BIZ.getItem(itemId), stock = BIZ.itemStock(itemId), value = BIZ.itemValue(itemId), usage30 = BIZ.itemUsage(itemId, 30);
            const fifo = BIZ.fifoBatches(itemId);
            const allBatches = DB.filter("batches", b => b.itemId === itemId).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
            const body = `
            <div class="detail-list" style="margin-bottom:18px">
                <div class="detail-item"><span class="lbl">物品名称</span><span class="val">${it.name}（${it.spec}）</span></div>
                <div class="detail-item"><span class="lbl">类别 / 编码</span><span class="val">${it.category} · ${it.id}</span></div>
                <div class="detail-item"><span class="lbl">存储条件</span><span class="val">${it.isColdChain ? `冷链 ${it.storageType} ${it.tempMin}~${it.tempMax}°C` : it.storageType}</span></div>
                <div class="detail-item"><span class="lbl">当前总库存</span><span class="val">${stock} ${it.unit}（价值 ${fmtMoney(value)}）</span></div>
                <div class="detail-item"><span class="lbl">安全库存</span><span class="val">${it.safetyStock} ${it.unit}</span></div>
                <div class="detail-item"><span class="lbl">近30天用量</span><span class="val">${usage30} ${it.unit}</span></div>
            </div>
            <h4 style="margin:8px 0 10px;font-size:14px"><i class="fas fa-layer-group"></i> 批次明细 ${fifo.length ? '· <span class="muted" style="font-weight:400">按 FIFO 发放顺序排列</span>' : ''}</h4>
            <div class="table-wrap"><table class="data">
                <thead><tr><th>发放顺序</th><th>批号</th><th>生产日期</th><th>有效期</th><th>剩余</th><th>供应商</th><th>数量</th><th>货位</th><th>状态</th><th>流水</th></tr></thead>
                <tbody>${allBatches.length ? allBatches.map(b => {
                    const st = BIZ.batchStatus(b), fifoIdx = fifo.findIndex(f => f.id === b.id), sup = BIZ.getSupplier(b.supplier), days = daysToToday(b.expiryDate);
                    const mvCount = BIZ.movementsByBatch(b.batchNo).length;
                    return `<tr ${fifoIdx === 0 ? 'style="background:#f0fdf4"' : ""}><td>${fifoIdx >= 0 ? `<span class="tag tag-green">#${fifoIdx + 1}</span>` : '<span class="muted">—</span>'}</td>
                        <td><strong>${b.batchNo}</strong></td><td>${fmtDate(b.productionDate)}</td><td>${fmtDate(b.expiryDate)}</td>
                        <td class="fw-700">${days > 0 ? days + "天" : '<span class="text-danger">已过期</span>'}</td><td>${sup ? sup.name : "—"}</td>
                        <td><strong>${b.quantity}</strong> / ${b.initialQty}</td><td>${b.location}</td><td><span class="tag ${st.cls}">${st.label}</span></td>
                        <td><a href="javascript:void(0)" onclick="App.showBatchTimeline('${b.batchNo}')" style="font-size:11px">查看 ${mvCount} 条 →</a></td></tr>`;
                }).join("") : this.emptyCell("fa-box-open", "暂无库存批次", 10)}</tbody>
            </table></div>`;
            this.openModal(`${it.name} - 库存详情`, body, `<button class="btn" onclick="App.closeModal()">关闭</button>`, "lg");
        },
        openMovementQuery() {
            const items = DB.all("items");
            const body = `<p class="muted" style="margin-bottom:10px">按批号或物品查询该批次/物品的全部库存动作流水（入库、出库、盘点调整等），形成可追责的时间线。</p>
            <div class="form-row" style="margin-bottom:14px">
                <div class="field"><label>按批号查询</label>
                    <input type="text" id="mq-batchno" placeholder="如：SY2025-1108A"></div>
                <div class="field"><label>或 按物品查询</label>
                    <select id="mq-item"><option value="">全部物品</option>${items.map(it => `<option value="${it.id}">${it.name}</option>`).join("")}</select></div>
                <div class="field" style="align-self:flex-end"><button class="btn btn-primary" onclick="App.runMovementQuery()"><i class="fas fa-search"></i> 查询流水</button></div>
            </div>
            <div id="mq-result">${this.empty("fa-stream", "输入批号或选择物品后点击查询").replace(/<div[^>]*>/, "").replace(/<\/div>$/, "")}</div>`;
            this.openModal("库存流水查询", body, `<button class="btn" onclick="App.closeModal()">关闭</button>`, "lg");
        },
        runMovementQuery() {
            const batchNo = document.getElementById("mq-batchno").value.trim();
            const itemId = document.getElementById("mq-item").value;
            let list = [];
            if (batchNo) list = BIZ.movementsByBatch(batchNo);
            else if (itemId) list = BIZ.movementsByItem(itemId);
            else { DB.all("stockMovements").forEach(m => list.push(m)); list.sort((a, b) => b.movementDate.localeCompare(a.movementDate)); list = list.slice(0, 100); }
            this.__mqList = list;
            this.__mqBatchNo = batchNo;
            this.__mqItemId = itemId;
            const box = document.getElementById("mq-result");
            if (!list.length) { box.innerHTML = this.empty("fa-circle-exclamation", "未找到流水记录").replace(/<div[^>]*>/, "").replace(/<\/div>$/, ""); return; }
            box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <span class="muted">共 ${list.length} 条流水记录${batchNo ? `（批号 ${batchNo}）` : itemId ? `（物品 ${BIZ.getItem(itemId).name}）` : '（最近 100 条）'}</span>
                <button class="btn btn-sm btn-ghost" onclick="App.exportMovementQuery()"><i class="fas fa-file-export"></i> 导出 CSV</button>
            </div>
            <div class="table-wrap"><table class="data" style="font-size:13px">
                <thead><tr><th>日期</th><th>类型</th><th>物品</th><th>批号</th><th>方向</th><th>数量</th><th>操作人</th><th>关联单据</th><th>备注</th></tr></thead>
                <tbody>${list.map(m => {
                    const it = BIZ.getItem(m.itemId);
                    const dirColor = m.direction === "IN" ? "text-success" : "text-danger";
                    const sign = m.direction === "IN" ? "+" : "-";
                    const typeTag = m.movementType === "入库" ? '<span class="tag tag-green">入库</span>' :
                                   m.movementType === "出库" ? '<span class="tag tag-teal">出库</span>' :
                                   m.movementType === "盘点调整" ? '<span class="tag tag-amber">盘点调整</span>' :
                                   m.movementType === "报废销毁" ? '<span class="tag tag-red">报废</span>' :
                                   m.movementType === "退回供应商" ? '<span class="tag tag-orange">退货</span>' : `<span class="tag tag-gray">${m.movementType}</span>`;
                    return `<tr><td>${fmtDate(m.movementDate)}</td><td>${typeTag}</td>
                        <td>${it ? it.name : "—"}</td><td><strong>${m.batchNo}</strong></td>
                        <td>${m.direction === "IN" ? '<span class="text-success">↑入库</span>' : '<span class="text-danger">↓出库</span>'}</td>
                        <td class="fw-700 ${dirColor}">${sign}${m.quantity}${it ? it.unit : ""}</td>
                        <td>${m.operator}</td><td>${m.refNo || "—"}</td><td style="max-width:260px">${m.remark || "—"}</td></tr>`;
                }).join("")}</tbody>
            </table></div>`;
        },
        exportMovementQuery() {
            const list = this.__mqList || [];
            if (!list.length) return this.toast("暂无可导出的流水", "warning");
            const csv = BIZ.movementsToCSV(list);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            const suf = this.__mqBatchNo ? "批次_" + this.__mqBatchNo : this.__mqItemId ? "物品_" + this.__mqItemId : "全部";
            link.download = `库存流水_${suf}_${todayStr()}.csv`;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            this.toast(`已导出 ${list.length} 条流水记录`, "success");
        },

        /* ---------- 入库管理 ---------- */
        inbound() {
            const records = DB.all("inboundRecords");
            document.getElementById("content").innerHTML = `
            <div class="toolbar">
                <button class="btn btn-primary" onclick="App.openInboundForm()"><i class="fas fa-plus"></i> 新增入库</button>
                <button class="btn" onclick="App.openReceiveCheck()"><i class="fas fa-clipboard-check"></i> 到货核对</button>
                <div class="spacer"></div><span class="muted">共 ${records.length} 条入库记录</span>
            </div>
            <div class="card"><div class="table-wrap"><table class="data">
                <thead><tr><th>入库单号</th><th>物品</th><th>批号</th><th>数量</th><th>供应商</th><th>生产日期</th><th>有效期</th><th>入库日期</th><th>单价</th><th>操作人</th><th>核对</th></tr></thead>
                <tbody>${records.length ? records.slice(0, 50).map(r => { const it = BIZ.getItem(r.itemId), sup = BIZ.getSupplier(r.supplier);
                    return `<tr><td>${r.receiptNo}</td><td><strong>${it.name}</strong><br><span class="muted" style="font-size:11px">${it.spec}</span></td>
                        <td>${r.batchNo}</td><td>${r.quantity} ${it.unit}</td><td>${sup ? sup.name : "—"}</td>
                        <td>${fmtDate(r.productionDate)}</td><td>${fmtDate(r.expiryDate)}</td><td>${fmtDate(r.inboundDate)}</td>
                        <td>${fmtMoney(r.price)}</td><td>${r.operator}</td><td>${r.checked ? '<span class="tag tag-green"><i class="fas fa-check"></i> 已核对</span>' : '<span class="tag tag-amber">待核对</span>'}</td></tr>`;
                }).join("") : this.emptyCell("fa-truck-ramp-box", "暂无入库记录", 11)}</tbody>
            </table></div></div>`;
        },
        openInboundForm(prefill) {
            const items = DB.all("items"), suppliers = DB.all("suppliers");
            const body = `
            <div class="form-row">
                <div class="field"><label>物品 <span class="text-danger">*</span></label>
                    <select id="ib-item"><option value="">请选择物品</option>${items.map(it => `<option value="${it.id}" ${prefill && prefill.itemId === it.id ? "selected" : ""}>${it.name}（${it.spec}）- ${it.category}${it.isColdChain ? " [冷链]" : ""}</option>`).join("")}</select></div>
                <div class="field"><label>批号 <span class="text-danger">*</span></label><input type="text" id="ib-batchno" placeholder="如 SY2026-0601A"></div>
            </div>
            <div class="form-row">
                <div class="field"><label>生产日期 <span class="text-danger">*</span></label><input type="date" id="ib-proddate" value="${addDays(todayStr(), -365)}"></div>
                <div class="field"><label>有效期 <span class="text-danger">*</span></label><input type="date" id="ib-expdate" value="${addDays(todayStr(), 365)}"><span class="hint" id="ib-exp-tip"></span></div>
            </div>
            <div class="form-row">
                <div class="field"><label>供应商 <span class="text-danger">*</span></label><select id="ib-supplier">${suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join("")}</select></div>
                <div class="field"><label>入库数量 <span class="text-danger">*</span></label><input type="number" id="ib-qty" min="1" value="100"></div>
            </div>
            <div class="form-row">
                <div class="field"><label>单价（元）</label><input type="number" id="ib-price" min="0" step="0.01" value="0"></div>
                <div class="field"><label>货位</label><input type="text" id="ib-location" placeholder="如 A-01-03"></div>
            </div>
            <div class="form-row form-row-1"><div class="field"><label>入库日期</label><input type="date" id="ib-date" value="${todayStr()}"></div></div>
            <div class="hint" style="margin-top:8px"><i class="fas fa-info-circle"></i> 系统将自动生成入库单号并创建批次库存，按先进先出原则纳入发放队列。</div>`;
            this.openModal("新增入库 - 录入批次信息", body, `<button class="btn" onclick="App.closeModal()">取消</button><button class="btn btn-primary" onclick="App.saveInbound()"><i class="fas fa-check"></i> 确认入库</button>`, "lg");
            const calc = () => { const tip = document.getElementById("ib-exp-tip"), exp = document.getElementById("ib-expdate").value; if (tip && exp) { const d = daysToToday(exp); tip.textContent = d > 0 ? `距今天 ${d} 天` : "已过期"; } };
            document.getElementById("ib-expdate").addEventListener("change", calc);
            setTimeout(calc, 100);
        },
        saveInbound() {
            const itemId = document.getElementById("ib-item").value, batchNo = document.getElementById("ib-batchno").value.trim();
            const prodDate = document.getElementById("ib-proddate").value, expDate = document.getElementById("ib-expdate").value;
            const supplier = document.getElementById("ib-supplier").value, qty = parseInt(document.getElementById("ib-qty").value);
            const price = parseFloat(document.getElementById("ib-price").value) || 0;
            const location = document.getElementById("ib-location").value.trim() || "未指定";
            const date = document.getElementById("ib-date").value;
            if (!itemId || !batchNo || !prodDate || !expDate || !qty || qty < 1) return this.toast("请填写完整的必填项", "error");
            if (expDate <= prodDate) return this.toast("有效期必须晚于生产日期", "error");
            const batchId = uid("B"), receiptNo = BIZ.genReceiptNo();
            DB.insert("batches", { id: batchId, itemId, batchNo, productionDate: prodDate, expiryDate: expDate, supplier, quantity: qty, initialQty: qty, inboundDate: date, price, location, inboundOperator: "张药剂师", receiptNo });
            const inId = uid("IN");
            DB.insert("inboundRecords", { id: inId, itemId, batchId, batchNo, quantity: qty, supplier, productionDate: prodDate, expiryDate: expDate, inboundDate: date, operator: "张药剂师", price, receiptNo, checked: true });
            BIZ.recordMovement({
                movementType: "入库", movementDate: date,
                itemId, batchId, batchNo, quantity: qty, balanceAfter: qty,
                direction: "IN", operator: "张药剂师",
                refType: "inbound", refId: inId, refNo: receiptNo,
                remark: "新增入库 - 批号 " + batchNo
            });
            const it = BIZ.getItem(itemId), d = daysToToday(expDate);
            this.toast(`入库成功：${it.name} ${qty}${it.unit}，批号 ${batchNo}（${d > 0 ? "有效期 " + d + " 天" : "已过期"}）`, "success");
            this.closeModal(); this.updateBadges(); this.navigate("inbound");
        },
        openReceiveCheck() {
            const pending = DB.filter("purchaseRequests", p => p.status === "已批准");
            const body = `<p class="muted" style="margin-bottom:14px">采购到货后，核对入库单与实物一致后完成入库。以下为已批准待到货的采购申请：</p>
                ${pending.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>采购单号</th><th>物品</th><th>采购数量</th><th>期望到货</th><th>状态</th><th>操作</th></tr></thead>
                <tbody>${pending.map(p => { const it = BIZ.getItem(p.itemId); return `<tr><td>${p.id}</td><td>${it.name}</td><td>${p.quantity} ${it.unit}</td><td>${fmtDate(p.expectedDate)}</td><td><span class="tag tag-amber">待到货核对</span></td><td><button class="btn btn-sm btn-success" onclick="App.confirmReceive('${p.id}')"><i class="fas fa-check"></i> 核对入库</button></td></tr>`; }).join("")}</tbody></table></div>` : this.empty("fa-clipboard-check", "暂无待核对到货的采购单")}`;
            this.openModal("到货核对入库", body, `<button class="btn" onclick="App.closeModal()">关闭</button>`, "lg");
        },
        confirmReceive(prId) {
            const pr = DB.find("purchaseRequests", p => p.id === prId);
            if (!pr) return;
            const it = BIZ.getItem(pr.itemId), batchId = uid("B"), receiptNo = BIZ.genReceiptNo();
            const prodDate = addDays(todayStr(), -300), expDate = addDays(todayStr(), 65), sup = DB.all("suppliers")[0];
            const batchNo = "RC" + receiptNo.slice(-6);
            DB.insert("batches", { id: batchId, itemId: pr.itemId, batchNo, productionDate: prodDate, expiryDate: expDate, supplier: sup.id, quantity: pr.quantity, initialQty: pr.quantity, inboundDate: todayStr(), price: 0, location: "待上架", inboundOperator: "张药剂师", receiptNo });
            const inId = uid("IN");
            DB.insert("inboundRecords", { id: inId, itemId: pr.itemId, batchId, batchNo, quantity: pr.quantity, supplier: sup.id, productionDate: prodDate, expiryDate: expDate, inboundDate: todayStr(), operator: "张药剂师", price: 0, receiptNo, checked: true });
            DB.update("purchaseRequests", prId, { status: "已到货" });
            BIZ.recordMovement({
                movementType: "入库", movementDate: todayStr(),
                itemId: pr.itemId, batchId, batchNo, quantity: pr.quantity, balanceAfter: pr.quantity,
                direction: "IN", operator: "张药剂师",
                refType: "inbound", refId: inId, refNo: receiptNo,
                remark: "采购到货核对入库 - 采购单 " + prId
            });
            this.toast(`到货核对完成：${it.name} ${pr.quantity}${it.unit} 已入库`, "success");
            this.closeModal(); this.updateBadges(); this.navigate("inbound");
        },

        /* ---------- 出库领用 ---------- */
        outbound() {
            const records = DB.all("outboundRecords");
            document.getElementById("content").innerHTML = `
            <div class="toolbar">
                <button class="btn btn-primary" onclick="App.openOutboundForm()"><i class="fas fa-qrcode"></i> 扫码出库</button>
                <button class="btn" onclick="App.openTraceForm()"><i class="fas fa-magnifying-glass"></i> 追溯查询</button>
                <div class="spacer"></div><span class="muted">共 ${records.length} 条出库记录</span>
            </div>
            <div class="card"><div class="table-wrap"><table class="data">
                <thead><tr><th>出库时间</th><th>物品</th><th>批号</th><th>数量</th><th>领用科室</th><th>领用人</th><th>用途</th><th>患者追溯</th></tr></thead>
                <tbody>${records.length ? records.slice(0, 50).map(r => { const it = BIZ.getItem(r.itemId);
                    return `<tr><td>${fmtDate(r.outboundDate)}</td><td><strong>${it.name}</strong><br><span class="muted" style="font-size:11px">${it.spec}</span></td>
                        <td>${r.batchNo}</td><td>${r.quantity} ${it.unit}</td><td><span class="tag tag-teal">${r.department}</span></td>
                        <td>${r.operator}</td><td>${r.purpose}</td><td>${r.patient && r.patient !== "—" ? `<span class="tag tag-blue"><i class="fas fa-user"></i> ${r.patient}</span>` : '<span class="muted">—</span>'}</td></tr>`;
                }).join("") : this.emptyCell("fa-cart-shopping", "暂无出库记录", 8)}</tbody>
            </table></div></div>`;
        },
        openOutboundForm() {
            const items = DB.all("items").filter(it => BIZ.validBatches(it.id).length > 0);
            const body = `
            <div class="scan-box"><i class="fas fa-qrcode"></i><p>请扫描耗材/药品包装上的批次条码，或手动选择物品出库</p>
                <button class="btn btn-primary btn-sm" onclick="App.simulateScan()"><i class="fas fa-barcode"></i> 模拟扫码</button></div>
            <div class="form-row">
                <div class="field"><label>选择物品 <span class="text-danger">*</span></label>
                    <select id="ob-item" onchange="App.onOutboundItemChange()"><option value="">请选择物品</option>${items.map(it => `<option value="${it.id}">${it.name}（${it.spec}）- 库存 ${BIZ.itemStock(it.id)}${it.unit}</option>`).join("")}</select></div>
                <div class="field"><label>出库数量 <span class="text-danger">*</span></label><input type="number" id="ob-qty" min="1" value="1" oninput="App.onOutboundItemChange()"></div>
            </div>
            <div class="form-row">
                <div class="field"><label>发放策略 <span class="text-danger">*</span>  <span class="hint">默认先进先出，药品建议切换近效期优先</span></label>
                    <div style="display:flex;gap:10px;margin-top:4px">
                        <label style="flex:1;padding:10px;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:8px" class="strategy-label strategy-active" data-strategy="FIFO">
                            <input type="radio" name="ob-strategy" value="FIFO" checked onchange="App.setOutboundStrategy('FIFO')">
                            <div><div style="font-weight:700">先进先出 (FIFO)</div><span class="muted" style="font-size:11px">按入库顺序发放，适合普通耗材</span></div>
                        </label>
                        <label style="flex:1;padding:10px;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:8px" class="strategy-label" data-strategy="FEFO">
                            <input type="radio" name="ob-strategy" value="FEFO" onchange="App.setOutboundStrategy('FEFO')">
                            <div><div style="font-weight:700">近效期优先 (FEFO)</div><span class="muted" style="font-size:11px">优先消耗近效期批次，避免过期浪费</span></div>
                        </label>
                    </div>
                </div>
            </div>
            <div id="ob-fifo-info" style="margin-bottom:14px"></div>
            <div class="form-row">
                <div class="field"><label>领用科室 <span class="text-danger">*</span></label><select id="ob-dept"><option>手术室</option><option>急诊科</option><option>心内科</option><option>普外科</option><option>骨科</option><option>ICU</option><option>儿科</option><option>其他</option></select></div>
                <div class="field"><label>领用人 <span class="text-danger">*</span></label><input type="text" id="ob-operator" placeholder="领用人姓名"></div>
            </div>
            <div class="form-row">
                <div class="field"><label>用途</label><input type="text" id="ob-purpose" placeholder="如：手术用、急救用药"></div>
                <div class="field"><label>患者追溯（姓名/住院号）</label><input type="text" id="ob-patient" placeholder="如：张三(住院号:102391)"></div>
            </div>`;
            this.openModal("出库领用 - 扫码发放", body, `<button class="btn" onclick="App.closeModal()">取消</button><button class="btn btn-primary" onclick="App.saveOutbound()"><i class="fas fa-check"></i> 确认出库</button>`, "lg");
            /* 策略高亮样式 */
            const style = document.createElement("style");
            style.id = "ob-style";
            style.textContent = `.strategy-active{border-color:var(--primary)!important;background:var(--primary-soft);}`;
            if (!document.getElementById("ob-style")) document.head.appendChild(style);
        },
        setOutboundStrategy(strategy) {
            document.querySelectorAll(".strategy-label").forEach(el => {
                el.classList.toggle("strategy-active", el.dataset.strategy === strategy);
            });
            this.onOutboundItemChange();
        },
        simulateScan() {
            const items = DB.all("items").filter(it => BIZ.validBatches(it.id).length > 0);
            if (!items.length) return this.toast("当前无可用库存", "warning");
            const pick = items[Math.floor(Math.random() * items.length)];
            document.getElementById("ob-item").value = pick.id;
            this.onOutboundItemChange();
            this.toast(`已扫描：${pick.name}`, "info");
        },
        onOutboundItemChange() {
            const itemId = document.getElementById("ob-item").value, qty = parseInt(document.getElementById("ob-qty").value) || 0;
            const strategy = (document.querySelector('input[name="ob-strategy"]:checked') || {}).value || "FIFO";
            const info = document.getElementById("ob-fifo-info");
            if (!itemId) { info.innerHTML = ""; return; }
            const it = BIZ.getItem(itemId);
            const result = BIZ.planIssue(itemId, qty, strategy);
            if (!result.plan.length) { info.innerHTML = `<span class="tag tag-red">该物品无可用库存</span>`; return; }
            const headerColor = result.ok ? "var(--primary)" : "var(--danger)";
            const headerBg = result.ok ? "var(--primary-soft)" : "var(--danger-soft)";
            info.innerHTML = `<div class="card" style="border:2px solid ${headerColor};background:${headerBg}">
                <div class="card-head" style="padding:10px 14px;border-bottom:1px dashed ${headerColor}">
                    <div style="font-weight:700"><i class="fas fa-sort-amount-down-alt"></i> 发放计划 · ${result.label}
                        ${result.ok ? '<span class="tag tag-green" style="margin-left:6px">库存充足</span>' : `<span class="tag tag-red" style="margin-left:6px">缺 ${result.shortage}${it.unit}</span>`}
                    </div>
                    <div style="font-size:12px;color:var(--text-muted)">共扣 ${result.plan.length} 个批次 · 实发 ${result.totalUse}${it.unit}${qty > result.totalUse ? ` / 请求 ${qty}${it.unit}` : ""}</div>
                </div>
                <div class="card-body" style="padding:4px 14px">
                    <table class="data" style="font-size:13px">
                        <thead><tr><th style="padding:8px 4px">批次</th><th style="padding:8px 4px">生产日期</th><th style="padding:8px 4px">有效期</th>
                            <th style="padding:8px 4px">货位</th><th style="padding:8px 4px">库存</th><th style="padding:8px 4px">扣减</th><th style="padding:8px 4px">剩余</th></tr></thead>
                        <tbody>
                            ${result.plan.map(p => { const sup = BIZ.getSupplier(p.supplier); const st = BIZ.batchStatus(p); return `<tr>
                                <td style="padding:8px 4px"><strong>${p.batchNo}</strong><br><span class="muted" style="font-size:11px">${sup ? sup.name.slice(0,10) : ""}</span></td>
                                <td style="padding:8px 4px">${fmtDate(p.productionDate)}</td>
                                <td style="padding:8px 4px">${fmtDate(p.expiryDate)} <span class="tag ${st.cls}" style="margin-left:4px">${st.label}</span></td>
                                <td style="padding:8px 4px">${p.location || "—"}</td>
                                <td style="padding:8px 4px">${p.use + p.left}${it.unit}</td>
                                <td style="padding:8px 4px"><span class="fw-700 text-danger">- ${p.use}</span>${it.unit}</td>
                                <td style="padding:8px 4px"><span class="fw-700">${p.left}</span>${it.unit}</td>
                            </tr>`; }).join("")}
                        </tbody>
                    </table>
                </div>
            </div>`;
        },
        saveOutbound() {
            const itemId = document.getElementById("ob-item").value, qty = parseInt(document.getElementById("ob-qty").value);
            const dept = document.getElementById("ob-dept").value, operator = document.getElementById("ob-operator").value.trim();
            const purpose = document.getElementById("ob-purpose").value.trim(), patient = document.getElementById("ob-patient").value.trim() || "—";
            const strategy = (document.querySelector('input[name="ob-strategy"]:checked') || {}).value || "FIFO";
            if (!itemId || !qty || qty < 1) return this.toast("请选择物品并填写数量", "error");
            if (!operator) return this.toast("请填写领用人", "error");
            const result = BIZ.planIssue(itemId, qty, strategy);
            if (!result.ok) return this.toast(`库存不足，最多可发放 ${result.totalUse} ${BIZ.getItem(itemId).unit}（缺 ${result.shortage}）`, "error");
            const it = BIZ.getItem(itemId);
            const outboundId = uid("OUT");
            result.plan.forEach(p => {
                DB.update("batches", p.batchId, { quantity: p.left });
                DB.insert("outboundRecords", { id: outboundId, itemId, batchId: p.batchId, batchNo: p.batchNo, quantity: p.use, department: dept, operator, purpose: purpose || "—", patient, outboundDate: todayStr(), strategy });
                BIZ.recordMovement({
                    movementType: "出库", movementDate: todayStr(),
                    itemId, batchId: p.batchId, batchNo: p.batchNo, quantity: p.use,
                    direction: "OUT", operator,
                    refType: "outbound", refId: outboundId, refNo: outboundId,
                    remark: `${dept} - ${purpose || "—"}${patient !== "—" ? " - " + patient : ""} (${strategy})`
                });
            });
            this.toast(`出库成功：${it.name} ${result.totalUse}${it.unit}（${result.label}，${result.plan.length} 个批次）`, "success");
            this.closeModal(); this.updateBadges(); this.navigate("outbound");
            if (BIZ.itemStock(itemId) < it.safetyStock) {
                const exist = DB.find("purchaseRequests", p => p.itemId === itemId && p.status === "待审批");
                if (!exist) {
                    const stock = BIZ.itemStock(itemId);
                    DB.insert("purchaseRequests", { id: BIZ.genPurchaseNo(), itemId, quantity: Math.ceil((it.safetyStock - stock) * 1.5), reason: `出库后库存低于安全线(${stock}<${it.safetyStock})，自动触发采购`, status: "待审批", requestDate: todayStr(), operator: "系统自动", expectedDate: addDays(todayStr(), 5) });
                    this.toast(`已自动触发「${it.name}」采购申请`, "warning");
                    this.updateBadges();
                }
            }
        },
        openTraceForm() {
            const depts = Array.from(new Set(DB.all("outboundRecords").map(o => o.department)));
            const body = `
            <div class="form-row" style="margin-bottom:12px">
                <div class="field"><label>关键词（患者/住院号/批号/物品）</label>
                    <input type="text" id="trace-kw" placeholder="如：张建国 / 102391 / SY2025-0312B"></div>
                <div class="field"><label>领用科室</label>
                    <select id="trace-dept"><option value="">全部科室</option>${depts.map(d => `<option value="${d}">${d}</option>`).join("")}</select></div>
            </div>
            <div class="form-row" style="margin-bottom:18px">
                <div class="field"><label>起始日期</label><input type="date" id="trace-date-start" value="${addDays(todayStr(), -30)}"></div>
                <div class="field"><label>结束日期</label><input type="date" id="trace-date-end" value="${todayStr()}"></div>
            </div>
            <div id="trace-result">${this.empty("fa-magnifying-glass", "点击「查询」按钮搜索耗材/药品完整链路").replace(/<div[^>]*>/, "").replace(/<\/div>$/, "")}</div>`;
            this.openModal("完整链路追溯查询", body, `<button class="btn" onclick="App.closeModal()">关闭</button><button class="btn btn-primary" onclick="App.runTrace()"><i class="fas fa-search"></i> 完整链路查询</button>`, "lg");
            document.getElementById("trace-kw").addEventListener("keydown", e => { if (e.key === "Enter") this.runTrace(); });
        },
        runTrace() {
            const kw = document.getElementById("trace-kw").value.trim().toLowerCase();
            const dept = document.getElementById("trace-dept").value;
            const ds = document.getElementById("trace-date-start").value;
            const de = document.getElementById("trace-date-end").value;
            const chains = BIZ.traceChain(kw);
            /* 应用额外筛选：科室 + 日期 */
            const filtered = chains.filter(c => {
                const o = c.outbound;
                if (dept && o.department !== dept) return false;
                if (ds && o.outboundDate < ds) return false;
                if (de && o.outboundDate > de) return false;
                return true;
            }).sort((a, b) => b.outbound.outboundDate.localeCompare(a.outbound.outboundDate));
            const box = document.getElementById("trace-result");
            if (!filtered.length) { this._lastTraceResults = []; box.innerHTML = this.empty("fa-circle-exclamation", "未找到匹配的链路记录，请调整筛选条件").replace(/<div[^>]*>/, "").replace(/<\/div>$/, ""); return; }
            this._lastTraceResults = filtered;
            box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <div class="muted">查询条件：关键词「${kw || "全部"}」${dept ? ` · 科室「${dept}」` : ""}${ds || de ? ` · 日期「${ds || "不限"} ~ ${de || "不限"}」` : ""} · 共命中 <strong>${filtered.length}</strong> 条完整链路</div>
                <button class="btn btn-sm btn-ghost" onclick="App.exportTrace()"><i class="fas fa-file-export"></i> 导出 CSV（含链路信息）</button>
            </div>
                ${filtered.map(c => {
                    const o = c.outbound, it = c.item, sup = c.supplier, ib = c.inbound;
                    const total = ((ib && ib.quantity) || "-") + (it ? (it.unit ? " " + it.unit : "") : "");
                    /* 该批次的盘点调整记录 */
                    const adjustMvs = BIZ.movementsByBatch(o.batchNo).filter(m => m.movementType === "盘点调整");
                    return `<div class="card" style="margin-bottom:12px;border-color:var(--border)">
                        <div class="card-head" style="padding:10px 14px">
                            <div style="font-weight:700"><i class="fas fa-box" style="color:var(--primary)"></i> ${it ? it.name : "未知物品"} <span class="muted" style="font-weight:400;font-size:12px">（${it ? it.spec : ""}）</span>
                                <a href="javascript:void(0)" onclick="App.showBatchTimeline('${o.batchNo}')" style="margin-left:8px;text-decoration:none"><span class="tag tag-blue">批次 ${o.batchNo}</span></a>
                                ${o.strategy ? `<span class="tag tag-gray" style="margin-left:4px">${o.strategy}</span>` : ""}
                            </div>
                            <span class="muted">出库 ${fmtDate(o.outboundDate)} · ${o.quantity}${it ? it.unit : ""}</span>
                        </div>
                        <div class="card-body" style="padding:10px 14px">
                            <div class="timeline" style="padding-left:20px;padding-top:4px">
                                <div class="timeline-item" style="padding-bottom:10px">
                                    <div class="t-time">① 采购入库 ${ib ? fmtDate(ib.inboundDate) : "未知"} ${sup ? `<span class="tag tag-gray" style="margin-left:6px">${sup.name.slice(0,12)}</span>` : ""} ${ib ? `<a href="javascript:void(0)" onclick="App.showInboundDetail('${ib.id}')" style="margin-left:6px;font-size:11px">查看入库单 →</a>` : ""}</div>
                                    <div class="t-text">
                                        <strong>供应商：</strong>${sup ? `${sup.name}${sup.license ? ` <span class="muted">(${sup.license})</span>` : ""}` : "—"}<br>
                                        <strong>入库单号：</strong>${ib ? ib.receiptNo : "—"} · <strong>入库数量：</strong>${total}<br>
                                        <strong>生产/有效期：</strong>${ib ? fmtDate(ib.productionDate) : "—"} ~ ${ib ? fmtDate(ib.expiryDate) : "—"}${ib && ib.checked ? ' · <span class="tag tag-green" style="margin-left:4px">已核对</span>' : ''}<br>
                                        <strong>入库操作：</strong>${ib ? ib.operator : "—"} · <strong>货位：</strong>${c.batch ? (c.batch.location || "—") : "—"}
                                    </div>
                                </div>
                                <div class="timeline-item" style="padding-bottom:${adjustMvs.length ? '10px' : '0'}">
                                    <div class="t-time">② 发放出库 ${fmtDate(o.outboundDate)} <span class="tag tag-teal" style="margin-left:6px">${o.department}</span></div>
                                    <div class="t-text">
                                        <strong>领用人：</strong>${o.operator} ·
                                        <strong>发放数量：</strong><span class="fw-700 text-danger">${o.quantity}${it ? it.unit : ""}</span> ·
                                        <strong>使用用途：</strong>${o.purpose || "—"}<br>
                                        <strong>患者追溯：</strong>${o.patient && o.patient !== "—" ? `<span class="tag tag-blue"><i class="fas fa-user"></i> ${o.patient}</span>` : '<span class="muted">未关联患者</span>'}
                                    </div>
                                </div>
                                ${adjustMvs.length ? `<div class="timeline-item" style="padding-bottom:0">
                                    <div class="t-time">③ 盘点调整（${adjustMvs.length} 次）</div>
                                    <div class="t-text">
                                        ${adjustMvs.map(m => `<div style="padding:2px 0">${fmtDate(m.movementDate)} · ${m.remark} · <span class="fw-700 ${m.direction === 'IN' ? 'text-success' : 'text-danger'}">${m.direction === 'IN' ? '+' : '-'}${m.quantity}</span> · 操作人 ${m.operator}</div>`).join("")}
                                        <a href="javascript:void(0)" onclick="App.showBatchTimeline('${o.batchNo}')" style="font-size:11px">查看完整批次流水 →</a>
                                    </div>
                                </div>` : ''}
                            </div>
                        </div>
                    </div>`;
                }).join("")}
            </div>`;
        },
        exportTrace() {
            /* 取最后一次查询的缓存（存于 App._lastTraceResults） */
            const data = this._lastTraceResults || [];
            if (!data.length) return this.toast("没有可导出的查询结果", "warning");
            const header = ["序号","物品","规格","批号","供应商","入库单号","入库日期","入库数量","生产日期","有效期","出库日期","出库数量","领用科室","领用人","使用用途","患者追溯","发放策略","盘点调整次数"];
            const rows = data.map((c, i) => {
                const o = c.outbound, it = c.item, ib = c.inbound, sup = c.supplier;
                const adjCount = BIZ.movementsByBatch(o.batchNo).filter(m => m.movementType === "盘点调整").length;
                return [i+1, it?it.name:"", it?it.spec:"", o.batchNo, sup?sup.name:"", ib?ib.receiptNo:"", ib?fmtDate(ib.inboundDate):"", ib?ib.quantity:"", ib?fmtDate(ib.productionDate):"", ib?fmtDate(ib.expiryDate):"", fmtDate(o.outboundDate), o.quantity, o.department, o.operator, o.purpose||"", o.patient||"", o.strategy||"", adjCount];
            });
            const csv = "\uFEFF" + [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\r\n");
            const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `追溯链路_${todayStr()}.csv`;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            this.toast(`已导出 ${data.length} 条链路记录（CSV）`, "success");
        },
        showInboundDetail(inId) {
            const r = DB.find("inboundRecords", x => x.id === inId);
            if (!r) return;
            const it = BIZ.getItem(r.itemId), sup = BIZ.getSupplier(r.supplier), b = BIZ.getBatch(r.batchId);
            const body = `<div class="detail-list">
                <div class="detail-item"><span class="lbl">入库单号</span><span class="val">${r.receiptNo}</span></div>
                <div class="detail-item"><span class="lbl">物品</span><span class="val">${it?it.name:"—"}</span></div>
                <div class="detail-item"><span class="lbl">批号</span><span class="val">${r.batchNo}</span></div>
                <div class="detail-item"><span class="lbl">入库数量</span><span class="val">${r.quantity} ${it?it.unit:""}</span></div>
                <div class="detail-item"><span class="lbl">供应商</span><span class="val">${sup?sup.name:"—"}</span></div>
                <div class="detail-item"><span class="lbl">生产日期</span><span class="val">${fmtDate(r.productionDate)}</span></div>
                <div class="detail-item"><span class="lbl">有效期</span><span class="val">${fmtDate(r.expiryDate)}</span></div>
                <div class="detail-item"><span class="lbl">入库日期</span><span class="val">${fmtDate(r.inboundDate)}</span></div>
                <div class="detail-item"><span class="lbl">入库操作人</span><span class="val">${r.operator}</span></div>
                <div class="detail-item"><span class="lbl">核对状态</span><span class="val">${r.checked?'<span class="tag tag-green">已核对</span>':'<span class="tag tag-amber">待核对</span>'}</span></div>
                <div class="detail-item"><span class="lbl">货位</span><span class="val">${b?(b.location||"—"):"—"}</span></div>
            </div>`;
            this.openModal(`入库单详情 - ${r.receiptNo}`, body, `<button class="btn" onclick="App.closeModal()">关闭</button>`, "md");
        },
        showBatchTimeline(batchNo) {
            const list = BIZ.movementsByBatch(batchNo);
            const b = DB.find("batches", x => x.batchNo === batchNo);
            const it = b ? BIZ.getItem(b.itemId) : null;
            const body = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <div class="detail-list" style="margin-bottom:0;flex:1">
                    ${b ? `<div class="detail-item"><span class="lbl">批号</span><span class="val">${b.batchNo}</span></div>` : ''}
                    ${it ? `<div class="detail-item"><span class="lbl">物品</span><span class="val">${it.name}（${it.spec}）</span></div>` : ''}
                    ${b ? `<div class="detail-item"><span class="lbl">当前库存</span><span class="val fw-700">${b.quantity} ${it?it.unit:""}</span></div>` : ''}
                    ${b ? `<div class="detail-item"><span class="lbl">有效期</span><span class="val">${fmtDate(b.expiryDate)}</span></div>` : ''}
                </div>
                <button class="btn btn-sm btn-ghost" onclick="App.exportBatchTimeline('${batchNo}')"><i class="fas fa-file-export"></i> 导出 CSV</button>
            </div>
            <h4 style="margin:8px 0 10px;font-size:14px"><i class="fas fa-stream"></i> 库存流水时间线（${list.length} 条）</h4>
            ${list.length ? `<div class="timeline" style="padding-left:20px">${list.map(m => {
                const mIt = BIZ.getItem(m.itemId);
                const dirColor = m.direction === "IN" ? "text-success" : "text-danger";
                const sign = m.direction === "IN" ? "+" : "-";
                const typeTag = m.movementType === '入库' ? 'tag-green' :
                                m.movementType === '出库' ? 'tag-teal' :
                                m.movementType === '盘点调整' ? 'tag-amber' :
                                m.movementType === '报废销毁' ? 'tag-red' :
                                m.movementType === '退回供应商' ? 'tag-orange' : 'tag-gray';
                const refLink = m.refType === "inbound" ? `<a href="javascript:void(0)" onclick="App.showInboundDetail('${m.refId}')" style="font-size:11px">${m.refNo}</a>` : m.refNo;
                return `<div class="timeline-item" style="padding-bottom:12px">
                    <div class="t-time">${fmtDate(m.movementDate)} <span class="tag ${typeTag}" style="margin-left:6px">${m.movementType}</span></div>
                    <div class="t-text">
                        <strong>数量：</strong><span class="fw-700 ${dirColor}">${sign}${m.quantity}${mIt?mIt.unit:""}</span> ·
                        <strong>操作人：</strong>${m.operator} ·
                        <strong>关联：</strong>${refLink}<br>
                        <strong>备注：</strong>${m.remark || "—"}
                    </div>
                </div>`;
            }).join("")}</div>` : '<div class="muted" style="padding:20px;text-align:center">该批次暂无流水记录</div>'}`;
            this.openModal(`批次流水 - ${batchNo}`, body, `<button class="btn" onclick="App.closeModal()">关闭</button>`, "lg");
        },
        exportBatchTimeline(batchNo) {
            const list = BIZ.movementsByBatch(batchNo);
            if (!list.length) return this.toast("该批次暂无流水记录", "warning");
            const csv = BIZ.movementsToCSV(list);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `批次流水_${batchNo}_${todayStr()}.csv`;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            this.toast(`已导出 ${list.length} 条流水记录`, "success");
        },

        /* ---------- 效期预警 ---------- */
        expiry() {
            document.getElementById("content").innerHTML = `
            <div class="toolbar">
                <button class="btn ${this.state.expiryFilter === 'expired' ? 'btn-danger' : ''}" onclick="App.setExpiryFilter('expired')">已过期</button>
                <button class="btn ${this.state.expiryFilter === 'critical' ? 'btn-danger' : ''}" onclick="App.setExpiryFilter('critical')">30天临期</button>
                <button class="btn ${this.state.expiryFilter === 'warning' ? 'btn-primary' : ''}" onclick="App.setExpiryFilter('warning')">90天预警</button>
                <button class="btn ${this.state.expiryFilter === 'all' ? 'btn-primary' : ''}" onclick="App.setExpiryFilter('all')">全部</button>
                <div class="spacer"></div>${this._expirySummary()}
            </div>
            <div class="card"><div class="table-wrap"><table class="data">
                <thead><tr><th>物品</th><th>批号</th><th>生产日期</th><th>有效期</th><th>剩余天数</th><th>数量</th><th>供应商</th><th>货位</th><th>状态</th><th>操作</th></tr></thead>
                <tbody id="expBody">${this._expiryRows()}</tbody>
            </table></div></div>`;
        },
        _expirySummary() { const ex = BIZ.expiryStats(); return `<span class="tag tag-red">已过期 ${ex.expired}</span><span class="tag tag-red">30天 ${ex.critical}</span><span class="tag tag-amber">90天 ${ex.warning}</span>`; },
        setExpiryFilter(f) { this.state.expiryFilter = f; this.views.expiry.call(this); },
        _expiryRows() {
            let list = DB.all("batches").filter(b => b.quantity > 0);
            const f = this.state.expiryFilter;
            list = list.filter(b => { const d = daysToToday(b.expiryDate); if (f === "expired") return d < 0; if (f === "critical") return d >= 0 && d <= 30; if (f === "warning") return d > 30 && d <= 90; return true; }).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
            if (!list.length) return this.emptyCell("fa-check-circle", "当前筛选条件下无预警批次", 10);
            return list.map(b => {
                const it = BIZ.getItem(b.itemId), st = BIZ.batchStatus(b), sup = BIZ.getSupplier(b.supplier), d = daysToToday(b.expiryDate);
                return `<tr><td><strong>${it.name}</strong><br><span class="muted" style="font-size:11px">${it.spec}</span></td><td>${b.batchNo}</td>
                    <td>${fmtDate(b.productionDate)}</td><td>${fmtDate(b.expiryDate)}</td><td class="fw-700 ${d <= 30 ? 'text-danger' : 'text-warning'}">${d < 0 ? "已过期" + (-d) + "天" : d + "天"}</td>
                    <td>${b.quantity} ${it.unit}</td><td>${sup ? sup.name.slice(0, 10) : "—"}</td><td>${b.location}</td><td><span class="tag ${st.cls}">${st.label}</span></td>
                    <td><button class="btn btn-sm btn-ghost" onclick="App.disposeBatch('${b.id}','scrap')"><i class="fas fa-trash"></i> 报废</button><button class="btn btn-sm btn-ghost" onclick="App.disposeBatch('${b.id}','return')"><i class="fas fa-rotate-left"></i> 退货</button></td></tr>`;
            }).join("");
        },
        disposeBatch(batchId, action) {
            const b = BIZ.getBatch(batchId);
            if (!b) return;
            const it = BIZ.getItem(b.itemId), label = action === "scrap" ? "报废销毁" : "退回供应商";
            if (!confirm(`确认将「${it.name}（批号 ${b.batchNo}，数量 ${b.quantity}）」${label}？\n该批次将从可用库存中移除，并计入库存流水。`)) return;
            const qty = b.quantity;
            const outId = uid("OUT");
            DB.update("batches", batchId, { quantity: 0 });
            DB.insert("outboundRecords", { id: outId, itemId: b.itemId, batchId, batchNo: b.batchNo, quantity: qty, department: "药剂科", operator: "张药剂师", purpose: label + "（效期处理）", patient: "—", outboundDate: todayStr(), disposalType: action });
            BIZ.recordMovement({
                movementType: label, movementDate: todayStr(),
                itemId: b.itemId, batchId, batchNo: b.batchNo, quantity: qty,
                direction: "OUT", operator: "张药剂师",
                refType: "outbound", refId: outId, refNo: b.batchNo,
                remark: label + " - 效期处置，由 " + label.slice(0, 2) + "流程触发"
            });
            this.toast(`已${label}：${it.name} ${b.batchNo}（${qty}${it.unit}），已写入库存流水`, "success");
            this.updateBadges(); this.views.expiry.call(this);
        },

        /* ---------- 采购申请 ---------- */
        purchase() {
            const list = DB.all("purchaseRequests");
            const suggestions = BIZ.purchaseSuggestion().filter(s => s.selected);
            const totalNeed = suggestions.reduce((sum, s) => sum + s.suggestQty, 0);
            document.getElementById("content").innerHTML = `
            <div class="card" style="margin-bottom:14px;border-color:#f59e0b;background:#fffbeb">
                <div class="card-head" style="padding:10px 14px;border-bottom:1px dashed #fbbf24">
                    <div style="font-weight:700;color:#b45309"><i class="fas fa-robot"></i> 智能待补货清单 · 根据近30天消耗自动预测 <span class="tag tag-amber" style="margin-left:6px">${suggestions.length} 种物品</span></div>
                    <div style="display:flex;gap:8px;align-items:center">
                        <span class="muted">合计建议采购 <strong style="color:#b45309">${totalNeed.toLocaleString()}</strong> 单位</span>
                        <button class="btn btn-sm btn-primary" onclick="App.mergePurchaseSelected()"><i class="fas fa-layer-group"></i> 一键合并生成采购申请</button>
                    </div>
                </div>
                <div class="card-body" style="padding:4px 14px">
                    ${suggestions.length ? `<table class="data" style="font-size:13px">
                        <thead><tr><th style="padding:8px 4px"><label style="display:inline-flex;align-items:center;gap:4px"><input type="checkbox" id="pr-all-check" checked onchange="App.toggleAllSuggestions(this)">全选</label></th>
                            <th style="padding:8px 4px">物品</th><th style="padding:8px 4px">当前库存</th><th style="padding:8px 4px">安全库存</th><th style="padding:8px 4px">日均消耗</th>
                            <th style="padding:8px 4px">缺口</th><th style="padding:8px 4px">已在途</th><th style="padding:8px 4px">建议采购量</th><th style="padding:8px 4px">手动调整</th></tr></thead>
                        <tbody>${suggestions.map(s => `<tr>
                            <td style="padding:8px 4px;text-align:center"><input type="checkbox" class="pr-item-check" data-item="${s.item.id}" checked></td>
                            <td style="padding:8px 4px"><strong>${s.item.name}</strong><br><span class="muted" style="font-size:11px">${s.item.spec}</span></td>
                            <td style="padding:8px 4px">${s.currentStock}<span class="text-danger">${s.currentStock < s.safetyStock ? ' ⚠' : ''}</span></td>
                            <td style="padding:8px 4px">${s.safetyStock}${s.item.unit}</td>
                            <td style="padding:8px 4px">${s.dailyAvg.toFixed(1)}${s.item.unit}</td>
                            <td style="padding:8px 4px"><span class="text-danger fw-700">${s.shortage > 0 ? s.shortage : '—'}</span></td>
                            <td style="padding:8px 4px">${s.pendingQty > 0 ? `<span class="tag tag-blue">${s.pendingQty}</span>` : '—'}</td>
                            <td style="padding:8px 4px"><span class="fw-700">${s.suggestQty}</span>${s.item.unit}</td>
                            <td style="padding:8px 4px;width:120px"><input type="number" min="1" value="${s.suggestQty}" class="pr-suggest-qty" data-item="${s.item.id}" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px"></td>
                        </tr>`).join("")}</tbody>
                    </table>` : '<div class="muted" style="padding:20px;text-align:center"><i class="fas fa-check-circle" style="color:var(--success)"></i> 当前库存充足，暂无待补货物品</div>'}
                </div>
            </div>
            <div class="toolbar"><button class="btn btn-primary" onclick="App.openPurchaseForm()"><i class="fas fa-plus"></i> 手动新建采购申请</button>
                <div class="spacer"></div><span class="muted">待审批 ${list.filter(p=>p.status==="待审批").length} · 已批准 ${list.filter(p=>p.status==="已批准").length} · 已到货 ${list.filter(p=>p.status==="已到货").length}</span></div>
            <div class="card"><div class="table-wrap"><table class="data">
                <thead><tr><th>采购单号</th><th>物品</th><th>采购数量</th><th>申请原因</th><th>申请人</th><th>申请日期</th><th>期望到货</th><th>状态</th><th>操作</th></tr></thead>
                <tbody>${list.length ? list.map(p => {
                    const it = BIZ.getItem(p.itemId);
                    const statusTag = p.status === "待审批" ? '<span class="tag tag-amber">待审批</span>' : p.status === "已批准" ? '<span class="tag tag-blue">已批准</span>' : p.status === "已到货" ? '<span class="tag tag-green">已到货</span>' : '<span class="tag tag-gray">已取消</span>';
                    let actions = "";
                    if (p.status === "待审批") actions = `<button class="btn btn-sm btn-success" onclick="App.approvePurchase('${p.id}')"><i class="fas fa-check"></i> 审批</button> <button class="btn btn-sm btn-ghost" onclick="App.cancelPurchase('${p.id}')">取消</button>`;
                    else if (p.status === "已批准") actions = `<button class="btn btn-sm btn-primary" onclick="App.confirmReceive('${p.id}')"><i class="fas fa-truck-ramp-box"></i> 到货入库</button>`;
                    else actions = '<span class="muted">—</span>';
                    return `<tr><td>${p.id}</td><td><strong>${it.name}</strong><br><span class="muted" style="font-size:11px">${it.spec}</span></td><td>${p.quantity} ${it.unit}</td>
                        <td style="max-width:240px">${p.reason}</td><td>${p.operator}</td><td>${fmtDate(p.requestDate)}</td><td>${fmtDate(p.expectedDate)}</td><td>${statusTag}</td><td>${actions}</td></tr>`;
                }).join("") : this.emptyCell("fa-clipboard-list", "暂无采购申请", 9)}</tbody>
            </table></div></div>`;
        },
        toggleAllSuggestions(el) {
            document.querySelectorAll(".pr-item-check").forEach(c => { c.checked = el.checked; });
        },
        mergePurchaseSelected() {
            const checked = document.querySelectorAll(".pr-item-check:checked");
            if (!checked.length) return this.toast("请至少勾选一个物品", "warning");
            let created = 0, merged = 0;
            checked.forEach(cb => {
                const itemId = cb.dataset.item;
                const qtyInput = document.querySelector(`.pr-suggest-qty[data-item="${itemId}"]`);
                const qty = parseInt(qtyInput.value) || 0;
                if (qty < 1) return;
                /* 同物品且待审批的 → 合并数量，避免重复单 */
                const existing = DB.find("purchaseRequests", p => p.itemId === itemId && p.status === "待审批");
                if (existing) {
                    DB.update("purchaseRequests", existing.id, {
                        quantity: existing.quantity + qty,
                        reason: `${existing.reason} · 智能补货追加 +${qty}${BIZ.getItem(itemId).unit}`
                    });
                    merged++;
                } else {
                    const it = BIZ.getItem(itemId);
                    const shortage = Math.max(0, it.safetyStock - BIZ.itemStock(itemId));
                    DB.insert("purchaseRequests", {
                        id: BIZ.genPurchaseNo(), itemId, quantity: qty,
                        reason: `智能补货 · 安全库存缺口${shortage}${it.unit} + 60天预计用量，建议补${qty}${it.unit}`,
                        status: "待审批", requestDate: todayStr(), operator: "系统智能补货",
                        expectedDate: addDays(todayStr(), 5)
                    });
                    created++;
                }
            });
            this.toast(`合并完成：新建 ${created} 张，合并 ${merged} 张待审批单`, "success");
            this.updateBadges(); this.navigate("purchase");
        },
        openPurchaseForm() {
            const items = DB.all("items");
            const body = `<div class="form-row">
                <div class="field"><label>采购物品 <span class="text-danger">*</span></label><select id="pr-item">${items.map(it => `<option value="${it.id}">${it.name}（${it.spec}）- 当前 ${BIZ.itemStock(it.id)}/${it.safetyStock}</option>`).join("")}</select></div>
                <div class="field"><label>采购数量 <span class="text-danger">*</span></label><input type="number" id="pr-qty" min="1" value="100"></div></div>
                <div class="form-row form-row-1"><div class="field"><label>申请原因 <span class="text-danger">*</span></label><textarea id="pr-reason" rows="3" placeholder="说明采购原因"></textarea></div></div>
                <div class="form-row"><div class="field"><label>期望到货日期</label><input type="date" id="pr-expected" value="${addDays(todayStr(), 5)}"></div></div>`;
            this.openModal("手动新建采购申请", body, `<button class="btn" onclick="App.closeModal()">取消</button><button class="btn btn-primary" onclick="App.savePurchase()"><i class="fas fa-check"></i> 提交申请</button>`);
        },
        savePurchase() {
            const itemId = document.getElementById("pr-item").value, qty = parseInt(document.getElementById("pr-qty").value);
            const reason = document.getElementById("pr-reason").value.trim(), expected = document.getElementById("pr-expected").value;
            if (!itemId || !qty || qty < 1 || !reason) return this.toast("请填写完整信息", "error");
            /* 若已有同物品待审批单，询问合并 */
            const existing = DB.find("purchaseRequests", p => p.itemId === itemId && p.status === "待审批");
            if (existing && confirm(`检测到「${BIZ.getItem(itemId).name}」已有待审批采购单 (${existing.id})，是否合并数量？\n点击确定合并，点击取消新建独立单`)) {
                DB.update("purchaseRequests", existing.id, {
                    quantity: existing.quantity + qty,
                    reason: `${existing.reason} · 手动追加 +${qty}${BIZ.getItem(itemId).unit}：${reason}`
                });
                this.toast(`已合并至采购单 ${existing.id}，新数量 ${existing.quantity + qty}${BIZ.getItem(itemId).unit}`, "success");
            } else {
                DB.insert("purchaseRequests", { id: BIZ.genPurchaseNo(), itemId, quantity: qty, reason, status: "待审批", requestDate: todayStr(), operator: "张药剂师", expectedDate: expected });
                this.toast(`采购申请已提交：${BIZ.getItem(itemId).name} ${qty}${BIZ.getItem(itemId).unit}`, "success");
            }
            this.closeModal(); this.updateBadges(); this.navigate("purchase");
        },
        approvePurchase(id) { DB.update("purchaseRequests", id, { status: "已批准" }); this.toast("采购申请已审批通过", "success"); this.updateBadges(); this.navigate("purchase"); },
        cancelPurchase(id) { if (!confirm("确认取消该采购申请？")) return; DB.update("purchaseRequests", id, { status: "已取消" }); this.toast("采购申请已取消", "info"); this.updateBadges(); this.navigate("purchase"); },
    }
};

/* 将 views 内的动作方法提升到 App 顶层，供 onclick="App.X()" 调用 */
Object.assign(App, App.views);
