/* ============================================================
   VM PROVISIONING SIMULATOR — app.js
   Full implementation: real validation, allocation, multi-VM,
   10-stage provisioning, live monitoring, comprehensive report.
============================================================ */
"use strict";
 
/* ============================================================
   1. APPLICATION STATE
============================================================ */
const state = {
 
    /* ── Physical host ── */
    host: {
        totalCPU      : 16,
        totalRAM      : 64,
        totalStorage  : 1000,
        availCPU      : 16,
        availRAM      : 64,
        availStorage  : 1000
    },
 
    /* ── Current VM being configured ── */
    vm: {
        name    : "",
        os      : "Ubuntu 22.04 LTS",
        cpu     : 4,
        ram     : 8,
        storage : 100,
        network : "Bridged Network"
    },
 
    /* ── All successfully provisioned VMs ── */
    provisionedVMs : [],
 
    /* ── Flags & tracking ── */
    validationPassed : false,
    allocationDone   : false,
    provisioning     : { startTime: null, endTime: null, completed: false },
 
    /* ── Monitoring ── */
    monitoring : { uptimeSeconds: 0, tickHandle: null, uptimeHandle: null },
 
    /* ── Current screen ── */
    currentScreen : 1,
    totalScreens  : 8,
 
    /* ── Timer handles for cleanup ── */
    timers : { validation: [], allocation: [], provision: [] }
};
 
/* ============================================================
   2. UTILITY HELPERS
============================================================ */
const $ = id => document.getElementById(id);
const setText = (id, val) => { const e = $(id); if (e) e.textContent = val; };
const setHTML = (id, val) => { const e = $(id); if (e) e.innerHTML   = val; };
const setWidth = (id, pct) => { const e = $(id); if (e) e.style.width = Math.max(0, Math.min(100, pct)) + "%"; };
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pad  = n => String(n).padStart(2, "0");
const fmtTime = s => `${pad(Math.floor(s/3600))}:${pad(Math.floor(s%3600/60))}:${pad(s%60)}`;
const now  = () => new Date().toLocaleString();
 
function clearTimerGroup(key) {
    state.timers[key].forEach(clearTimeout);
    state.timers[key] = [];
}
 
/* ============================================================
   3. TOAST
============================================================ */
function showToast(message, isError = false) {
    const t = $("toast");
    if (!t) return;
    setText("toastMessage", message);
    t.className = isError ? "error" : "";
    t.classList.add("show");
    clearTimeout(showToast._h);
    showToast._h = setTimeout(() => t.classList.remove("show"), 3000);
}
 
/* ============================================================
   4. LOADING SCREEN
============================================================ */
function hideLoadingScreen() {
    const ls = $("loading-screen");
    if (!ls) return;
    setTimeout(() => {
        ls.style.transition = "opacity .5s";
        ls.style.opacity    = "0";
        setTimeout(() => { ls.style.display = "none"; }, 500);
    }, 1800);
}
 
/* ============================================================
   5. SCREEN NAVIGATION
============================================================ */
function showScreen(n) {
    if (n < 1 || n > state.totalScreens) return;
    state.currentScreen = n;
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active-screen"));
    const target = $("screen" + n);
    if (target) target.classList.add("active-screen");
    updateProgress();
    updateSidebar();
}
 
function updateProgress() {
    setWidth("progressFill", (state.currentScreen / state.totalScreens) * 100);
    setText("stepNumber", state.currentScreen);
}
 
function updateSidebar() {
    document.querySelectorAll("aside ul li").forEach(li => li.classList.remove("active"));
    const cur = $("menu" + state.currentScreen);
    if (cur) cur.classList.add("active");
}
 
function nextScreen() {
    if (state.currentScreen >= state.totalScreens) return;
    showScreen(state.currentScreen + 1);
 
    if (state.currentScreen === 4) runValidation();
    if (state.currentScreen === 5) runAllocation();
    if (state.currentScreen === 6) runProvisioning();
    if (state.currentScreen === 7) startMonitoring();
    if (state.currentScreen === 8) { stopMonitoring(); buildReport(); }
}
 
