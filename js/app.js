// app.js
// Bootstrap SPA: сервисы, роутинг и layout.

import { config, getConfigValue } from "./config.js";
import { createGraphClient } from "./api/graphClient.js";
import { createPyrusClient } from "./api/pyrusClient.js";
import { createMembersService } from "./services/membersService.js";
import { createCatalogsService } from "./services/catalogsService.js";
import { createVacationsService } from "./services/vacationsService.js";
import { createScheduleService } from "./services/scheduleService.js";
import { createProdCalendarService } from "./services/prodCalendarService.js";
import { createMeetingsService } from "./services/meetingsService.js";
import { createAccessService } from "./services/accessService.js";
import { createAuthService } from "./services/authService.js";
import { createUserProfileService } from "./services/userProfileService.js";
import { createCrmService } from "./services/crmService.js";
import { createKpCatalogsService } from "./services/kpCatalogService.js";
import { createKpService } from "./services/kpService.js";
import { createKpN8nService } from "./services/kpN8nService.js";
import { createKpEquipmentService } from "./services/kpEquipmentService.js";
import { createTimezoneService } from "./services/timezoneService.js";
import * as requestCache from "./cache/requestCache.js";
import { subscribe, navigate } from "./router/hashRouter.js";
import { installGlobalErrorOverlay } from "./utils/errorOverlay.js";

// Init Fail-safe ASAP
installGlobalErrorOverlay();

// ... existing imports ...


import { createAppShell } from "./layout/appShell.js";
import { createHeader } from "./layout/header.js";
import { mount } from "./layout/mount.js";
import { createUserPopover } from "./ui/userPopover.js";
import { createUserBirthdayModal } from "./ui/userBirthdayModal.js";
import { initPopoverEngineOnce } from "./ui/popoverEngine.js";
import { createWorkView } from "./views/workView.js";
import { createMeetView } from "./views/meetView.js";
import { createKpView } from "./views/kpView.js";
import { createGanttView } from "./views/ganttView.js";
import { createForbiddenView } from "./views/forbiddenView.js";
import { createLoginView } from "./views/loginView.js";

const GRAPH_HOOK_URL = getConfigValue("graphHookUrl", { required: true });
const TIMEZONE_OFFSET_MIN = getConfigValue("timezone.localOffsetMin", {
  defaultValue: 4 * 60,
  required: true,
});

const graphClient = createGraphClient({ graphHookUrl: GRAPH_HOOK_URL });
const pyrusClient = createPyrusClient({ graphClient });
const membersService = createMembersService({ pyrusClient });
const userProfileService = createUserProfileService({ pyrusClient, cache: requestCache, config });
const catalogsService = createCatalogsService({ pyrusClient });
const vacationsService = createVacationsService({
  pyrusClient,
  formId: config.pyrus.forms.otpusk,
  fieldIds: config.pyrus.fields.otpusk,
  timezoneOffsetMin: TIMEZONE_OFFSET_MIN,
});
const scheduleService = createScheduleService({
  pyrusClient,
  formId: config.pyrus.forms.smeni,
  graphClient,
});
const meetingsService = createMeetingsService({
  graphClient,
  cache: requestCache,
  config,
  membersService,
});
const prodCalendarService = createProdCalendarService({ config });
const accessService = createAccessService({ config, userProfileService });
const authService = createAuthService({
  config,
  userProfileService,
  requestCache,
  navigate,
  graphClient,
});
const timezoneService = createTimezoneService({ config });
timezoneService.init();

const crmService = createCrmService({ pyrusClient, config });
const kpCatalogService = createKpCatalogsService({ pyrusClient, catalogsService });
const kpService = createKpService({ pyrusClient, config });
const kpN8nService = createKpN8nService();
const kpEquipmentService = createKpEquipmentService({ pyrusClient });

const services = {
  graphClient,
  membersService,
  userProfileService,
  catalogsService,
  vacationsService,
  scheduleService,
  meetingsService,
  prodCalendarService,
  accessService,
  authService,
  timezoneService,
  crmService,
  kpCatalogService,
  kpService,
  kpN8nService,
  kpEquipmentService,
};

const ctx = {
  config,
  getConfigValue,
  services,
  router: {
    navigate,
  },
  actions: {},
};

const appRoot = document.getElementById("app");
if (!appRoot) {
  throw new Error("App root container is missing.");
}

const appShell = createAppShell({ rootEl: appRoot });
const { headerRoot, pageRoot } = appShell;
initPopoverEngineOnce();

const workViewEl = document.getElementById("work-view");
if (workViewEl) {
  ctx.dom = { ...(ctx.dom || {}), workViewEl };
}

const viewFactories = {
  work: () => createWorkView(ctx),
  meet: () => createMeetView(ctx),
  kp: () => createKpView(ctx),
  gantt: () => createGanttView(ctx),
  login: () => createLoginView(ctx),
};

const views = {
  work: null,
  meet: null,
  kp: null,
  gantt: null,
  login: null,
};

const forbiddenView = createForbiddenView({
  onBack: () => navigate("work"),
});

const PRIVATE_ROUTES = new Set(["work", "meet", "kp", "gantt"]);

let currentView = null;
let currentRouteName = "work";

function getView(name) {
  if (!views[name]) {
    views[name] = viewFactories[name]();
  }
  return views[name];
}

const workView = getView("work");
workView.initTheme?.();

