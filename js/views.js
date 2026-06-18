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
    const pendingReview = list.filter(c => c.status === "待复核").length;
    document.getElementById("content").innerHTML = `
    <div class="toolbar"><button class="btn btn-primary" onclick="App.openCheckForm()"><i class="fas fa-plus"></i> 新建盘点</button>
        <div class="spacer"></div>
        ${pendingReview > 0 ? `<span class="tag tag-amber" style="margin-right:10px"><i class="fas fa-clock"></i> ${pendingReview} 张待复核</span>` : ''}
        <span class="muted">盘完生成待复核单，主管确认后才真正改库存</span></div>
    <div class="grid grid-2">${list.length ? list.map(c => this._checkCard(c)).join("") : this.empty("fa-clipboard-check", "暂无盘点记录")}</div>`;
};

App._checkCard = function (c) {
    const totalDiff = (c.items || []).reduce((s, i) => s + (i.diff || 0), 0);
    const statusTag = c.status === "已完成" ? '<span class="tag tag-green">已完成·已复核</span>' :
                      c.status === "待复核" ? '<span class="tag tag-amber">待复核</span>' : '<span class="tag tag-gray">' + c.status + '</span>';
    const reviewInfo = c.status === "已完成" && c.reviewedBy ? `
        <div class="detail-item"><span class="lbl">复核人</span><span class="val">${c.reviewedBy}</span></div>
        <div class="detail-item"><span class="lbl">复核时间</span><span class="val">${fmtDate(c.reviewDate)}</span></div>` : '';
    const reviewBtn = c.status === "待复核" ?
        `<button class="btn btn-sm btn-success" onclick="App.reviewCheck('${c.id}')"><i class="fas fa-check-double"></i> 主管复核</button>
         <button class="btn btn-sm btn-ghost" style="margin-left:6px" onclick="App.showCheckDetail('${c.id}')">查看明细</button>` :
        `<button class="btn btn-sm btn-ghost" onclick="App.showCheckDetail('${c.id}')"><i class="fas fa-file-alt"></i> 查看差异报告</button>`;
    return `<div class="card">
        <div class="card-head"><h3><i class="fas fa-clipboard-check"></i> 盘点单 ${c.id}</h3>${statusTag}</div>
        <div class="card-body">
            <div class="detail-list" style="margin-bottom:14px">
                <div class="detail-item"><span class="lbl">盘点日期</span><span class="val">${fmtDate(c.checkDate)}</span></div>
                <div class="detail-item"><span class="lbl">盘点人</span><span class="val">${c.operator}</span></div>
                <div class="detail-item"><span class="lbl">盘点物品</span><span class="val">${(c.items || []).length} 项</span></div>
                <div class="detail-item"><span class="lbl">净差异</span><span class="val ${totalDiff < 0 ? 'text-danger' : totalDiff > 0 ? 'text-success' : ''}">${totalDiff > 0 ? '+' : ''}${totalDiff}</span></div>
                ${reviewInfo}
            </div>
            ${reviewBtn}
        </div></div>`;
};

App.openCheckForm = function () {
    const items = DB.all("items");
    const body = `<p class="muted" style="margin-bottom:10px">选择需要盘点的物品，录入实物数量。<strong style="color:var(--danger)">实物数量必须为非负整数</strong>（空、负数、小数会被自动拦截），保存后进入待复核状态。</p>
        <div class="table-wrap"><table class="data"><thead><tr><th>选择</th><th>物品</th><th>账面库存</th><th>实物数量</th><th>差异预览</th></tr></thead>
        <tbody>${items.map(it => { const stock = BIZ.itemStock(it.id);
            return `<tr><td><input type="checkbox" class="chk-item" data-id="${it.id}" data-stock="${stock}" data-unit="${it.unit}" checked></td>
                <td>${it.name}（${it.spec}）</td><td>${stock} ${it.unit}</td>
                <td><input type="number" class="phy-qty" data-id="${it.id}" value="${stock}" min="0" step="1" oninput="App.onCheckQtyInput(this)" style="width:90px"></td>
                <td class="diff-preview" data-id="${it.id}"><span class="muted">—</span></td></tr>`;
        }).join("")}</tbody></table></div>
        <div id="check-validation" style="margin-top:10px"></div>`;
    this.openModal("新建盘点", body, `<button class="btn" onclick="App.closeModal()">取消</button><button class="btn btn-primary" onclick="App.saveCheck()"><i class="fas fa-check"></i> 保存（进入待复核）</button>`, "lg");
    /* 初始计算差异预览 */
    document.querySelectorAll(".phy-qty").forEach(i => App.onCheckQtyInput(i));
};