function previousScreen() {
    if (state.currentScreen <= 1) return;
    if (state.currentScreen === 7) stopMonitoring();
    showScreen(state.currentScreen - 1);
}
 
/* ============================================================
   6. BUTTON EVENTS
============================================================ */
document.querySelectorAll(".nextBtn").forEach(b => b.addEventListener("click", nextScreen));
document.querySelectorAll(".backBtn").forEach(b => b.addEventListener("click", previousScreen));
 
document.addEventListener("keydown", e => {
    if (e.key === "ArrowRight") nextScreen();
    if (e.key === "ArrowLeft")  previousScreen();
});
 
$("startSimulation") ?.addEventListener("click", () => showScreen(2));
$("addAnotherVM")    ?.addEventListener("click", provisionAnotherVM);
$("restartSimulation")?.addEventListener("click", restartSimulator);
$("goBackFromFail")  ?.addEventListener("click", () => showScreen(3));
 
/* ── Disable Allocate button until validation passes ── */
const allocateBtn = $("allocateBtn");
if (allocateBtn) allocateBtn.disabled = true;
 
/* ============================================================
   7. HOST RESOURCE DISPLAY
============================================================ */
function refreshHostDisplay() {
    const h   = state.host;
    const usedCPU     = h.totalCPU     - h.availCPU;
    const usedRAM     = h.totalRAM     - h.availRAM;
    const usedStorage = h.totalStorage - h.availStorage;
 
    setText("hostCPUDisplay",     `${h.availCPU} / ${h.totalCPU} Cores`);
    setText("hostRAMDisplay",     `${h.availRAM} / ${h.totalRAM} GB`);
    setText("hostStorageDisplay", `${h.availStorage} / ${h.totalStorage} GB`);
    setText("hostCPUUsed",        `${usedCPU} Cores in use`);
    setText("hostRAMUsed",        `${usedRAM} GB in use`);
    setText("hostStorageUsed",    `${usedStorage} GB in use`);
 
    setWidth("hostCPUBar",     (h.availCPU     / h.totalCPU)     * 100);
    setWidth("hostRAMBar",     (h.availRAM     / h.totalRAM)     * 100);
    setWidth("hostStorageBar", (h.availStorage / h.totalStorage) * 100);
 
    setText("infoAvailCPU",     h.availCPU     + " Cores");
    setText("infoAvailRAM",     h.availRAM     + " GB");
    setText("infoAvailStorage", h.availStorage + " GB");
    setText("infoVMCount",      state.provisionedVMs.length);
    setText("hostStatusCell",   state.provisionedVMs.length > 0 ? "Active — VMs Running" : "Ready for Provisioning");
 
    /* Update availability hints on Screen 3 */
    setText("availCPUHint",     h.availCPU);
    setText("availRAMHint",     h.availRAM);
    setText("availStorageHint", h.availStorage);
}
 
/* ============================================================
   8. VM CONFIGURATION
============================================================ */
const vmNameInput   = $("vmName");
const osSelect      = $("osSelect");
const networkSelect = $("networkSelect");
 
function refreshConfigDefaults() {
    const h = state.host;
    setElText("cpuValue",     Math.min(4,   h.availCPU));
    setElText("ramValue",     Math.min(8,   h.availRAM));
    setElText("storageValue", Math.min(100, h.availStorage));
    if (vmNameInput)   vmNameInput.value      = "";
    if (osSelect)      osSelect.selectedIndex  = 0;
    if (networkSelect) networkSelect.selectedIndex = 0;
    updateConfigSummary();
}
 
function setElText(id, val) { const e = $(id); if (e) e.textContent = val; }
function getElInt(id)       { const e = $(id); return e ? parseInt(e.textContent) || 0 : 0; }
 