const userPopover = createUserPopover({
  getProfile: () => userProfileService.getCachedProfile(),
});
const birthdayModal = createUserBirthdayModal();

const header = createHeader({
  onNavigate: navigate,
  onToggleTheme: () => {
    workView.toggleTheme?.();
  },
  onLogout: () => {
    userPopover.close?.();
    birthdayModal.close?.();
    authService.logout?.();
  },
  onOpenUserPopover: (anchorEl) => {
    userPopover.open(anchorEl);
  },
  canAccessRoute: accessService.canAccessRoute,
  getTimezoneLabelShort: () => timezoneService.getLabelShort(),
  listTimezoneZones: () => timezoneService.listZones(),
  onTimezoneChange: (zoneId) => {
    timezoneService.setZoneById(zoneId);
  }
});

timezoneService.subscribe(() => {
  header.updateTimezoneLabel();
  if (currentView) {
    currentView.unmount?.();
    currentView.mount?.();
  }
});
headerRoot.appendChild(header.el);

ctx.actions.setUserProfile = (profile) => {
  updateHeaderProfile(profile);
  header.setActive(currentRouteName);
};

function getSessionUserId() {
  const session = authService.getSession?.();
  return session?.memberId ?? session?.user?.id ?? session?.userId ?? null;
}

function updateHeaderProfile(profile) {
  if (!profile) return;
  updateHeaderSummary(profile);
  if (isBirthdayToday(profile) && !birthdayModal.isOpen()) {
    birthdayModal.open();
  }
}

function updateHeaderSummary(profile) {
  if (!profile) return;
  if (profile.avatar_id && !profile.avatarUrl) {
    userProfileService
      .loadAvatar({ avatarId: profile.avatar_id })
      .then((avatarUrl) => {
        if (!avatarUrl) return;
        profile.avatarUrl = avatarUrl;
        updateHeaderSummary(profile);
      })
      .catch(() => { });
  }
  header.setUserSummary({
    fullName: profile.fullName,
    position: profile.position,
    initials: profile.initials,
    avatarUrl: profile.avatarUrl,
  });
}

function isBirthdayToday(profile) {
  const birthDate = profile?.birth_date;
  if (!birthDate || typeof birthDate !== "object") return false;
  const day = Number(birthDate.day);
  const month = Number(birthDate.month);
  if (!day || !month) return false;
  const now = new Date();
  return now.getDate() === day && now.getMonth() + 1 === month;
}

function routeHasRestrictions(routeName) {
  const allowed = config?.routeAccess?.[routeName];
  return Array.isArray(allowed) && allowed.length > 0;
}

async function ensureProfileIfNeeded(routeName) {
  const hasSession = authService.hasValidSession();
  if (!hasSession || !routeHasRestrictions(routeName)) return;
  if (userProfileService.getCachedProfile()) return;
  const userId = getSessionUserId();
  if (!userId) return;
  try {
    const profile = await userProfileService.loadCurrentUserProfile({ userId, force: false });
    updateHeaderProfile(profile);
  } catch (error) {
    console.warn("Profile preload failed", error);
  }
}

async function handleRoute(route) {
  const routeName = route?.name || "work";
  currentRouteName = routeName;
  const hasSession = authService.hasValidSession();

  if (routeName === "login") {
    if (hasSession) {
      navigate("work");
      return;
    }
    appShell.setHeaderVisible(false);
    const loginView = getView("login");
    if (currentView && currentView !== loginView) {
      currentView.unmount?.();
    }
    mount(pageRoot, loginView.el);
    loginView.mount?.();
    currentView = loginView;
    return;
  }

  appShell.setHeaderVisible(true);

  if (PRIVATE_ROUTES.has(routeName) && !hasSession) {
    navigate("login");
    return;
  }

  if (PRIVATE_ROUTES.has(routeName)) {
    await ensureProfileIfNeeded(routeName);
  }

  if (PRIVATE_ROUTES.has(routeName) && !accessService.canAccessRoute(routeName)) {
    if (currentView) {
      currentView.unmount?.();
    }
    forbiddenView.setMessage?.("Доступ запрещён, обратитесь к администратору");
    mount(pageRoot, forbiddenView.el);
    forbiddenView.mount?.();
    currentView = forbiddenView;
    header.setActive(routeName);
    return;
  }
  const nextView = getView(routeName) || getView("work");

  if (currentView && currentView !== nextView) {
    currentView.unmount?.();
  }

  header.setActive(routeName);
  mount(pageRoot, nextView.el);
  nextView.mount?.();
  currentView = nextView;
}

if (!authService.hasValidSession()) {
  userProfileService.clear();
}

subscribe((route) => {
  Promise.resolve(handleRoute(route)).catch((error) => {
    console.error("Route handling failed", error);
  });
});

if (authService.hasValidSession()) {
  const cachedProfile = userProfileService.getCachedProfile();
  if (cachedProfile) {
    updateHeaderProfile(cachedProfile);
  } else {
    const userId = getSessionUserId();
    if (userId) {
      userProfileService
        .loadCurrentUserProfile({ userId, force: false })
        .then((profile) => {
          updateHeaderProfile(profile);
          header.setActive(currentRouteName);
        })
        .catch((error) => {
          console.warn("Profile warmup failed", error);
        });
    }
  }
}

membersService.getMembers().catch((error) => {
  console.warn("Members warmup failed", error);
});
