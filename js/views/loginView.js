const AUTH_METHOD_EMAIL = "email";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function setCookie(name, value, days) {
  try {
    const expires = new Date(Date.now() + days * 86400000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch (_) {}
}

export function createLoginView(ctx) {
  const el = document.createElement("section");
  el.className = "login-view";
  let cleanup = [];
  let resendTimerId = null;

  function addListener(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    cleanup.push(() => target.removeEventListener(type, handler, options));
  }

  function clearResendTimer() {
    if (resendTimerId) {
      clearInterval(resendTimerId);
      resendTimerId = null;
    }
  }

  function resetCleanup() {
    cleanup.forEach((fn) => fn());
    cleanup = [];
  }

  function saveAuthCache({ login, user, roles, memberId, permissions }) {
    const storageKey = ctx?.config?.storage?.auth?.key || "sm_graph_auth_v1";
    const cookieDays = Number(ctx?.config?.storage?.auth?.cookieDays) || 0;
    const payload = {
      savedAt: Date.now(),
      authMethod: AUTH_METHOD_EMAIL,
      login: login || "",
      user: user || null,
      roles: roles || null,
      memberId: memberId || null,
      permissions: permissions || null,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (_) {}
    if (cookieDays) {
      setCookie(storageKey, JSON.stringify(payload), cookieDays);
    }
  }

  function mount() {
    document.body.classList.add("login-active");
    el.innerHTML = "";

    const template = document.getElementById("login-template");
    if (!template) {
      throw new Error("Login template not found.");
    }
    const node = template.content.cloneNode(true);
    el.appendChild(node);

    const loginScreenEl = el.querySelector("#login-screen");
    const emailInputEl = el.querySelector("#email-input");
    const emailSendButtonEl = el.querySelector("#email-send-button");
    const emailStepRequestEl = el.querySelector("#email-step-request");
    const emailStepCodeEl = el.querySelector("#email-step-code");
    const emailTargetLabelEl = el.querySelector("#email-target-label");
    const emailChangeButtonEl = el.querySelector("#email-change-button");
    const otpGroupEl = el.querySelector("#otp-group");
    const otpInputs = otpGroupEl ? Array.from(otpGroupEl.querySelectorAll(".otp-input")) : [];
    const emailVerifyButtonEl = el.querySelector("#email-verify-button");
    const emailResendButtonEl = el.querySelector("#email-resend-button");
    const emailRequestErrorEl = el.querySelector("#email-request-error");
    const emailCodeErrorEl = el.querySelector("#email-code-error");

    const emailAuthState = {
      step: "request",
      targetEmail: "",
      resendRemaining: 0,
      currentCode: "",
      member: null,
      membersLoaded: false,
      membersLoading: false,
      membersLoadError: "",
      membersByEmail: new Map(),
    };

    function clearAuthErrors() {
      if (emailRequestErrorEl) emailRequestErrorEl.textContent = "";
      if (emailCodeErrorEl) emailCodeErrorEl.textContent = "";
      otpGroupEl?.classList.remove("error");
    }

    function setEmailAuthStep(step) {
      emailAuthState.step = step;
      emailStepRequestEl?.classList.toggle("hidden", step !== "request");
      emailStepCodeEl?.classList.toggle("hidden", step !== "code");
      clearAuthErrors();
      if (step === "request") {
        emailInputEl?.focus();
      } else {
        otpInputs[0]?.focus();
      }
    }

    function updateResendButton() {
      if (!emailResendButtonEl) return;
      if (emailAuthState.resendRemaining > 0) {
        emailResendButtonEl.disabled = true;
        emailResendButtonEl.textContent = `Повторная отправка (${emailAuthState.resendRemaining}с)`;
      } else {
        emailResendButtonEl.disabled = false;
        emailResendButtonEl.textContent = "Повторная отправка";
      }
    }

    function startResendTimer() {
      clearResendTimer();
      emailAuthState.resendRemaining = 60;
      updateResendButton();
      resendTimerId = setInterval(() => {
        emailAuthState.resendRemaining -= 1;
        if (emailAuthState.resendRemaining <= 0) {
          emailAuthState.resendRemaining = 0;
          clearResendTimer();
        }
        updateResendButton();
      }, 1000);
    }

    function normalizeOtpValue(value) {
      return value.replace(/\D/g, "");
    }

    function setOtpError(message) {
      if (emailCodeErrorEl) emailCodeErrorEl.textContent = message || "";
      otpGroupEl?.classList.toggle("error", Boolean(message));
    }

    function getOtpValue() {
      return otpInputs.map((input) => input.value).join("");
    }

    function fillOtpFromString(value) {
      const digits = normalizeOtpValue(value).slice(0, otpInputs.length).split("");
      otpInputs.forEach((input, index) => {
        input.value = digits[index] || "";
      });
      const nextIndex = Math.min(digits.length, otpInputs.length - 1);
      otpInputs[nextIndex]?.focus();
    }

    function handleOtpInput(event) {
      const input = event.target;
      const index = otpInputs.indexOf(input);
      const clean = normalizeOtpValue(input.value);
      input.value = clean.slice(-1);
      setOtpError("");
      if (input.value && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      }
    }

    function handleOtpKeydown(event) {
      const input = event.target;
      const index = otpInputs.indexOf(input);
      if (event.key === "Backspace" && !input.value && index > 0) {
        otpInputs[index - 1].value = "";
        otpInputs[index - 1].focus();
        event.preventDefault();
      }
      if (event.key === "ArrowLeft" && index > 0) {
        otpInputs[index - 1].focus();
        event.preventDefault();
      }
      if (event.key === "ArrowRight" && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
        event.preventDefault();
      }
    }

    function handleOtpPaste(event) {
      const data = event.clipboardData?.getData("text");
      if (!data) return;
      event.preventDefault();
      fillOtpFromString(data);
    }

    async function loadEmailAuthMembers() {
      if (emailAuthState.membersLoaded || emailAuthState.membersLoading) return;
      emailAuthState.membersLoading = true;
      emailAuthState.membersLoadError = "";
      try {
        const { membersByEmail } = await ctx.services.membersService.getMembersIndex();
        const normalizedMap = new Map();
        for (const [email, member] of membersByEmail.entries()) {
          normalizedMap.set(email, {
            id: member.id,
            first_name: member.first_name || "",
            last_name: member.last_name || "",
            email: member.email || "",
          });
        }
        emailAuthState.membersByEmail = normalizedMap;
        emailAuthState.membersLoaded = true;
      } catch (err) {
        console.error("Не удалось загрузить сотрудников для email-авторизации:", err);
        emailAuthState.membersByEmail = new Map();
        emailAuthState.membersLoaded = false;
        emailAuthState.membersLoadError = "Не удалось проверить email, попробуйте позже";
        if (emailRequestErrorEl) {
          emailRequestErrorEl.textContent = emailAuthState.membersLoadError;
        }
      } finally {
        emailAuthState.membersLoading = false;
      }
    }

    function generateEmailAuthCode(length) {
      const size = Math.max(1, Number(length) || 6);
      const values = new Uint32Array(size);
      crypto.getRandomValues(values);
      return Array.from(values, (value) => String(value % 10)).join("");
    }

    async function sendEmailAuthCode(payload) {
      return ctx.services.graphClient.callGraphApi("email", payload);
    }

    function resetEmailAuthState(keepEmail = true) {
      clearResendTimer();
      emailAuthState.step = "request";
      emailAuthState.resendRemaining = 0;
      emailAuthState.currentCode = "";
      emailAuthState.member = null;
      if (!keepEmail && emailInputEl) emailInputEl.value = "";
      if (emailTargetLabelEl) emailTargetLabelEl.textContent = "—";
      otpInputs.forEach((input) => {
        input.value = "";
      });
      updateResendButton();
      setEmailAuthStep("request");
    }

    function initHandlers() {
      otpInputs.forEach((input) => {
        addListener(input, "input", handleOtpInput);
        addListener(input, "keydown", handleOtpKeydown);
      });
      if (otpGroupEl) {
        addListener(otpGroupEl, "paste", handleOtpPaste);
      }

      addListener(emailSendButtonEl, "click", async () => {
        clearAuthErrors();
        const email = emailInputEl?.value.trim() || "";
        const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!isValid) {
          if (emailRequestErrorEl) emailRequestErrorEl.textContent = "Введите корректный email";
          emailInputEl?.focus();
          return;
        }
        if (!emailAuthState.membersLoaded) {
          if (emailRequestErrorEl) {
            emailRequestErrorEl.textContent =
              emailAuthState.membersLoadError || "Не удалось проверить email, попробуйте позже";
          }
          return;
        }

        const normalizedEmail = normalizeEmail(email);
        if (!emailAuthState.membersByEmail.has(normalizedEmail)) {
          if (emailRequestErrorEl) {
            emailRequestErrorEl.textContent =
              "Email не найден — укажите почту которую используете для работы в Pyrus";
          }
          return;
        }

        const member = emailAuthState.membersByEmail.get(normalizedEmail);
        const code = generateEmailAuthCode(ctx.config.auth.codeLength);
        emailAuthState.currentCode = code;
        emailAuthState.member = member;
        emailAuthState.targetEmail = email;
        if (emailTargetLabelEl) emailTargetLabelEl.textContent = email;
        otpInputs.forEach((input) => {
          input.value = "";
        });
        try {
          await sendEmailAuthCode({
            type: "email",
            email,
            code,
            first_name: member.first_name || "",
            last_name: member.last_name || "",
          });
        } catch (err) {
          if (emailRequestErrorEl) {
            emailRequestErrorEl.textContent = err?.message || "Не удалось отправить код";
          }
          return;
        }
        setEmailAuthStep("code");
        startResendTimer();
      });

      addListener(emailChangeButtonEl, "click", () => {
        setEmailAuthStep("request");
      });

      addListener(emailVerifyButtonEl, "click", async () => {
        clearAuthErrors();
        const code = getOtpValue();
        if (code.length < otpInputs.length) {
          setOtpError("Введите 6-значный код");
          return;
        }
        if (code !== emailAuthState.currentCode) {
          setOtpError("Неверный код. Попробуйте ещё раз");
          return;
        }
        const member = emailAuthState.member;
        const email = emailAuthState.targetEmail || "";
        if (!member?.id) {
          setOtpError("Не удалось определить пользователя. Повторите вход.");
          return;
        }

        let profile = null;
        try {
          profile = await ctx.services.userProfileService.loadCurrentUserProfile({
            userId: member.id,
            force: true,
          });
        } catch (err) {
          setOtpError(err?.message || "Не удалось загрузить профиль пользователя");
          return;
        }

        const user = {
          id: member.id,
          name: profile?.fullName || `${member?.last_name || ""} ${member?.first_name || ""}`.trim(),
          login: email,
          roles: profile?.roleIds || profile?.roles || [],
        };

        saveAuthCache({
          login: email,
          user,
          roles: user.roles,
          memberId: member.id,
          permissions: null,
        });
        if (ctx.actions?.setUserProfile) {
          ctx.actions.setUserProfile(profile);
        }
        ctx.router.navigate("work");
      });

      addListener(emailResendButtonEl, "click", async () => {
        if (emailAuthState.resendRemaining > 0) return;
        clearAuthErrors();
        const email = emailAuthState.targetEmail;
        const normalizedEmail = normalizeEmail(email);
        const member = emailAuthState.member || emailAuthState.membersByEmail.get(normalizedEmail);
        if (!member || !email) {
          if (emailCodeErrorEl) {
            emailCodeErrorEl.textContent = "Сначала запросите код по email";
          }
          return;
        }
        const code = generateEmailAuthCode(ctx.config.auth.codeLength);
        emailAuthState.currentCode = code;
        emailAuthState.member = member;
        try {
          await sendEmailAuthCode({
            type: "email",
            email,
            code,
            first_name: member.first_name || "",
            last_name: member.last_name || "",
          });
        } catch (err) {
          if (emailCodeErrorEl) {
            emailCodeErrorEl.textContent = err?.message || "Не удалось отправить код";
          }
          return;
        }
        startResendTimer();
      });
    }

    if (loginScreenEl) {
      loginScreenEl.classList.remove("hidden");
    }
    resetEmailAuthState(true);
    initHandlers();
    loadEmailAuthMembers();
  }

  function unmount() {
    document.body.classList.remove("login-active");
    resetCleanup();
    clearResendTimer();
    el.innerHTML = "";
  }

  return { el, mount, unmount };
}