function updateConfigSummary() {
    const cpu     = getElInt("cpuValue");
    const ram     = getElInt("ramValue");
    const storage = getElInt("storageValue");
    const name    = vmNameInput?.value.trim() || "Ubuntu-VM01";
    const os      = osSelect?.value           || "Ubuntu 22.04 LTS";
    const network = networkSelect?.value      || "Bridged Network";
 
    state.vm = { name, os, cpu, ram, storage, network };
 
    setText("summaryName",    name);
    setText("summaryOS",      os);
    setText("summaryCPU",     cpu     + " Cores");
    setText("summaryRAM",     ram     + " GB");
    setText("summaryStorage", storage + " GB");
    setText("summaryNetwork", network);
}
 
function changeValue(target, amount) {
    const el = $(target);
    if (!el) return;
    let val = parseInt(el.textContent) || 0;
    const h = state.host;
    if (target === "cpuValue")     val = Math.max(1,  Math.min(h.availCPU,     val + amount));
    if (target === "ramValue")     val = Math.max(1,  Math.min(h.availRAM,     val + amount));
    if (target === "storageValue") val = Math.max(20, Math.min(h.availStorage, val + amount * 10));
    el.textContent = val;
    updateConfigSummary();
}
 
/* Register counter and input events */
document.querySelectorAll(".plus").forEach(b  => b.addEventListener("click", function() { changeValue(this.dataset.target,  1); }));
document.querySelectorAll(".minus").forEach(b => b.addEventListener("click", function() { changeValue(this.dataset.target, -1); }));
if (vmNameInput)   vmNameInput.addEventListener("input",   updateConfigSummary);
if (osSelect)      osSelect.addEventListener("change",     updateConfigSummary);
if (networkSelect) networkSelect.addEventListener("change", updateConfigSummary);
 
/* ============================================================
   9. RESOURCE VALIDATION  (Screen 4)
   Real comparison: requested vs available.
============================================================ */
const VAL_ITEMS = [
    { card: "valCardCPU",     fill: "valFillCPU",     status: "valStatusCPU",     detail: "valDetailCPU"     },
    { card: "valCardRAM",     fill: "valFillRAM",     status: "valStatusRAM",     detail: "valDetailRAM"     },
    { card: "valCardStorage", fill: "valFillStorage", status: "valStatusStorage", detail: "valDetailStorage" },
    { card: "valCardNetwork", fill: "valFillNetwork", status: "valStatusNetwork", detail: "valDetailNetwork" }
];
 
function resetValidationUI() {
    VAL_ITEMS.forEach(item => {
        const card   = $(item.card);
        const fill   = $(item.fill);
        const status = $(item.status);
        const detail = $(item.detail);
        if (card)   { card.classList.remove("pass", "fail"); }
        if (fill)   { fill.style.transition = "none"; fill.style.width = "0%"; }
        if (status) { status.textContent = "Waiting..."; status.style.color = ""; }
        if (detail) { detail.textContent = ""; detail.className = "val-detail"; }
    });
    const vs = $("validationSuccess"); if (vs) vs.style.display = "none";
    const vf = $("validationFailure"); if (vf) vf.style.display = "none";
    if (allocateBtn) allocateBtn.disabled = true;
    state.validationPassed = false;
}
 
