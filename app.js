const DB_NAME = "nex_seguros_os_db";
const STORE_NAME = "requests";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const STATUSES = ["Recebido", "Em análise", "Aprovado", "Reprovado", "Finalizado"];

const DEFAULT_SETTINGS = {
  title: "NEX SEGUROS - Envio de Ordem de Serviço",
  subtitle: "Envie sua OS, confira a taxa automaticamente, pague via PIX e anexe o comprovante para concluir sua solicitação.",
  pixKey: "nexclubapp@gmail.com",
  whatsapp: "553138013505",
  primary: "#003d52",
  accent: "#f7b719",
  logoData: ""
};

const DEFAULT_USERS = [
  { name: "Administrador NEX", email: "nexclubapp@gmail.com", password: "#Nexclub", locked: true }
];

let dbPromise;
let adminSession = null;
let currentRequests = [];
let activeDetailRecord = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  brandLogo: $("#brandLogo"),
  pageTitle: $("#pageTitle"),
  pageSubtitle: $("#pageSubtitle"),
  whatsappBtn: $("#whatsappBtn"),
  openAdminBtn: $("#openAdminBtn"),
  adminModal: $("#adminModal"),
  detailModal: $("#detailModal"),
  serviceForm: $("#serviceForm"),
  formMessage: $("#formMessage"),
  clientCpf: $("#clientCpf"),
  clientPhone: $("#clientPhone"),
  serviceValue: $("#serviceValue"),
  displayTotal: $("#displayTotal"),
  heroPayAmount: $("#heroPayAmount"),
  pixKeyDisplay: $("#pixKeyDisplay"),
  pixQrCode: $("#pixQrCode"),
  qrAmountText: $("#qrAmountText"),
  copyPixBtn: $("#copyPixBtn"),
  serviceFile: $("#serviceFile"),
  paymentFile: $("#paymentFile"),
  serviceFileName: $("#serviceFileName"),
  paymentFileName: $("#paymentFileName"),
  loginPanel: $("#loginPanel"),
  adminPanel: $("#adminPanel"),
  adminEmail: $("#adminEmail"),
  adminPassword: $("#adminPassword"),
  loginMessage: $("#loginMessage"),
  loginBtn: $("#loginBtn"),
  logoutBtn: $("#logoutBtn"),
  adminSearch: $("#adminSearch"),
  exportBtn: $("#exportBtn"),
  requestsTable: $("#requestsTable"),
  emptyRequests: $("#emptyRequests"),
  userForm: $("#userForm"),
  usersList: $("#usersList"),
  settingsForm: $("#settingsForm"),
  detailTitle: $("#detailTitle"),
  detailContent: $("#detailContent")
};

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function dbTransaction(mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = callback(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

async function saveRequest(record) {
  await dbTransaction("readwrite", (store) => store.put(record));
}

async function getAllRequests() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    request.onerror = () => reject(request.error);
  });
}

async function getRequest(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function loadSettings() {
  const saved = localStorage.getItem("nexSettings");
  return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
  localStorage.setItem("nexSettings", JSON.stringify(settings));
}

function loadUsers() {
  const saved = localStorage.getItem("nexAdminUsers");
  return saved ? JSON.parse(saved) : [...DEFAULT_USERS];
}

function saveUsers(users) {
  localStorage.setItem("nexAdminUsers", JSON.stringify(users));
}

function applySettings() {
  const settings = loadSettings();
  document.documentElement.style.setProperty("--primary", settings.primary);
  document.documentElement.style.setProperty("--accent", settings.accent);
  els.pageTitle.textContent = settings.title;
  els.pageSubtitle.textContent = settings.subtitle;
  els.pixKeyDisplay.value = settings.pixKey;
  if (settings.logoData) els.brandLogo.src = settings.logoData;

  const message = encodeURIComponent("Olá, venho através do Nex Seguro!");
  const phone = onlyDigits(settings.whatsapp || DEFAULT_SETTINGS.whatsapp);
  els.whatsappBtn.href = `https://wa.me/${phone}?text=${message}`;

  $("#settingTitle").value = settings.title;
  $("#settingSubtitle").value = settings.subtitle;
  $("#settingPixKey").value = settings.pixKey;
  $("#settingWhatsapp").value = settings.whatsapp;
  $("#settingPrimary").value = settings.primary;
  $("#settingAccent").value = settings.accent;

  updateCalculation();
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(iso));
}

