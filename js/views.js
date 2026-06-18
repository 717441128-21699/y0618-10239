/* ========================================================================
 * 视图扩展 (views.js) — 冷链监控 / 盘点管理 / 趋势分析
 * 挂载到 App.views，并在 DOM 加载后启动应用
 * ====================================================================== */

/* ---------- 冷链监控 ---------- */
App.views.coldchain = function () {
    const coldBatches = DB.all("batches").filter(b => { const it = BIZ.getItem(b.itemId); return it && it.isColdChain && b.quantity > 0; });
    const alarms = BIZ.coldChainAlarms();
    document.getElementById("content").innerHTML = `
    <div class="toolbar">
        <span class="muted"><i class="fas fa-snowflake" style="color:var(--info)"></i> 冷链药品全程温度监控 · 每20秒自动刷新</span>
        <div class="spacer"></div>
        ${alarms.length ? `<span class="tag tag-red"><i class="fas fa-triangle-exclamation"></i> ${alarms.length} 个超温告警</span>` : `<span class="tag tag-green">全部正常</span>`}
    </div>
    <div class="grid grid-2">${coldBatches.length ? coldBatches.map(b => this._coldCard(b)).join("") : this.empty("fa-snowflake", "无冷链批次")}</div>`;
    this._renderColdCharts();
};

App._coldCard = function (b) {
    const it = BIZ.getItem(b.itemId), t = BIZ.latestTemp(b.id);
    const cls = !t ? "temp-normal" : t.status === "alarm" ? "temp-alarm" : t.status === "warning" ? "temp-warn" : "temp-normal";
    const statusText = !t ? "无数据" : t.status === "alarm" ? "超温告警" : t.status === "warning" ? "低温预警" : "温度正常";
    const colorCls = cls === "temp-alarm" ? "text-danger" : cls === "temp-warn" ? "text-warning" : "text-success";
    const tagCls = cls === "temp-alarm" ? "tag-red" : cls === "temp-warn" ? "tag-amber" : "tag-green";
    return `<div class="card">
        <div class="card-head"><h3><i class="fas fa-snowflake" style="color:var(--info)"></i> ${it.name}</h3><span class="tag ${tagCls}">${statusText}</span></div>
        <div class="card-body">
            <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px">
                <div><span class="temp-value ${colorCls}">${t ? t.temperature : "—"}</span><span class="temp-unit muted">°C</span>
                    <div class="muted" style="font-size:12px;margin-top:2px">批号 ${b.batchNo} · 库存 ${b.quantity}${it.unit}</div></div>
                <div style="text-align:right"><div class="muted" style="font-size:12px">存储范围</div><div class="fw-700">${it.tempMin} ~ ${it.tempMax} °C</div>
                    ${t ? `<div class="muted" style="font-size:11px">${t.timestamp}</div>` : ""}</div>
            </div>
            <div style="height:120px"><canvas id="tempChart-${b.id}"></canvas></div>
        </div></div>`;
};

App._renderColdCharts = function () {
    const coldBatches = DB.all("batches").filter(b => { const it = BIZ.getItem(b.itemId); return it && it.isColdChain && b.quantity > 0; });
    coldBatches.forEach(b => {
        const it = BIZ.getItem(b.itemId);
        const el = document.getElementById("tempChart-" + b.id);
        if (!el) return;
        const logs = DB.filter("tempLogs", l => l.batchId === b.id).sort((a, c) => a.timestamp.localeCompare(c.timestamp)).slice(-12);
        this.charts["temp-" + b.id] = new Chart(el, {
            type: "line",
            data: {
                labels: logs.map(l => l.timestamp.slice(11, 16)),
                datasets: [
                    { label: "温度", data: logs.map(l => l.temperature), borderColor: "#0d9488", backgroundColor: "rgba(13,148,136,.1)", tension: .4, fill: true, pointRadius: 2, borderWidth: 2 },
                    { label: "上限", data: logs.map(() => it.tempMax), borderColor: "rgba(239,68,68,.5)", borderDash: [5, 4], pointRadius: 0, borderWidth: 1, fill: false },
                    { label: "下限", data: logs.map(() => it.tempMin), borderColor: "rgba(59,130,246,.5)", borderDash: [5, 4], pointRadius: 0, borderWidth: 1, fill: false }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: false, ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 9 } } } } }
        });
    });
};

/* ---------- 盘点管理 ---------- */
App.views.check = function () {
    const list = DB.all("inventoryChecks");
    document.getElementById("content").innerHTML = `
    <div class="toolbar"><button class="btn btn-primary" onclick="App.openCheckForm()"><i class="fas fa-plus"></i> 新建盘点</button>
        <div class="spacer"></div><span class="muted">系统对比账面库存与实物，自动生成差异报告</span></div>
    <div class="grid grid-2">${list.length ? list.map(c => this._checkCard(c)).join("") : this.empty("fa-clipboard-check", "暂无盘点记录")}</div>`;
};

