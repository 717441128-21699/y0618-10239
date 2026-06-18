/* ========================================================================
 * 数据层 (data.js)
 * 负责数据模型定义、示例数据初始化、localStorage 持久化及业务计算工具
 * ====================================================================== */

const STORE_KEY = "med_inventory_db_v1";

/* ---------- 工具函数 ---------- */
const uid = (p = "ID") => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function todayStr() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
}
function nowStr() {
    return new Date().toISOString().slice(0, 16).replace("T", " ");
}
function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}
function daysBetween(aStr, bStr) {
    const a = new Date(aStr), b = new Date(bStr);
    return Math.round((b - a) / 86400000);
}
/* 距今天数：正数表示未来，负数表示已过去 */
function daysToToday(dateStr) {
    return daysBetween(todayStr(), dateStr);
}
function fmtDate(s) {
    if (!s) return "—";
    const d = new Date(s);
    if (isNaN(d)) return s;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtMoney(n) { return "¥" + Number(n || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 }); }
function fmtDateTime(s) {
    if (!s) return "—";
    return s.replace("T", " ");
}

/* ========================================================================
 * 示例数据
 * ====================================================================== */
function seedData() {
    const TODAY = todayStr(); // 2026-06-18

    /* ---------- 供应商 ---------- */
    const suppliers = [
        { id: "SUP-01", name: "国药控股医疗供应链有限公司", contact: "李建国", phone: "021-68881234", license: "沪食药监械经营许20180001" },
        { id: "SUP-02", name: "华润医药商业集团", contact: "王丽华", phone: "010-85556677", license: "京食药监械经营许20190042" },
        { id: "SUP-03", name: "迈瑞医疗国际有限公司", contact: "陈志强", phone: "0755-26889900", license: "粤食药监械经营许20170115" },
        { id: "SUP-04", name: "上海莱士血液制品股份公司", contact: "赵敏", phone: "021-33580000", license: "沪食药监准20154003" },
    ];

    /* ---------- 耗材/药品目录 ---------- */
    /* storageType: 常温 / 冷藏 / 冷冻 ; isColdChain 决定是否记录温度 */
    const items = [
        { id: "ITM-01", name: "一次性无菌注射器", spec: "20ml", unit: "支", category: "耗材", safetyStock: 500, storageType: "常温", tempMin: null, tempMax: null, isColdChain: false },
        { id: "ITM-02", name: "一次性使用输液器", spec: "带针 闭式", unit: "套", category: "耗材", safetyStock: 300, storageType: "常温", tempMin: null, tempMax: null, isColdChain: false },
        { id: "ITM-03", name: "人血白蛋白", spec: "10g/50ml/瓶", unit: "瓶", category: "药品", safetyStock: 40, storageType: "冷藏", tempMin: 2, tempMax: 8, isColdChain: true },
        { id: "ITM-04", name: "胰岛素注射液(诺和灵)", spec: "300IU/3ml", unit: "支", category: "药品", safetyStock: 60, storageType: "冷藏", tempMin: 2, tempMax: 8, isColdChain: true },
        { id: "ITM-05", name: "一次性手术包", spec: "标准型", unit: "包", category: "耗材", safetyStock: 80, storageType: "常温", tempMin: null, tempMax: null, isColdChain: false },
        { id: "ITM-06", name: "破伤风疫苗", spec: "0.5ml/支", unit: "支", category: "药品", safetyStock: 100, storageType: "冷藏", tempMin: 2, tempMax: 8, isColdChain: true },
        { id: "ITM-07", name: "医用外科口罩", spec: "灭菌型", unit: "只", category: "耗材", safetyStock: 2000, storageType: "常温", tempMin: null, tempMax: null, isColdChain: false },
        { id: "ITM-08", name: "可吸收性外科缝合线", spec: "1号 针3/8弧", unit: "包", category: "耗材", safetyStock: 100, storageType: "常温", tempMin: null, tempMax: null, isColdChain: false },
        { id: "ITM-09", name: "一次性导尿包", spec: "16Fr 硅胶", unit: "套", category: "耗材", safetyStock: 60, storageType: "常温", tempMin: null, tempMax: null, isColdChain: false },
        { id: "ITM-10", name: "静脉留置针", spec: "20G", unit: "支", category: "耗材", safetyStock: 150, storageType: "常温", tempMin: null, tempMax: null, isColdChain: false },
    ];

    /* ---------- 批次库存 ----------
     * 精心构造以覆盖：已过期 / 30天预警 / 90天预警 / 正常 / 库存不足 / 冷链
     */
    const batches = [
        // ITM-01 注射器
        { id: "B-001", itemId: "ITM-01", batchNo: "SY2025-1108A", productionDate: "2025-06-10", expiryDate: addDays(TODAY, 25), supplier: "SUP-01", quantity: 120, initialQty: 300, inboundDate: "2025-11-10", price: 2.5, location: "A-01-03", inboundOperator: "张药剂师", receiptNo: "RK-20251110-01" },
        { id: "B-002", itemId: "ITM-01", batchNo: "SY2025-0312B", productionDate: "2025-03-01", expiryDate: addDays(TODAY, 78), supplier: "SUP-02", quantity: 220, initialQty: 500, inboundDate: "2025-03-12", price: 2.4, location: "A-01-04", inboundOperator: "张药剂师", receiptNo: "RK-20250312-02" },
        { id: "B-003", itemId: "ITM-01", batchNo: "SY2024-0506C", productionDate: "2024-05-01", expiryDate: addDays(TODAY, -8), supplier: "SUP-01", quantity: 40, initialQty: 500, inboundDate: "2024-05-06", price: 2.3, location: "A-01-05", inboundOperator: "李库管", receiptNo: "RK-20240506-03" },

        // ITM-02 输液器
        { id: "B-004", itemId: "ITM-02", batchNo: "SH2025-0901", productionDate: "2025-01-15", expiryDate: addDays(TODAY, 45), supplier: "SUP-02", quantity: 90, initialQty: 400, inboundDate: "2025-01-20", price: 3.8, location: "A-02-01", inboundOperator: "张药剂师", receiptNo: "RK-20250120-04" },
        { id: "B-005", itemId: "ITM-02", batchNo: "SH2026-0201", productionDate: "2026-02-01", expiryDate: addDays(TODAY, 240), supplier: "SUP-02", quantity: 280, initialQty: 400, inboundDate: "2026-02-05", price: 3.9, location: "A-02-02", inboundOperator: "张药剂师", receiptNo: "RK-20260205-05" },

        // ITM-03 人血白蛋白 (冷链，库存不足)
        { id: "B-006", itemId: "ITM-03", batchNo: "ALB2025-0601", productionDate: "2025-06-01", expiryDate: addDays(TODAY, 18), supplier: "SUP-04", quantity: 15, initialQty: 50, inboundDate: "2025-06-05", price: 480, location: "冷藏柜 C-01", inboundOperator: "张药剂师", receiptNo: "RK-20250605-06" },
        { id: "B-007", itemId: "ITM-03", batchNo: "ALB2026-0301", productionDate: "2026-03-01", expiryDate: addDays(TODAY, 265), supplier: "SUP-04", quantity: 20, initialQty: 30, inboundDate: "2026-03-05", price: 485, location: "冷藏柜 C-01", inboundOperator: "张药剂师", receiptNo: "RK-20260305-07" },

        // ITM-04 胰岛素 (冷链)
        { id: "B-008", itemId: "ITM-04", batchNo: "INS2026-0101", productionDate: "2026-01-10", expiryDate: addDays(TODAY, 205), supplier: "SUP-02", quantity: 55, initialQty: 100, inboundDate: "2026-01-15", price: 65, location: "冷藏柜 C-02", inboundOperator: "张药剂师", receiptNo: "RK-20260115-08" },
        { id: "B-009", itemId: "ITM-04", batchNo: "INS2025-0801", productionDate: "2025-08-01", expiryDate: addDays(TODAY, 22), supplier: "SUP-02", quantity: 12, initialQty: 80, inboundDate: "2025-08-05", price: 64, location: "冷藏柜 C-02", inboundOperator: "李库管", receiptNo: "RK-20250805-09" },

        // ITM-05 手术包 (库存不足触发采购)
        { id: "B-010", itemId: "ITM-05", batchNo: "SP2026-0401", productionDate: "2026-01-20", expiryDate: addDays(TODAY, 220), supplier: "SUP-03", quantity: 35, initialQty: 100, inboundDate: "2026-01-25", price: 85, location: "B-03-01", inboundOperator: "张药剂师", receiptNo: "RK-20260125-10" },

        // ITM-06 破伤风疫苗 (冷链，30天预警)
        { id: "B-011", itemId: "ITM-06", batchNo: "TT2025-0901", productionDate: "2025-09-01", expiryDate: addDays(TODAY, 12), supplier: "SUP-01", quantity: 48, initialQty: 100, inboundDate: "2025-09-05", price: 28, location: "冷藏柜 C-03", inboundOperator: "张药剂师", receiptNo: "RK-20250905-11" },
        { id: "B-012", itemId: "ITM-06", batchNo: "TT2026-0401", productionDate: "2026-04-01", expiryDate: addDays(TODAY, 295), supplier: "SUP-01", quantity: 80, initialQty: 100, inboundDate: "2026-04-05", price: 28.5, location: "冷藏柜 C-03", inboundOperator: "张药剂师", receiptNo: "RK-20260405-12" },

        // ITM-07 口罩 (库存充足)
        { id: "B-013", itemId: "ITM-07", batchNo: "MK2026-0301", productionDate: "2026-03-01", expiryDate: addDays(TODAY, 640), supplier: "SUP-02", quantity: 3200, initialQty: 5000, inboundDate: "2026-03-05", price: 1.2, location: "B-01-01", inboundOperator: "张药剂师", receiptNo: "RK-20260305-13" },

        // ITM-08 缝合线 (90天预警)
        { id: "B-014", itemId: "ITM-08", batchNo: "SL2025-0501", productionDate: "2025-05-01", expiryDate: addDays(TODAY, 68), supplier: "SUP-03", quantity: 60, initialQty: 120, inboundDate: "2025-05-08", price: 120, location: "B-04-01", inboundOperator: "李库管", receiptNo: "RK-20250508-14" },

        // ITM-09 导尿包
        { id: "B-015", itemId: "ITM-09", batchNo: "UC2026-0201", productionDate: "2026-02-10", expiryDate: addDays(TODAY, 250), supplier: "SUP-03", quantity: 48, initialQty: 80, inboundDate: "2026-02-15", price: 32, location: "B-05-01", inboundOperator: "张药剂师", receiptNo: "RK-20260215-15" },

        // ITM-10 留置针 (库存不足)
        { id: "B-016", itemId: "ITM-10", batchNo: "IV2026-0501", productionDate: "2026-05-01", expiryDate: addDays(TODAY, 700), supplier: "SUP-01", quantity: 45, initialQty: 200, inboundDate: "2026-05-05", price: 8.5, location: "A-03-02", inboundOperator: "张药剂师", receiptNo: "RK-20260505-16" },
    ];

    /* ---------- 入库记录 (与批次对应，另含一条已核对到货) ---------- */
    const inboundRecords = batches.map(b => ({
        id: uid("IN"), itemId: b.itemId, batchId: b.id, batchNo: b.batchNo,
        quantity: b.initialQty, supplier: b.supplier, productionDate: b.productionDate,
        expiryDate: b.expiryDate, inboundDate: b.inboundDate, operator: b.inboundOperator,
        price: b.price, receiptNo: b.receiptNo, checked: true
    }));

    /* ---------- 出库记录 (含患者追溯) ---------- */
    const departments = ["手术室", "急诊科", "心内科", "普外科", "骨科", "ICU", "儿科"];
    const outboundRecords = [
        { id: uid("OUT"), itemId: "ITM-01", batchId: "B-002", batchNo: "SY2025-0312B", quantity: 30, department: "手术室", operator: "王护士", purpose: "手术用", patient: "张建国(住院号:102391)", outboundDate: addDays(TODAY, -2) },
        { id: uid("OUT"), itemId: "ITM-01", batchId: "B-002", batchNo: "SY2025-0312B", quantity: 20, department: "急诊科", operator: "刘护士", purpose: "急救用药", patient: "李淑芬(住院号:102405)", outboundDate: addDays(TODAY, -1) },
        { id: uid("OUT"), itemId: "ITM-02", batchId: "B-005", batchNo: "SH2026-0201", quantity: 15, department: "心内科", operator: "陈护士", purpose: "静脉输液", patient: "赵明(住院号:102410)", outboundDate: addDays(TODAY, -1) },
        { id: uid("OUT"), itemId: "ITM-03", batchId: "B-006", batchNo: "ALB2025-0601", quantity: 5, department: "ICU", operator: "孙护士", purpose: "低蛋白血症治疗", patient: "周伟(住院号:102388)", outboundDate: addDays(TODAY, -3) },
        { id: uid("OUT"), itemId: "ITM-04", batchId: "B-008", batchNo: "INS2026-0101", quantity: 8, department: "急诊科", operator: "刘护士", purpose: "糖尿病急症", patient: "吴芳(住院号:102420)", outboundDate: addDays(TODAY, -2) },
        { id: uid("OUT"), itemId: "ITM-05", batchId: "B-010", batchNo: "SP2026-0401", quantity: 12, department: "手术室", operator: "王护士", purpose: "阑尾切除术", patient: "郑华(住院号:102415)", outboundDate: addDays(TODAY, -3) },
        { id: uid("OUT"), itemId: "ITM-06", batchId: "B-011", batchNo: "TT2025-0901", quantity: 10, department: "急诊科", operator: "刘护士", purpose: "外伤破伤风预防", patient: "黄强(住院号:102430)", outboundDate: addDays(TODAY, -1) },
        { id: uid("OUT"), itemId: "ITM-07", batchId: "B-013", batchNo: "MK2026-0301", quantity: 200, department: "普外科", operator: "杨护士", purpose: "日常防护", patient: "—", outboundDate: addDays(TODAY, -1) },
        { id: uid("OUT"), itemId: "ITM-08", batchId: "B-014", batchNo: "SL2025-0501", quantity: 6, department: "手术室", operator: "王护士", purpose: "缝合", patient: "林娜(住院号:102440)", outboundDate: addDays(TODAY, -2) },
        { id: uid("OUT"), itemId: "ITM-01", batchId: "B-001", batchNo: "SY2025-1108A", quantity: 18, department: "儿科", operator: "何护士", purpose: "疫苗接种", patient: "陈乐乐(门诊号:50123)", outboundDate: addDays(TODAY, -1) },
    ];

    /* ---------- 采购申请 ---------- */
    const purchaseRequests = [
        { id: "PR-001", itemId: "ITM-05", quantity: 150, reason: "库存低于安全线(35<80)", status: "已批准", requestDate: addDays(TODAY, -4), operator: "系统自动", expectedDate: addDays(TODAY, 3) },
        { id: "PR-002", itemId: "ITM-10", quantity: 200, reason: "库存低于安全线(45<150)", status: "待审批", requestDate: addDays(TODAY, -1), operator: "系统自动", expectedDate: addDays(TODAY, 6) },
        { id: "PR-003", itemId: "ITM-03", quantity: 50, reason: "冷链药品效期临近，提前补货", status: "已到货", requestDate: addDays(TODAY, -12), operator: "张药剂师", expectedDate: addDays(TODAY, -1) },
        { id: "PR-004", itemId: "ITM-09", quantity: 80, reason: "常规月度补充", status: "待审批", requestDate: addDays(TODAY, -2), operator: "张药剂师", expectedDate: addDays(TODAY, 5) },
    ];

    /* ---------- 温度记录 (冷链全程数据，含超温) ---------- */
    const tempLogs = [];
    const coldBatches = batches.filter(b => {
        const it = items.find(i => i.id === b.itemId);
        return it && it.isColdChain && b.quantity > 0;
    });
    coldBatches.forEach(b => {
        const item = items.find(i => i.id === b.itemId);
        // 生成最近 8 小时温度记录
        let alarmInserted = false;
        for (let h = 8; h >= 0; h--) {
            let temp;
            // ITM-06 破伤风疫苗 B-011 制造一次超温报警
            if (b.id === "B-011" && h <= 3) {
                temp = item.tempMax + 2 + Math.random() * 1.5; // 超温
                alarmInserted = true;
            } else {
                temp = (item.tempMin + item.tempMax) / 2 + (Math.random() * 2 - 1);
            }
            const ts = new Date(Date.now() - h * 3600000);
            const status = temp < item.tempMin ? "warning" : temp > item.tempMax ? "alarm" : "normal";
            tempLogs.push({
                id: uid("TMP"), itemId: b.itemId, batchId: b.id, batchNo: b.batchNo,
                temperature: +temp.toFixed(1), timestamp: ts.toISOString().slice(0, 16).replace("T", " "), status
            });
        }
    });

    /* ---------- 盘点记录 ---------- */
    const inventoryChecks = [
        {
            id: "CHK-001", checkDate: addDays(TODAY, -7), operator: "张药剂师", status: "已完成",
            items: [
                { itemId: "ITM-01", bookQty: 380, physicalQty: 375, diff: -5 },
                { itemId: "ITM-07", bookQty: 3400, physicalQty: 3400, diff: 0 },
                { itemId: "ITM-02", bookQty: 370, physicalQty: 365, diff: -5 },
            ]
        },
        {
            id: "CHK-002", checkDate: TODAY, operator: "张药剂师", status: "进行中",
            items: [
                { itemId: "ITM-03", bookQty: 35, physicalQty: 0, diff: 0 },
                { itemId: "ITM-04", bookQty: 67, physicalQty: 0, diff: 0 },
                { itemId: "ITM-06", bookQty: 128, physicalQty: 0, diff: 0 },
            ]
        },
    ];

    return { suppliers, items, batches, inboundRecords, outboundRecords, purchaseRequests, tempLogs, inventoryChecks };
}