/* 实时校验：空/负数/小数 */
App.onCheckQtyInput = function (input) {
    const id = input.dataset.id;
    const bookQty = parseInt(document.querySelector(`.chk-item[data-id="${id}"]`).dataset.stock);
    const raw = input.value.trim();
    const cell = document.querySelector(`.diff-preview[data-id="${id}"]`);
    /* 规则：非空 + 整数 + ≥0 */
    let err = null;
    if (raw === "") err = "不能为空";
    else if (!/^\d+$/.test(raw)) err = "必须是非负整数";
    else { const v = parseInt(raw); if (v < 0) err = "不能为负"; }
    if (err) {
        input.style.borderColor = "var(--danger)";
        input.style.background = "var(--danger-soft)";
        cell.innerHTML = `<span class="tag tag-red"><i class="fas fa-exclamation-triangle"></i> ${err}</span>`;
    } else {
        input.style.borderColor = "";
        input.style.background = "";
        const v = parseInt(raw), diff = v - bookQty;
        const unit = document.querySelector(`.chk-item[data-id="${id}"]`).dataset.unit;
        cell.innerHTML = diff === 0 ? '<span class="tag tag-green">相符</span>' :
            diff > 0 ? `<span class="text-success fw-700">盘盈 +${diff}${unit}</span>` :
            `<span class="text-danger fw-700">盘亏 ${diff}${unit}</span>`;
    }
};

App.saveCheck = function () {
    const checks = document.querySelectorAll(".chk-item:checked");
    if (!checks.length) return this.toast("请至少选择一项物品", "warning");
    /* 严格校验：所有勾选物品的实物数必须合规 */
    const invalid = [];
    const items = [];
    checks.forEach(chk => {
        const id = chk.dataset.id, bookQty = parseInt(chk.dataset.stock), unit = chk.dataset.unit;
        const input = document.querySelector(`.phy-qty[data-id="${id}"]`);
        const raw = (input.value || "").trim();
        if (raw === "" || !/^\d+$/.test(raw)) { invalid.push(`${chk.parentElement.nextElementSibling.textContent.split('（')[0]}：实物数量 ${raw === '' ? '空' : raw} 不合规`); return; }
        const physicalQty = parseInt(raw);
        if (physicalQty < 0) { invalid.push(`${id}：不能为负数`); return; }
        /* 计算调整计划（不落库） */
        const plan = BIZ.planReconcile(id, physicalQty);
        items.push({ itemId: id, bookQty, physicalQty, diff: physicalQty - bookQty, unit, plannedActions: plan.actions, plannedDirection: plan.direction });
    });
    if (invalid.length) {
        document.getElementById("check-validation").innerHTML = `<div class="tag tag-red" style="padding:8px 12px;display:block"><i class="fas fa-ban"></i> 以下 ${invalid.length} 项录入不合规，已拦截：<ul style="margin:6px 0 0 16px">${invalid.map(t => `<li>${t}</li>`).join("")}</ul></div>`;
        return this.toast(`已拦截 ${invalid.length} 项不合规录入，请修正后再保存`, "error");
    }
    const checkId = BIZ.genCheckNo();
    const totalDiff = items.reduce((s, i) => s + i.diff, 0);
    DB.insert("inventoryChecks", {
        id: checkId, checkDate: todayStr(), operator: "张药剂师",
        status: "待复核", items, totalDiff, reconciled: false,
        createdAt: new Date().toISOString().slice(0, 16).replace("T", " ")
    });
    const adjustedCount = items.filter(i => i.diff !== 0).length;
    this.toast(`盘点单 ${checkId} 已保存为「待复核」状态，含 ${items.length} 项（${adjustedCount} 项有差异），等待主管复核`, "success");
    this.closeModal(); this.updateBadges(); this.navigate("check");
};