App._checkCard = function (c) {
    const totalDiff = c.items.reduce((s, i) => s + i.diff, 0);
    const done = c.status === "已完成";
    return `<div class="card">
        <div class="card-head"><h3><i class="fas fa-clipboard-check"></i> 盘点单 ${c.id}</h3><span class="tag ${done ? 'tag-green' : 'tag-amber'}">${c.status}</span></div>
        <div class="card-body">
            <div class="detail-list" style="margin-bottom:14px">
                <div class="detail-item"><span class="lbl">盘点日期</span><span class="val">${fmtDate(c.checkDate)}</span></div>
                <div class="detail-item"><span class="lbl">执行人</span><span class="val">${c.operator}</span></div>
                <div class="detail-item"><span class="lbl">盘点物品</span><span class="val">${c.items.length} 项</span></div>
                <div class="detail-item"><span class="lbl">净差异</span><span class="val ${totalDiff < 0 ? 'text-danger' : totalDiff > 0 ? 'text-success' : ''}">${totalDiff > 0 ? '+' : ''}${totalDiff}</span></div>
            </div>
            <button class="btn btn-sm btn-ghost" onclick="App.showCheckDetail('${c.id}')"><i class="fas fa-file-alt"></i> 查看差异报告</button>
        </div></div>`;
};

App.openCheckForm = function () {
    const items = DB.all("items");
    const body = `<p class="muted" style="margin-bottom:14px">选择需要盘点的物品，录入实物数量，系统自动对比账面库存并计算差异。</p>
        <div class="table-wrap"><table class="data"><thead><tr><th>选择</th><th>物品</th><th>账面库存</th><th>实物数量</th></tr></thead>
        <tbody>${items.map(it => { const stock = BIZ.itemStock(it.id);
            return `<tr><td><input type="checkbox" class="chk-item" data-id="${it.id}" data-stock="${stock}" data-unit="${it.unit}" checked></td>
                <td>${it.name}（${it.spec}）</td><td>${stock} ${it.unit}</td><td><input type="number" class="phy-qty" data-id="${it.id}" value="${stock}" min="0" style="width:90px"></td></tr>`;
        }).join("")}</tbody></table></div>`;
    this.openModal("新建盘点", body, `<button class="btn" onclick="App.closeModal()">取消</button><button class="btn btn-primary" onclick="App.saveCheck()"><i class="fas fa-check"></i> 完成盘点</button>`, "lg");
};

App.saveCheck = function () {
    const checks = document.querySelectorAll(".chk-item:checked");
    if (!checks.length) return this.toast("请至少选择一项物品", "warning");
    const items = [];
    let totalDiff = 0;
    checks.forEach(chk => {
        const id = chk.dataset.id, bookQty = parseInt(chk.dataset.stock);
        const phy = document.querySelector(`.phy-qty[data-id="${id}"]`);
        const physicalQty = parseInt(phy.value);
        items.push({ itemId: id, bookQty, physicalQty, diff: physicalQty - bookQty });
        totalDiff += physicalQty - bookQty;
    });
    const checkId = BIZ.genCheckNo();
    const checkOperator = "张药剂师";
    /* 精确校准 + 记录每个物品的处理动作 */
    const reconciledItems = items.map(it => {
        const r = BIZ.reconcileStock(it.itemId, it.physicalQty, { checkId, operator: checkOperator });
        return { ...it, actions: r.actions, direction: r.direction, diff: r.diff };
    });
    DB.insert("inventoryChecks", {
        id: checkId, checkDate: todayStr(), operator: checkOperator,
        status: "已完成", items: reconciledItems, totalDiff,
        reconciled: true
    });
    const adjustedCount = reconciledItems.filter(i => i.diff !== 0).length;
    this.toast(`盘点完成：已校准 ${adjustedCount} 项，净差异 ${totalDiff > 0 ? '+' : ''}${totalDiff}`, "success");
    this.closeModal(); this.updateBadges(); this.navigate("check");
};