/* ========================================================================
 * DB 对象：localStorage 读写
 * ====================================================================== */
const DB = {
    data: null,
    load() {
        const raw = localStorage.getItem(STORE_KEY);
        if (raw) {
            try { this.data = JSON.parse(raw); return; } catch (e) { /* fallthrough */ }
        }
        this.data = seedData();
        this.save();
    },
    save() {
        localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
    },
    reset() {
        this.data = seedData();
        this.save();
    },
    /* 通用集合操作 */
    all(collection) { return this.data[collection] || []; },
    find(collection, fn) { return (this.data[collection] || []).find(fn); },
    filter(collection, fn) { return (this.data[collection] || []).filter(fn); },
    insert(collection, obj) {
        if (!this.data[collection]) this.data[collection] = [];
        this.data[collection].unshift(obj);
        this.save();
        return obj;
    },
    update(collection, id, patch) {
        const arr = this.data[collection] || [];
        const idx = arr.findIndex(x => x.id === id);
        if (idx >= 0) { arr[idx] = { ...arr[idx], ...patch }; this.save(); return arr[idx]; }
        return null;
    },
    remove(collection, id) {
        this.data[collection] = (this.data[collection] || []).filter(x => x.id !== id);
        this.save();
    },
};

/* ========================================================================
 * 业务逻辑工具
 * ====================================================================== */
