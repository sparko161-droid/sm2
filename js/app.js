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
import { subscribe, navigate } from "./router/hashRouter.js";
import { createHeader } from "./layout/header.js";
import { mount } from "./layout/mount.js";
import { createWorkView } from "./views/workView.js";
import { createMeetView } from "./views/meetView.js";
import { createKpView } from "./views/kpView.js";

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

const services = {
  graphClient,
  membersService,
  catalogsService,
  vacationsService,
  scheduleService,
  prodCalendarService,
};

const ctx = {
  config,
  getConfigValue,
  services,
};

const headerRoot = document.getElementById("app-header");
const pageRoot = document.getElementById("app-page");

if (!headerRoot || !pageRoot) {
  throw new Error("App layout containers are missing.");
}

const viewFactories = {
  work: () => createWorkView(ctx),
  meet: () => createMeetView(ctx),
  kp: () => createKpView(ctx),
};

const views = {
  work: null,
  meet: null,
  kp: null,
};

let currentView = null;

function getView(name) {
  if (!views[name]) {
    views[name] = viewFactories[name]();
  }
  return views[name];
}

const header = createHeader({ onNavigate: navigate });
headerRoot.appendChild(header.el);

function handleRoute(route) {
  const routeName = route?.name || "work";
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