App.showCheckDetail = function (id) {
    const c = DB.find("inventoryChecks", x => x.id === id);
    if (!c) return;
    const totalDiff = c.items.reduce((s, i) => s + i.diff, 0);
    /* 生成每个物品的调整动作明细行 */
    const actionRows = (actions) => {
        if (!actions || !actions.length) return '<span class="muted">无调整</span>';
        return actions.map(a => {
            const sign = a.type === "盘盈加计" || a.type === "盘盈新增" ? "+" : "-";
            const cls = a.type.startsWith("盘盈") ? "text-success" : "text-danger";
            return `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px"><span class="muted">批号 <strong>${a.batchNo}</strong> · ${a.type}</span><span class="fw-700 ${cls}">${sign}${a.qty}</span></div>`;
        }).join("");
    };
    const body = `
    <div class="detail-list" style="margin-bottom:16px">
        <div class="detail-item"><span class="lbl">盘点单号</span><span class="val">${c.id}</span></div>
        <div class="detail-item"><span class="lbl">盘点日期</span><span class="val">${fmtDate(c.checkDate)}</span></div>
        <div class="detail-item"><span class="lbl">执行人</span><span class="val">${c.operator}</span></div>
        <div class="detail-item"><span class="lbl">盘点物品数</span><span class="val">${c.items.length} 项</span></div>
        <div class="detail-item"><span class="lbl">净差异总量</span><span class="val ${totalDiff < 0 ? 'text-danger' : totalDiff > 0 ? 'text-success' : ''}">${totalDiff > 0 ? '+' : ''}${totalDiff}</span></div>
        ${c.reconciled ? `<div class="detail-item"><span class="lbl">库存校准</span><span class="val"><span class="tag tag-green">已按实物数量精确校准</span></span></div>` : ''}
    </div>
    <h4 style="margin:8px 0 10px;font-size:14px"><i class="fas fa-file-lines"></i> 差异明细与校准动作报告</h4>
    <div class="table-wrap"><table class="data"><thead><tr><th>物品</th><th>账面</th><th>实物</th><th>差异</th><th>处理动作明细</th></tr></thead>
    <tbody>${c.items.map(i => {
        const it = BIZ.getItem(i.itemId);
        const rate = i.bookQty ? ((i.diff / i.bookQty) * 100).toFixed(1) : "0.0";
        return `<tr><td><strong>${it.name}</strong><br><span class="muted" style="font-size:11px">${it.spec}</span></td>
            <td>${i.bookQty} ${it.unit}</td><td>${i.physicalQty} ${it.unit}</td>
            <td class="fw-700 ${i.diff < 0 ? 'text-danger' : i.diff > 0 ? 'text-success' : ''}">${i.diff > 0 ? '+' : ''}${i.diff}（${rate}%）</td>
            <td style="min-width:200px">${i.diff === 0 ? '<span class="muted">账实相符</span>' : actionRows(i.actions)}</td></tr>`;
    }).join("")}</tbody></table></div>
    ${c.reconciled ? `<p class="muted" style="margin-top:12px;font-size:12px"><i class="fas fa-info-circle"></i> 处理规则：盘亏从近效期批次依次扣减；盘盈优先加入最早入库批次，不足时新建"盘点调整"批次。所有调整已写入出库记录表，可在追溯中按批次号查找。</p>` : ''}`;
    this.openModal(`盘点差异报告 - ${c.id}`, body, `<button class="btn" onclick="App.closeModal()">关闭</button>`, "lg");
};

