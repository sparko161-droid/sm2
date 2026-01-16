import { createEmptyKpModel, recalcKpModel, formatMoney } from "../utils/kpCalc.js";
import { getKpAvatarSize } from "../config.js";
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
    equipmentFilter: "" // for search
  };

  // --- Render Logic ---

  function render() {
    el.innerHTML = "";

    const container = document.createElement("div");
    container.className = "kp-container kp-root";
    container.style.cssText = "padding: 20px; max-width: 1200px; margin: 0 auto;";

    // Header
    const header = document.createElement("header");
    header.style.cssText = "margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;";
    header.innerHTML = `<h1>Коммерческие предложения</h1>`;

    if (state.loading) {
      const loader = document.createElement("span");
      loader.className = "loader";
      loader.textContent = "Загрузка...";
      header.appendChild(loader);
    } else if (state.mode === "edit") {
      const backBtn = document.createElement("button");
      backBtn.className = "btn";
      backBtn.textContent = "← Назад к списку";
      backBtn.onclick = () => switchMode("list");
      header.prepend(backBtn);
    }

    container.appendChild(header);

    if (state.error) {
      const errBanner = document.createElement("div");
      errBanner.className = "error-banner";
      errBanner.style.cssText = "color: red; padding: 10px; border: 1px solid red; margin-bottom: 10px;";
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
      el.querySelectorAll(".kp-deal-item").forEach(item => {
        item.addEventListener("click", () => handleDealSelect(item.dataset.id));
      });
      const searchInput = el.querySelector(".kp-deals-search");
      if (searchInput) {
        searchInput.addEventListener("input", (event) => {
          state.dealsQuery = event.target.value;
          render();
        });
      }
    }

    if (state.mode === "edit") {
      attachEditorListeners(el);
      // Trigger lazy loads for photos if any equipment rows exist
      if (state.model && state.model.sections && state.model.sections.equipment) {
        state.model.sections.equipment.items.forEach(async (item) => {
            if (item.photo && item.photo.attachmentId) {
               const imgEl = el.querySelector(`.kp-img-preview[data-att-id="${item.photo.attachmentId}"]`);
               if (imgEl && !imgEl.src.startsWith("data:")) {
                   const res = await kpN8nService.fetchPyrusAttachmentBase64(item.photo.attachmentId);
                   if (res.ok) {
                       // Determine mime
                       const ext = (item.photo.name || "").split('.').pop().toLowerCase();
                       const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : (ext === 'webp' ? 'image/webp' : 'image/png');
                       imgEl.src = `data:${mime};base64,${res.data}`;
                   }
               }
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
          const haystack = `${title} ${client}`.toLowerCase();
          return haystack.includes(query);
        })
      : state.deals;
    if (!state.deals.length && !state.loading) {
      listDiv.innerHTML = '<p>Нет active сделок для вашего пользователя.</p>';
      return listDiv;
    }
    listDiv.innerHTML = `
      <div style="margin-bottom: 12px;">
        <input type="text" class="kp-deals-search" placeholder="Поиск сделки..." value="${state.dealsQuery}">
      </div>
      <ul style="list-style: none; padding: 0;">
        ${deals.map(deal => `
          <li class="kp-deal-item" data-id="${deal.id}" style="border: 1px solid var(--table-border-strong, #ddd); padding: 15px; margin-bottom: 10px; border-radius: 8px; cursor: pointer; background: var(--bg-card, #fff);">
            <div style="display: flex; justify-content: space-between;">
              <strong style="font-size: 1.1em;">${deal.subject || "(без темы)"}</strong>
              ${deal.hasKp ? '<span style="color: green;">✅ КП выставлено</span>' : '<span style="color: #666;">📝 Создать КП</span>'}
            </div>
            <div style="font-size: 0.9em; color: gray; margin-top: 5px;">
              ${deal.clientName} | Создано: ${new Date(deal.createDate).toLocaleDateString()}
              ${deal.kpTotal ? ` | Сумма: <b>${deal.kpTotal}</b>` : ''}
              ${deal.kpFilename ? `<br><small>Файл: ${deal.kpFilename}</small>` : ''}
            </div>
          </li>
        `).join("")}
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
        <div class="kp-editor-meta" style="margin-bottom: 20px; background: var(--bg-secondary, #f9f9f9); padding: 15px; border-radius: 8px;">
            <h3>Проект КП для сделки #${m.meta.crmId}</h3>
            <div style="display: flex; gap: 20px; margin-top: 10px;">
                <label>
                    Срок действия (дней):
                    <input type="number" class="kp-input-valid-days" value="${m.meta.validDays}" min="1" max="365" style="width: 60px;">
                </label>
                <div>Создан: ${new Date(m.meta.createdAt).toLocaleDateString()}</div>
                <div>Менеджер: ${m.meta.manager.name}</div>
            </div>
        </div>
        
        ${renderSectionTable("Услуги", "services", m.sections.services)}
        ${renderSectionTable("Лицензии", "licenses", m.sections.licenses)}
        ${renderEquipmentTable(m.sections.equipment)}
        ${renderMaintenanceBlock(m.sections.maintenance)}
        
         <div class="kp-total-block" style="margin-top: 30px; font-size: 1.5em; text-align: right; font-weight: bold; border-top: 2px solid #ccc; padding-top: 20px;">
            Итого КП: <span class="kp-grand-total">${formatMoney(m.total)}</span>
        </div>
        <div class="kp-actions" style="margin-top: 40px; display: flex; gap: 10px; justify-content: flex-end;">
            <button class="btn btn-save" style="background: #28a745; color: white; padding: 10px 20px;">💾 Сохранить и отправить</button>
        </div>
    `;
    return mk;
  }

  function renderSectionTable(title, key, sectionData) {
     if (key === 'equipment') return ""; // Handled separately
     const isLicense = (key === 'licenses');
     const isServices = key === "services";
     
     return `
        <div class="kp-section" data-key="${key}" style="margin-bottom: 30px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h3>${title}</h3>
                ${isServices ? "" : `
                  <label>Скидка на раздел: 
                      <input type="number" class="kp-input-discount" data-section="${key}" value="${sectionData.discountPercent}" min="0" max="100" style="width: 60px;"> %
                  </label>
                `}
            </div>
            <table class="kp-table" style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
                <thead>
                    <tr style="background: var(--bg-secondary, #f0f0f0); text-align: left;">
                        <th style="padding: 10px; border-bottom: 2px solid #ccc;">Наименование</th>
                        ${isLicense ? '<th style="padding: 10px; border-bottom: 2px solid #ccc;">Описание</th>' : ''}
                        <th style="padding: 10px; border-bottom: 2px solid #ccc; width: 100px;">Кол-во</th>
                        <th style="padding: 10px; border-bottom: 2px solid #ccc; width: 120px;">Цена</th>
                        ${isServices ? '<th style="padding: 10px; border-bottom: 2px solid #ccc; width: 100px;">Скидка</th>' : ''}
                        <th style="padding: 10px; border-bottom: 2px solid #ccc; width: 120px;">Сумма</th>
                        <th style="padding: 10px; border-bottom: 2px solid #ccc; width: 40px;"></th>
                    </tr>
                </thead>
                <tbody>
                    ${sectionData.items.map((item, idx) => `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 10px;">
                                 <div class="kp-item-title">${item.name}</div>
                            </td>
                            ${isLicense ? `<td style="padding: 10px; font-size:0.8em; color:gray;">${item.description || ''}</td>` : ''}
                            <td style="padding: 10px;">
                                <input type="number" class="kp-row-qty" data-section="${key}" data-idx="${idx}" value="${item.qty}" min="1" style="width: 100%;">
                            </td>
                            <td style="padding: 10px;">
                                <input type="number" class="kp-row-price" data-section="${key}" data-idx="${idx}" value="${item.price}" min="0" style="width: 100%;">
                            </td>
                            ${isServices ? `<td style="padding: 10px;">${item.discountPercent || 0}%</td>` : ''}
                            <td style="padding: 10px;">
                                ${formatMoney(item.total)}
                            </td>
                            <td style="padding: 10px; text-align: center;">
                                <button class="btn-icon kp-btn-del" data-section="${key}" data-idx="${idx}" title="Удалить">✕</button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
           <div style="display: flex; justify-content: space-between; align-items: center;">
               <button class="btn btn-sm kp-btn-add" data-section="${key}">+ Добавить (из справочника)</button> 
               <div style="text-align: right;">
                 <div>Итого без скидки: <strong>${formatMoney(sectionData.subtotal || 0)}</strong></div>
                 <div>Итого со скидкой: <strong>${formatMoney(sectionData.total || 0)}</strong></div>
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
                 <label>Скидка на раздел: 
                    <input type="number" class="kp-input-discount" data-section="${key}" value="${sectionData.discountPercent}" min="0" max="100" style="width: 60px;"> %
                </label>
            </div>
            <table class="kp-table" style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
                <thead>
                    <tr style="background: var(--bg-secondary, #f0f0f0); text-align: left;">
                        <th style="padding:10px;">Фото</th>
                        <th style="padding:10px;">Наименование</th>
                        <th style="padding:10px;">Тип</th>
                        <th style="padding:10px;">Кол-во</th>
                        <th style="padding:10px;">Цена</th>
                        <th style="padding:10px;">Сумма</th>
                         <th style="padding: 10px;"></th>
                    </tr>
                </thead>
                <tbody>
                     ${sectionData.items.map((item, idx) => {
                         const hasPhoto = item.photo && item.photo.attachmentId;
                         // Placeholder src, will be replaced by async loader
                         const src = hasPhoto ? "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" : ""; 
                         
                         return `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 10px;">
                              ${hasPhoto ? `<img src="${src}" class="kp-img-preview" data-att-id="${item.photo.attachmentId}" style="width: 40px; height: 40px; object-fit: contain;">` : ''}
                            </td>
                            <td style="padding: 10px;">
                                <div class="kp-item-title">${item.name}</div>
                                <div style="font-size:0.8em; color:gray">${item.description || ""}</div>
                            </td>
                            <td style="padding: 10px; font-size: 0.9em;">
                                ${item.typeName || "-"}
                            </td>
                             <td style="padding: 10px;">
                                <input type="number" class="kp-row-qty" data-section="${key}" data-idx="${idx}" value="${item.qty}" min="1" style="width: 100%;">
                            </td>
                            <td style="padding: 10px;">
                                <input type="number" class="kp-row-price" data-section="${key}" data-idx="${idx}" value="${item.price}" min="0" style="width: 90%;">
                            </td>
                             <td style="padding: 10px;">
                                ${formatMoney(item.total)}
                            </td>
                            <td style="padding: 10px; text-align: center;">
                                <button class="btn-icon kp-btn-del" data-section="${key}" data-idx="${idx}" title="Удалить">✕</button>
                            </td>
                        </tr>
                         `;
                     }).join("")}
                </tbody>
            </table>
             <div style="display: flex; justify-content: space-between; align-items: center;">
               <button class="btn btn-sm kp-btn-add" data-section="${key}">+ Добавить (из справочника)</button> 
               <div style="text-align: right;">
                 <div>Итого без скидки: <strong>${formatMoney(sectionData.subtotal || 0)}</strong></div>
                 <div>Итого со скидкой: <strong>${formatMoney(sectionData.total || 0)}</strong></div>
               </div>
           </div>
        </div>
     `;
  }
  
  function renderMaintenanceBlock(maintData) {
    return `
        <div class="kp-section-maintenance" style="margin-bottom: 30px; background: var(--bg-secondary, #fafafa); padding: 15px; border-radius: 8px;">
            <h3>Техническое обслуживание (iiko)</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; align-items: center;">
                 <label>Количество терминалов (фронтов):
                    <input type="number" class="kp-input-terminals" value="${maintData.terminals}" min="0" style="width: 80px;">
                 </label>
                 <!-- Price is auto-calculated or manual override if allowed -->
                 <div>Цена за терминал: 
                   <input type="number" class="kp-input-maint-price" value="${maintData.unitPrice || 0}" style="width: 80px;">
                 </div>
                 <div style="text-align: right; font-weight: bold; font-size: 1.2em;">Всего: ${formatMoney(maintData.total)}</div>
            </div>
            <small style="color: gray;">Цена подбирается автоматически по количеству терминалов, но может быть изменена вручную.</small>
        </div>
      `;
  }

  // --- Interactions ---

  async function handleDealSelect(dealId) {
      const deal = state.deals.find(d => String(d.id) === String(dealId));
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
          avatar: profile?.avatarUrl || session?.user?.avatarUrl
      };
      
      try {
          if (deal.kpFilename) {
              // Load existing KP
              state.loading = true;
              render(); 
              
              try {
                  const loadedModel = await services.kpService.loadKpFromFile(deal.kpFilename);
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
          
          state.model = recalcKpModel(state.model);
          switchMode("edit");
      } catch(e) { 
          console.error(e); 
          state.error = "Ошибка при открытии сделки";
          render();
      }
  }

  function switchMode(newMode) {
      state.mode = newMode;
      if (newMode === "list") loadDeals();
      else render();
  }
  
  function attachEditorListeners(root) {
     root.addEventListener("change", (e) => {
         const t = e.target;
         if (t.classList.contains("kp-row-qty") || t.classList.contains("kp-row-price")) {
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
     });
     
     root.addEventListener("click", e => {
         const t = e.target;
         if (t.classList.contains("kp-btn-del")) deleteRow(t.dataset.section, t.dataset.idx);
         if (t.classList.contains("kp-btn-add")) openCatalogSelector(t.dataset.section, t);
         if (t.classList.contains("btn-save")) saveCurrentKp();
     });
  }

  // --- Helpers ---

  function updateRow(sectionKey, idx, classList, value) {
     const item = state.model.sections[sectionKey].items[idx];
     if (!item) return;
     if (classList.contains("kp-row-qty")) item.qty = Number(value);
     if (classList.contains("kp-row-price")) item.price = Number(value);
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
  function updateMeta(f, v) { state.model.meta[f] = v; }
  
  async function updateMaintenance(terminalsCount) {
      const count = Number(terminalsCount);
      state.model.sections.maintenance.terminals = count;
      try {
          const items = await kpCatalogService.loadMaintenanceCatalog();
          const priceInfo = kpCatalogService.getMaintenancePriceForTerminals(items, count);
          state.model.sections.maintenance.unitPrice = priceInfo.unitPrice;
      } catch (e) { console.warn(e); }
      doRecalc();
  }

  function doRecalc() {
      state.model = recalcKpModel(state.model);
      render();
  }
  
  async function saveCurrentKp() {
      // Logic for save
      // ...
      if (!state.model || !state.currentDeal) return;
      
      const btn = el.querySelector(".btn-save");
      if (btn) { btn.disabled = true; btn.textContent = "Сохранение..."; }
      
      try {
          doRecalc();
          const avatarId = userProfileService?.getCachedProfile?.()?.avatar_id;
          if (avatarId && userProfileService?.loadAvatar) {
              const avatarUrl = await userProfileService.loadAvatar({
                  avatarId,
                  size: getKpAvatarSize(),
                  force: true
              });
              if (avatarUrl) {
                  state.model.meta.manager.avatar = avatarUrl;
              }
          }
          await kpService.saveKpForDeal(state.currentDeal.id, state.model);
      } catch (e) {
          console.error(e);
          alert("Ошибка: " + e.message);
      } finally {
          if (btn) {
              btn.textContent = "Сохранено ✅"; 
              setTimeout(() => { btn.disabled = false; btn.textContent = "💾 Сохранить и отправить"; }, 2000);
          }
      }
  }

  // --- Catalog Selectors ---

  async function openCatalogSelector(sectionKey, anchorEl) {
      let items = [];
      try {
          if (sectionKey === "services") items = await kpCatalogService.loadServicesCatalog();
          else if (sectionKey === "licenses") items = await kpCatalogService.loadLicensesCatalog();
          else if (sectionKey === "equipment") {
              items = await kpEquipmentService.loadEquipmentRegister();
          }
      } catch (e) {
          console.warn("Catalog load failed", e);
          items = [];
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

              const description = it.description ? `<div class="kp-popover__meta">${it.description}</div>` : "";
              const typeName = it.typeName ? `<div class="kp-popover__meta">${it.typeName}</div>` : "";
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
                      photo: it.photo || null
                  };
                  state.model.sections[sectionKey].items.push(row);
                  doRecalc();
                  if (popoverId) closePopover(popoverId);
              };
              listEl.appendChild(itemEl);
          });
      };

      const filterList = () => {
          const query = searchInput.value.trim().toLowerCase();
          if (!query) return items;
          return items.filter((it) => {
              const haystack = `${it.name || ""} ${it.description || ""} ${it.typeName || ""}`.toLowerCase();
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
          contentEl: popDiv
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
         if (e.message.includes("CRM not configured")) state.error = "CRM не настроена (см. config.json)";
         else state.error = "Ошибка загрузки сделок: " + e.message;
     } finally {
         state.loading = false;
         if (state.mode === "list") render();
     }
  }

  function mount() {
      loadDeals();
  }
  function unmount() { }

  return { el, mount, unmount };
}