function runValidation() {
    clearTimerGroup("validation");
    resetValidationUI();
 
    const vm = state.vm;
    const h  = state.host;
 
    /* Determine pass/fail for each resource */
    const checks = [
        {
            pass      : vm.cpu <= h.availCPU,
            passMsg   : `✓ CPU validated — ${vm.cpu} Cores requested, ${h.availCPU} available`,
            failMsg   : `✗ CPU Validation Failed`,
            failDetail: `Requested: ${vm.cpu} Cores | Available: ${h.availCPU} Cores`
        },
        {
            pass      : vm.ram <= h.availRAM,
            passMsg   : `✓ Memory validated — ${vm.ram} GB requested, ${h.availRAM} GB available`,
            failMsg   : `✗ Memory Validation Failed`,
            failDetail: `Requested: ${vm.ram} GB | Available: ${h.availRAM} GB`
        },
        {
            pass      : vm.storage <= h.availStorage,
            passMsg   : `✓ Storage validated — ${vm.storage} GB requested, ${h.availStorage} GB available`,
            failMsg   : `✗ Storage Validation Failed`,
            failDetail: `Requested: ${vm.storage} GB | Available: ${h.availStorage} GB`
        },
        {
            pass      : true,
            passMsg   : "✓ Network interface available",
            failMsg   : "",
            failDetail: ""
        }
    ];
 
    let overallPass = true;
    let firstFailIndex = -1;
 
    checks.forEach((c, i) => {
        if (!c.pass) { overallPass = false; if (firstFailIndex === -1) firstFailIndex = i; }
    });
 
    /* Animate each check one by one — stop at first failure */
    const lastIndex = firstFailIndex === -1 ? checks.length - 1 : firstFailIndex;
 
    checks.forEach((check, i) => {
        if (firstFailIndex !== -1 && i > firstFailIndex) return; /* skip after fail */
 
        const delay = i * 1100;
 
        const t1 = setTimeout(() => {
            const item   = VAL_ITEMS[i];
            const fill   = $(item.fill);
            const status = $(item.status);
 
            if (status) status.textContent = "Checking...";
            if (fill)   { fill.style.transition = "width 0.9s linear"; fill.style.width = "100%"; }
 
            const t2 = setTimeout(() => {
                const card   = $(item.card);
                const detail = $(item.detail);
                const passed = check.pass;
 
                if (card)   card.classList.add(passed ? "pass" : "fail");
                if (status) { status.textContent = passed ? check.passMsg : check.failMsg; status.style.color = passed ? "#16a34a" : "#dc2626"; }
                if (detail && !passed) {
                    detail.textContent = check.failDetail;
                    detail.className   = "val-detail visible failed";
                } else if (detail && passed) {
                    detail.className = "val-detail";
                }
 
                /* After last item resolves, show result banner */
                if (i === lastIndex) {
                    const t3 = setTimeout(() => {
                        if (overallPass) {
                            const vs = $("validationSuccess");
                            if (vs) vs.style.display = "block";
                            if (allocateBtn) allocateBtn.disabled = false;
                            state.validationPassed = true;
                            showToast("All resources validated successfully");
                        } else {
                            const vf = $("validationFailure");
                            const vm = state.vm;
                            const h  = state.host;
                            /* Build descriptive failure message */
                            const lines = checks
                                .map((c, idx) => !c.pass ? `<strong>${["CPU","Memory","Storage"][idx]}:</strong> Requested ${
                                    idx===0 ? vm.cpu+" Cores" : idx===1 ? vm.ram+" GB" : vm.storage+" GB"
                                } — Available ${
                                    idx===0 ? h.availCPU+" Cores" : idx===1 ? h.availRAM+" GB" : h.availStorage+" GB"
                                }` : null)
                                .filter(Boolean)
                                .join(" &nbsp;|&nbsp; ");
 
                            if (vf) {
                                vf.style.display = "block";
                                setText("validationFailureMsg", "");
                                setHTML("validationFailureMsg", lines + " — Please reduce the VM configuration and try again.");
                            }
                            state.validationPassed = false;
                            if (allocateBtn) allocateBtn.disabled = true;
                            showToast("Validation failed — check resource limits", true);
                        }
                    }, 300);
                    state.timers.validation.push(t3);
                }
 
            }, 900);
            state.timers.validation.push(t2);
 
        }, delay);
        state.timers.validation.push(t1);
    });
}
 
/* ============================================================
   10. RESOURCE ALLOCATION  (Screen 5)
   Deducts from host immediately when animation completes.
============================================================ */
const ALLOC_ITEMS = [
    { fill: "cpuAllocate",     status: "cpuStatus",     amount: "cpuAllocAmount"     },
    { fill: "ramAllocate",     status: "ramStatus",     amount: "ramAllocAmount"     },
    { fill: "storageAllocate", status: "storageStatus", amount: "storageAllocAmount" },
    { fill: "networkAllocate", status: "networkStatus", amount: "networkAllocAmount" }
];
 
