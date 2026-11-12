/* ---------------------------------------------------------------
   Cipher Auto Lab — front-end configuration

   Put your Stripe PUBLISHABLE key below. It starts with pk_test_ or
   pk_live_ and is safe to expose in client code — that is what it is
   designed for. The SECRET key (sk_...) must NEVER appear in this file
   or anywhere else in this repo; it lives only in Vercel's environment
   variables as STRIPE_SECRET_KEY.

   This lives in its own file rather than inline in index.html because
   the Content-Security-Policy sets script-src 'self', which blocks all
   inline <script> blocks. An inline key would silently never run.
   --------------------------------------------------------------- */

window.STRIPE_PK = "pk_live_51UZZWSFV7MSauZaGG2VZqF1275Eqfiri4YgaZVgkBfvWOjkUBYhSkKRtzwGpjvmH1cF4OEYG0tX23SmhzA5UiVe000oRgvgucl";

/* Google address suggestions (js/address.js). Paste a Google Maps BROWSER key here,
   restricted in Google Cloud to:
     - Websites: cipherautolab.com/*, www.cipherautolab.com/*
     - APIs: Maps JavaScript API and Places API (New)
   Like the Stripe key above it is public by design; the website restriction is what
   stops anyone else using it. Leave it empty and the address boxes simply use the
   browser's own autofill. */
window.GMAPS_KEY = "";
