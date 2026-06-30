<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('username','password') displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>

  <#if section = "header">
    <#-- Hidden: we render our own title inside body -->
  <#elseif section = "form">

    <div class="hpc-login-wrap">

      <#-- ── Logo + Title ── -->
      <div class="hpc-login-header">
        <div class="hpc-logo">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="44" height="44" rx="12" fill="rgba(251,206,181,0.15)" stroke="rgba(251,206,181,0.4)" stroke-width="1.5"/>
            <rect x="8" y="10" width="6" height="24" rx="2" fill="#fbceb5"/>
            <rect x="19" y="10" width="6" height="24" rx="2" fill="#fbceb5" opacity="0.7"/>
            <rect x="30" y="10" width="6" height="24" rx="2" fill="#fbceb5" opacity="0.5"/>
            <rect x="8" y="20" width="28" height="4" rx="2" fill="rgba(255,255,255,0.2)"/>
          </svg>
        </div>
        <h2 class="hpc-title">
          <#if client?? && client.name?has_content>
            <#if client.name == "open-ondemand" || client.clientId == "open-ondemand">
              Open OnDemand
            <#else>
              HPC Cluster Management
            </#if>
          <#else>
            HPC Cluster Management
          </#if>
        </h2>
        <p class="hpc-subtitle">Sign in to your account</p>
      </div>

      <#-- ── Error Messages ── -->
      <#if messagesPerField.existsError('username','password')>
        <div class="hpc-alert hpc-alert-error">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="margin-right:8px;flex-shrink:0;">
            <circle cx="8" cy="8" r="7.5" stroke="#ff6b6b" stroke-width="1"/>
            <path d="M8 4v4M8 11v1" stroke="#ff6b6b" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
        </div>
      </#if>

      <#-- ── Login Form ── -->
      <form id="kc-form-login" action="${url.loginAction}" method="post">

        <div class="hpc-form-group">
          <input
            type="text"
            id="username"
            name="username"
            class="hpc-input"
            placeholder="${msg('username')}"
            value="${(login.username!'')}"
            autocomplete="username"
            autofocus
            tabindex="1"
          />
        </div>

        <div class="hpc-form-group hpc-password-wrap">
          <input
            type="password"
            id="password"
            name="password"
            class="hpc-input"
            placeholder="${msg('password')}"
            autocomplete="current-password"
            tabindex="2"
          />
          <span class="hpc-eye-toggle" onclick="togglePassword()" title="Show/hide password">
            <svg id="eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
        </div>

        <div class="hpc-form-options">
          <#if realm.rememberMe && !usernameEditDisabled??>
            <label class="hpc-checkbox-wrap">
              <input
                type="checkbox"
                id="rememberMe"
                name="rememberMe"
                tabindex="3"
                <#if login.rememberMe??>checked</#if>
              />
              <span class="hpc-checkmark"></span>
              ${msg("rememberMe")}
            </label>
          </#if>

          <#if realm.resetPasswordAllowed>
            <a href="${url.loginResetCredentialsUrl}" class="hpc-link" tabindex="5">
              ${msg("doForgotPassword")}
            </a>
          </#if>
        </div>

        <input type="hidden" id="id-hidden-input" name="credentialId"
          <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>

        <div class="hpc-form-group">
          <input
            type="submit"
            id="kc-login"
            class="hpc-btn-primary"
            value="${msg('doLogIn')}"
            tabindex="4"
          />
        </div>

      </form>

      <#-- ── Social Providers ── -->
      <#if social?? && social.providers?has_content>
        <div class="hpc-social-divider">
          <span>— Or Sign In With —</span>
        </div>
        <div class="hpc-social">
          <#list social.providers as p>
            <a href="${p.loginUrl}" class="hpc-social-btn">
              <#if p.iconClasses?has_content>
                <i class="${p.iconClasses!}" aria-hidden="true"></i>
              </#if>
              ${p.displayName!}
            </a>
          </#list>
        </div>
      </#if>

    </div><!-- /.hpc-login-wrap -->

    <script>
      function togglePassword() {
        var pwd = document.getElementById('password');
        var icon = document.getElementById('eye-icon');
        if (pwd.type === 'password') {
          pwd.type = 'text';
          icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
        } else {
          pwd.type = 'password';
          icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
        }
      }
    </script>

  <#elseif section = "info">
    <#-- no extra info panel -->
  </#if>

</@layout.registrationLayout>