function toDateTimeLocal(iso) {
  const date = new Date(iso);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function parseCurrency(value) {
  const normalized = String(value || "")
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function maskCurrencyInput(input) {
  const digits = onlyDigits(input.value);
  const cents = Number(digits || 0);
  input.value = formatCurrency(cents / 100);
}

function maskCpf(value) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function maskPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

function calculateFee(serviceValue) {
  if (serviceValue <= 0) return 0;
  if (serviceValue < 200) return 19;
  return Math.round(serviceValue * 9.5) / 100;
}

function getCurrentAmounts() {
  const serviceValue = parseCurrency(els.serviceValue.value);
  const fee = calculateFee(serviceValue);
  return { serviceValue, fee, total: fee };
}

function updateCalculation() {
  const { serviceValue, fee, total } = getCurrentAmounts();
  els.displayTotal.textContent = formatCurrency(total);
  els.heroPayAmount.textContent = formatCurrency(total);
  els.qrAmountText.textContent = serviceValue > 0 ? `Taxa: ${formatCurrency(total)}` : "Digite o valor da OS";

  const settings = loadSettings();
  const pixPayload = createPixPayload(settings.pixKey, total);
  els.pixQrCode.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pixPayload)}`;
}

function tlv(id, value) {
  const text = String(value ?? "");
  return `${id}${String(text.length).padStart(2, "0")}${text}`;
}

function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function createPixPayload(key, amount) {
  const merchantAccount = tlv("00", "br.gov.bcb.pix") + tlv("01", key) + tlv("02", "Taxa Nex Seguros");
  const additionalData = tlv("05", "NEXOS");
  const payloadWithoutCrc =
    tlv("00", "01") +
    tlv("26", merchantAccount) +
    tlv("52", "0000") +
    tlv("53", "986") +
    (amount > 0 ? tlv("54", amount.toFixed(2)) : "") +
    tlv("58", "BR") +
    tlv("59", "NEX SEGUROS") +
    tlv("60", "BELO HORIZONTE") +
    tlv("62", additionalData) +
    "6304";
  return payloadWithoutCrc + crc16(payloadWithoutCrc);
}

function showMessage(element, text, type) {
  element.textContent = text;
  element.classList.remove("message-ok", "message-error");
  if (type) element.classList.add(type === "ok" ? "message-ok" : "message-error");
}

function validateFile(file) {
  if (!file) return "Arquivo obrigatório.";
  if (!ACCEPTED_TYPES.includes(file.type)) return "Use JPG, JPEG, PNG ou PDF.";
  if (file.size > MAX_FILE_SIZE) return "O arquivo deve ter até 10 MB.";
  return "";
}

function fileToData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl: reader.result
    });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function generateProtocol() {
  const now = new Date();
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `NEX-${stamp}-${suffix}`;
}

function validateForm() {
  const required = [
    ["#clientName", "Informe o nome completo."],
    ["#clientCpf", "Informe o CPF."],
    ["#clientPhone", "Informe o telefone com WhatsApp."],
    ["#clientEmail", "Informe o e-mail."],
    ["#shopName", "Informe o nome da oficina."],
    ["#serviceValue", "Informe o valor da Ordem de Serviço."]
  ];

  for (const [selector, message] of required) {
    const field = $(selector);
    if (!field.value.trim() || (selector === "#serviceValue" && parseCurrency(field.value) <= 0)) {
      field.focus();
      return message;
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($("#clientEmail").value.trim())) return "Informe um e-mail válido.";
  if (onlyDigits($("#clientCpf").value).length !== 11) return "Informe um CPF com 11 dígitos.";
  if (onlyDigits($("#clientPhone").value).length < 10) return "Informe um telefone válido.";

  const serviceFileError = validateFile(els.serviceFile.files[0]);
  if (serviceFileError) return `Ordem de Serviço: ${serviceFileError}`;
  const paymentFileError = validateFile(els.paymentFile.files[0]);
  if (paymentFileError) return `Comprovante PIX: ${paymentFileError}`;
  return "";
}

async function handleSubmit(event) {
  event.preventDefault();
  const error = validateForm();
  if (error) {
    showMessage(els.formMessage, error, "error");
    return;
  }

  const { serviceValue, fee, total } = getCurrentAmounts();
  const protocol = generateProtocol();
  const submitBtn = els.serviceForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  showMessage(els.formMessage, "Enviando solicitação...", "");

  try {
    const [serviceFile, paymentFile] = await Promise.all([
      fileToData(els.serviceFile.files[0]),
      fileToData(els.paymentFile.files[0])
    ]);

    const record = {
      id: crypto.randomUUID(),
      protocol,
      createdAt: new Date().toISOString(),
      clientName: $("#clientName").value.trim(),
      clientCpf: $("#clientCpf").value.trim(),
      clientPhone: $("#clientPhone").value.trim(),
      clientEmail: $("#clientEmail").value.trim(),
      shopName: $("#shopName").value.trim(),
      serviceValue,
      fee,
      total,
      status: "Recebido",
      serviceFile,
      paymentFile
    };

    await saveRequest(record);
    els.serviceForm.reset();
    els.serviceFileName.textContent = "Nenhum arquivo selecionado";
    els.paymentFileName.textContent = "Nenhum arquivo selecionado";
    updateCalculation();
    showMessage(
      els.formMessage,
      `Recebemos sua solicitação com sucesso. Protocolo ${protocol}. Nossa equipe analisará os documentos e entrará em contato caso seja necessário.`,
      "ok"
    );
  } catch (err) {
    showMessage(els.formMessage, "Não foi possível salvar a solicitação. Tente novamente.", "error");
  } finally {
    submitBtn.disabled = false;
  }
}

function setAdminVisible(isVisible) {
  els.loginPanel.classList.toggle("hidden", isVisible);
  els.adminPanel.classList.toggle("hidden", !isVisible);
}

async function handleLogin() {
  const email = els.adminEmail.value.trim().toLowerCase();
  const password = els.adminPassword.value;
  const user = loadUsers().find((item) => item.email.toLowerCase() === email && item.password === password);
  if (!user) {
    showMessage(els.loginMessage, "E-mail ou senha inválidos.", "error");
    return;
  }
  adminSession = user.email;
  localStorage.setItem("nexAdminSession", user.email);
  showMessage(els.loginMessage, "", "");
  setAdminVisible(true);
  await refreshAdmin();
}

function handleLogout() {
  adminSession = null;
  localStorage.removeItem("nexAdminSession");
  els.adminEmail.value = "";
  els.adminPassword.value = "";
  setAdminVisible(false);
}

async function refreshAdmin() {
  currentRequests = await getAllRequests();
  renderRequests();
  renderUsers();
}

function recordMatchesSearch(record, term) {
  if (!term) return true;
  const haystack = [
    record.clientName,
    record.clientCpf,
    record.clientPhone,
    record.shopName,
    formatCurrency(record.serviceValue),
    String(record.serviceValue).replace(".", ","),
    record.status,
    record.protocol
  ].join(" ").toLowerCase();
  return haystack.includes(term.toLowerCase());
}

function renderRequests() {
  const term = els.adminSearch.value.trim();
  const filtered = currentRequests.filter((record) => recordMatchesSearch(record, term));
  els.emptyRequests.classList.toggle("hidden", filtered.length > 0);
  els.requestsTable.innerHTML = filtered.map((record) => `
    <tr>
      <td>${formatDate(record.createdAt)}</td>
      <td><strong>${escapeHtml(record.clientName)}</strong><br><small>${escapeHtml(record.protocol)}</small></td>
      <td>${escapeHtml(record.clientCpf)}</td>
      <td>${escapeHtml(record.clientPhone)}</td>
      <td>${escapeHtml(record.shopName)}</td>
      <td>${formatCurrency(record.serviceValue)}</td>
      <td>${formatCurrency(record.fee)}</td>
      <td>
        <select class="status-select" data-status-id="${record.id}">
          ${STATUSES.map((status) => `<option value="${status}" ${status === record.status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </td>
      <td>
        <div class="action-row">
          <button class="btn btn-secondary" type="button" data-view-id="${record.id}">
            <span data-lucide="eye"></span>
            Abrir
          </button>
        </div>
      </td>
    </tr>
  `).join("");
  refreshIcons();
}

function renderUsers() {
  const users = loadUsers();
  els.usersList.innerHTML = users.map((user) => `
    <div class="user-item">
      <div>
        <strong>${escapeHtml(user.name)}</strong>
        <span>${escapeHtml(user.email)}</span>
      </div>
      <button class="btn btn-secondary" type="button" data-remove-user="${escapeHtml(user.email)}" ${user.locked ? "disabled" : ""}>
        <span data-lucide="trash-2"></span>
        Remover
      </button>
    </div>
  `).join("");
  refreshIcons();
}

async function updateStatus(id, status) {
  const record = await getRequest(id);
  if (!record) return;
  record.status = status;
  await saveRequest(record);
  await refreshAdmin();
}

function renderAttachment(file, title) {
  const safeTitle = escapeHtml(title);
  const safeName = escapeHtml(file.name);
  const viewer = file.type === "application/pdf"
    ? `<iframe class="attachment-frame" src="${file.dataUrl}" title="${safeTitle}"></iframe>`
    : `<img class="attachment-frame" src="${file.dataUrl}" alt="${safeTitle}" />`;

  return `
    <article class="attachment-card">
      <h3>${safeTitle}</h3>
      <p>${safeName}</p>
      ${viewer}
      <a class="btn btn-secondary" download="${safeName}" href="${file.dataUrl}">
        <span data-lucide="download"></span>
        Baixar arquivo
      </a>
    </article>
  `;
}

function renderDetail(record) {
  activeDetailRecord = record;
  els.detailTitle.textContent = `${record.clientName} - ${record.protocol}`;
  els.detailContent.innerHTML = `
    <div class="detail-grid">
      <div class="detail-card"><span>Data</span><strong>${formatDate(record.createdAt)}</strong></div>
      <div class="detail-card"><span>Protocolo</span><strong>${escapeHtml(record.protocol)}</strong></div>
      <div class="detail-card"><span>Status</span><strong>${escapeHtml(record.status)}</strong></div>
      <div class="detail-card"><span>Cliente</span><strong>${escapeHtml(record.clientName)}</strong></div>
      <div class="detail-card"><span>CPF</span><strong>${escapeHtml(record.clientCpf)}</strong></div>
      <div class="detail-card"><span>Telefone</span><strong>${escapeHtml(record.clientPhone)}</strong></div>
      <div class="detail-card"><span>E-mail</span><strong>${escapeHtml(record.clientEmail)}</strong></div>
      <div class="detail-card"><span>Oficina</span><strong>${escapeHtml(record.shopName)}</strong></div>
      <div class="detail-card"><span>Valor da OS</span><strong>${formatCurrency(record.serviceValue)}</strong></div>
      <div class="detail-card"><span>Taxa calculada</span><strong>${formatCurrency(record.fee)}</strong></div>
      <div class="detail-card"><span>Valor pago</span><strong>${formatCurrency(record.total)}</strong></div>
    </div>
    <form class="detail-edit-form" id="detailEditForm">
      <h3>Editar todos os campos da solicitação</h3>
      <div class="grid two">
        <label>Data e hora<input id="editCreatedAt" type="datetime-local" value="${toDateTimeLocal(record.createdAt)}" required /></label>
        <label>Protocolo<input id="editProtocol" value="${escapeHtml(record.protocol)}" required /></label>
        <label>Nome do cliente<input id="editClientName" value="${escapeHtml(record.clientName)}" required /></label>
        <label>CPF<input id="editClientCpf" value="${escapeHtml(record.clientCpf)}" required /></label>
        <label>Telefone<input id="editClientPhone" value="${escapeHtml(record.clientPhone)}" required /></label>
        <label>E-mail<input id="editClientEmail" type="email" value="${escapeHtml(record.clientEmail)}" required /></label>
        <label>Oficina<input id="editShopName" value="${escapeHtml(record.shopName)}" required /></label>
        <label>Valor da OS<input id="editServiceValue" value="${formatCurrency(record.serviceValue)}" required /></label>
        <label>Taxa calculada<input id="editFee" value="${formatCurrency(record.fee)}" required /></label>
        <label>Valor pago<input id="editTotal" value="${formatCurrency(record.total)}" required /></label>
        <label>Status
          <select id="editStatus">
            ${STATUSES.map((status) => `<option value="${status}" ${status === record.status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </label>
        <label class="edit-file-field">
          Substituir Ordem de Serviço
          <input id="editServiceFile" type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" />
          <span>Atual: ${escapeHtml(record.serviceFile.name)}</span>
        </label>
        <label class="edit-file-field">
          Substituir comprovante PIX
          <input id="editPaymentFile" type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" />
          <span>Atual: ${escapeHtml(record.paymentFile.name)}</span>
        </label>
      </div>
      <button class="btn btn-primary" type="submit">
        <span data-lucide="save"></span>
        Salvar dados editados
      </button>
    </form>
    <div class="detail-actions">
      <button class="btn btn-primary" type="button" id="printDetailBtn">
        <span data-lucide="printer"></span>
        Imprimir solicitação
      </button>
    </div>
    <div class="attachments-view">
      ${renderAttachment(record.serviceFile, "Ordem de Serviço")}
      ${renderAttachment(record.paymentFile, "Comprovante PIX")}
    </div>
  `;
  $("#printDetailBtn").addEventListener("click", () => window.print());
  $("#editClientCpf").addEventListener("input", () => { $("#editClientCpf").value = maskCpf($("#editClientCpf").value); });
  $("#editClientPhone").addEventListener("input", () => { $("#editClientPhone").value = maskPhone($("#editClientPhone").value); });
  $("#editServiceValue").addEventListener("input", () => {
    maskCurrencyInput($("#editServiceValue"));
    const recalculatedFee = calculateFee(parseCurrency($("#editServiceValue").value));
    $("#editFee").value = formatCurrency(recalculatedFee);
    $("#editTotal").value = formatCurrency(recalculatedFee);
  });
  $("#editFee").addEventListener("input", () => { maskCurrencyInput($("#editFee")); });
  $("#editTotal").addEventListener("input", () => { maskCurrencyInput($("#editTotal")); });
  $("#detailEditForm").addEventListener("submit", saveDetailEdits);
  refreshIcons();
}

async function saveDetailEdits(event) {
  event.preventDefault();
  if (!activeDetailRecord) return;
  const serviceValue = parseCurrency($("#editServiceValue").value);
  const fee = parseCurrency($("#editFee").value);
  const total = parseCurrency($("#editTotal").value);
  const serviceFileInput = $("#editServiceFile").files[0];
  const paymentFileInput = $("#editPaymentFile").files[0];

  if (serviceFileInput) {
    const error = validateFile(serviceFileInput);
    if (error) {
      alert(`Ordem de Serviço: ${error}`);
      return;
    }
  }

  if (paymentFileInput) {
    const error = validateFile(paymentFileInput);
    if (error) {
      alert(`Comprovante PIX: ${error}`);
      return;
    }
  }

  const updated = {
    ...activeDetailRecord,
    createdAt: new Date($("#editCreatedAt").value).toISOString(),
    protocol: $("#editProtocol").value.trim(),
    clientName: $("#editClientName").value.trim(),
    clientCpf: $("#editClientCpf").value.trim(),
    clientPhone: $("#editClientPhone").value.trim(),
    clientEmail: $("#editClientEmail").value.trim(),
    shopName: $("#editShopName").value.trim(),
    serviceValue,
    fee,
    total,
    status: $("#editStatus").value
  };

  if (serviceFileInput) updated.serviceFile = await fileToData(serviceFileInput);
  if (paymentFileInput) updated.paymentFile = await fileToData(paymentFileInput);

  await saveRequest(updated);
  await refreshAdmin();
  renderDetail(updated);
}

async function openDetail(id) {
  const record = await getRequest(id);
  if (!record) return;
  renderDetail(record);
  els.detailModal.showModal();
}

function exportExcel() {
  const term = els.adminSearch.value.trim();
  const rows = currentRequests.filter((record) => recordMatchesSearch(record, term));
  const header = ["Data", "Protocolo", "Nome do cliente", "CPF", "Telefone", "E-mail", "Oficina", "Valor da OS", "Taxa calculada", "Status"];
  const body = rows.map((record) => [
    formatDate(record.createdAt),
    record.protocol,
    record.clientName,
    record.clientCpf,
    record.clientPhone,
    record.clientEmail,
    record.shopName,
    formatCurrency(record.serviceValue),
    formatCurrency(record.fee),
    record.status
  ]);

  const table = [header, ...body]
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table>${table}</table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `solicitacoes-nex-seguros-${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

async function handleUserForm(event) {
  event.preventDefault();
  const users = loadUsers();
  const user = {
    name: $("#newUserName").value.trim(),
    email: $("#newUserEmail").value.trim(),
    password: $("#newUserPassword").value
  };
  if (!user.name || !user.email || !user.password) return;
  if (users.some((item) => item.email.toLowerCase() === user.email.toLowerCase())) {
    alert("Este e-mail já está autorizado.");
    return;
  }
  users.push(user);
  saveUsers(users);
  event.target.reset();
  renderUsers();
}

function removeUser(email) {
  const users = loadUsers().filter((user) => user.email !== email || user.locked);
  saveUsers(users);
  renderUsers();
}

async function handleSettings(event) {
  event.preventDefault();
  const settings = loadSettings();
  settings.title = $("#settingTitle").value.trim() || DEFAULT_SETTINGS.title;
  settings.subtitle = $("#settingSubtitle").value.trim() || DEFAULT_SETTINGS.subtitle;
  settings.pixKey = $("#settingPixKey").value.trim() || DEFAULT_SETTINGS.pixKey;
  settings.whatsapp = $("#settingWhatsapp").value.trim() || DEFAULT_SETTINGS.whatsapp;
  settings.primary = $("#settingPrimary").value || DEFAULT_SETTINGS.primary;
  settings.accent = $("#settingAccent").value || DEFAULT_SETTINGS.accent;

  const logoFile = $("#settingLogo").files[0];
  if (logoFile) {
    const error = validateFile(logoFile);
    if (error || logoFile.type === "application/pdf") {
      alert("A logo deve ser JPG, JPEG ou PNG com até 10 MB.");
      return;
    }
    settings.logoData = (await fileToData(logoFile)).dataUrl;
  }

  saveSettings(settings);
  applySettings();
  alert("Layout e dados de pagamento atualizados.");
}

function switchTab(tabName) {
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
  $("#requestsTab").classList.toggle("hidden", tabName !== "requests");
  $("#usersTab").classList.toggle("hidden", tabName !== "users");
  $("#settingsTab").classList.toggle("hidden", tabName !== "settings");
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function bindEvents() {
  els.clientCpf.addEventListener("input", () => { els.clientCpf.value = maskCpf(els.clientCpf.value); });
  els.clientPhone.addEventListener("input", () => { els.clientPhone.value = maskPhone(els.clientPhone.value); });
  els.serviceValue.addEventListener("input", () => {
    maskCurrencyInput(els.serviceValue);
    updateCalculation();
  });

  els.serviceFile.addEventListener("change", () => {
    const file = els.serviceFile.files[0];
    els.serviceFileName.textContent = file ? file.name : "Nenhum arquivo selecionado";
  });
  els.paymentFile.addEventListener("change", () => {
    const file = els.paymentFile.files[0];
    els.paymentFileName.textContent = file ? file.name : "Nenhum arquivo selecionado";
  });

  els.copyPixBtn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(loadSettings().pixKey);
    els.copyPixBtn.textContent = "Chave copiada";
    setTimeout(() => {
      els.copyPixBtn.innerHTML = '<span data-lucide="copy"></span>Copiar chave PIX';
      refreshIcons();
    }, 1600);
  });

  els.serviceForm.addEventListener("submit", handleSubmit);

  els.openAdminBtn.addEventListener("click", async () => {
    const savedSession = localStorage.getItem("nexAdminSession");
    const users = loadUsers();
    adminSession = users.some((user) => user.email === savedSession) ? savedSession : null;
    setAdminVisible(Boolean(adminSession));
    if (adminSession) await refreshAdmin();
    els.adminModal.showModal();
  });

  $("[data-close-modal]").addEventListener("click", () => els.adminModal.close());
  $("[data-close-detail]").addEventListener("click", () => els.detailModal.close());
  els.loginBtn.addEventListener("click", handleLogin);
  els.logoutBtn.addEventListener("click", handleLogout);
  els.adminSearch.addEventListener("input", renderRequests);
  els.exportBtn.addEventListener("click", exportExcel);
  els.userForm.addEventListener("submit", handleUserForm);
  els.settingsForm.addEventListener("submit", handleSettings);

  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view-id]");
    if (viewButton) openDetail(viewButton.dataset.viewId);

    const removeButton = event.target.closest("[data-remove-user]");
    if (removeButton && !removeButton.disabled) removeUser(removeButton.dataset.removeUser);

    const tab = event.target.closest("[data-tab]");
    if (tab) switchTab(tab.dataset.tab);
  });

  document.addEventListener("change", (event) => {
    const select = event.target.closest("[data-status-id]");
    if (select) updateStatus(select.dataset.statusId, select.value);
  });
}

function initializeStorageDefaults() {
  if (!localStorage.getItem("nexAdminUsers")) saveUsers(DEFAULT_USERS);
  if (!localStorage.getItem("nexSettings")) saveSettings(DEFAULT_SETTINGS);
}

document.addEventListener("DOMContentLoaded", () => {
  initializeStorageDefaults();
  bindEvents();
  applySettings();
  refreshIcons();
});
