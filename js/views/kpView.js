import {
  createEmptyKpModel,
  recalcKpModel,
  formatMoney,
} from "../utils/kpCalc.js";
import { getKpAvatarSize, getKpDefaults } from "../config/kpConfig.js";
import { openPopover, closePopover } from "../ui/popoverEngine.js";

export function createKpView({ services, router }) {
  const {
    crmService,
    authService,
    kpCatalogService,
    kpService,
    kpEquipmentService,
    kpN8nService,
    userProfileService,
  } = services;
  const el = document.createElement("div");
  el.className = "kp-view";

  // State
  let state = {
    loading: false,
    mode: "list", // "list" | "edit"
    deals: [],
    error: null,
    currentDeal: null,
    model: null, // The KP data model
    dealsQuery: "",
    // Equipment lazy load state
    equipmentCache: [], // full list
    equipmentFilter: "", // for search
    // Avatar loading state - only attempt once per session
    avatarLoadAttempted: false,
    avatarUrl: null,
    // Prevent duplicate listeners
    editorListenersAttached: false,
    // Prevent double-save
    isSaving: false,
    highResAvatar: null,
  };

  // Preload all catalogs in background (non-blocking)
  async function preloadCatalogs() {
    // Fire and forget - load all catalogs
    try {
      await Promise.all([
        kpCatalogService.loadServicesCatalog(),
        kpCatalogService.loadLicensesCatalog(),
        kpEquipmentService.loadEquipmentRegister(),
        kpCatalogService.loadMaintenanceCatalog(),
        kpCatalogService.loadTrainingsCatalog(),
        kpEquipmentService.loadConsumablesFromEquipment(),
      ]);
      console.log("[KP] Catalogs preloaded");
    } catch (e) {
      console.warn("Failed to preload catalogs", e);
    }
  }

  function truncateWords(text, limit = 12) {
    if (!text) return "";
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length <= limit) return text;
    return words.slice(0, limit).join(" ") + "...";
  }

  // --- Render Logic ---

  function render() {
    el.innerHTML = "";

    const container = document.createElement("div");
    container.className = "kp-container kp-root";
    // We'll use a <style> block for responsive overrides
    const styleId = "kp-view-styles";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        .kp-container { padding: 20px; max-width: 1200px; margin: 0 auto; box-sizing: border-box; }
        .kp-editor-meta-grid { display: flex; gap: 20px; margin-top: 10px; }
        
        @media (max-width: 640px) {
          .kp-container { padding: 12px 8px !important; }
          .kp-editor-meta-grid { flex-direction: column; gap: 10px !important; }
          .kp-actions { flex-direction: column; }
          .kp-actions button { width: 100%; }
          .kp-section h3 { font-size: 1.1em; }
          .kp-total-block { font-size: 1.2em !important; }
        }
      `;
      document.head.appendChild(style);
    }

    // Header
    const header = document.createElement("header");
    header.style.cssText =
      "margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;";
    header.innerHTML = `<h1>Коммерческие предложения</h1>`;

    // Back button (if in edit mode)
    if (state.mode === "edit") {
      const backBtn = document.createElement("button");
      backBtn.className = "btn";
      backBtn.textContent = "← Назад к списку";
      backBtn.onclick = () => switchMode("list");
      header.prepend(backBtn);
    }

    if (state.loading) {
      const loader = document.createElement("span");
      loader.className = "loader";
      loader.style.cssText = "font-size: 0.8em; color: var(--text-muted); margin-left: auto;";
      loader.textContent = "Загрузка...";
      header.appendChild(loader);
    }

    container.appendChild(header);

    if (state.error) {
      const errBanner = document.createElement("div");
      errBanner.className = "error-banner";
      errBanner.style.cssText =
        "color: red; padding: 10px; border: 1px solid red; margin-bottom: 10px;";
      errBanner.textContent = state.error;
      container.appendChild(errBanner);
    }

    if (state.mode === "list") {
      container.appendChild(renderDealsListRaw());
    } else if (state.mode === "edit") {
      container.appendChild(renderEditorRaw());
    }

    el.appendChild(container);

    // Attach Listeners
    if (state.mode === "list") {
      el.querySelectorAll(".kp-deal-item").forEach((item) => {
        item.addEventListener("click", () => handleDealSelect(item.dataset.id));
      });
      const searchInput = el.querySelector(".kp-deals-search");
      if (searchInput) {
        let dealsDebounceId = null;
        searchInput.addEventListener("input", (event) => {
          state.dealsQuery = event.target.value;
          if (dealsDebounceId) clearTimeout(dealsDebounceId);
          dealsDebounceId = setTimeout(() => {
            render();
          }, 200);
        });
        // Restore focus
        if (state.dealsQuery) {
          searchInput.focus();
          searchInput.setSelectionRange(
            state.dealsQuery.length,
            state.dealsQuery.length,
          );
        }
      }
    }

    if (state.mode === "edit") {
      // Attach listeners only once per editor session
      if (!state.editorListenersAttached) {
        attachEditorListeners(el);
        state.editorListenersAttached = true;
      }
      // Trigger lazy loads for photos if any equipment/consumable rows exist
      if (state.model && state.model.sections) {
        ["equipment", "consumables"].forEach(sectionKey => {
            const section = state.model.sections[sectionKey];
            if (section && section.items) {
                section.items.forEach(async (item) => {
                    if (item.photo && item.photo.attachmentId) {
                        const imgEl = el.querySelector(
                            `.kp-img-preview[data-att-id="${item.photo.attachmentId}"]`,
                        );
                        if (imgEl && !imgEl.src.startsWith("data:")) {
                            const res = await kpN8nService.fetchPyrusAttachmentBase64(
                                item.photo.attachmentId,
                            );
                            if (res.ok) {
                                // Determine mime
                                const ext = (item.photo.name || "")
                                    .split(".")
                                    .pop()
                                    .toLowerCase();
                                const mime =
                                    ext === "jpg" || ext === "jpeg"
                                        ? "image/jpeg"
                                        : ext === "webp"
                                            ? "image/webp"
                                            : "image/png";
                                imgEl.src = `data:${mime};base64,${res.data}`;
                            }
                        }
                    }
                });
            }
        });
      }
    }
  }

  function renderDealsListRaw() {
    const listDiv = document.createElement("div");
    listDiv.className = "kp-deals-list";
    const query = state.dealsQuery.trim().toLowerCase();
    const deals = query
      ? state.deals.filter((deal) => {
          const title = String(deal.subject || "");
          const client = String(deal.clientName || "");
          const dealId = String(deal.id || "");
          const haystack = `${title} ${client} ${dealId}`.toLowerCase();
          return haystack.includes(query);
        })
      : state.deals;
    if (!state.deals.length && !state.loading) {
      listDiv.innerHTML = "<p>Нет active сделок для вашего пользователя.</p>";
      return listDiv;
    }
    listDiv.innerHTML = `
      <div style="margin-bottom: 12px;">
        <input type="text" class="kp-deals-search" placeholder="Поиск сделки..." value="${state.dealsQuery}">
      </div>
      <ul style="list-style: none; padding: 0;">
        ${deals
          .map(
            (deal) => `
          <li class="kp-deal-item" data-id="${deal.id}" style="border: 1px solid var(--table-border-strong, #ddd); padding: 15px; margin-bottom: 10px; border-radius: 8px; cursor: pointer; background: var(--bg-card, #fff);">
            <div style="display: flex; justify-content: space-between;">
              <strong style="font-size: 1.1em;">${deal.subject || "(без темы)"}</strong>
              ${deal.hasKp ? '<span style="color: #28a745;">✏️ Редактировать КП</span>' : '<span style="color: var(--text-muted);">📝 Создать КП</span>'}
            </div>
            <div style="font-size: 0.9em; color: var(--text-muted); margin-top: 5px;">
              ${(!deal.clientName || deal.clientName === "Клиент (не указан)") ? (deal.subject || deal.clientName) : deal.clientName} | Создано: ${new Date(deal.createDate).toLocaleDateString()}
              ${deal.kpTotal ? ` | Сумма: <b>${deal.kpTotal}</b>` : ""}
              ${deal.kpFilename ? `<br><small>Файл: ${deal.kpFilename}</small>` : ""}
            </div>
          </li>
        `,
          )
          .join("")}
      </ul>
    `;
    return listDiv;
  }

  function renderEditorRaw() {
    if (!state.model) return document.createElement("div");
    const mk = document.createElement("div");
    mk.className = "kp-editor kp-card";
    const m = state.model;

    mk.innerHTML = `
        <div class="kp-editor-meta" style="margin-bottom: 24px; background: var(--bg-secondary); padding: 16px; border-radius: 12px; border: 1px solid var(--border); box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
            <h3 style="margin-top: 0; margin-bottom: 12px;">Проект КП для сделки #${m.meta.crmId}</h3>
            <div class="kp-editor-meta-grid">
                <label style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 0.9em; color: var(--text-muted);">Срок действия (дней):</span>
                    <input type="number" class="kp-input-valid-days" value="${m.meta.validDays}" min="1" max="365" style="width: 60px; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border);">
                </label>
                <div style="font-size: 0.9em; color: var(--text-muted);">Создан: <b style="color: var(--text-main);">${new Date(m.meta.createdAt).toLocaleDateString()}</b></div>
                <div style="font-size: 0.9em; color: var(--text-muted);">Менеджер: <b style="color: var(--text-main);">${m.meta.manager.name}</b></div>
            </div>
        </div>
        
        ${renderSectionTable("Услуги", "services", m.sections.services)}
        ${renderSectionTable("Лицензии", "licenses", m.sections.licenses)}
        ${renderSectionTable("Обучение", "trainings", m.sections.trainings)}
        ${renderSectionTable("Расходные материалы", "consumables", m.sections.consumables)}
        ${renderEquipmentTable(m.sections.equipment)}
        ${renderMaintenanceBlock(m.sections.maintenance)}
        
         <div class="kp-total-block" style="margin-top: 30px; font-size: 1.5em; text-align: right; font-weight: bold; border-top: 2px solid var(--border-strong); padding-top: 20px;">
            Итого КП: <span class="kp-grand-total">${formatMoney(m.total)}</span>
        </div>
        <div class="kp-actions" style="margin-top: 40px; display: flex; gap: 10px; justify-content: flex-end;">
            <button class="btn btn-save" style="background: #28a745; color: white; padding: 10px 20px;">💾 Сохранить и отправить</button>
            <button class="btn btn-save-new" style="background: #17a2b8; color: white; padding: 10px 20px;">💾 Сохранить (NEW)</button>
        </div>
    `;
    return mk;
  }

  function renderSectionTable(title, key, sectionData) {
    if (key === "equipment") return ""; // Handled separately
    const isLicense = key === "licenses";
    const isServices = key === "services";

    return `
        <div class="kp-section" data-key="${key}" style="margin-bottom: 30px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3>${title}</h3>
            </div>
            <div class="kp-table-scroll-wrapper" style="width: 100%; overflow-x: auto; margin-bottom: 10px; border: 1px solid var(--border); border-radius: 8px;">
                <table class="kp-table" style="width: 100%; border-collapse: collapse; min-width: 600px;">
                    <thead>
                        <tr style="background: var(--table-header-bg, #f0f0f0); text-align: left; color: var(--text-main);">
                            ${key === "consumables" ? '<th style="padding: 10px; border-bottom: 2px solid var(--border-strong); width: 60px;">Фото</th>' : ""}
                            <th style="padding: 10px; border-bottom: 2px solid var(--border-strong);">Наименование</th>
                            <th style="padding: 10px; border-bottom: 2px solid var(--border-strong);">Описание</th>
                            <th style="padding: 10px; border-bottom: 2px solid var(--border-strong); width: 80px;">Кол-во</th>
                            <th style="padding: 10px; border-bottom: 2px solid var(--border-strong); width: 100px;">Цена</th>
                            <th style="padding: 10px; border-bottom: 2px solid var(--border-strong); width: 80px;">Скидка</th>
                            <th style="padding: 10px; border-bottom: 2px solid var(--border-strong); width: 110px;">Сумма</th>
                            <th style="padding: 10px; border-bottom: 2px solid var(--border-strong); width: 40px;"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sectionData.items
                          .map(
                            (item, idx) => {
                              const hasPhoto = item.photo && item.photo.attachmentId;
                              let src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
                              if (item.photo?.base64Data) {
                                src = `data:image/jpeg;base64,${item.photo.base64Data}`;
                              }
                              
                              return `
                            <tr style="border-bottom: 1px solid var(--border);">
                                ${key === "consumables" ? `
                                  <td style="padding: 10px;">
                                    ${hasPhoto ? `<img src="${src}" class="kp-img-preview" data-att-id="${item.photo.attachmentId}" style="width: 40px; height: 40px; object-fit: contain;">` : ""}
                                  </td>
                                ` : ""}
                                <td style="padding: 10px;">
                                     <div class="kp-item-title" style="font-weight: 600;">${item.name}</div>
                                </td>
                                <td style="padding: 10px; font-size:0.85em; color: var(--text-muted, gray);">
                                    ${truncateWords(item.description)}
                                </td>
                                <td style="padding: 10px;">
                                    <input type="number" class="kp-row-qty" data-section="${key}" data-idx="${idx}" value="${item.qty}" min="1" style="width: 100%; padding: 4px;">
                                </td>
                                <td style="padding: 10px;">
                                    <input type="number" class="kp-row-price" data-section="${key}" data-idx="${idx}" value="${item.price}" min="0" style="width: 100%; padding: 4px; ${key === 'consumables' ? '' : 'background: var(--bg-alt); border: 1px solid var(--border); color: var(--text-muted); cursor: not-allowed;'}" ${key === 'consumables' ? '' : 'readonly'}>
                                </td>
                                <td style="padding: 10px;">
                                    ${(() => {
                                      if (isServices) {
                                        const mode = item.discountMode || "auto";
                                        if (mode === "auto") {
                                          return `<div style="text-align: center; color: var(--accent, #c80000); font-weight: 700; font-size: 0.9em;">${item.discountPercent || 0}%<br><span style="font-size: 0.7em; opacity: 0.7;">(Авто)</span></div>`;
                                        } else if (mode === "fixed") {
                                          return `<div style="text-align: center; color: var(--text-muted); font-weight: 700; font-size: 0.9em;">0%<br><span style="font-size: 0.7em; opacity: 0.7;">(Фикс)</span></div>`;
                                        } else {
                                          return `<input type="number" class="kp-row-discount" data-section="${key}" data-idx="${idx}" value="${item.discountPercent || 0}" min="0" max="100" style="width: 100%; padding: 4px;">`;
                                        }
                                      } else {
                                        return `<input type="number" class="kp-row-discount" data-section="${key}" data-idx="${idx}" value="${item.discountPercent || 0}" min="0" max="100" style="width: 100%; padding: 4px;">`;
                                      }
                                    })()}
                                </td>
                                <td style="padding: 10px; font-weight: 500;">
                                    ${formatMoney(item.total)}
                                </td>
                                <td style="padding: 10px; text-align: center;">
                                    <button class="btn-icon kp-btn-del" data-section="${key}" data-idx="${idx}" title="Удалить">✕</button>
                                </td>
                            </tr>
                         `;
                        })
                        .join("")}
                    </tbody>
                </table>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
               <button class="btn btn-sm kp-btn-add" data-section="${key}">+ Добавить (из справочника)</button> 
               <div style="text-align: right;">
                 <div style="font-weight: 800; font-size: 1.1em; text-transform: uppercase;">ИТОГО:</div>
                 ${(() => {
                   const total = sectionData.total || 0;
                   const subtotal = sectionData.subtotal || 0;
                   if (subtotal > total) {
                     return `
                       <div style="color: var(--accent, #c80000); font-weight: 900; font-size: 1.3em; line-height: 1;">${formatMoney(total)}</div>
                       <div style="text-decoration: line-through; color: var(--text-muted); font-size: 0.9em; opacity: 0.7;">${formatMoney(subtotal)}</div>
                     `;
                   } else {
                     return `<div style="font-weight: 900; font-size: 1.3em;">${formatMoney(total)}</div>`;
                   }
                 })()}
               </div>
           </div>
        </div>
      `;
  }

  function renderEquipmentTable(sectionData) {
    const key = "equipment";
    return `
        <div class="kp-section" data-key="${key}" style="margin-bottom: 30px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3>Оборудование</h3>
            </div>
            <div class="kp-table-scroll-wrapper" style="width: 100%; overflow-x: auto; margin-bottom: 10px; border: 1px solid var(--border); border-radius: 8px;">
                <table class="kp-table" style="width: 100%; border-collapse: collapse; min-width: 600px;">
                    <thead>
                        <tr style="background: var(--bg-secondary, #f0f0f0); text-align: left;">
                            <th style="padding:10px;">Фото</th>
                            <th style="padding:10px;">Наименование</th>
                            <th style="padding:10px;">Тип</th>
                            <th style="padding:10px; width: 80px;">Кол-во</th>
                            <th style="padding:10px; width: 100px;">Цена</th>
                            <th style="padding:10px; width: 80px;">Скидка</th>
                            <th style="padding:10px; width: 110px;">Сумма</th>
                             <th style="padding: 10px;"></th>
                        </tr>
                    </thead>
                    <tbody>
                         ${sectionData.items
                           .map((item, idx) => {
                             const hasPhoto = item.photo && item.photo.attachmentId;
                             let src =
                               "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
                             if (item.photo?.base64Data) {
                               src = `data:image/jpeg;base64,${item.photo.base64Data}`;
                             }
    
                             return `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 10px;">
                                  ${hasPhoto ? `<img src="${src}" class="kp-img-preview" data-att-id="${item.photo.attachmentId}" style="width: 40px; height: 40px; object-fit: contain;">` : ""}
                                </td>
                                <td style="padding: 10px;">
                                    <div class="kp-item-title">${item.name}</div>
                                    <div style="font-size:0.8em; color:gray">${truncateWords(item.description)}</div>
                                </td>
                                <td style="padding: 10px; font-size: 0.9em;">
                                    ${item.typeName || "-"}
                                </td>
                                 <td style="padding: 10px;">
                                    <input type="number" class="kp-row-qty" data-section="${key}" data-idx="${idx}" value="${item.qty}" min="1" style="width: 100%;">
                                </td>
                                <td style="padding: 10px;">
                                    <input type="number" class="kp-row-price" data-section="${key}" data-idx="${idx}" value="${item.price}" min="0" style="width: 100%; background: #f9f9f9; border: 1px solid #ddd; color: #666; cursor: not-allowed;" readonly>
                                </td>
                                <td style="padding: 10px;">
                                    <input type="number" class="kp-row-discount" data-section="${key}" data-idx="${idx}" value="${item.discountPercent || 0}" min="0" max="100" style="width: 100%; padding: 4px;">
                                </td>
                                 <td style="padding: 10px; font-weight: 500;">
                                    ${formatMoney(item.total)}
                                </td>
                                <td style="padding: 10px; text-align: center;">
                                    <button class="btn-icon kp-btn-del" data-section="${key}" data-idx="${idx}" title="Удалить">✕</button>
                                </td>
                            </tr>
                             `;
                           })
                           .join("")}
                    </tbody>
                </table>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
               <button class="btn btn-sm kp-btn-add" data-section="${key}">+ Добавить (из справочника)</button> 
               <div style="text-align: right;">
                 <div style="font-weight: 800; font-size: 1.1em; text-transform: uppercase;">ИТОГО:</div>
                 ${(() => {
                   const total = sectionData.total || 0;
                   const subtotal = sectionData.subtotal || 0;
                   if (subtotal > total) {
                     return `
                       <div style="color: var(--accent, #c80000); font-weight: 900; font-size: 1.3em; line-height: 1;">${formatMoney(total)}</div>
                       <div style="text-decoration: line-through; color: var(--text-muted); font-size: 0.9em; opacity: 0.7;">${formatMoney(subtotal)}</div>
                     `;
                   } else {
                     return `<div style="font-weight: 900; font-size: 1.3em;">${formatMoney(total)}</div>`;
                   }
                 })()}
               </div>
           </div>
        </div>
     `;
  }

  function renderMaintenanceBlock(maintData) {
    return `
        <div class="kp-section-maintenance" style="margin-bottom: 30px; background: var(--bg-secondary); padding: 15px; border-radius: 8px; border: 1px solid var(--border);">
            <h3 style="margin-top: 0;">Техническое обслуживание (iiko)</h3>
             <div style="display: flex; gap: 30px; align-items: center; margin-bottom: 15px; flex-wrap: wrap;">
                 <label>Количество терминалов (фронтов):
                    <input type="number" class="kp-input-terminals" value="${maintData.terminals}" min="0" style="width: 80px;">
                 </label>
                 <label>Кол-во мес:
                    <input type="number" class="kp-input-maint-months" value="${maintData.months || getKpDefaults().maintenanceMonths}" min="1" max="12" style="width: 60px;">
                 </label>
                 <div>Цена за терминал: 
                    <input type="number" class="kp-input-maint-price" value="${maintData.unitPrice || 0}" style="width: 80px; background: var(--bg-alt); border: 1px solid var(--border); color: var(--text-muted); cursor: not-allowed;" readonly>
                 </div>
            </div>
            
            <div style="display: flex; justify-content: flex-end; border-top: 1px solid var(--border-light); padding-top: 15px;">
                 <div style="text-align: right; line-height: 1.4;">
                    <div style="font-weight: 800; font-size: 1.1em; text-transform: uppercase;">ИТОГО за ${maintData.months} мес:</div>
                    ${(() => {
                      const total = maintData.total || 0;
                      const subtotal = maintData.subtotal || 0;
                      if (subtotal > total) {
                        return `
                          <div style="color: var(--accent, #c80000); font-weight: 900; font-size: 1.3em; line-height: 1;">${formatMoney(total)}</div>
                          <div style="text-decoration: line-through; color: var(--text-muted); font-size: 0.9em; opacity: 0.7;">${formatMoney(subtotal)}</div>
                        `;
                      } else {
                        return `<div style="font-weight: 900; font-size: 1.3em;">${formatMoney(total)}</div>`;
                      }
                    })()}
                    <div style="font-size: 0.9em; color: var(--text-muted); margin-top: 5px;">Далее: ${formatMoney(maintData.unitPrice * maintData.terminals)}/мес</div>
                 </div>
            </div>
            
            <small style="color: var(--text-muted); margin-top: 10px; display: block;">Цена подбирается автоматически по количеству терминалов согласно каталогу.</small>
        </div>
      `;
  }

  // --- Interactions ---

  async function handleDealSelect(dealId) {
    const deal = state.deals.find((d) => String(d.id) === String(dealId));
    if (!deal) return;
    state.currentDeal = deal;

    const session = authService.getSession();
    const profile = userProfileService?.getCachedProfile?.();
    const manager = {
      id: session?.memberId || profile?.id || 0,
      fullName: profile?.fullName || session?.user?.name || "Менеджер",
      position: profile?.position || "",
      phone: profile?.phoneWork || profile?.phoneMobile || "",
      email: profile?.email || "",
      tg: profile?.messenger_id || profile?.skype || "",
      avatar: profile?.avatarUrl || session?.user?.avatarUrl,
    };

    try {
      if (deal.kpFilename) {
        // Load existing KP
        state.loading = true;
        render();

        try {
          const loadedModel = await services.kpService.loadKpFromFile(
            deal.kpFilename,
          );
          state.model = recalcKpModel(loadedModel);
          if (state.model.meta.crmId !== deal.id) {
            console.warn("CRM ID mismatch in loaded file");
          }
        } catch (e) {
          console.error("Failed to load KP file", e);
          alert("Не удалось загрузить файл КП. Открываю пустой шаблон.");
          state.model = createEmptyKpModel({ crmId: deal.id, manager });
        } finally {
          state.loading = false;
        }
      } else {
        state.model = createEmptyKpModel({ crmId: deal.id, manager });
      }

      // Always ensure client info is synced from CRM deal to the draft model
      // (Useful for new KP and for refreshing loaded KP if CRM data updated)
      if (state.model && state.model.meta) {
        const rawClientName = (deal.clientName || "").trim();
        const placeholder = "Клиент (не указан)";
        const isPlaceholder = !rawClientName || rawClientName === placeholder;
        const finalClientName = isPlaceholder ? (deal.subject || placeholder) : rawClientName;

        state.model.meta.client = {
          name: finalClientName,
          juridicalName: deal.clientJuridicalName || (isPlaceholder ? "" : rawClientName) || finalClientName,
          inn: deal.clientInn || "",
        };
      }

      state.model = recalcKpModel(state.model);

      // Preload catalogs in background for faster popover opening
      preloadCatalogs();

      switchMode("edit");
    } catch (e) {
      console.error(e);
      state.error = "Ошибка при открытии сделки";
      render();
    }
  }

  function switchMode(newMode) {
    state.mode = newMode;
    // Reset editor listeners flag when leaving edit mode
    if (newMode === "list") {
      state.editorListenersAttached = false;
    }
    if (newMode === "edit") {
      lazyLoadPhotos();
    }
    render();
  }

  async function lazyLoadPhotos() {
    if (!state.model) return;
    const sectionsToLoad = ["equipment", "consumables"];
    
    for (const key of sectionsToLoad) {
      const items = state.model.sections[key]?.items || [];
      const toLoad = items.filter(
        (i) => i.photo?.attachmentId && !i.photo?.base64Data,
      );
      if (!toLoad.length) continue;

      // Load sequentially or with small limit to avoid flooding
      for (const item of toLoad) {
        try {
          const res = await kpN8nService.fetchPyrusAttachmentBase64(
            item.photo.attachmentId,
          );
          if (res.ok && res.data) {
            item.photo.base64Data = res.data;
            // Re-render single row or entire table if needed. For now simple render()
            render();
          }
        } catch (e) {
          console.warn(`[KP] Lazy photo load failed for ${item.name}`, e);
        }
      }
    }
  }

  function attachEditorListeners(root) {
    root.addEventListener("change", (e) => {
      const t = e.target;
      if (
        t.classList.contains("kp-row-qty") ||
        t.classList.contains("kp-row-price") ||
        t.classList.contains("kp-row-discount")
      ) {
        updateRow(t.dataset.section, t.dataset.idx, t.classList, t.value);
      }
      if (t.classList.contains("kp-input-discount")) {
        updateSectionDiscount(t.dataset.section, t.value);
      }
      if (t.classList.contains("kp-input-valid-days")) {
        updateMeta("validDays", t.value);
      }
      if (t.classList.contains("kp-input-terminals")) {
        updateMaintenance(t.value);
      }
      if (t.classList.contains("kp-input-maint-price")) {
        state.model.sections.maintenance.unitPrice = Number(t.value);
        doRecalc();
      }
      if (t.classList.contains("kp-input-maint-months")) {
        state.model.sections.maintenance.months = Number(t.value);
        doRecalc();
      }
    });

    root.addEventListener("click", (e) => {
      const t = e.target;
      if (t.classList.contains("kp-btn-del"))
        deleteRow(t.dataset.section, t.dataset.idx);
      if (t.classList.contains("kp-btn-add"))
        openCatalogSelector(t.dataset.section, t);
      if (t.classList.contains("btn-save")) saveCurrentKp('original');
      if (t.classList.contains("btn-save-new")) saveCurrentKp('new');
    });
  }

  // --- Helpers ---

  function updateRow(sectionKey, idx, classList, value) {
    const item = state.model.sections[sectionKey].items[idx];
    if (!item) return;
    if (classList.contains("kp-row-qty")) item.qty = Number(value);
    if (classList.contains("kp-row-price")) item.price = Number(value);
    if (classList.contains("kp-row-discount"))
      item.discountPercent = Number(value);
    doRecalc();
  }

  function deleteRow(sectionKey, idx) {
    state.model.sections[sectionKey].items.splice(idx, 1);
    doRecalc();
  }

  function updateSectionDiscount(key, val) {
    state.model.sections[key].discountPercent = Number(val);
    doRecalc();
  }
  function updateMeta(f, v) {
    state.model.meta[f] = v;
  }

  async function updateMaintenance(terminalsCount) {
    const count = Number(terminalsCount);
    state.model.sections.maintenance.terminals = count;
    try {
      const items = await kpCatalogService.loadMaintenanceCatalog();
      const priceInfo = kpCatalogService.getMaintenancePriceForTerminals(
        items,
        count,
      );
      state.model.sections.maintenance.unitPrice = priceInfo.unitPrice;
      state.model.sections.maintenance.basePrice = priceInfo.baseUnitPrice;
    } catch (e) {
      console.warn(e);
    }
    doRecalc();
  }

  function doRecalc() {
    state.model = recalcKpModel(state.model);
    render();
  }

  function showLoadingOverlay(text = "Загрузка...") {
    let overlay = document.getElementById("global-loading-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "global-loading-overlay";
      overlay.className = "global-loading-overlay";
      overlay.innerHTML = `
              <div class="loading-spinner"></div>
              <div class="loading-text"></div>
          `;
      document.body.appendChild(overlay);
    }
    overlay.querySelector(".loading-text").textContent = text;
    overlay.classList.add("visible");
  }

  function hideLoadingOverlay() {
    document
      .getElementById("global-loading-overlay")
      ?.classList.remove("visible");
  }

  async function saveCurrentKp(format = 'original') {
    if (!state.model || !state.currentDeal) return;

    // Prevent double-save
    if (state.isSaving) {
      console.log("[KP] Save already in progress, ignoring");
      return;
    }
    state.isSaving = true;

    const btn = el.querySelector(".btn-save");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Генерация КП...";
    }

    try {
      // 1. Recalculate model
      doRecalc();

      // 2. Load high-resolution manager avatar for the final KP
      if (btn) btn.textContent = "Загрузка аватара (HD)...";
      const profile = userProfileService?.getCachedProfile?.();

      if (
        !state.highResAvatar &&
        profile?.avatar_id &&
        userProfileService?.loadAvatar
      ) {
        try {
          // Use loadAvatar but force it to bypass cache if it was small (e.g. from session)
          const base64Avatar = await userProfileService.loadAvatar({
            avatarId: profile.avatar_id,
            size: 200, // Explicitly requesting larger size
            force: true,
          });
          if (base64Avatar) {
            state.highResAvatar = base64Avatar;
          }
        } catch (e) {
          console.warn("[KP] High-res avatar load failed, using current", e);
        }
      }

      if (state.highResAvatar) {
        state.model.meta.manager.avatar = state.highResAvatar;
      }

      // 2.5 Load all equipment and consumables photos as base64 for embedding
      if (btn) btn.textContent = "Загрузка фото оборудования...";
      const eqItems = state.model.sections.equipment.items || [];
      const consItems = state.model.sections.consumables.items || [];
      const photosToLoad = [...eqItems, ...consItems].filter(
        (item) => item.photo?.attachmentId && !item.photo?.base64Data,
      );

      if (photosToLoad.length > 0) {
        // Load with small concurrency limit (e.g. 3)
        const limit = 3;
        for (let i = 0; i < photosToLoad.length; i += limit) {
          const chunk = photosToLoad.slice(i, i + limit);
          await Promise.all(
            chunk.map(async (item) => {
              try {
                const res = await kpN8nService.fetchPyrusAttachmentBase64(
                  item.photo.attachmentId,
                );
                if (res.ok && res.data) {
                  item.photo.base64Data = res.data;
                }
              } catch (err) {
                console.warn(`[KP] Failed to load photo for ${item.name}`, err);
              }
            }),
          );
        }
      }

      // 3. Save KP and update CRM task
      if (btn) btn.textContent = "Сохранение...";
      showLoadingOverlay("Сохранение КП...");
      const result = await kpService.saveKpForDeal(
        state.currentDeal.id,
        state.model,
        { format }
      );

      // 4. Update local state with returned model (contains new filename/url)
      if (result.model) {
        state.model = result.model;
      }

      // 5. Update current deal to reflect KP saved
      if (state.currentDeal) {
        state.currentDeal.hasKp = true;
        state.currentDeal.kpFilename = state.model.meta.kpFilename;
        state.currentDeal.kpUrl = state.model.meta.kpUrl;
      }

      // 6. Show success
      hideLoadingOverlay();
      if (btn) {
        btn.textContent = "Сохранено ✅";
        if (state.model.meta.kpUrl) {
          showKpLinkPopover(state.model.meta.kpUrl, btn);
        }
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = "💾 Сохранить и отправить";
        }, 3000);
      }

      // 7. Reload deals in background to update list status
      loadDeals();
    } catch (e) {
      hideLoadingOverlay();
      console.error(e);
      alert("Ошибка: " + e.message);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "💾 Сохранить и отправить";
      }
    } finally {
      state.isSaving = false;
    }
  }
  function showKpLinkPopover(url, anchorEl) {
    const popDiv = document.createElement("div");
    popDiv.className = "kp-popover";
    popDiv.style.width = "400px";
    popDiv.style.maxWidth = "calc(100vw - 40px)";
    popDiv.style.padding = "30px";
    popDiv.style.boxShadow = "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)";
    popDiv.style.border = "none";
    popDiv.style.borderRadius = "24px";
    popDiv.style.background = "#ffffff";
    popDiv.style.color = "#1a202c";
    
    popDiv.innerHTML = `
          <div style="font-weight: 800; margin-bottom: 20px; color: #d20000; font-size: 1.5em; display: flex; align-items: center; justify-content: center; gap: 12px;">
             <span style="font-size: 1.2em;">🚀</span> <span>КП готово!</span>
          </div>
          <div style="font-size: 0.95em; color: #4a5568; margin-bottom: 14px; text-align: center; font-weight: 600;">Ссылка для вашего клиента:</div>
          <div style="font-size: 0.9em; margin-bottom: 25px; word-break: break-all; background: #f7fafc; color: #2d3748; padding: 18px; border-radius: 14px; border: 1px solid #e2e8f0; font-family: 'Monaco', 'Consolas', monospace; line-height: 1.5; max-height: 120px; overflow-y: auto; text-align: center; box-shadow: inset 0 2px 4px 0 rgba(0,0,0,0.05);">
            ${url}
          </div>
          <button class="kp-btn-copy-link" style="width: 100%; padding: 16px; background: #d20000; color: white; border: none; border-radius: 14px; font-size: 1.1em; font-weight: 700; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 10px; box-shadow: 0 4px 6px rgba(210, 0, 0, 0.2);">
            <span>📋</span> <span>Копировать и закрыть</span>
          </button>
          <div style="margin-top: 18px; text-align: center;">
             <button class="kp-btn-close-modal" style="background: none; border: none; color: #718096; cursor: pointer; font-size: 0.9em; text-decoration: underline; font-weight: 500;">Закрыть без копирования</button>
          </div>
        `;

    const copyBtn = popDiv.querySelector(".kp-btn-copy-link");
    copyBtn.onclick = () => {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          copyBtn.style.background = "#28a745";
          copyBtn.style.boxShadow = "none";
          copyBtn.innerHTML = "<span>✅</span> <span>Скопировано!</span>";
          setTimeout(() => {
            closePopover();
          }, 800);
        })
        .catch((err) => {
          console.error("Failed to copy", err);
          alert(
            "Не удалось скопировать ссылку. Пожалуйста, скопируйте вручную из поля выше.",
          );
        });
    };

    popDiv.querySelector(".kp-btn-close-modal").onclick = () => {
      closePopover();
    };

    openPopover({
      id: "kp_final_success",
      contentEl: popDiv,
      placement: "center",
      modal: true,
    });
  }

  // --- Catalog Selectors ---

  async function openCatalogSelector(sectionKey, anchorEl) {
    let items = [];
    try {
      if (sectionKey === "services")
        items = await kpCatalogService.loadServicesCatalog();
      else if (sectionKey === "licenses")
        items = await kpCatalogService.loadLicensesCatalog();
      else if (sectionKey === "equipment")
        items = await kpEquipmentService.loadEquipmentRegister();
      else if (sectionKey === "trainings")
      items = await kpCatalogService.loadTrainingsCatalog();
    else if (sectionKey === "consumables")
      items = await kpEquipmentService.loadConsumablesFromEquipment();
  } catch (e) {
      alert("Ошибка загрузки каталога");
      return;
    }
    const popDiv = document.createElement("div");
    popDiv.className = "kp-popover";

    const searchInput = document.createElement("input");
    searchInput.className = "kp-popover__search";
    searchInput.type = "text";
    searchInput.placeholder = "Поиск...";

    const listEl = document.createElement("div");
    listEl.className = "kp-popover__list";

    let popoverId = null;

    const renderList = (list) => {
      listEl.innerHTML = "";
      list.forEach((it) => {
        const itemEl = document.createElement("div");
        itemEl.className = "kp-popover__item";

        const description = it.description
          ? `<div class="kp-popover__meta">${it.description}</div>`
          : "";
        const typeName = it.typeName
          ? `<div class="kp-popover__meta">${it.typeName}</div>`
          : "";
        const price = it.price > 0 ? `${it.price} ₽` : "";

        itemEl.innerHTML = `
                  <div class="kp-popover__row">
                      <div class="kp-popover__name">${it.name}</div>
                      <div class="kp-popover__price">${price}</div>
                  </div>
                  ${description}
                  ${typeName}
              `;
        itemEl.onclick = () => {
          const row = {
            name: it.name,
            qty: 1,
            price: it.price,
            total: it.price,
            description: it.description || "",
            typeName: it.typeName || "",
            photo: it.photo || null,
            discountMode: it.discountMode || "auto",
          };
          state.model.sections[sectionKey].items.push(row);
          doRecalc();
          if (sectionKey === "equipment" || sectionKey === "consumables") {
            lazyLoadPhotos();
          }
          if (popoverId) closePopover(popoverId);
        };
        listEl.appendChild(itemEl);
      });
    };

    const filterList = () => {
      const query = searchInput.value.trim().toLowerCase();
      if (!query) return items;
      return items.filter((it) => {
        const haystack =
          `${it.name || ""} ${it.description || ""} ${it.typeName || ""}`.toLowerCase();
        return haystack.includes(query);
      });
    };

    let debounceId = null;
    searchInput.addEventListener("input", () => {
      if (debounceId) window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        renderList(filterList());
      }, 80);
    });

    popDiv.appendChild(searchInput);
    popDiv.appendChild(listEl);

    renderList(items);

    popoverId = openPopover({
      id: `kp_cat_${sectionKey}`,
      anchorRect: anchorEl.getBoundingClientRect(),
      contentEl: popDiv,
    });

    window.requestAnimationFrame(() => {
      searchInput.focus();
    });
  }

  // --- Lifecycle ---
  async function loadDeals() {
    state.loading = true;
    state.error = null;
    render();
    try {
      const session = authService.getSession();
      const userId = session?.memberId ?? session?.user?.id;
      if (!userId) throw new Error("No user");

      const deals = await crmService.loadDealsForManager({ managerId: userId });
      state.deals = deals;
    } catch (e) {
      if (e.message.includes("CRM not configured"))
        state.error = "CRM не настроена (см. config.json)";
      else state.error = "Ошибка загрузки сделок: " + e.message;
    } finally {
      state.loading = false;
      render();
    }
  }

  function mount() {
    loadDeals();
  }
  function unmount() {}

  return { el, mount, unmount };
}