function resetAllocationUI() {
    ALLOC_ITEMS.forEach(item => {
        const fill   = $(item.fill);
        const status = $(item.status);
        const amount = $(item.amount);
        if (fill)   { fill.style.transition = "none"; fill.style.width = "0%"; }
        if (status) { status.textContent = "Waiting..."; status.style.color = ""; }
        if (amount) { amount.textContent  = ""; }
    });
    const ar = $("allocResult"); if (ar) ar.classList.remove("visible");
    state.allocationDone = false;
}
 
function runAllocation() {
    if (!state.validationPassed) {
        showToast("Allocation blocked — validation not passed", true);
        showScreen(4);
        return;
    }
    clearTimerGroup("allocation");
    resetAllocationUI();
 
    const vm = state.vm;
    const labels = [
        { label: "Allocating CPU Cores...",   done: `✓ Allocated ${vm.cpu} Cores`,    amount: `${vm.cpu} Cores allocated` },
        { label: "Allocating Memory...",       done: `✓ Allocated ${vm.ram} GB RAM`,   amount: `${vm.ram} GB allocated`    },
        { label: "Allocating Storage...",      done: `✓ Allocated ${vm.storage} GB`,   amount: `${vm.storage} GB allocated` },
        { label: "Assigning Network...",       done: `✓ Network Assigned Successfully`, amount: `${vm.network} assigned`   }
    ];
 
    labels.forEach((lbl, i) => {
        const t1 = setTimeout(() => {
            const item   = ALLOC_ITEMS[i];
            const fill   = $(item.fill);
            const status = $(item.status);
            const amount = $(item.amount);
 
            if (status) { status.textContent = lbl.label; status.style.color = "#2563eb"; }
            if (fill)   { fill.style.transition = "width 1s ease"; fill.style.width = "100%"; }
 
            const t2 = setTimeout(() => {
                if (status) { status.textContent = lbl.done;   status.style.color = "#16a34a"; }
                if (amount)   amount.textContent  = lbl.amount;
 
                /* After all done → deduct resources + show summary */
                if (i === labels.length - 1) {
                    const t3 = setTimeout(() => {
                        /* Deduct from host */
                        state.host.availCPU     -= vm.cpu;
                        state.host.availRAM     -= vm.ram;
                        state.host.availStorage -= vm.storage;
                        state.host.availCPU     = Math.max(0, state.host.availCPU);
                        state.host.availRAM     = Math.max(0, state.host.availRAM);
                        state.host.availStorage = Math.max(0, state.host.availStorage);
 
                        refreshHostDisplay();
                        state.allocationDone = true;
 
                        /* Show post-allocation summary */
                        setText("allocRemCPU",     state.host.availCPU     + " Cores remaining");
                        setText("allocRemRAM",     state.host.availRAM     + " GB remaining");
                        setText("allocRemStorage", state.host.availStorage + " GB remaining");
                        const ar = $("allocResult"); if (ar) ar.classList.add("visible");
 
                        showToast("Resource allocation complete");
                    }, 400);
                    state.timers.allocation.push(t3);
                }
            }, 1000);
            state.timers.allocation.push(t2);
        }, i * 1000);
        state.timers.allocation.push(t1);
    });
}
 