/* ---------- 趋势分析 ---------- */
App.views.analysis = function () {
    const items = DB.all("items");
    const outs = DB.all("outboundRecords");
    /* 各物品近30天用量 */
    const usage = items.map(it => ({ it, qty: BIZ.itemUsage(it.id, 30) })).sort((a, b) => b.qty - a.qty);
    const topItems = usage.filter(u => u.qty > 0).slice(0, 6);
    /* 近6个月各月用量 */
    const months = [];
    for (let m = 5; m >= 0; m--) {
        const d = new Date(); d.setMonth(d.getMonth() - m);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = `${d.getMonth() + 1}月`;
        const qty = outs.filter(o => o.outboundDate.slice(0, 7) === ym).reduce((s, o) => s + o.quantity, 0);
        months.push({ label, qty });
    }
    /* 类别消耗 */
    const catData = {};
    items.forEach(it => { catData[it.category] = (catData[it.category] || 0) + BIZ.itemUsage(it.id, 30); });

    document.getElementById("content").innerHTML = `
    <div class="grid grid-4" style="margin-bottom:18px">
        <div class="kpi"><div class="kpi-icon teal"><i class="fas fa-chart-column"></i></div>
            <div><div class="kpi-label">近30天总消耗</div><div class="kpi-value">${usage.reduce((s, u) => s + u.qty, 0)}</div>
            <div class="kpi-sub">件 / ${outs.length} 次出库</div></div></div>
        <div class="kpi"><div class="kpi-icon blue"><i class="fas fa-crown"></i></div>
            <div><div class="kpi-label">消耗最多</div><div class="kpi-value" style="font-size:18px">${topItems.length ? topItems[0].it.name : "—"}</div>
            <div class="kpi-sub">${topItems.length ? topItems[0].qty + " " + topItems[0].it.unit : "无数据"}</div></div></div>
        <div class="kpi"><div class="kpi-icon amber"><i class="fas fa-warehouse"></i></div>
            <div><div class="kpi-label">需补货物品</div><div class="kpi-value text-warning">${BIZ.lowStockItems().length}</div>
            <div class="kpi-sub">低于安全库存</div></div></div>
        <div class="kpi"><div class="kpi-icon green"><i class="fas fa-truck-ramp-box"></i></div>
            <div><div class="kpi-label">待处理采购</div><div class="kpi-value">${DB.filter("purchaseRequests", p => p.status === "待审批").length}</div>
            <div class="kpi-sub">待审批</div></div></div>
    </div>
    <div class="grid grid-2" style="margin-bottom:18px">
        <div class="card"><div class="card-head"><h3><i class="fas fa-chart-line"></i> 近6个月用量趋势</h3></div>
            <div class="card-body"><div style="height:240px"><canvas id="trendChart"></canvas></div></div></div>
        <div class="card"><div class="card-head"><h3><i class="fas fa-chart-column"></i> 物品消耗排行（近30天）</h3></div>
            <div class="card-body"><div style="height:240px"><canvas id="rankChart"></canvas></div></div></div>
    </div>
    <div class="grid grid-2">
        <div class="card"><div class="card-head"><h3><i class="fas fa-layer-group"></i> 类别消耗占比</h3></div>
            <div class="card-body"><div style="height:240px"><canvas id="catChart"></canvas></div></div></div>
        <div class="card"><div class="card-head"><h3><i class="fas fa-lightbulb"></i> 智能采购建议</h3></div>
            <div class="card-body" style="padding:6px 18px">${this._purchaseAdvice(usage)}</div></div>
    </div>`;

    /* 趋势折线 */
    this.charts.trend = new Chart(document.getElementById("trendChart"), {
        type: "line",
        data: { labels: months.map(m => m.label), datasets: [{ label: "消耗量", data: months.map(m => m.qty), borderColor: "#0d9488", backgroundColor: "rgba(13,148,136,.15)", tension: .4, fill: true, pointRadius: 4, pointBackgroundColor: "#0d9488", borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
    /* 排行柱状 */
    this.charts.rank = new Chart(document.getElementById("rankChart"), {
        type: "bar",
        data: { labels: topItems.map(u => u.it.name), datasets: [{ label: "消耗量", data: topItems.map(u => u.qty), backgroundColor: "#14b8a6", borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } }
    });
    /* 类别饼图 */
    this.charts.cat = new Chart(document.getElementById("catChart"), {
        type: "doughnut",
        data: { labels: Object.keys(catData), datasets: [{ data: Object.values(catData), backgroundColor: ["#0d9488", "#3b82f6", "#f59e0b"], borderWidth: 2, borderColor: "#fff" }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
    });
};

App._purchaseAdvice = function (usage) {
    const advice = [];
    usage.forEach(({ it, qty }) => {
        const stock = BIZ.itemStock(it.id);
        const dailyAvg = qty / 30;
        const daysLeft = dailyAvg > 0 ? Math.floor(stock / dailyAvg) : 999;
        if (stock < it.safetyStock) {
            const suggestQty = Math.max(Math.ceil(dailyAvg * 30 - stock), it.safetyStock - stock);
            advice.push({ it, stock, suggestQty, dailyAvg, daysLeft, urgent: true });
        } else if (daysLeft < 14 && dailyAvg > 0) {
            advice.push({ it, stock, suggestQty: Math.ceil(dailyAvg * 30), dailyAvg, daysLeft, urgent: false });
        }
    });
    if (!advice.length) return this.empty("fa-check-circle", "当前库存健康，暂无紧急采购建议");
    advice.sort((a, b) => (a.urgent === b.urgent) ? a.daysLeft - b.daysLeft : (a.urgent ? -1 : 1));
    return advice.slice(0, 6).map(a => `<div class="stat-row">
        <div><span class="fw-700">${a.it.name}</span> <span class="muted">${a.it.spec}</span><br>
            <span class="muted" style="font-size:11px">日均消耗 ${a.dailyAvg.toFixed(1)}${a.it.unit} · 可用约 ${a.daysLeft > 900 ? "充足" : a.daysLeft + "天"}</span></div>
        <div style="text-align:right">
            ${a.urgent ? '<span class="tag tag-red">急需补货</span>' : '<span class="tag tag-amber">建议补货</span>'}<br>
            <button class="btn btn-sm btn-primary" style="margin-top:4px" onclick="App.quickPurchase('${a.it.id}')">采购 ${a.suggestQty}${a.it.unit}</button></div>
    </div>`).join("");
};

/* ---------- 启动 ---------- */
document.addEventListener("DOMContentLoaded", () => App.init());