const BIZ = {
    getItem(id) { return DB.find("items", i => i.id === id); },
    getSupplier(id) { return DB.find("suppliers", s => s.id === id); },
    getBatch(id) { return DB.find("batches", b => b.id === id); },

    /* 物品总库存 */
    itemStock(itemId) {
        return DB.filter("batches", b => b.itemId === itemId && b.quantity > 0)
            .reduce((s, b) => s + b.quantity, 0);
    },
    /* 物品总价值 */
    itemValue(itemId) {
        return DB.filter("batches", b => b.itemId === itemId)
            .reduce((s, b) => s + b.quantity * (b.price || 0), 0);
    },
    /* 有效库存批次（未过期且有量） */
    validBatches(itemId) {
        return DB.filter("batches", b => b.itemId === itemId && b.quantity > 0 && daysToToday(b.expiryDate) > 0);
    },
    /* FIFO：纯先进先出 — 按入库日期升序，同日按效期升序 */
    sortFIFO(itemId) {
        return this.validBatches(itemId).sort((a, b) => {
            const dd = a.inboundDate.localeCompare(b.inboundDate);
            if (dd !== 0) return dd;
            return a.expiryDate.localeCompare(b.expiryDate);
        });
    },
    /* FEFO：近效期优先（First Expired First Out）— 按效期升序，同日按入库日期升序 */
    sortFEFO(itemId) {
        return this.validBatches(itemId).sort((a, b) => {
            const ed = a.expiryDate.localeCompare(b.expiryDate);
            if (ed !== 0) return ed;
            return a.inboundDate.localeCompare(b.inboundDate);
        });
    },
    /* 通用发放排序：支持 strategy="FIFO" | "FEFO"，默认 FIFO */
    fifoBatches(itemId, strategy = "FIFO") {
        return strategy === "FEFO" ? this.sortFEFO(itemId) : this.sortFIFO(itemId);
    },
    /* 计算发放计划：按策略扣减指定数量，返回 {ok, plan:[{batchId, batchNo, use, left}], shortage, totalUse} */
    planIssue(itemId, qty, strategy = "FIFO") {
        const batches = this.fifoBatches(itemId, strategy);
        let remain = qty, plan = [];
        for (const b of batches) {
            if (remain <= 0) break;
            const use = Math.min(b.quantity, remain);
            plan.push({ batchId: b.id, batchNo: b.batchNo, productionDate: b.productionDate, expiryDate: b.expiryDate, supplier: b.supplier, inboundDate: b.inboundDate, location: b.location, use, left: b.quantity - use });
            remain -= use;
        }
        return {
            ok: remain <= 0, shortage: remain, totalUse: qty - remain,
            plan, strategy: strategy, label: strategy === "FEFO" ? "近效期优先(FEFO)" : "先进先出(FIFO)"
        };
    },
    /* 完整链路追溯：支持多维搜索（关键词为空时返回全部，让外层日期/科室筛选生效） */
    traceChain(keyword) {
        const kw = (keyword || "").trim().toLowerCase();
        const all = DB.all("outboundRecords");
        const matches = kw ? all.filter(o => {
            const it = this.getItem(o.itemId);
            const patient = (o.patient || "").toLowerCase();
            const batchNo = (o.batchNo || "").toLowerCase();
            const dept = (o.department || "").toLowerCase();
            const itemName = (it ? it.name : "").toLowerCase();
            const purpose = (o.purpose || "").toLowerCase();
            const operator = (o.operator || "").toLowerCase();
            return patient.includes(kw) || batchNo.includes(kw) || dept.includes(kw) || itemName.includes(kw) || purpose.includes(kw) || operator.includes(kw);
        }) : all;
        return matches.map(o => {
            const it = this.getItem(o.itemId);
            const inbound = DB.find("inboundRecords", r => r.batchId === o.batchId)
                || DB.all("inboundRecords").find(r => r.batchNo === o.batchNo && r.itemId === o.itemId);
            const sup = inbound ? this.getSupplier(inbound.supplier) : null;
            const batch = this.getBatch(o.batchId);
            return {
                outbound: o, item: it, inbound: inbound || null,
                supplier: sup || null, batch: batch || null,
            };
        });
    },
    /* 采购建议汇总：基于低库存 + 已存在的待审批采购单，避免重复，给出合并后的建议 */
    purchaseSuggestion() {
        const low = this.lowStockItems();
        const pending = {};
        DB.filter("purchaseRequests", p => p.status === "待审批").forEach(p => {
            pending[p.itemId] = (pending[p.itemId] || 0) + p.quantity;
        });
        return low.map(x => {
            const usage30 = this.itemUsage(x.item.id, 30);
            const daily = usage30 / 30;
            /* 建议采购量 = 60 天预计用量 + 安全库存 - 当前库存 - 已在途 */
            const target = Math.round(Math.max(daily, 0) * 60 + x.item.safetyStock);
            const onHand = x.stock + (pending[x.item.id] || 0);
            const suggestQty = Math.max(0, target - onHand);
            const shortage = x.short + (pending[x.item.id] ? 0 : 0);
            return {
                item: x.item, currentStock: x.stock,
                safetyStock: x.item.safetyStock, shortage,
                usage30, dailyAvg: +daily.toFixed(2),
                pendingQty: pending[x.item.id] || 0,
                suggestQty: suggestQty || Math.max(x.item.safetyStock, x.short * 2),
                selected: true
            };
        }).filter(x => x.suggestQty > 0).sort((a, b) => b.shortage - a.shortage);
    },
    /* 盘点校准：按实物数量调整批次库存，优先从 FEFO 首个批次做增减 */
    reconcileStock(itemId, physicalQty, options = {}) {
        const current = this.itemStock(itemId);
        const diff = physicalQty - current;
        if (diff === 0) return { diff: 0, actions: [] };
        const actions = [];
        let remain = Math.abs(diff);
        const dir = diff > 0 ? "IN" : "OUT"; // IN=盘盈入库, OUT=盘亏出库
        /* 盘亏：从近效期批次依次扣减 */
        if (dir === "OUT") {
            const batches = this.sortFEFO(itemId);
            for (const b of batches) {
                if (remain <= 0) break;
                const use = Math.min(b.quantity, remain);
                DB.update("batches", b.id, { quantity: b.quantity - use });
                actions.push({ batchId: b.id, batchNo: b.batchNo, qty: use, type: "盘亏扣减" });
                remain -= use;
            }
        } else {
            /* 盘盈：加到最老的入库批次（FIFO 头端），若没有有效批次则新建一个虚拟盘点批次 */
            const batches = this.sortFIFO(itemId);
            if (batches.length) {
                DB.update("batches", batches[0].id, { quantity: batches[0].quantity + remain });
                actions.push({ batchId: batches[0].id, batchNo: batches[0].batchNo, qty: remain, type: "盘盈增加" });
            } else {
                const newBatch = {
                    id: uid("B"), itemId, batchNo: "ADJ" + todayStr().replace(/-/g, ""),
                    productionDate: todayStr(), expiryDate: addDays(todayStr(), 365),
                    supplier: (DB.all("suppliers")[0] || {}).id || "", quantity: remain, initialQty: remain,
                    inboundDate: todayStr(), price: 0, location: "盘点补入", inboundOperator: "系统校准",
                    receiptNo: "ADJ-" + todayStr().replace(/-/g, "")
                };
                DB.insert("batches", newBatch);
                actions.push({ batchId: newBatch.id, batchNo: newBatch.batchNo, qty: remain, type: "盘盈新增批次" });
            }
        }
        /* 留下盘点调整记录，供追溯 */
        DB.insert("outboundRecords", {
            id: uid("OUT"), itemId, batchId: "—", batchNo: "盘点调整",
            quantity: Math.abs(diff), department: "药剂科", operator: options.operator || "张药剂师",
            purpose: dir === "OUT" ? "盘亏调整" : "盘盈调整", patient: "—", outboundDate: todayStr(),
            extra: { reconcile: true, direction: dir, checkId: options.checkId || null }
        });
        return { diff, direction: dir, actions };
    },
    /* 效期状态：expired / critical(30天) / warning(90天) / normal */
    batchStatus(batch) {
        const d = daysToToday(batch.expiryDate);
        if (d < 0) return { key: "expired", label: "已过期", cls: "tag-red" };
        if (d <= 30) return { key: "critical", label: `${d}天到期`, cls: "tag-red" };
        if (d <= 90) return { key: "warning", label: `${d}天到期`, cls: "tag-amber" };
        return { key: "normal", label: `${d}天到期`, cls: "tag-green" };
    },
    /* 效期统计 */
    expiryStats() {
        let expired = 0, critical = 0, warning = 0;
        DB.all("batches").forEach(b => {
            if (b.quantity <= 0) return;
            const d = daysToToday(b.expiryDate);
            if (d < 0) expired++;
            else if (d <= 30) critical++;
            else if (d <= 90) warning++;
        });
        return { expired, critical, warning, total: expired + critical + warning };
    },
    /* 低于安全线物品 */
    lowStockItems() {
        return DB.all("items").map(it => ({
            item: it, stock: this.itemStock(it.id),
            short: Math.max(0, it.safetyStock - this.itemStock(it.id))
        })).filter(x => x.stock < x.item.safetyStock);
    },
    /* 冷链当前温度（取最新一条） */
    latestTemp(batchId) {
        const logs = DB.filter("tempLogs", t => t.batchId === batchId)
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        return logs[0] || null;
    },
    /* 冷链告警 */
    coldChainAlarms() {
        const list = [];
        DB.all("batches").forEach(b => {
            const it = this.getItem(b.itemId);
            if (!it || !it.isColdChain || b.quantity <= 0) return;
            const t = this.latestTemp(b.id);
            if (t && (t.status === "alarm" || t.status === "warning")) {
                list.push({ batch: b, item: it, temp: t });
            }
        });
        return list;
    },
    /* 物品近 30 天用量 */
    itemUsage(itemId, days = 30) {
        const since = addDays(todayStr(), -days);
        return DB.filter("outboundRecords", o => o.itemId === itemId && o.outboundDate >= since)
            .reduce((s, o) => s + o.quantity, 0);
    },
    /* 单据编号生成 */
    genReceiptNo() {
        const d = new Date();
        const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
        const seq = String(Math.floor(Math.random() * 9000) + 1000);
        return `RK-${ymd}-${seq}`;
    },
    genOutboundNo() {
        const d = new Date();
        const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
        return `CK-${ymd}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    },
    genPurchaseNo() {
        const n = DB.all("purchaseRequests").length + 1;
        return `PR-${String(n).padStart(3, "0")}`;
    },
    genCheckNo() {
        const n = DB.all("inventoryChecks").length + 1;
        return `CHK-${String(n).padStart(3, "0")}`;
    },
};