/* ============================================================
   11. VM PROVISIONING  (Screen 6) — 10 stages
============================================================ */
const PROV_STAGES = [
    { id: "pStep1",  text: "Initialize Hypervisor",        detail: "Starting VMware ESXi hypervisor services..."      },
    { id: "pStep2",  text: "Create Virtual Machine",       detail: "Creating VM descriptor and configuration file..."  },
    { id: "pStep3",  text: "Reserve CPU Resources",        detail: `Reserving ${0} vCPUs for the virtual machine...`  },
    { id: "pStep4",  text: "Reserve RAM Resources",        detail: `Allocating ${0} GB memory balloon...`             },
    { id: "pStep5",  text: "Allocate Storage Volume",      detail: `Creating ${0} GB virtual disk (VMDK)...`          },
    { id: "pStep6",  text: "Configure Network Adapter",    detail: "Attaching virtual NIC to network switch..."        },
    { id: "pStep7",  text: "Install Guest OS",             detail: `Deploying ${""} image...`                         },
    { id: "pStep8",  text: "Configure Boot Loader",        detail: "Writing GRUB2 / BCD boot configuration..."        },
    { id: "pStep9",  text: "Start Virtual Machine",        detail: "Powering on VM — executing BIOS POST..."          },
    { id: "pStep10", text: "VM Running",                   detail: "Virtual machine is operational and healthy ✓"     }
];
 
function buildStageDetails() {
    const vm = state.vm;
    PROV_STAGES[2].detail = `Reserving ${vm.cpu} vCPUs for the virtual machine...`;
    PROV_STAGES[3].detail = `Allocating ${vm.ram} GB memory balloon...`;
    PROV_STAGES[4].detail = `Creating ${vm.storage} GB virtual disk (VMDK)...`;
    PROV_STAGES[6].detail = `Deploying ${vm.os} image to virtual disk...`;
}
 
function resetProvisioningUI() {
    clearTimerGroup("provision");
    const fill = $("overallFill");
    if (fill) { fill.style.transition = "none"; fill.style.width = "0%"; }
    setText("currentTask",       "Preparing...");
    setText("currentTaskDetail", "");
    PROV_STAGES.forEach(s => {
        const el = $(s.id);
        if (el) el.classList.remove("active", "completed");
    });
    state.provisioning = { startTime: null, endTime: null, completed: false };
}
 
function runProvisioning() {
    if (!state.allocationDone) {
        showToast("Provisioning blocked — allocation not completed", true);
        showScreen(5);
        return;
    }
    clearTimerGroup("provision");
    resetProvisioningUI();
    buildStageDetails();
 
    state.provisioning.startTime = Date.now();
    const total = PROV_STAGES.length;
 
    PROV_STAGES.forEach((stage, i) => {
        const t = setTimeout(() => {
 
            /* Mark previous as completed */
            if (i > 0) {
                const prev = $(PROV_STAGES[i - 1].id);
                if (prev) { prev.classList.remove("active"); prev.classList.add("completed"); }
            }
            /* Activate current */
            const cur = $(stage.id);
            if (cur) cur.classList.add("active");
            setText("currentTask",       stage.text);
            setText("currentTaskDetail", stage.detail);
 
            /* Progress bar */
            const fill = $("overallFill");
            if (fill) {
                fill.style.transition = "width 1.1s ease";
                fill.style.width = Math.round(((i + 1) / total) * 100) + "%";
            }
 
        }, i * 1300);
        state.timers.provision.push(t);
    });
 
    /* Final completion */
    const done = setTimeout(() => {
        const last = $(PROV_STAGES[total - 1].id);
        if (last) { last.classList.remove("active"); last.classList.add("completed"); }
        const fill = $("overallFill");
        if (fill) fill.style.width = "100%";
        setText("currentTask",       "✓ Provisioning Completed Successfully");
        setText("currentTaskDetail", "The virtual machine is now running on the hypervisor.");
 
        /* Record completion */
        state.provisioning.endTime   = Date.now();
        state.provisioning.completed = true;
 
        /* Save VM to provisioned list */
        state.provisionedVMs.push({
            ...state.vm,
            id          : state.provisionedVMs.length + 1,
            provisionedAt: now()
        });
 
        /* Refresh host display & sidebar */
        refreshHostDisplay();
        refreshSidebarVMList();
        setText("headerStatus", `${state.provisionedVMs.length} VM(s) Running`);
 
        showToast(`${state.vm.name} provisioned successfully!`);
    }, total * 1300 + 500);
    state.timers.provision.push(done);
}
 
