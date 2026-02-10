/**
 * ShareMe Dashboard — profile selection and share info forms
 */
(function () {
  'use strict';

  // ─── Config ─────────────────────────────────────────────────────────────
  var QR_BASE = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&bgcolor=F8FAFC&color=334155&data=';
  var SECTION_META = {
    personal: { title: 'Information to share', desc: 'Add the details you want to show when someone scans your QR code.' },
    professional: { title: 'Work details', desc: 'Add your professional work information to share.' },
    business: { title: 'Business details', desc: 'Add your business information to share.' },
    academics: { title: 'Academic details', desc: 'Add your education information to share.' }
  };

  // Section form config: { endpoint, getData, keysToMerge }
  var SECTION_SAVERS = {};

  // ─── State ──────────────────────────────────────────────────────────────
  var currentUser = null;
  var currentProfile = 'personal';

  // ─── DOM refs (cached after init) ───────────────────────────────────────
  var dom = {};

  // ─── Utilities ──────────────────────────────────────────────────────────
  function displayName(user) {
    return (user.display_name || user.first_name || user.username || user.email || 'User').trim() || 'User';
  }

  function isValidEmail(str) {
    if (!str || typeof str !== 'string') return false;
    var t = str.trim();
    return t.length > 0 && t.indexOf('@') > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  }

  function getEl(id) { return document.getElementById(id); }
  function val(id) { var el = getEl(id); return el ? el.value.trim() : ''; }

  function api(method, url, data) {
    return fetch(url, {
      method: method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined
    }).then(function (r) { return r.json(); });
  }

  // ─── Modal helpers ──────────────────────────────────────────────────────
  function openModal(modalEl) {
    modalEl.classList.add('open');
    modalEl.setAttribute('aria-hidden', 'false');
  }

  function closeShareModal() {
    dom.shareInfoModal.classList.remove('open');
    dom.shareInfoModal.setAttribute('aria-hidden', 'true');
    hideShareEmailError();
  }

  function closeAccountModal() {
    dom.accountModal.classList.remove('open');
    dom.accountModal.setAttribute('aria-hidden', 'true');
    hideAccountErrors();
  }

  function closeDeactivateModal() {
    dom.deactivateModal.classList.remove('open');
    dom.deactivateModal.setAttribute('aria-hidden', 'true');
    if (dom.deactivateEmailInput) dom.deactivateEmailInput.value = '';
    if (dom.deactivateEmailError) {
      dom.deactivateEmailError.style.display = 'none';
      dom.deactivateEmailError.textContent = '';
    }
    if (dom.deactivateEmailInput) dom.deactivateEmailInput.classList.remove('input-error');
  }

  function openDeactivateModal() {
    if (currentUser && currentUser.email) dom.deactivateEmailInput.value = '';
    hideDeactivateError();
    openModal(dom.deactivateModal);
  }

  function showDeactivateError(msg) {
    if (!dom.deactivateEmailError) return;
    dom.deactivateEmailError.textContent = msg || 'Email does not match this account.';
    dom.deactivateEmailError.style.display = 'block';
    dom.deactivateEmailInput.classList.add('input-error');
  }

  function hideDeactivateError() {
    if (dom.deactivateEmailError) {
      dom.deactivateEmailError.style.display = 'none';
      dom.deactivateEmailError.textContent = '';
    }
    if (dom.deactivateEmailInput) dom.deactivateEmailInput.classList.remove('input-error');
  }

  function showShareEmailError(msg) {
    dom.shareEmailError.textContent = msg || 'Please enter a valid email address.';
    dom.shareEmailError.style.display = 'block';
    dom.shareEmailInput.classList.add('input-error');
  }

  function hideShareEmailError() {
    dom.shareEmailError.style.display = 'none';
    dom.shareEmailInput.classList.remove('input-error');
  }

  function showAccountError(fieldId, msg) {
    var errEl = getEl('account-' + fieldId + '-error');
    var inputEl = getEl('account-' + fieldId);
    if (errEl && inputEl) {
      errEl.textContent = msg || '';
      errEl.style.display = msg ? 'block' : 'none';
      inputEl.classList.toggle('input-error', !!msg);
    }
  }

  function hideAccountErrors() {
    ['email', 'phone', 'username'].forEach(function (id) { showAccountError(id, ''); });
  }

  // ─── Success notification ───────────────────────────────────────────────
  var toastTimeout;
  function showSuccessNotification(message) {
    var toast = getEl('success-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function () {
      toast.classList.remove('visible');
    }, 3500);
  }

  // ─── Share info form: show / fill / save ────────────────────────────────
  function showSectionForm(section) {
    document.querySelectorAll('.share-section-form').forEach(function (form) {
      form.style.display = form.getAttribute('data-section') === section ? 'block' : 'none';
    });
    var meta = SECTION_META[section] || SECTION_META.personal;
    dom.shareInfoModalTitle.textContent = meta.title;
    dom.shareInfoModalDesc.textContent = meta.desc;
  }

  function fillShareForm(section) {
    var u = currentUser || {};
    var set = function (id, v) { var el = getEl(id); if (el) el.value = v || ''; };

    if (section === 'personal') {
      set('share-name-prefix', u.share_name_prefix);
      set('share-name', u.share_name);
      set('share-email', u.share_email || u.email);
      set('share-country-code', u.share_country_code || u.country_code || '+1');
      set('share-phone', u.share_phone || u.phone);
      set('share-street', u.share_street);
      set('share-city', u.share_city);
      set('share-state', u.share_state);
      set('share-postal', u.share_postal_code);
      hideShareEmailError();
    } else if (section === 'professional') {
      ['prof-employer-name', 'prof-employer-phone', 'prof-employer-address', 'prof-employee-title', 'prof-years-worked'].forEach(function (id) {
        set(id, u['prof_' + id.replace('prof-', '').replace(/-/g, '_')]);
      });
    } else if (section === 'business') {
      set('biz-name', u.biz_name);
      set('biz-description', u.biz_description);
      set('biz-address', u.biz_address);
      set('biz-website', u.biz_website);
      set('biz-phone', u.biz_phone);
      set('biz-create-date', u.biz_create_date);
      set('biz-social-facebook', u.biz_social_facebook);
      set('biz-social-instagram', u.biz_social_instagram);
      set('biz-social-twitter', u.biz_social_twitter);
      set('biz-social-tiktok', u.biz_social_tiktok);
    } else if (section === 'academics') {
      set('acad-education', u.acad_education);
      set('acad-graduated-from', u.acad_graduated_from);
      set('acad-field-pursued', u.acad_field_pursued);
      set('acad-highest-level', u.acad_highest_level);
      set('acad-years-attended', u.acad_years_attended);
      set('acad-currently-enrolled', u.acad_currently_enrolled);
    }
  }

  function mergeUser(data, keys) {
    if (currentUser && keys) keys.forEach(function (k) { currentUser[k] = data[k]; });
  }

  function savePersonalInfo() {
    var data = {
      share_name_prefix: getEl('share-name-prefix').value,
      share_name: val('share-name'),
      share_email: val('share-email'),
      share_country_code: getEl('share-country-code').value,
      share_phone: val('share-phone'),
      share_street: val('share-street'),
      share_city: val('share-city'),
      share_state: val('share-state'),
      share_postal_code: val('share-postal')
    };
    return api('PUT', '/api/me/share-info', data).then(function (res) {
      if (res.ok) mergeUser(data, Object.keys(data));
      return res;
    });
  }

  function saveSectionForm(section) {
    var cfg = SECTION_SAVERS[section];
    if (!cfg) return Promise.reject(new Error('Unknown section'));
    var data = cfg.getData();
    return api('PUT', cfg.endpoint, data).then(function (res) {
      if (res.ok) mergeUser(data, cfg.keys);
      return res;
    });
  }

  function getProfessionalData() {
    return {
      prof_employer_name: val('prof-employer-name'),
      prof_employer_phone: val('prof-employer-phone'),
      prof_employer_address: val('prof-employer-address'),
      prof_employee_title: val('prof-employee-title'),
      prof_years_worked: val('prof-years-worked')
    };
  }
  function getBusinessData() {
    return {
      biz_name: val('biz-name'),
      biz_description: val('biz-description'),
      biz_address: val('biz-address'),
      biz_website: val('biz-website'),
      biz_phone: val('biz-phone'),
      biz_create_date: getEl('biz-create-date').value || '',
      biz_social_facebook: val('biz-social-facebook'),
      biz_social_instagram: val('biz-social-instagram'),
      biz_social_twitter: val('biz-social-twitter'),
      biz_social_tiktok: val('biz-social-tiktok')
    };
  }
  function getAcademicsData() {
    return {
      acad_education: val('acad-education'),
      acad_graduated_from: val('acad-graduated-from'),
      acad_field_pursued: val('acad-field-pursued'),
      acad_highest_level: getEl('acad-highest-level').value,
      acad_years_attended: val('acad-years-attended'),
      acad_currently_enrolled: val('acad-currently-enrolled')
    };
  }

  SECTION_SAVERS.professional = { endpoint: '/api/me/professional-info', getData: getProfessionalData, keys: ['prof_employer_name', 'prof_employer_phone', 'prof_employer_address', 'prof_employee_title', 'prof_years_worked'] };
  SECTION_SAVERS.business = { endpoint: '/api/me/business-info', getData: getBusinessData, keys: ['biz_name', 'biz_description', 'biz_address', 'biz_website', 'biz_phone', 'biz_create_date', 'biz_social_facebook', 'biz_social_instagram', 'biz_social_twitter', 'biz_social_tiktok'] };
  SECTION_SAVERS.academics = { endpoint: '/api/me/academics-info', getData: getAcademicsData, keys: ['acad_education', 'acad_graduated_from', 'acad_field_pursued', 'acad_highest_level', 'acad_years_attended', 'acad_currently_enrolled'] };

  // ─── QR & funnel ────────────────────────────────────────────────────────
  function setQrFor(profile) {
    var data = 'ShareMe-' + profile.charAt(0).toUpperCase() + profile.slice(1);
    dom.qrImg.src = QR_BASE + encodeURIComponent(data);
    dom.qrImg.alt = 'QR code for ' + profile + ' profile';
  }

  function setEditLinkText(profile) {
    var label = profile.charAt(0).toUpperCase() + profile.slice(1);
    getEl('share-info-edit-link').textContent = 'Edit ' + label + ' information';
  }

  // ─── Event handlers ─────────────────────────────────────────────────────
  function handleSaveShareInfo(e) {
    e.preventDefault();
    hideShareEmailError();
    var emailVal = val('share-email');
    if (emailVal && !isValidEmail(emailVal)) {
      showShareEmailError('Please enter a valid email address.');
      return;
    }
    savePersonalInfo()
      .then(function (res) {
        if (res.ok) {
          showSuccessNotification('Personal information saved successfully');
          closeShareModal();
        } else showShareEmailError(res.error || 'Failed to save.');
      })
      .catch(function () { showShareEmailError('Unable to reach server. Please try again.'); });
  }

  var SECTION_SUCCESS_MESSAGES = {
    professional: 'Professional information saved successfully',
    business: 'Business information saved successfully',
    academics: 'Academic information saved successfully'
  };
  function handleSaveSection(section) {
    return function (e) {
      e.preventDefault();
      saveSectionForm(section)
        .then(function (res) {
          if (res.ok) {
            showSuccessNotification(SECTION_SUCCESS_MESSAGES[section] || 'Information saved successfully');
            closeShareModal();
          } else alert(res.error || 'Failed to save.');
        })
        .catch(function () { alert('Unable to reach server. Please try again.'); });
    };
  }

  function handleSaveAccount(e) {
    e.preventDefault();
    hideAccountErrors();
    var emailVal = val('account-email');
    var phoneVal = val('account-phone');
    var usernameVal = val('account-username');
    var ok = true;
    if (!emailVal || !isValidEmail(emailVal)) { showAccountError('email', 'Please enter a valid email address.'); ok = false; }
    if (!phoneVal || phoneVal.replace(/\D/g, '').length < 7) { showAccountError('phone', 'Phone number is required (at least 7 digits).'); ok = false; }
    if (!usernameVal || usernameVal.length < 2) { showAccountError('username', 'Username is required (at least 2 characters).'); ok = false; }
    if (!ok) return;

    var data = {
      email: emailVal,
      first_name: val('account-first-name'),
      last_name: val('account-last-name'),
      country_code: getEl('account-country-code').value,
      phone: phoneVal,
      username: usernameVal,
      display_name: val('account-display-name')
    };
    api('PUT', '/api/me/account', data)
      .then(function (res) {
        if (res.ok) {
          mergeUser(data, ['email', 'first_name', 'last_name', 'country_code', 'phone', 'username', 'display_name']);
          dom.displayNameEl.textContent = displayName(currentUser);
          showSuccessNotification('Account settings saved successfully');
          closeAccountModal();
        } else showAccountError('email', res.error || 'Failed to save.');
      })
      .catch(function () { showAccountError('email', 'Unable to reach server. Please try again.'); });
  }

  // ─── Init ───────────────────────────────────────────────────────────────
  function cacheDom() {
    dom.qrImg = getEl('dashboard-qr');
    dom.navGuest = getEl('nav-guest');
    dom.navAuth = getEl('nav-auth');
    dom.displayNameEl = getEl('user-display-name');
    dom.shareInfoModal = getEl('share-info-modal');
    dom.shareInfoModalTitle = getEl('share-info-modal-title');
    dom.shareInfoModalDesc = getEl('share-info-modal-desc');
    dom.shareEmailInput = getEl('share-email');
    dom.shareEmailError = getEl('share-email-error');
    dom.accountModal = getEl('account-modal');
    dom.deactivateModal = getEl('deactivate-modal');
    dom.deactivateEmailInput = getEl('deactivate-email');
    dom.deactivateEmailError = getEl('deactivate-email-error');
    dom.upgradeModal = getEl('upgrade-modal');
    dom.upgradePaymentError = getEl('upgrade-payment-error');
  }

  function bindEvents() {
    getEl('nav-logout').addEventListener('click', function (e) {
      e.preventDefault();
      fetch('/api/logout', { method: 'POST', credentials: 'include' })
        .then(function () { window.location.href = 'sharemelandingpage.html'; });
    });

    getEl('settings-icon').addEventListener('click', function (e) {
      e.preventDefault();
      var u = currentUser || {};
      getEl('account-country-code').value = u.country_code || '+1';
      getEl('account-email').value = u.email || '';
      getEl('account-first-name').value = u.first_name || '';
      getEl('account-last-name').value = u.last_name || '';
      getEl('account-phone').value = u.phone || '';
      getEl('account-username').value = u.username || '';
      getEl('account-display-name').value = u.display_name || '';
      hideAccountErrors();
      openModal(dom.accountModal);
    });

    getEl('account-cancel').addEventListener('click', closeAccountModal);
    dom.accountModal.querySelector('form').addEventListener('submit', handleSaveAccount);

    getEl('deactivate-account-link').addEventListener('click', function (e) {
      e.preventDefault();
      closeAccountModal();
      openDeactivateModal();
    });

    getEl('deactivate-cancel').addEventListener('click', closeDeactivateModal);
    getEl('deactivate-form').addEventListener('submit', function (e) {
      e.preventDefault();
      hideDeactivateError();
      var emailVal = val('deactivate-email');
      if (!emailVal || !isValidEmail(emailVal)) {
        showDeactivateError('Please enter a valid email address.');
        return;
      }
      api('POST', '/api/me/deactivate', { email: emailVal })
        .then(function (res) {
          if (res.ok) {
            closeDeactivateModal();
            window.location.href = 'sharemelandingpage.html';
          } else {
            showDeactivateError(res.error || 'Deactivation failed.');
          }
        })
        .catch(function () {
          showDeactivateError('Unable to reach server. Please try again.');
        });
    });

    getEl('share-info-edit-link').addEventListener('click', function (e) {
      e.preventDefault();
      showSectionForm(currentProfile);
      fillShareForm(currentProfile);
      openModal(dom.shareInfoModal);
    });

    getEl('share-info-cancel').addEventListener('click', closeShareModal);
    document.querySelectorAll('.share-section-cancel').forEach(function (btn) {
      btn.addEventListener('click', closeShareModal);
    });

    var upgradeCancelBtn = getEl('upgrade-modal-cancel');
    if (upgradeCancelBtn && dom.upgradeModal) {
      upgradeCancelBtn.addEventListener('click', function () {
        dom.upgradeModal.classList.remove('open');
        dom.upgradeModal.setAttribute('aria-hidden', 'true');
        if (dom.upgradePaymentError) { dom.upgradePaymentError.style.display = 'none'; dom.upgradePaymentError.textContent = ''; }
      });
    }
    var upgradeForm = getEl('upgrade-payment-form');
    if (upgradeForm) {
      upgradeForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (dom.upgradePaymentError) { dom.upgradePaymentError.style.display = 'none'; dom.upgradePaymentError.textContent = ''; }
        var cardNumber = (getEl('upgrade-card-number') && getEl('upgrade-card-number').value) ? getEl('upgrade-card-number').value.replace(/\s/g, '') : '';
        var expiration = (getEl('upgrade-expiration') && getEl('upgrade-expiration').value) ? getEl('upgrade-expiration').value.trim() : '';
        var cvv = (getEl('upgrade-cvv') && getEl('upgrade-cvv').value) ? getEl('upgrade-cvv').value.trim() : '';
        if (!cardNumber || !expiration || !cvv) {
          if (dom.upgradePaymentError) { dom.upgradePaymentError.textContent = 'Please enter card number, expiration, and CVV.'; dom.upgradePaymentError.style.display = 'block'; }
          return;
        }
        var submitBtn = getEl('upgrade-modal-submit');
        if (submitBtn) submitBtn.disabled = true;
        fetch('/api/checkout/mock-complete', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ card_number: cardNumber, expiration: expiration, cvv: cvv })
        })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res.ok) {
              window.location.href = 'sharemedashboard.html?upgrade=success';
            } else {
              if (dom.upgradePaymentError) { dom.upgradePaymentError.textContent = res.error || 'Payment failed.'; dom.upgradePaymentError.style.display = 'block'; }
              if (submitBtn) submitBtn.disabled = false;
            }
          })
          .catch(function () {
            if (dom.upgradePaymentError) { dom.upgradePaymentError.textContent = 'Unable to process. Please try again.'; dom.upgradePaymentError.style.display = 'block'; }
            if (submitBtn) submitBtn.disabled = false;
          });
      });
    }

    dom.shareEmailInput.addEventListener('blur', function () {
      var v = val('share-email');
      if (v && !isValidEmail(v)) showShareEmailError('Please enter a valid email address.');
      else hideShareEmailError();
    });

    getEl('share-info-form').addEventListener('submit', handleSaveShareInfo);
    getEl('professional-info-form').addEventListener('submit', handleSaveSection('professional'));
    getEl('business-info-form').addEventListener('submit', handleSaveSection('business'));
    getEl('academics-info-form').addEventListener('submit', handleSaveSection('academics'));

    document.querySelectorAll('.btn-funnel').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.btn-funnel').forEach(function (b) { b.classList.remove('selected'); });
        this.classList.add('selected');
        currentProfile = this.getAttribute('data-funnel');
        setQrFor(currentProfile);
        setEditLinkText(currentProfile);
      });
    });
  }

  function showUpgradeSuccessToast() {
    var toast = document.getElementById('success-toast') || (function () {
      var t = document.createElement('div');
      t.id = 'success-toast';
      t.className = 'success-toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
      return t;
    })();
    toast.textContent = "You're now on Pro!";
    toast.classList.add('visible');
    setTimeout(function () { toast.classList.remove('visible'); }, 4000);
  }

  function init() {
    cacheDom();
    setQrFor('personal');
    setEditLinkText('personal');
    bindEvents();

    var params = new URLSearchParams(window.location.search);
    if (params.get('upgrade') === 'success') {
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(showUpgradeSuccessToast, 300);
    }

    fetch('/api/me', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok && data.user) {
          currentUser = data.user;
          dom.navGuest.style.display = 'none';
          dom.navAuth.style.display = '';
          dom.displayNameEl.textContent = displayName(data.user);
          // Free tier: hide Professional, Business, Academics buttons and center Personal
          var plan = (currentUser.plan || 'free').toLowerCase();
          var funnelContainer = document.querySelector('.funnel-buttons');
          document.querySelectorAll('.btn-funnel.pro-tier-only').forEach(function (btn) {
            btn.style.display = plan === 'pro' ? '' : 'none';
          });
          if (funnelContainer) {
            funnelContainer.classList.toggle('funnel-buttons--free-tier', plan !== 'pro');
          }
          var upgradeWrap = document.getElementById('funnel-upgrade-wrap');
          var upgradeLink = document.getElementById('dashboard-upgrade-link');
          if (plan === 'free' && upgradeWrap && upgradeLink) {
            upgradeWrap.style.display = '';
            upgradeLink.addEventListener('click', function (e) {
              e.preventDefault();
              if (dom.upgradeModal) {
                if (dom.upgradePaymentError) { dom.upgradePaymentError.style.display = 'none'; dom.upgradePaymentError.textContent = ''; }
                dom.upgradeModal.classList.add('open');
                dom.upgradeModal.setAttribute('aria-hidden', 'false');
              }
            });
          } else if (upgradeWrap) {
            upgradeWrap.style.display = 'none';
          }
        } else {
          window.location.replace('sharemelandingpage.html');
        }
      })
      .catch(function () {
        window.location.replace('sharemelandingpage.html');
      });
  }

  init();
})();