/* 主管复核：通过后才真正改库存 + 写流水 */
App.reviewCheck = function (id) {
    const c = DB.find("inventoryChecks", x => x.id === id);
    if (!c || c.status !== "待复核") return;
    const diffItems = (c.items || []).filter(i => i.diff !== 0);
    const body = `<div class="detail-list" style="margin-bottom:14px">
        <div class="detail-item"><span class="lbl">盘点单号</span><span class="val">${c.id}</span></div>
        <div class="detail-item"><span class="lbl">盘点人</span><span class="val">${c.operator}</span></div>
        <div class="detail-item"><span class="lbl">盘点日期</span><span class="val">${fmtDate(c.checkDate)}</span></div>
        <div class="detail-item"><span class="lbl">待复核项</span><span class="val">${diffItems.length} 项有差异</span></div>
    </div>
    <div class="table-wrap"><table class="data"><thead><tr><th>物品</th><th>账面</th><th>实物</th><th>差异</th><th>计划调整去向（批次）</th></tr></thead>
    <tbody>${(c.items || []).map(i => {
        const it = BIZ.getItem(i.itemId);
        const actionTxt = (i.plannedActions || []).map(a => `<div style="padding:2px 0">批号 <strong>${a.batchNo}</strong> · ${a.type} · ${a.qty}${it.unit}</div>`).join("") || '<span class="muted">无调整</span>';
        return `<tr><td><strong>${it.name}</strong><br><span class="muted" style="font-size:11px">${it.spec}</span></td>
            <td>${i.bookQty} ${it.unit}</td><td>${i.physicalQty} ${it.unit}</td>
            <td class="fw-700 ${i.diff < 0 ? 'text-danger' : i.diff > 0 ? 'text-success' : ''}">${i.diff > 0 ? '+' : ''}${i.diff}</td>
            <td style="min-width:220px">${actionTxt}</td></tr>`;
    }).join("")}</tbody></table></div>
    <div class="field" style="margin-top:14px"><label>复核人姓名 <span class="text-danger">*</span></label><input type="text" id="rv-reviewer" placeholder="主管姓名" value="李主管"></div>
    <p class="muted" style="margin-top:8px;font-size:12px"><i class="fas fa-info-circle"></i> 复核通过后，系统将按上述计划真实扣减/增加批次库存，并写入库存流水，不可撤销。</p>`;
    this.openModal("主管复核盘点单 - " + id, body, `<button class="btn" onclick="App.closeModal()">取消</button><button class="btn btn-ghost" onclick="App.rejectCheck('${id}')"><i class="fas fa-times"></i> 驳回重盘</button><button class="btn btn-success" onclick="App.approveCheck('${id}')"><i class="fas fa-check-double"></i> 确认复核通过</button>`, "lg");
};

App.approveCheck = function (id) {
    const c = DB.find("inventoryChecks", x => x.id === id);
    if (!c || c.status !== "待复核") return;
    const reviewer = document.getElementById("rv-reviewer").value.trim();
    if (!reviewer) return this.toast("请填写复核人姓名", "error");
    /* 逐项执行真实校准 */
    (c.items || []).forEach(i => {
        if (i.diff === 0) return;
        BIZ.executeReconcile(i.itemId, i.diff, i.plannedActions || [], {
            checkId: id, operator: c.operator, reviewedBy: reviewer
        });
    });
    DB.update("inventoryChecks", id, {
        status: "已完成", reviewedBy: reviewer, reviewDate: todayStr(),
        reconciled: true, reviewedAt: new Date().toISOString().slice(0, 16).replace("T", " ")
    });
    this.toast(`盘点单 ${id} 复核通过，库存已按实物数量精确校准`, "success");
    this.closeModal(); this.updateBadges(); this.navigate("check");
};

App.rejectCheck = function (id) {
    if (!confirm("确认驳回该盘点单？库存不会被修改，需重新盘点。")) return;
    DB.update("inventoryChecks", id, { status: "已驳回", reconciled: false });
    this.toast("盘点单已驳回，库存未变更", "info");
    this.closeModal(); this.updateBadges(); this.navigate("check");
};

