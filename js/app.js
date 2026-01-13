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
import { createAccessService } from "./services/accessService.js";
import { createAuthService } from "./services/authService.js";
import { subscribe, navigate } from "./router/hashRouter.js";
import { createHeader } from "./layout/header.js";
import { mount } from "./layout/mount.js";
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
});
const prodCalendarService = createProdCalendarService({ config });
const accessService = createAccessService({ config });
const authService = createAuthService({ config });

const services = {
  graphClient,
  membersService,
  catalogsService,
  vacationsService,
  scheduleService,
  prodCalendarService,
  accessService,
  authService,
};

const ctx = {
  config,
  getConfigValue,
  services,
  router: {
    navigate,
  },
};

const headerRoot = document.getElementById("app-header");
const pageRoot = document.getElementById("app-page");

if (!headerRoot || !pageRoot) {
  throw new Error("App layout containers are missing.");
}

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

function getView(name) {
  if (!views[name]) {
    views[name] = viewFactories[name]();
  }
  return views[name];
}

const header = createHeader({ onNavigate: navigate, canAccessRoute: accessService.canAccessRoute });
headerRoot.appendChild(header.el);

function handleRoute(route) {
  const routeName = route?.name || "work";
  const hasSession = authService.hasValidSession();

  if (routeName === "login") {
    if (hasSession) {
      navigate("work");
      return;
    }
    headerRoot.style.display = "none";
    const loginView = getView("login");
    if (currentView && currentView !== loginView) {
      currentView.unmount?.();
    }
    mount(pageRoot, loginView.el);
    loginView.mount?.();
    currentView = loginView;
    return;
  }

  headerRoot.style.display = "";

  if (PRIVATE_ROUTES.has(routeName) && !hasSession) {
    navigate("login");
    return;
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

subscribe(handleRoute);

membersService.getMembers().catch((error) => {
  console.warn("Members warmup failed", error);
});
