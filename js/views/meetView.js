export function createMeetView(ctx) {
  const el = document.createElement("section");
  el.className = "placeholder-view";

  const title = document.createElement("h1");
  title.textContent = "Встречи";

  const description = document.createElement("p");
  description.textContent = "Скоро здесь будет график встреч.";

  const membersMeta = document.createElement("div");
  membersMeta.className = "placeholder-meta";
  membersMeta.textContent = "Members loaded: —";

  el.appendChild(title);
  el.appendChild(description);
  el.appendChild(membersMeta);

  let mounted = false;

  async function updateMembersMeta() {
    const membersService = ctx?.services?.membersService;
    if (!membersService) {
      membersMeta.textContent = "Members loaded: —";
      return;
    }
    try {
      const members = await membersService.getMembersList();
      membersMeta.textContent = `Members loaded: ${members.length}`;
    } catch (error) {
      console.error("Members warmup failed", error);
      membersMeta.textContent = "Members loaded: —";
    }
  }

  return {
    el,
    mount() {
      if (!mounted) {
        mounted = true;
        updateMembersMeta();
      } else {
        updateMembersMeta();
      }
    },
    unmount() {},
  };
}