/* ============================================================
   12. SIDEBAR VM LIST
============================================================ */
function refreshSidebarVMList() {
    const container = $("sidebarVMs");
    if (!container) return;
    if (!state.provisionedVMs.length) {
        container.innerHTML = '<p class="no-vms">No VMs yet</p>';
        return;
    }
    container.innerHTML = state.provisionedVMs.map(v => `
        <div class="sidebar-vm-chip">
            <strong>${v.name}</strong>
            ${v.cpu} CPU · ${v.ram} GB · ${v.storage} GB
        </div>`).join("");
}
 
/* ============================================================
   13. MONITORING DASHBOARD  (Screen 7)
============================================================ */
function startMonitoring() {
    stopMonitoring();
    state.monitoring.uptimeSeconds = 0;
 
    const vm = state.vm;
    setText("monVMName",    vm.name);
    setText("monOS",        vm.os);
    setText("monStatus",    "Running");
    setText("monCPU",       vm.cpu     + " vCPUs");
    setText("monRAM",       vm.ram     + " GB");
    setText("monStorage",   vm.storage + " GB SSD");
    setText("monNetwork",   vm.network);
 
    tick(); /* immediate first update */
 
    state.monitoring.tickHandle   = setInterval(tick, 1000);
    state.monitoring.uptimeHandle = setInterval(() => {
        state.monitoring.uptimeSeconds++;
        setText("vmUptime", fmtTime(state.monitoring.uptimeSeconds));
    }, 1000);
}
 
function tick() {
    const cpu  = rand(15, 85);
    const mem  = rand(40, 90);
    const disk = rand(20, 75);
    const net  = rand(5, 250);
 
    setText("cpuUsage",     cpu  + "%");
    setText("memoryUsage",  mem  + "%");
    setText("diskUsage",    disk + "%");
    setText("networkUsage", net  + " Mbps");
 
    setWidth("cpuGauge",  cpu);
    setWidth("ramGauge",  mem);
    setWidth("diskGauge", disk);
    setWidth("netGauge",  Math.min(net / 2.5, 100)); /* scale 250 Mbps → 100% */
}
 
function stopMonitoring() {
    clearInterval(state.monitoring.tickHandle);
    clearInterval(state.monitoring.uptimeHandle);
    state.monitoring.tickHandle = state.monitoring.uptimeHandle = null;
}
 
/* ============================================================
   14. FINAL REPORT  (Screen 8)
============================================================ */
function buildReport() {
    const vm   = state.vm;
    const h    = state.host;
    const secs = state.provisioning.startTime && state.provisioning.endTime
        ? Math.round((state.provisioning.endTime - state.provisioning.startTime) / 1000) : 0;
 
    setText("rVMName",      vm.name);
    setText("rOS",          vm.os);
    setText("rStatus",      "Running");
    setText("rCPU",         vm.cpu     + " Cores");
    setText("rRAM",         vm.ram     + " GB");
    setText("rStorage",     vm.storage + " GB SSD");
    setText("rNetwork",     vm.network);
    setText("rTime",        secs + "s");
    setText("rTimestamp",   now());
 
    setText("rTotalCPU",     h.totalCPU     + " Cores");
    setText("rRemCPU",       h.availCPU     + " Cores");
    setText("rTotalRAM",     h.totalRAM     + " GB");
    setText("rRemRAM",       h.availRAM     + " GB");
    setText("rTotalStorage", h.totalStorage + " GB");
    setText("rRemStorage",   h.availStorage + " GB");
    setText("rVMCount",      state.provisionedVMs.length);
 
    buildVMTable();
}
 