App.showCheckDetail = function (id) {
    const c = DB.find("inventoryChecks", x => x.id === id);
    if (!c) return;
    const items = c.items || [];
    const totalDiff = items.reduce((s, i) => s + (i.diff || 0), 0);
    /* 生成每个物品的调整动作明细行：盘盈=+、盘亏=-，字段兼容 plannedActions 和 actions */
    const actionRows = (i) => {
        const actions = i.plannedActions || i.actions || [];
        if (!actions.length) return '<span class="muted">无调整</span>';
        return actions.map(a => {
            const isGain = a.type && a.type.indexOf("盘盈") === 0;
            const sign = isGain ? "+" : "-";
            const cls = isGain ? "text-success" : "text-danger";
            const textType = a.type === "盘盈增加" ? "盘盈加计" : a.type;
            const it = BIZ.getItem(i.itemId);
            return `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px"><span class="muted">批号 <strong>${a.batchNo}</strong> · ${textType}</span><span class="fw-700 ${cls}">${sign}${a.qty}${it ? it.unit : ""}</span></div>`;
        }).join("");
    };
    const statusTag = c.status === "已完成" ? '<span class="tag tag-green">已完成·已复核</span>' :
                      c.status === "待复核" ? '<span class="tag tag-amber">待复核（库存未变更）</span>' : '<span class="tag tag-gray">' + c.status + '</span>';
    const body = `
    <div class="detail-list" style="margin-bottom:16px">
        <div class="detail-item"><span class="lbl">盘点单号</span><span class="val">${c.id}</span></div>
        <div class="detail-item"><span class="lbl">状态</span><span class="val">${statusTag}</span></div>
        <div class="detail-item"><span class="lbl">盘点日期</span><span class="val">${fmtDate(c.checkDate)}</span></div>
        <div class="detail-item"><span class="lbl">盘点人</span><span class="val">${c.operator}</span></div>
        ${c.reviewedBy ? `<div class="detail-item"><span class="lbl">复核人</span><span class="val">${c.reviewedBy}</span></div>` : ''}
        ${c.reviewDate ? `<div class="detail-item"><span class="lbl">复核时间</span><span class="val">${fmtDate(c.reviewDate)}${c.reviewedAt ? ' ' + (c.reviewedAt.split(' ')[1] || '') : ''}</span></div>` : ''}
        <div class="detail-item"><span class="lbl">盘点物品数</span><span class="val">${items.length} 项</span></div>
        <div class="detail-item"><span class="lbl">净差异总量</span><span class="val ${totalDiff < 0 ? 'text-danger' : totalDiff > 0 ? 'text-success' : ''}">${totalDiff > 0 ? '+' : ''}${totalDiff}</span></div>
        ${c.reconciled ? `<div class="detail-item"><span class="lbl">库存校准</span><span class="val"><span class="tag tag-green">已按实物数量精确校准</span></span></div>` : '<div class="detail-item"><span class="lbl">库存校准</span><span class="val"><span class="tag tag-amber">待复核通过后生效</span></span></div>'}
    </div>
    <h4 style="margin:8px 0 10px;font-size:14px"><i class="fas fa-file-lines"></i> 差异明细与批次调整去向</h4>
    <div class="table-wrap"><table class="data"><thead><tr><th>物品</th><th>账面</th><th>实物</th><th>差异</th><th>批次调整去向</th></tr></thead>
    <tbody>${items.map(i => {
        const it = BIZ.getItem(i.itemId);
        const rate = i.bookQty ? ((i.diff / i.bookQty) * 100).toFixed(1) : "0.0";
        return `<tr><td><strong>${it.name}</strong><br><span class="muted" style="font-size:11px">${it.spec}</span></td>
            <td>${i.bookQty} ${it.unit}</td><td>${i.physicalQty} ${it.unit}</td>
            <td class="fw-700 ${i.diff < 0 ? 'text-danger' : i.diff > 0 ? 'text-success' : ''}">${i.diff > 0 ? '+' : ''}${i.diff}（${rate}%）</td>
            <td style="min-width:220px">${i.diff === 0 ? '<span class="muted">账实相符</span>' : actionRows(i)}</td></tr>`;
    }).join("")}</tbody></table></div>
    ${c.reconciled ? `<p class="muted" style="margin-top:12px;font-size:12px"><i class="fas fa-info-circle"></i> 处理规则：盘亏从近效期批次依次扣减；盘盈优先加入最早入库批次，不足时新建"盘点调整"批次。所有调整已写入库存流水，可在「追溯查询」按批次号查看完整时间线。</p>` : '<p class="muted" style="margin-top:12px;font-size:12px"><i class="fas fa-info-circle"></i> 当前盘点单待主管复核，库存尚未变更。复核通过后才会真正扣减/增加批次库存。</p>'}`;
    this.openModal(`盘点详情 - ${c.id}`, body, `<button class="btn" onclick="App.closeModal()">关闭</button>`, "lg");
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

/* ---------- 追责看板 ---------- */
App.views.accountability = function () {
    const rs = BIZ.riskSummary();
    const s = rs.summary;
    const v = this.__acctTab || "item";
    document.getElementById("content").innerHTML = `
    <div class="toolbar">
        <h3 style="margin:0"><i class="fas fa-magnifying-glass-chart"></i> 库存风险与追责看板</h3>
        <div class="spacer"></div>
        <span class="muted">数据截止：${todayStr()}</span>
    </div>
    <div class="stat-grid" style="grid-template-columns:repeat(5,1fr)">
        <div class="kpi-card"><div class="kpi-label">总流水数</div><div class="kpi-value">${s.totalMovements}</div><div class="kpi-foot muted">条记录</div></div>
        <div class="kpi-card"><div class="kpi-label">出库总量</div><div class="kpi-value text-info">${s.totalIssue}</div><div class="kpi-foot muted">含领用、发放</div></div>
        <div class="kpi-card"><div class="kpi-label">报废销毁</div><div class="kpi-value text-danger">${s.totalScrap}</div><div class="kpi-foot muted">效期处理报废</div></div>
        <div class="kpi-card"><div class="kpi-label">退回供应商</div><div class="kpi-value text-warning">${s.totalReturn}</div><div class="kpi-foot muted">效期退回</div></div>
        <div class="kpi-card"><div class="kpi-label">盘点调整</div><div class="kpi-value text-primary">${s.totalAdj}</div><div class="kpi-foot muted">次盘亏/盘盈</div></div>
    </div>
    <div class="toolbar" style="margin-top:16px">
        <div class="tab-group">
            <button class="tab-btn ${v==='item'?'active':''}" onclick="App.switchAcctTab('item')"><i class="fas fa-pills"></i> 按物品</button>
            <button class="tab-btn ${v==='batch'?'active':''}" onclick="App.switchAcctTab('batch')"><i class="fas fa-barcode"></i> 按批次</button>
            <button class="tab-btn ${v==='dept'?'active':''}" onclick="App.switchAcctTab('dept')"><i class="fas fa-building"></i> 按科室</button>
        </div>
        <div class="spacer"></div>
        <span class="muted">点击行查看详细流水</span>
    </div>
    <div class="card" style="margin-top:8px">
        <div id="acctTabBody" style="min-height:300px">
            ${v === 'item' ? renderAcctByItem(rs.byItem) : v === 'batch' ? renderAcctByBatch(rs.byBatch) : renderAcctByDept(rs.byDept)}
        </div>
    </div>`;
};
function renderAcctByItem(list) {
    if (!list.length) return '<div class="muted" style="padding:30px;text-align:center">暂无数据</div>';
    return `<table class="data-table">
        <thead><tr><th>物品名称</th><th>规格</th><th>风险分</th><th>出库量</th><th>报废量</th><th>退货量</th><th>盘点调整</th><th>操作</th></tr></thead>
        <tbody>${list.slice(0, 50).map(r => `<tr>
            <td>${r.item ? r.item.name : r.itemId}</td>
            <td class="muted">${r.item ? r.item.spec : "—"}</td>
            <td><span class="tag ${r.riskScore>20?'tag-red':r.riskScore>10?'tag-amber':'tag-green'}">${r.riskScore}</span></td>
            <td>${r.issueQty}</td>
            <td class="${r.scrapQty>0?'text-danger fw-700':''}">${r.scrapQty}</td>
            <td class="${r.returnQty>0?'text-warning fw-700':''}">${r.returnQty}</td>
            <td>${r.adjCount} 次</td>
            <td><button class="btn btn-sm btn-ghost" onclick="App.showAccountabilityItem('item','${r.itemId}')"><i class="fas fa-list"></i> 流水</button></td>
        </tr>`).join("")}</tbody></table>`;
}
function renderAcctByBatch(list) {
    if (!list.length) return '<div class="muted" style="padding:30px;text-align:center">暂无数据</div>';
    return `<table class="data-table">
        <thead><tr><th>批号</th><th>物品</th><th>流水数</th><th>动作类型</th><th>操作</th></tr></thead>
        <tbody>${list.slice(0, 50).map(r => `<tr>
            <td><span class="mono">${r.batchNo}</span></td>
            <td>${r.item ? r.item.name : "—"}</td>
            <td class="fw-700">${r.movements}</td>
            <td>${r.typeList.map(t => `<span class="tag tag-gray" style="margin-right:3px">${t}</span>`).join("")}</td>
            <td><button class="btn btn-sm btn-ghost" onclick="App.showAccountabilityItem('batch','${r.batchNo}')"><i class="fas fa-clock-rotate-left"></i> 时间线</button></td>
        </tr>`).join("")}</tbody></table>`;
}
function renderAcctByDept(list) {
    if (!list.length) return '<div class="muted" style="padding:30px;text-align:center">暂无数据</div>';
    return `<table class="data-table">
        <thead><tr><th>科室</th><th>出库量</th><th>出库单数</th><th>涉及患者</th><th>操作</th></tr></thead>
        <tbody>${list.slice(0, 50).map(r => `<tr>
            <td class="fw-700">${r.dept}</td>
            <td>${r.issueQty}</td>
            <td>${r.outboundCount}</td>
            <td>${r.patientCount || 0} 人</td>
            <td><button class="btn btn-sm btn-ghost" onclick="App.showAccountabilityItem('dept','${r.dept}')"><i class="fas fa-list"></i> 流水</button></td>
        </tr>`).join("")}</tbody></table>`;
}
App.switchAcctTab = function (t) {
    this.__acctTab = t;
    this.views.accountability.call(this);
};
App.showAccountabilityItem = function (type, key) {
    let list = [], title = "";
    if (type === "item") {
        list = BIZ.movementsByItem(key);
        const it = BIZ.getItem(key);
        title = `物品流水 - ${it ? it.name : key}`;
    } else if (type === "batch") {
        list = BIZ.movementsByBatch(key);
        title = `批次流水 - ${key}`;
    } else if (type === "dept") {
        list = BIZ.movementsByDept(key);
        title = `科室流水 - ${key}`;
    }
    const body = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span class="muted">共 ${list.length} 条流水记录</span>
        <button class="btn btn-sm btn-ghost" onclick="App.exportAccountabilityList('${type}','${key}')"><i class="fas fa-file-export"></i> 导出 CSV</button>
    </div>
    ${list.length ? `<div class="timeline" style="padding-left:20px;max-height:500px;overflow:auto">${list.slice(0, 100).map(m => {
        const it = BIZ.getItem(m.itemId);
        const dirColor = m.direction === "IN" ? "text-success" : "text-danger";
        const sign = m.direction === "IN" ? "+" : "-";
        const typeTag = m.movementType === '入库' ? 'tag-green' :
                        m.movementType === '出库' ? 'tag-teal' :
                        m.movementType === '盘点调整' ? 'tag-amber' :
                        m.movementType === '报废销毁' ? 'tag-red' :
                        m.movementType === '退回供应商' ? 'tag-orange' : 'tag-gray';
        return `<div class="timeline-item" style="padding-bottom:10px">
            <div class="t-time">${fmtDate(m.movementDate)} <span class="tag ${typeTag}" style="margin-left:6px">${m.movementType}</span></div>
            <div class="t-text">
                <strong>物品：</strong>${it?it.name:m.itemId} ·
                <strong>批号：</strong><span class="mono">${m.batchNo}</span> ·
                <strong>数量：</strong><span class="fw-700 ${dirColor}">${sign}${m.quantity}${it?it.unit:""}</span><br>
                <strong>操作人：</strong>${m.operator} · <strong>关联：</strong>${m.refNo || "—"}
                ${m.remark ? `<br><strong>备注：</strong>${m.remark}` : ""}
            </div>
        </div>`;
    }).join("")}</div>${list.length>100?'<div class="muted" style="text-align:center;padding:8px">仅显示前 100 条，完整数据请导出 CSV</div>':''}` : '<div class="muted" style="padding:30px;text-align:center">暂无流水记录</div>'}`;
    this.openModal(title, body, `<button class="btn" onclick="App.closeModal()">关闭</button>`, "lg");
};
App.exportAccountabilityList = function (type, key) {
    let list = [], name = "";
    if (type === "item") { list = BIZ.movementsByItem(key); name = "物品_" + key; }
    else if (type === "batch") { list = BIZ.movementsByBatch(key); name = "批次_" + key; }
    else if (type === "dept") { list = BIZ.movementsByDept(key); name = "科室_" + key; }
    if (!list.length) return this.toast("暂无流水记录", "warning");
    const csv = BIZ.movementsToCSV(list);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `追责流水_${name}_${todayStr()}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    this.toast(`已导出 ${list.length} 条流水记录`, "success");
};

/* ---------- 启动 ---------- */
document.addEventListener("DOMContentLoaded", () => App.init());
