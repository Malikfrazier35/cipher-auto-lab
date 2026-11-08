/* The refundable deposit, shared by the booking page (/quote) and the Detail Menu booking (/menu).
   One Stripe Checkout Session (created by /api/create-checkout-session) drives two Stripe elements:
     1. Apple Pay / Google Pay buttons first (the Express Checkout Element),
     2. card and Cash App Pay below (the Payment Element).
   Card numbers go to Stripe only. Link's "use saved payment" is switched off here, because its
   one-time-code step slowed people down at the last screen.

   CALDeposit.mount({
     clientSecret, express: '#el', payment: '#el', theme: 'dark' | 'light',
     onAmount(text), onCanPay(bool), onWallets(bool), onPaid(), onError(message)
   }) -> { ready: Promise, pay(): Promise }                                              */
(function () {
  var BASE = { fontFamily: 'Inter, system-ui, sans-serif', borderRadius: '10px', spacingUnit: '4px', colorDanger: '#DC2626' };
  var THEMES = {
    dark: { theme: 'night', variables: Object.assign({}, BASE, {
        colorPrimary: '#A3E635', colorBackground: '#0B0E12', colorText: '#F0F4F8', colorTextSecondary: '#8B96A4', colorDanger: '#F87171' }),
      rules: { '.Input': { border: '1px solid #2A3139' }, '.AccordionItem': { border: '1px solid #2A3139' } } },
    light: { theme: 'stripe', variables: Object.assign({}, BASE, {
        colorPrimary: '#0B0E11', colorBackground: '#FFFFFF', colorText: '#0B0E11', colorTextSecondary: '#5D6772' }),
      rules: { '.Input': { border: '1.5px solid #E3E7E4', boxShadow: 'none' }, '.Input:focus': { border: '1.5px solid #0B0E11', boxShadow: '0 0 0 3px #EEF8D9' },
               '.AccordionItem': { border: '1.5px solid #E3E7E4', boxShadow: 'none' } } },
  };

  var stripe = null;

  function mount(o) {
    stripe = stripe || window.Stripe(window.STRIPE_PK);
    var theme = o.theme === 'light' ? 'light' : 'dark';
    var checkout = stripe.initCheckoutElementsSdk({
      clientSecret: o.clientSecret,
      elementsOptions: { appearance: THEMES[theme] },
    });
    var actions = null;

    checkout.on('change', function (s) {
      if (s && s.total && s.total.total && o.onAmount) o.onAmount(s.total.total.amount);
      if (o.onCanPay) o.onCanPay(!!(s && s.canConfirm));
    });

    function settle(promise) {
      return Promise.resolve(promise).then(function (res) {
        if (res && res.type === 'error') throw new Error(res.error && res.error.message);
        if (o.onPaid) o.onPaid();
        return true;
      }).catch(function (err) {
        if (o.onError) o.onError(err && err.message);
        return false;
      });
    }

    // 1. wallets first
    var express = null;
    if (o.express && document.querySelector(o.express)) {
      express = checkout.createExpressCheckoutElement({
        buttonHeight: 52,
        buttonType: { applePay: 'book', googlePay: 'book' },
        buttonTheme: theme === 'light' ? { applePay: 'black', googlePay: 'black' } : { applePay: 'white', googlePay: 'white' },
        layout: { maxColumns: 1, overflow: 'never' },
        paymentMethodOrder: ['apple_pay', 'google_pay'],
        // 'always' also offers Apple Pay in Chrome on a Mac (pay with the iPhone by QR code)
        paymentMethods: { applePay: 'always', googlePay: 'always', link: 'never', paypal: 'never', amazonPay: 'never', klarna: 'never' },
      });
      express.on('availablepaymentmethodschange', function (e) {
        if (o.onWallets) o.onWallets(!!(e && e.paymentMethods));
      });
      express.mount(o.express);
    }

    // 2. everything else below
    var payment = checkout.createPaymentElement({
      layout: { type: 'accordion', defaultCollapsed: false, radios: 'always', spacedAccordionItems: true },
      paymentMethodOrder: ['card', 'cashapp'],
      wallets: { applePay: 'never', googlePay: 'never', link: 'never' },
    });
    payment.mount(o.payment);

    var ready = checkout.loadActions().then(function (r) {
      if (!r || r.type !== 'success') throw new Error((r && r.error && r.error.message) || 'Payment could not load.');
      actions = r.actions;
      var s = actions.getSession();
      if (s && s.total && s.total.total && o.onAmount) o.onAmount(s.total.total.amount);
      if (express) express.on('confirm', function (event) {
        settle(actions.confirm({ expressCheckoutConfirmEvent: event, redirect: 'if_required' }));
      });
      return actions;
    });

    return {
      ready: ready,
      // the email is already on the session (customer_email), so it is not sent again here
      pay: function () { return actions ? settle(actions.confirm({ redirect: 'if_required' })) : Promise.resolve(false); },
    };
  }

  window.CALDeposit = { mount: mount };
})();