function buildVMTable() {
    const tbody   = $("vmTableBody");
    const section = $("allVMsSection");
    if (!tbody) return;
 
    if (state.provisionedVMs.length > 1 && section) section.style.display = "block";
    else if (section) section.style.display = "none";
 
    tbody.innerHTML = state.provisionedVMs.map(vm => `
        <tr>
            <td>${vm.id}</td>
            <td><strong>${vm.name}</strong></td>
            <td>${vm.os}</td>
            <td>${vm.cpu} Cores</td>
            <td>${vm.ram} GB</td>
            <td>${vm.storage} GB</td>
            <td>${vm.network}</td>
            <td><span class="pill running">● Running</span></td>
        </tr>`).join("");
}
 
/* ============================================================
   15. PROVISION ANOTHER VM
   Keeps host resources deducted. Resets config/flow only.
============================================================ */
function provisionAnotherVM() {
    /* Guard: check if host has any resources left */
    const h = state.host;
    if (h.availCPU < 1 || h.availRAM < 1 || h.availStorage < 20) {
        showToast("No host resources remaining — cannot provision more VMs", true);
        return;
    }
 
    clearTimerGroup("validation");
    clearTimerGroup("allocation");
    clearTimerGroup("provision");
 
    state.validationPassed = false;
    state.allocationDone   = false;
    state.provisioning     = { startTime: null, endTime: null, completed: false };
    state.monitoring.uptimeSeconds = 0;
 
    resetValidationUI();
    resetAllocationUI();
    resetProvisioningUI();
 
    refreshConfigDefaults();
    if (allocateBtn) allocateBtn.disabled = true;
 
    setText("vmUptime",   "00:00:00");
    setText("monStatus",  "—");
    setText("monVMName",  "—");
 
    showScreen(3);
    showToast(`Configure next VM — ${h.availCPU} CPU, ${h.availRAM} GB RAM remaining`);
}
 
/* ============================================================
   16. RESTART SIMULATION — full reset to initial state
============================================================ */
function restartSimulator() {
    clearTimerGroup("validation");
    clearTimerGroup("allocation");
    clearTimerGroup("provision");
    stopMonitoring();
 
    /* Restore host */
    state.host.availCPU      = state.host.totalCPU;
    state.host.availRAM      = state.host.totalRAM;
    state.host.availStorage  = state.host.totalStorage;
 
    /* Clear VMs */
    state.provisionedVMs    = [];
    state.validationPassed  = false;
    state.allocationDone    = false;
    state.provisioning      = { startTime: null, endTime: null, completed: false };
    state.monitoring.uptimeSeconds = 0;
 
    resetValidationUI();
    resetAllocationUI();
    resetProvisioningUI();
 
    refreshHostDisplay();
    refreshSidebarVMList();
    refreshConfigDefaults();
 
    if (allocateBtn) allocateBtn.disabled = true;
    setText("headerStatus", "System Ready");
    setText("vmUptime",     "00:00:00");
    setText("monVMName",    "—");
    setText("monOS",        "—");
    setText("monStatus",    "—");
 
    const allVMs = $("allVMsSection"); if (allVMs) allVMs.style.display = "none";
    const tbody  = $("vmTableBody");   if (tbody)  tbody.innerHTML = "";
    const ar     = $("allocResult");   if (ar)     ar.classList.remove("visible");
 
    showScreen(1);
    showToast("Simulation fully reset — host resources restored");
}
 
/* ============================================================
   17. INITIALISATION
============================================================ */
function init() {
    hideLoadingScreen();
    showScreen(1);
    refreshHostDisplay();
    refreshSidebarVMList();
    refreshConfigDefaults();
 
    /* Hide allVMs table initially */
    const allVMs = $("allVMsSection"); if (allVMs) allVMs.style.display = "none";
 
    console.clear();
    console.log("══════════════════════════════════════════");
    console.log("  VM Provisioning Simulator — Ready");
    console.log("  Real Validation ✓  Real Allocation ✓");
    console.log("  Multi-VM ✓  10-Stage Provisioning ✓");
    console.log("══════════════════════════════════════════");
}
 
window.addEventListener("load", init);
