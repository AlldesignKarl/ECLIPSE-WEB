// @ts-nocheck
// Alldesign Karl — tienda online.
//
// Catálogo, fichas, cesta y pago con Wix Headless (la misma tienda de Wix que
// ya estaba montada). CLIENT_ID es el identificador público del cliente OAuth
// de Wix para visitantes: no es una clave secreta y está pensado para ir en el
// navegador. El pago se hace en la página segura de Wix.
import './shop.css';
import { CONTACT, applyContact } from './contact';
// Copia de los productos de Wix (10/10/2026): se ven al instante y siguen
// viéndose si Wix tarda en responder. Al cargar, se sustituyen por los de Wix.
import SNAPSHOT from './shop-products.js';
import { MIN_ORDER, validateRegistro, normId, round2 } from './wholesale';

applyContact();

(function () {
  "use strict";

  var CLIENT_ID = "ea222fb8-f58c-44ac-ad80-daf0f8bfc11c";
  var STORES_APP_ID = "215238eb-22a5-4c36-9e7b-e7c08025e04e";
  var API = "https://www.wixapis.com";
  var TOKEN_KEY = "adk.tokens.v1";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .split("&").join("&amp;")
      .split("<").join("&lt;")
      .split(">").join("&gt;")
      .split('"').join("&quot;");
  }
  function money(amount, currency) {
    var n = Number(amount);
    if (!isFinite(n)) return "";
    try {
      return new Intl.NumberFormat("es-ES", { style: "currency", currency: currency || "EUR" }).format(n);
    } catch (e) {
      return n.toFixed(2) + " €";
    }
  }
  // Las imágenes del carrito pueden llegar como wix:image://v1/<id>/<nombre>.
  function imgUrl(u) {
    if (!u) return "";
    if (u.indexOf("wix:image://v1/") === 0) {
      var rest = u.slice("wix:image://v1/".length);
      return "https://static.wixstatic.com/media/" + rest.split("/")[0];
    }
    return u;
  }
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  /* ---------------- sesión de visitante (Wix Headless) ---------------- */
  var tokens = null;
  try { tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); } catch (e) { tokens = null; }

  function saveTokens(data) {
    tokens = {
      access: data.access_token,
      refresh: data.refresh_token,
      exp: Date.now() + (Number(data.expires_in || 14400) - 120) * 1000
    };
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens)); } catch (e) {}
  }
  function requestToken(body) {
    return fetch(API + "/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error("token " + r.status);
      return r.json();
    }).then(saveTokens);
  }
  var tokenPromise = null;
  function ensureToken() {
    if (tokens && tokens.access && tokens.exp > Date.now()) return Promise.resolve();
    if (tokenPromise) return tokenPromise;
    var p;
    if (tokens && tokens.refresh) {
      // Renovar conserva la misma cesta; solo si falla se crea un visitante nuevo.
      p = requestToken({ clientId: CLIENT_ID, grantType: "refresh_token", refreshToken: tokens.refresh })
        .catch(function () { return requestToken({ clientId: CLIENT_ID, grantType: "anonymous" }); });
    } else {
      p = requestToken({ clientId: CLIENT_ID, grantType: "anonymous" });
    }
    tokenPromise = p.then(function () { tokenPromise = null; }, function (e) { tokenPromise = null; throw e; });
    return tokenPromise;
  }
  function api(method, path, body, retried) {
    return ensureToken().then(function () {
      return fetch(API + path, {
        method: method,
        headers: { "Content-Type": "application/json", "Authorization": tokens.access },
        body: body ? JSON.stringify(body) : undefined
      });
    }).then(function (r) {
      if (r.status === 401 && !retried) {
        tokens.exp = 0;
        return api(method, path, body, true);
      }
      return r.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : {}; } catch (e) { data = { raw: txt }; }
        if (!r.ok) {
          var err = new Error((data && data.message) || ("HTTP " + r.status));
          err.status = r.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  /* ---------------- catálogo ---------------- */
  var products = [];
  var activeFilter = "all";

  function mainImage(p) {
    return p && p.media && p.media.main && p.media.main.image && p.media.main.image.url || "";
  }
  function allImages(p) {
    var list = [];
    var main = mainImage(p);
    if (main) list.push(main);
    var items = p && p.media && p.media.itemsInfo && p.media.itemsInfo.items || [];
    items.forEach(function (it) {
      var u = it && it.image && it.image.url;
      if (u && list.indexOf(u) === -1) list.push(u);
    });
    return list;
  }
  function sized(u, w) {
    if (!u || u.indexOf("static.wixstatic.com/media/") === -1) return u;
    var name = u.split("/media/")[1].split("/")[0];
    return "https://static.wixstatic.com/media/" + name + "/v1/fill/w_" + w + ",h_" + Math.round(w * 1.25) + ",al_c,q_85,enc_auto/" + name;
  }
  // Productos que solo se venden en packs (p. ej. "Pack de 5"): se compran de N en N.
  var PACKS = { "f4d56313-6834-4f16-93d0-f07d02b35f0a": 5 };
  // Los precios guardados en Wix son sin IVA; el 21 % se suma al pagar (igual que lo calcula Wix, línea a línea).
  // Las tarjetas regalo no llevan IVA.
  var VAT = 0.21;
  function net(n) { return Math.round(Number(n) * 100) / 100; }
  function vatOf(n) { return Math.round(Number(n) * VAT * 100) / 100; }
  function gross(n) { return Math.round((net(n) + vatOf(n)) * 100) / 100; }
  function packOf(p) {
    if (!p) return 1;
    if (PACKS[p.id]) return PACKS[p.id];
    var r = (p.ribbon && p.ribbon.name || "").toLowerCase();
    var i = r.indexOf("pack de ");
    var n = i === -1 ? 0 : parseInt(r.slice(i + 8), 10);
    return n > 1 ? n : 1;
  }
  function packOfItem(id) {
    return PACKS[id] || packOf(findProduct(id));
  }
  function priceOf(p) {
    var r = p.actualPriceRange || {};
    var pk = packOf(p);
    var min = r.minValue && net(r.minValue.amount * pk);
    var max = r.maxValue && net(r.maxValue.amount * pk);
    var cur = p.currency || "EUR";
    var cmp = p.compareAtPriceRange && p.compareAtPriceRange.minValue && net(p.compareAtPriceRange.minValue.amount * pk);
    var html = "";
    if (cmp && Number(cmp) > Number(min)) html += "<s>" + esc(money(cmp, cur)) + "</s>";
    html += (max && Number(max) > Number(min) ? "Desde " : "") + esc(money(min, cur)) + '<span class="vat">sin IVA</span>';
    return html;
  }
  function inStock(p) {
    return !(p.inventory && p.inventory.availabilityStatus === "OUT_OF_STOCK");
  }

  function skeleton() {
    var html = "";
    for (var i = 0; i < 6; i++) html += '<div class="card skeleton"><div class="card-media"></div><div class="card-info"><span></span></div></div>';
    $("grid").innerHTML = html;
  }

  function categoriesOf() {
    var seen = {};
    var list = [];
    products.forEach(function (p) {
      var cats = p.directCategoriesInfo && p.directCategoriesInfo.categories || [];
      cats.forEach(function (c) {
        if (c && c.id && !seen[c.id] && c.name) { seen[c.id] = 1; list.push({ id: c.id, name: c.name }); }
      });
    });
    return list;
  }

  function renderToolbar() {
    var cats = categoriesOf();
    var bar = $("toolbar");
    if (cats.length < 2) { bar.hidden = true; return; }
    var html = '<button class="chip" data-filter="all" aria-pressed="' + (activeFilter === "all") + '">Todo</button>';
    cats.forEach(function (c) {
      html += '<button class="chip" data-filter="' + esc(c.id) + '" aria-pressed="' + (activeFilter === c.id) + '">' + esc(c.name) + "</button>";
    });
    bar.innerHTML = html;
    bar.hidden = false;
  }

  function visibleProducts() {
    if (activeFilter === "all") return products;
    return products.filter(function (p) {
      var cats = p.directCategoriesInfo && p.directCategoriesInfo.categories || [];
      return cats.some(function (c) { return c.id === activeFilter; });
    });
  }

  function cardHtml(p, i) {
    var imgs = allImages(p);
    var media = imgs[0]
      ? '<img src="' + esc(sized(imgs[0], 720)) + '" alt="' + esc(p.name) + '" loading="lazy">' +
        (imgs[1] ? '<img class="alt" src="' + esc(sized(imgs[1], 720)) + '" alt="" loading="lazy">' : "")
      : "";
    var ribbon = p.ribbon && p.ribbon.name ? '<span class="ribbon caps">' + esc(p.ribbon.name) + "</span>" : "";
    var sold = inStock(p) ? "" : '<span class="soldout caps">Agotado</span>';
    return '<button class="card reveal" type="button" data-id="' + esc(p.id) + '" style="--d:' + (i % 3) + '">' +
      '<div class="card-media">' + media + ribbon + sold + '<span class="card-quick caps">Ver pieza</span></div>' +
      '<div class="card-info"><span class="card-name">' + esc(p.name) + '</span><span class="card-price">' + priceOf(p) + "</span></div>" +
      "</button>";
  }

  function renderGrid() {
    var list = visibleProducts();
    var grid = $("grid");
    grid.classList.toggle("n1", list.length === 1);
    grid.classList.toggle("n2", list.length === 2);
    grid.innerHTML = list.map(cardHtml).join("");
    observeReveals($("grid"));
  }

  function showProducts(list) {
    products = list;
    $("empty").hidden = true;
    renderToolbar();
    renderGrid();
  }

  function loadProducts() {
    showProducts(SNAPSHOT.slice());
    var body = {
      query: { cursorPaging: { limit: 100 } },
      fields: ["CURRENCY", "PLAIN_DESCRIPTION", "MEDIA_ITEMS_INFO", "DIRECT_CATEGORIES_INFO"]
    };
    return api("POST", "/stores/v3/products/query", body).then(function (data) {
      products = (data.products || []).filter(function (p) { return p.visible !== false; });
      if (!products.length) {
        $("grid").innerHTML = "";
        $("empty").hidden = false;
        observeReveals($("colecciones"));
        return;
      }
      $("empty").hidden = true;
      renderToolbar();
      renderGrid();
      refreshCartPrices();
    }).catch(function () {
      // Sin respuesta de Wix se quedan los productos de la copia.
    });
  }

  $("toolbar").addEventListener("click", function (e) {
    var b = e.target.closest("[data-filter]");
    if (!b) return;
    activeFilter = b.getAttribute("data-filter");
    renderToolbar();
    renderGrid();
  });
  $("grid").addEventListener("click", function (e) {
    var c = e.target.closest("[data-id]");
    if (c) openProduct(c.getAttribute("data-id"));
  });

  /* ---------------- ficha de producto ---------------- */
  var current = null;
  var variants = [];
  var variantsFailed = false;
  var picked = {};
  var texts = {};
  var qty = 1;

  function textMods() {
    return (current && current.modifiers || []).filter(function (m) { return m.modifierRenderType === "FREE_TEXT"; });
  }
  // Vistas previas: la foto real de la pieza con los colores elegidos (una por color o combinación).
  // Clave: posición del color en COLOR_ORDER; en las de dos colores, el 1.º son las flores y el 2.º las ramitas.
  var COLOR_ORDER = ["Rojo", "Naranja", "Amarillo", "Verde claro", "Verde oscuro", "Azul claro", "Azul oscuro", "Morado", "Rosa claro", "Rosa oscuro"];
  var PREVIEWS = {
    "2435d64f-e41d-4995-b730-f3a8cc13ed5a": "0:6d53c1625e6642778f2aaf663005bc94,01:38dfeeb21c8948c3afae3292bbcfbe81,02:ae339e50d6f04ce48248048ca40b08fa,03:21e83ce2e7024e49b2875fbfb4068fc7,04:679e0b05a9c04e148ddefba35528abdf,05:f656959a4b824917ad2e8994eb57e4b3,06:2d34f7b10d0149088609591948585ea1,07:0cbad9ebdd51487091f0b56f41166bca,08:1e9709962c7c4c7890d2f62a7656a87a,09:7f07b16f26f148c29f465f92f644fb8e,1:2712d6936a69490e9c5fa7944257f8e6,10:3e07cdb3449c4dd0b69d4bfee959ffc8,12:c2a1e96a26694d0f942168ffe204efef,13:5f61b235100d4957a0afa2c065b09531,14:9b98d519b59c4023a1944072be918239,15:eb91574229054cf4be8460ddb319c3b3,16:11cd2d98bc854db5b57d84e9c822a020,17:86f25f1ea842475fbce7c3c5a22f37b8,18:0c10df16dfde40ccb509dc4c8c1b365b,19:6148a8ae6da34479bfd794b1a861bb78,2:10d73cc047c0414db9845f8309595a2c,20:2cb66a85ad6d4b48a44cdeff319d7bab,21:2c8f9d33c2cc4cb59c075fe5a3b5897d,23:324df6e920cb48ebb214430c18e75478,24:1c00ce695cbd4721bb58d9e63e9eca84,25:f47cddc608574daf8bbd686ad2b5a3e6,26:cc356bb45ad049549920d07ca247995c,27:92ed25ae7fa1495592702dcc5fdabff9,28:eeaf3bc9ed014255a11cd65feaec9c06,29:38f8c84ebe244dfea3ba9344aec55470,3:e9876b7dd8514aadb3b19f50a3e30521,30:d4210461def9465f8934ed27d8ed0f9e,31:96961050081b48aabdba3ef3a3a1f594,32:c60894e23a6e46eb90dcf7744dff2cc4,34:d8cd0ab5ecc94068afd49ab1bfeb1f79,35:46270f9b7c884a6eae28051e5f648d5f,36:8f0db4ad4b0e40b5a9f3589e2973589a,37:ad9b713722ce4c6ca60ab00246851f3e,38:542b27bb207643319b27c35c2310e6c5,39:797d0ffb6b8842caad029700e650ffb0,4:d030fc5005cd46328f6389777dd08b0c,40:87eaaa48c6e244d8b5c72000d6d8b11f,41:7b0ca23d140e43f78c175fad25b855bc,42:2794bac1eac54757b94405174aad2126,43:fe159f6d0f694ed2813317d2b04ab5d5,45:15b3b06c65cf4b92a4d204680f087896,46:98d575e4d87d4463ae971d9073ec738c,47:c35669d8db424280bbe6fa559b323690,48:f5f1f5a59f66403099ac4f173218498c,49:8edf17a652aa4f32b345a0c2e7a0b529,5:363261acd06d44b8bc11b192b9d65c43,50:0cca2652bb5e4bb3bd96ac6a87cc6f83,51:ecbc7e90baaa44ea90aaea06b3ce4fdd,52:9f4852e9b9fc400980bd5a97b1752f40,53:7ba3a6ad9ffe4a158b1751919884bea5,54:ab6ff2ea45a048eaa23f7b13f6928e0e,56:dce7af8d0bc24137ba48240499ce06bc,57:8a9b79f1463245fd93ab9af853082423,58:e3b2540520e64e9dac34ecd707597a4d,59:3e8033808d2b4cb0b79666d704cdd2c4,6:f952a07021314e3b9e4220ade25a5d4c,60:c928fc56de0a4f879c4e09295312ff1c,61:1eb42046ccfa404890c905be943b6f89,62:40059c2c859a47408242183877d9e040,63:604c248ec1584e8e9fb9f08ea9b7f287,64:f7d8fb1aa2df4dd6854572982312448f,65:b7b23088e1214250a7d5496bbf259aea,67:0d7e172caa834995aa9d92832fc1d235,68:9ca3f9646afb40ca89bfc3beff0d71ae,69:f386e2e965274930a60b715ea5664052,7:8ad384154c0d4439825ff31aa5560c72,70:69ee26cb18f84c18a602c59cfc83aa0f,71:f1e487d6359e4fc08c2c8fbb04388855,72:a2ea908598a644a7a6af4170512829b2,73:8a9cfae0c846458eabf6b5cf9d9804a9,74:fdf8c38a29b849d5ac4584d48e970383,75:b27b8e1092e5400d89332ffe8fcf7441,76:dc0889c80797455eb1cde0f9e9a629ad,78:8a066b5aeac74725a1cb5a51bdd1a39f,79:a91fc8f85e134d4ea8e8bcd2747de0f7,8:fccad0ffbef04b1b99fdf6ea8dc7f2cb,80:c843eaf52ec54283b1a99d25b9b2a881,81:68764e7294984f2880660362b6cae6fd,82:42f974f1aa134cd38e40ba9961072d14,83:033335b826a041fba4fae488f57838df,84:c74224d4aa194ac2a0349cfe7b79eaa2,85:0355c97ea39c4bcaab2df914f968670c,86:d7bc3f4aee1e440ab568b77fe29b8a2a,87:988cfe719c4e4a889f26d15855dfaa51,89:6ff13f3b969c469b9b409b1d6b42a639,9:afdcfa67a2984a87b9ee425cab44ebb1,90:85369bc49fbb416d9b592db5249c0629,91:48ad02f7c9ac42d8a73bbe8b082048ab,92:85e343ff06f24bdb951f69c582acf2e5,93:042a66c82a1949c084d2a315a859b0c5,94:56836f0c6a44429bac58c71a23f8bae6,95:09141bda3a3146e3a8fe5beebcda71ea,96:a1c2d0e3559f4fbc9dfb14d349e03a9c,97:3b16d664c90b4cfdb9a0e47aa795a945,98:61bf45d4e4424e04b3d927728adacc63",
    "1ae0ea11-9aec-46e5-b2a1-33d8ce70b33b": "0:6717f14f27844bebb7d582d5832558cc,1:7348cdcb27c14cdb839f4d37fde0d572,2:342f33c8b0d048a482a9d22dba252fcc,3:0cb8ae7826eb4c659bdeadb63e201fb0,4:5061a8ae3564461ea1455d346fd0695e,5:354b7fd8ef78413ca2d568bbc4c5dfee,6:2c03c69c18184aed9e16597019e1ee27,7:23b45542e25341c6bdc87616986f7d11,8:69ccd3ed132a480192f6d4a43320398e,9:81c630b8edd74ff2886e4801b63af180"
  };
  var previewMaps = {};
  function previewMap(id) {
    if (!PREVIEWS[id]) return null;
    if (!previewMaps[id]) {
      var m = {};
      PREVIEWS[id].split(",").forEach(function (p) {
        var kv = p.split(":");
        m[kv[0]] = "https://static.wixstatic.com/media/43eaa1_" + kv[1] + "~mv2.jpg";
      });
      previewMaps[id] = m;
    }
    return previewMaps[id];
  }
  function colorOpt() {
    var os = current && current.options || [];
    for (var i = 0; i < os.length; i++) if (os[i].optionRenderType === "SWATCH_CHOICES") return os[i];
    return null;
  }
  function previewFor(firstId, secondId) {
    var m = current && previewMap(current.id);
    var o = colorOpt();
    if (!m || !o || !firstId) return "";
    var a = COLOR_ORDER.indexOf(choiceName(o, firstId));
    var b = secondId ? COLOR_ORDER.indexOf(choiceName(o, secondId)) : -1;
    if (a < 0) return "";
    return m[b >= 0 ? String(a) + b : String(a)] || m[String(a)] || "";
  }
  function currentPreview() {
    var o = colorOpt();
    return o ? previewFor(picked[o.id], pairOpt() ? second : null) : "";
  }
  // Muestra la vista previa (o la foto original si aún no hay color elegido).
  function updatePreview() {
    if (!current || !previewMap(current.id)) return;
    var u = currentPreview();
    $("pd-tag").hidden = !u;
    var imgs = allImages(current);
    if (u) setMainImage(u, 0); else if (imgs[0]) setMainImage(imgs[0], 0);
  }
  // Al pasar por un color, se descarga ya su foto para que el cambio sea instantáneo.
  function preloadFor(choiceId) {
    var o = colorOpt();
    if (!o) return;
    var u = "";
    if (pairOpt() && picked[o.id] && picked[o.id] !== choiceId && !second) u = previewFor(picked[o.id], choiceId);
    else u = previewFor(choiceId, null);
    if (u) { var im = new Image(); im.src = sized(u, 900); }
  }
  // Productos de dos colores: el primero es la variante y el segundo se guarda en el campo "Segundo color".
  var second = null;
  function pairMod() {
    var ms = textMods();
    for (var i = 0; i < ms.length; i++) if ((ms[i].name || "").toLowerCase().indexOf("segundo color") !== -1) return ms[i];
    return null;
  }
  function pairOpt() {
    if (!pairMod()) return null;
    var os = current.options || [];
    for (var i = 0; i < os.length; i++) if (os[i].optionRenderType === "SWATCH_CHOICES") return os[i];
    return null;
  }
  function choiceName(o, id) {
    var cs = o && o.choicesSettings && o.choicesSettings.choices || [];
    for (var i = 0; i < cs.length; i++) if (cs[i].choiceId === id) return cs[i].name || "";
    return "";
  }
  function syncSecond() {
    var pm = pairMod();
    if (pm) texts[modKey(pm)] = second ? choiceName(pairOpt(), second) : "";
  }
  function modKey(m) {
    return m.freeTextSettings && m.freeTextSettings.key || m.key || m.name;
  }
  function modMax(m) {
    return m.freeTextSettings && Number(m.freeTextSettings.maxCharCount) || 0;
  }
  // Solo letras (incluidas Ñ y acentos) o números.
  function validChar(ch) {
    return ch.toLowerCase() !== ch.toUpperCase() || "0123456789".indexOf(ch) !== -1;
  }

  function findProduct(id) {
    for (var i = 0; i < products.length; i++) if (products[i].id === id) return products[i];
    return null;
  }

  function matchVariant() {
    var opts = current && current.options || [];
    if (!variants.length) return variantsFailed ? {} : null;
    if (!opts.length) return variants[0];
    for (var i = 0; i < variants.length; i++) {
      var v = variants[i];
      var ok = opts.every(function (o) {
        return (v.optionChoices || []).some(function (oc) {
          return oc.optionChoiceIds && oc.optionChoiceIds.optionId === o.id && oc.optionChoiceIds.choiceId === picked[o.id];
        });
      });
      if (ok) return v;
    }
    return null;
  }

  function choiceAvailable(optionId, choiceId) {
    if (!variants.length) return true;
    return variants.some(function (v) {
      var has = (v.optionChoices || []).some(function (oc) {
        return oc.optionChoiceIds && oc.optionChoiceIds.optionId === optionId && oc.optionChoiceIds.choiceId === choiceId;
      });
      return has && v.visible !== false && !(v.inventoryStatus && v.inventoryStatus.inStock === false);
    });
  }

  function renderPdState() {
    var v = matchVariant();
    var opts = current.options || [];
    var allPicked = opts.every(function (o) { return picked[o.id]; });
    renderPrice(v);
    var add = $("pd-add");
    var note = $("pd-note");
    note.classList.remove("error");
    var pm = pairMod();
    var missing = textMods().filter(function (m) { return m !== pm && m.mandatory && !texts[modKey(m)]; });
    if (pairOpt() && (!picked[pairOpt().id] || !second)) {
      add.disabled = true;
      note.textContent = picked[pairOpt().id] ? "Elige el segundo color: esta pieza lleva 2 colores." : "Elige 2 colores para tu letra.";
    } else if (!allPicked) {
      add.disabled = true;
      note.textContent = "Elige " + opts.filter(function (o) { return !picked[o.id]; }).map(function (o) { return (o.name || "").toLowerCase(); }).join(" y ") + ".";
    } else if (missing.length) {
      add.disabled = true;
      note.textContent = modMax(missing[0]) === 1 ? "Escribe la letra que quieres." : "Completa: " + (missing[0].name || "").toLowerCase() + ".";
    } else if (variants.length && !v) {
      add.disabled = true;
      note.textContent = "Esta combinación no está disponible.";
    } else if (v && v.inventoryStatus && v.inventoryStatus.inStock === false) {
      add.disabled = true;
      note.textContent = "Agotado por ahora.";
    } else if (!variants.length && !variantsFailed) {
      add.disabled = true;
      note.textContent = "Cargando disponibilidad…";
    } else {
      add.disabled = false;
      note.textContent = "";
    }
  }

  // Precio total según la cantidad elegida: sin IVA en grande y con IVA debajo.
  function renderPrice(v) {
    var cur = current.currency || "EUR";
    var unit = v && v.price && v.price.actualPrice && v.price.actualPrice.amount;
    var cmpUnit = v && v.price && v.price.compareAtPrice && v.price.compareAtPrice.amount;
    if (!unit) {
      var r = current.actualPriceRange || {};
      unit = r.minValue && r.minValue.amount;
    }
    var total = Math.round(Number(unit) * qty * 100) / 100;
    var cmp = cmpUnit ? Math.round(Number(cmpUnit) * qty * 100) / 100 : 0;
    $("pd-price").innerHTML = (cmp > total ? "<s>" + esc(money(net(cmp), cur)) + "</s>" : "") + esc(money(net(total), cur)) +
      '<span class="pd-vat">Precio mayorista · IVA no incluido</span>';
  }

  function renderOptions() {
    var opts = current.options || [];
    var po = pairOpt();
    $("pd-options").innerHTML = opts.map(function (o) {
      var choices = (o.choicesSettings && o.choicesSettings.choices || []).filter(function (c) { return c.visible !== false; });
      var isSwatch = o.optionRenderType === "SWATCH_CHOICES";
      var isPair = o === po;
      var chosen = null;
      choices.forEach(function (c) { if (picked[o.id] === c.choiceId) chosen = c; });
      var label = '<div class="opt-label">' + esc(o.name) + (chosen ? '<span class="opt-picked">' + esc(chosen.name) + "</span>" : "") + "</div>";
      if (isPair) {
        var names = [chosen ? chosen.name : "", second ? choiceName(o, second) : ""].filter(Boolean);
        label = '<div class="opt-label">Colores' + (names.length ? '<span class="opt-picked">' + esc(names.join(" + ")) + "</span>" : "") +
          (names.length < 2 ? '<span class="opt-hint">elige 2</span>' : "") + "</div>";
      }
      var items = choices.map(function (c) {
        var avail = isPair || choiceAvailable(o.id, c.choiceId);
        var on = picked[o.id] === c.choiceId || isPair && second === c.choiceId;
        var common = ' data-opt="' + esc(o.id) + '" data-choice="' + esc(c.choiceId) + '" aria-pressed="' + on + '"' + (avail ? "" : " disabled");
        if (isSwatch && c.colorCode) {
          var n = !isPair ? "" : picked[o.id] === c.choiceId ? "1" : second === c.choiceId ? "2" : "";
          return '<button type="button" class="swatch' + (isPair ? " sq" : "") + '"' + common + ' style="--sw:' + esc(c.colorCode) + '" title="' + esc(c.name) + '" aria-label="' + esc(c.name) + '">' + (n ? '<span class="sw-n">' + n + "</span>" : "") + "</button>";
        }
        return '<button type="button" class="choice"' + common + ">" + esc(c.name) + "</button>";
      }).join("");
      var help = isPair && previewMap(current.id) ? '<p class="opt-help">El 1.º color es para las flores grandes y el 2.º para las ramitas. Mira cómo queda en la foto.</p>' : "";
      return '<div class="opt">' + label + '<div class="' + (isSwatch ? "swatches" : "choices") + '">' + items + "</div>" + help + "</div>";
    }).join("");
  }

  function renderMods() {
    var pm = pairMod();
    $("pd-mods").innerHTML = textMods().map(function (m, i) {
      if (m === pm) return "";
      var title = m.freeTextSettings && m.freeTextSettings.title || m.name || "";
      var max = modMax(m);
      if (max === 1) {
        return '<div class="mod"><div class="opt-label">' + esc(m.name || "Letra") + '</div><div class="letter-row">' +
          '<input class="letter-input" type="text" maxlength="1" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="A" data-mod="' + i + '" aria-label="' + esc(title) + '">' +
          '<p class="letter-help"><strong>' + esc(title) + "</strong>Escribe una sola letra o número.</p></div></div>";
      }
      return '<div class="mod"><div class="opt-label">' + esc(m.name || "") + '</div><input class="text-input" type="text" autocomplete="off"' + (max ? ' maxlength="' + max + '"' : "") + ' data-mod="' + i + '" placeholder="' + esc(title) + '" aria-label="' + esc(title) + '"></div>';
    }).join("");
  }

  var wantSrc = "";
  function setMainImage(u, idx) {
    var img = $("pd-img");
    var src = sized(u, 900);
    wantSrc = src;
    if (img.getAttribute("src") !== src) {
      if (!img.getAttribute("src") || reduceMotion) {
        img.src = src;
      } else {
        var pre = new Image();
        pre.onload = pre.onerror = function () {
          if (wantSrc !== src) return;
          img.src = src;
          img.classList.remove("swap");
          void img.offsetWidth;
          img.classList.add("swap");
        };
        pre.src = src;
      }
    }
    Array.prototype.forEach.call($("pd-thumbs").children, function (b, i) {
      b.setAttribute("aria-current", i === idx ? "true" : "false");
    });
  }

  function openProduct(id) {
    current = findProduct(id);
    if (!current) return;
    variants = [];
    variantsFailed = false;
    picked = {};
    texts = {};
    second = null;
    qty = packOf(current);
    $("pd-qty").textContent = String(qty);
    var pkInfo = $("pd-pack");
    if (qty > 1) {
      pkInfo.textContent = "Pack de " + qty + " unidades · pedido mínimo " + qty + ", de " + qty + " en " + qty + " · envío gratis";
      pkInfo.hidden = false;
    } else {
      pkInfo.hidden = true;
    }
    $("pd-name").textContent = current.name || "";
    $("pd-desc").innerHTML = current.plainDescription ? descHtml(current.plainDescription) : "";
    var imgs = allImages(current);
    $("pd-img").alt = current.name || "";
    $("pd-thumbs").innerHTML = imgs.length > 1 ? imgs.map(function (u, i) {
      return '<button type="button" data-img="' + i + '" aria-label="Imagen ' + (i + 1) + '"><img src="' + esc(sized(u, 160)) + '" alt=""></button>';
    }).join("") : "";
    $("pd-tag").hidden = true;
    $("pd-img").removeAttribute("src");
    if (imgs[0]) setMainImage(imgs[0], 0);
    (current.options || []).forEach(function (o) {
      var choices = (o.choicesSettings && o.choicesSettings.choices || []).filter(function (c) { return c.visible !== false; });
      if (choices.length === 1) picked[o.id] = choices[0].choiceId;
    });
    renderOptions();
    renderMods();
    renderPdState();
    openLayer("product");
    var vq = { query: { filter: { "productData.productId": { "$eq": current.id } } } };
    var forId = current.id;
    api("POST", "/stores/v3/products/query-variants", vq).then(function (data) {
      if (!current || current.id !== forId) return;
      variants = (data.variants || []).filter(function (v) { return v.visible !== false; });
      renderOptions();
      renderPdState();
    }).catch(function () {
      if (!current || current.id !== forId) return;
      // Sin Wix se puede pedir igual: el pedido llega por correo con las opciones elegidas.
      variantsFailed = true;
      renderPdState();
    });
  }

  // Descripción en párrafos; "Instrucciones de uso" y los pasos "1. Título: texto" se muestran con su propio estilo.
  function descHtml(s) {
    var d = document.createElement("div");
    d.innerHTML = s;
    var blocks = Array.prototype.map.call(d.querySelectorAll("p, li, h1, h2, h3, h4"), function (el) { return el.textContent.trim(); }).filter(Boolean);
    if (!blocks.length) blocks = [(d.textContent || "").trim()].filter(Boolean);
    return blocks.map(function (t) {
      var low = t.toLowerCase();
      if (low === "instrucciones de uso" || low === "instrucciones de uso:") return '<h4 class="pd-howto">Instrucciones de uso</h4>';
      if ("0123456789".indexOf(t.charAt(0)) !== -1 && t.charAt(1) === ".") {
        var rest = t.slice(2).trim();
        var c = rest.indexOf(":");
        var title = c === -1 ? rest : rest.slice(0, c);
        var body = c === -1 ? "" : rest.slice(c + 1).trim();
        if (body) body = body.charAt(0).toUpperCase() + body.slice(1);
        return '<div class="pd-step"><span class="pd-step-n">' + esc(t.charAt(0)) + '</span><div><strong>' + esc(title) + "</strong>" + (body ? "<span>" + esc(body) + "</span>" : "") + "</div></div>";
      }
      if (low.indexOf("gracias por apoyar") === 0) return '<p class="pd-thanks">' + esc(t) + "</p>";
      return "<p>" + esc(t) + "</p>";
    }).join("");
  }

  function stripHtml(s) {
    var d = document.createElement("div");
    d.innerHTML = s;
    return d.textContent || "";
  }

  $("pd-thumbs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-img]");
    if (!b) return;
    var i = Number(b.getAttribute("data-img"));
    var u = i === 0 ? currentPreview() : "";
    $("pd-tag").hidden = !u;
    setMainImage(u || allImages(current)[i], i);
  });
  $("pd-options").addEventListener("click", function (e) {
    var b = e.target.closest("[data-choice]");
    if (!b || b.disabled) return;
    var oid = b.getAttribute("data-opt");
    var cid = b.getAttribute("data-choice");
    var po = pairOpt();
    if (po && po.id === oid) {
      if (picked[oid] === cid) { if (second) { picked[oid] = second; second = null; } else delete picked[oid]; }
      else if (second === cid) second = null;
      else if (!picked[oid]) picked[oid] = cid;
      else second = cid;
      syncSecond();
    } else {
      picked[oid] = cid;
    }
    renderOptions();
    renderPdState();
    updatePreview();
  });
  $("pd-options").addEventListener("pointerover", function (e) {
    var b = e.target.closest(".swatch[data-choice]");
    if (b) preloadFor(b.getAttribute("data-choice"));
  });
  $("pd-mods").addEventListener("input", function (e) {
    var input = e.target.closest("[data-mod]");
    if (!input) return;
    var m = textMods()[Number(input.getAttribute("data-mod"))];
    if (!m) return;
    var max = modMax(m);
    var val = input.value;
    if (max === 1) {
      var ch = val.trim().slice(-1);
      if (ch && !validChar(ch)) {
        ch = "";
        input.classList.remove("shake");
        void input.offsetWidth;
        input.classList.add("shake");
      }
      val = ch.toUpperCase();
      input.value = val;
      input.classList.toggle("filled", !!val);
    } else if (max && val.length > max) {
      val = val.slice(0, max);
      input.value = val;
    }
    texts[modKey(m)] = val.trim();
    renderPdState();
  });
  $("pd-mods").addEventListener("animationend", function (e) {
    e.target.classList.remove("shake");
  });
  $("pd-minus").addEventListener("click", function () { var pk = packOf(current); qty = Math.max(pk, qty - pk); $("pd-qty").textContent = qty; renderPrice(matchVariant()); });
  $("pd-plus").addEventListener("click", function () { var pk = packOf(current); qty = Math.min(99 * pk, qty + pk); $("pd-qty").textContent = qty; renderPrice(matchVariant()); });

  // Opciones elegidas, en texto, para el pedido (color, letra, aroma...).
  function pickedDetail() {
    var parts = [];
    var po = pairOpt();
    (current.options || []).forEach(function (o) {
      if (!picked[o.id]) return;
      var n = choiceName(o, picked[o.id]);
      if (o === po && second) parts.push("Colores: " + n + " + " + choiceName(o, second));
      else parts.push((o.name || "") + ": " + n);
    });
    var pm = pairMod();
    textMods().forEach(function (m) {
      if (m === pm) return;
      var val = texts[modKey(m)];
      if (val) parts.push((modMax(m) === 1 ? "Letra" : m.name || "") + ": " + val);
    });
    return parts.join(" · ");
  }
  function unitOf(p, v) {
    var u = v && v.price && v.price.actualPrice && v.price.actualPrice.amount;
    if (!u) { var r = p.actualPriceRange || {}; u = r.minValue && r.minValue.amount; }
    return Number(u) || 0;
  }

  $("pd-add").addEventListener("click", function () {
    var v = matchVariant();
    if (!current || !v) return;
    var detail = pickedDetail();
    var key = current.id + "|" + detail;
    var line = null;
    cart.forEach(function (l) { if (l.key === key) line = l; });
    if (line) line.qty += qty;
    else cart.push({ key: key, productId: current.id, name: (current.name || "").trim(), detalle: detail, qty: qty, unit: unitOf(current, v), pack: packOf(current), img: allImages(current)[0] || "" });
    saveCart();
    renderCart();
    closeLayers();
    setTimeout(function () { openLayer("cart"); }, reduceMotion ? 0 : 350);
    var badge = $("bag-count");
    badge.classList.remove("bump");
    void badge.offsetWidth;
    badge.classList.add("bump");
  });

  /* ---------------- cesta mayorista (pedido mínimo, precios sin IVA) ---------------- */
  var CART_KEY = "adk.mayoristas.cesta.v1";
  var REG_KEY = "adk.mayoristas.registro.v1";
  var cart = [];
  try { cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]") || []; } catch (e) { cart = []; }
  function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} }
  function cartTotal() { return round2(cart.reduce(function (s, l) { return s + l.unit * l.qty; }, 0)); }

  // Con el catálogo de Wix cargado, los precios de la cesta se ponen al día.
  function refreshCartPrices() {
    cart = cart.filter(function (l) { return findProduct(l.productId); });
    cart.forEach(function (l) { l.unit = unitOf(findProduct(l.productId)); });
    saveCart();
    renderCart();
  }

  function renderCart() {
    var count = cart.reduce(function (s, l) { return s + l.qty; }, 0);
    var badge = $("bag-count");
    badge.textContent = count;
    badge.classList.toggle("show", count > 0);
    var body = $("cart-body");
    if (!cart.length) {
      body.innerHTML = '<div class="cart-empty"><span class="script">Tu pedido está vacío</span><p>Pedido mínimo ' + esc(money(MIN_ORDER)) + ' sin IVA.</p></div>';
      $("cart-foot").hidden = true;
      return;
    }
    body.innerHTML = cart.map(function (l, i) {
      var less = l.qty - l.pack < l.pack ? 0 : l.qty - l.pack;
      var dl = [l.detalle, l.pack > 1 ? "Pack de " + l.pack + " · " + l.qty + " unidades" : ""].filter(Boolean).join(String.fromCharCode(10));
      return '<div class="line">' +
        (l.img ? '<img src="' + esc(sized(l.img, 200)) + '" alt="">' : "<span></span>") +
        '<div><div class="line-name">' + esc(l.name) + "</div>" +
        (dl ? '<div class="line-desc">' + esc(dl) + "</div>" : "") +
        '<div class="line-desc">' + esc(money(l.unit)) + " / ud. sin IVA</div>" +
        '<div class="qty"><button type="button" data-line="' + i + '" data-q="' + less + '" aria-label="Quitar">−</button><span>' + l.qty + '</span><button type="button" data-line="' + i + '" data-q="' + (l.qty + l.pack) + '" aria-label="Añadir">+</button></div>' +
        '<button type="button" class="remove" data-remove="' + i + '">Eliminar</button></div>' +
        '<div class="line-price">' + esc(money(round2(l.unit * l.qty))) + "</div></div>";
    }).join("");
    var total = cartTotal();
    var missing = round2(MIN_ORDER - total);
    $("cart-subtotal").textContent = money(total);
    $("cart-min").hidden = missing <= 0;
    $("cart-min").innerHTML = "Pedido mínimo " + esc(money(MIN_ORDER)) + " sin IVA. Te faltan <strong>" + esc(money(missing)) + "</strong>.";
    $("cart-bar").style.setProperty("--p", Math.min(1, total / MIN_ORDER));
    $("checkout").disabled = missing > 0;
    $("cart-foot").hidden = false;
  }

  $("cart-body").addEventListener("click", function (e) {
    var q = e.target.closest("[data-q]");
    var rm = e.target.closest("[data-remove]");
    if (q) {
      var i = Number(q.getAttribute("data-line"));
      var n = Number(q.getAttribute("data-q"));
      if (n < 1) cart.splice(i, 1); else cart[i].qty = Math.min(9999, n);
    } else if (rm) {
      cart.splice(Number(rm.getAttribute("data-remove")), 1);
    } else return;
    saveCart();
    renderCart();
  });

  /* ---------------- alta de cliente mayorista ---------------- */
  var reg = null;
  try { reg = JSON.parse(localStorage.getItem(REG_KEY) || "null"); } catch (e) { reg = null; }

  function setErrors(form, fields) {
    form.querySelectorAll("[data-err]").forEach(function (el) {
      var k = el.getAttribute("data-err");
      el.textContent = fields && fields[k] || "";
      var input = form.querySelector('[name="' + k + '"]');
      if (input) input.setAttribute("aria-invalid", fields && fields[k] ? "true" : "false");
    });
  }

  // Envía al servidor y, si no hay clave de Resend, reenvía con FormSubmit.
  function send(payload) {
    return fetch("/api/mayoristas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (out) {
        if (!r.ok || !out.ok) { var err = new Error(out.error || "No se ha podido enviar."); err.fields = out.fields; throw err; }
        if (out.relay !== "formsubmit") return out;
        var fd = new FormData();
        fd.append("_subject", out.subject);
        fd.append("_template", "table");
        fd.append("_captcha", "false");
        fd.append("_replyto", payload.cliente.email);
        if (out.cc) fd.append("_cc", out.cc);
        out.rows.forEach(function (row) { fd.append(row[0], row[1] || "—"); });
        return fetch("https://formsubmit.co/ajax/" + encodeURIComponent(out.to), { method: "POST", headers: { Accept: "application/json" }, body: fd })
          .then(function (r2) { return r2.json().catch(function () { return {}; }); }, function () { return {}; })
          .then(function (fs) {
            // Si el correo falla pero quedó guardado en el servidor, el envío es correcto.
            if (String(fs.success) === "true" || out.saved) return out;
            // Pasa si el envío por correo aún no está activado en FormSubmit.
            throw new Error("No hemos podido enviarlo en este momento. Inténtalo de nuevo en unos minutos.");
          });
      });
    }, function () { throw new Error("No hay conexión. Comprueba tu red e inténtalo de nuevo."); });
  }

  function readForm(form) {
    var f = form.elements;
    return {
      empresa: f.empresa.value.trim(), nombre: f.nombre.value.trim(), email: f.email.value.trim(),
      telefono: f.telefono.value.trim(), nif: normId(f.nif.value), dni: normId(f.dni.value),
      nifIva: normId(f.nifIva.value), privacidad: f.privacidad.checked
    };
  }

  function showGate() {
    var g = $("gate");
    g.hidden = false;
    document.body.classList.add("locked");
    var form = $("gate-form");
    if (reg) Object.keys(reg).forEach(function (k) {
      var el = form.elements[k];
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!reg[k]; else el.value = reg[k];
    });
    setTimeout(function () { form.elements.empresa.focus(); }, 60);
  }
  function hideGate() {
    $("gate").hidden = true;
    document.body.classList.remove("locked");
    renderWho();
  }
  function renderWho() {
    $("who").innerHTML = reg ? "Comprando como <strong>" + esc(reg.empresa) + "</strong> · NIF " + esc(reg.nif) + ' · <button type="button" id="who-edit">Cambiar datos</button>' : "";
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest("#who-edit")) showGate();
  });

  $("gate-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = this;
    var data = readForm(form);
    var errs = validateRegistro(data);
    setErrors(form, errs);
    var msg = $("gate-msg");
    msg.textContent = "";
    if (Object.keys(errs).length) {
      var first = form.querySelector('[aria-invalid="true"]');
      if (first) first.focus();
      return;
    }
    var btn = $("gate-send");
    btn.disabled = true;
    msg.textContent = "Enviando tus datos…";
    send({ tipo: "registro", cliente: data, website2: form.elements.website2.value }).then(function () {
      reg = data;
      try { localStorage.setItem(REG_KEY, JSON.stringify(reg)); } catch (e2) {}
      msg.textContent = "";
      hideGate();
      toast("¡Bienvenido! Ya puedes hacer tu pedido.");
    }).catch(function (err) {
      if (err.fields) {
        setErrors(form, err.fields);
        msg.textContent = err.message;
        return;
      }
      // Los datos ya están comprobados: si el aviso por correo falla, el cliente
      // entra igual. Sus datos completos van también en cada pedido.
      reg = data;
      try { localStorage.setItem(REG_KEY, JSON.stringify(reg)); } catch (e2) {}
      msg.textContent = "";
      hideGate();
      toast("¡Bienvenido! Ya puedes hacer tu pedido.");
    }).then(function () { btn.disabled = false; });
  });

  /* ---------------- enviar pedido ---------------- */
  $("checkout").addEventListener("click", function () {
    if (!cart.length || cartTotal() < MIN_ORDER) return;
    if (!reg) { closeLayers(); showGate(); return; }
    var btn = $("checkout");
    btn.disabled = true;
    $("cart-msg").textContent = "Enviando tu pedido…";
    send({
      tipo: "pedido",
      cliente: reg,
      notas: $("cart-notes").value.trim(),
      lineas: cart.map(function (l) { return { productId: l.productId, detalle: l.detalle, qty: l.qty }; })
    }).then(function (out) {
      cart = [];
      saveCart();
      renderCart();
      $("cart-notes").value = "";
      $("cart-msg").textContent = "";
      $("cart-body").innerHTML = '<div class="cart-empty"><span class="script">¡Pedido enviado!</span><p>Referencia <strong>' + esc(out.ref || "") + "</strong> · " + esc(money(out.subtotal || 0)) + " sin IVA.</p><p>Te escribiremos a " + esc(reg.email) + " para confirmar el pedido, el envío y la forma de pago.</p></div>";
    }).catch(function (err) {
      $("cart-msg").textContent = err.fields ? err.message : err.message + " Tu pedido sigue guardado en la cesta.";
      btn.disabled = false;
    });
  });

  /* ---------------- búsqueda ---------------- */
  $("search-input").addEventListener("input", function () {
    var term = this.value.trim().toLowerCase();
    var out = $("search-out");
    if (!term) { out.innerHTML = '<p class="search-hint">Escribe el nombre de una pieza.</p>'; return; }
    var found = products.filter(function (p) { return (p.name || "").toLowerCase().indexOf(term) !== -1; });
    if (!found.length) {
      out.innerHTML = '<p class="search-hint">' + (products.length ? "No hay piezas con ese nombre." : "La nueva colección llegará muy pronto.") + "</p>";
      return;
    }
    out.innerHTML = '<div class="search-results">' + found.map(function (p) {
      var img = mainImage(p);
      return '<button class="sr" type="button" data-id="' + esc(p.id) + '">' + (img ? '<img src="' + esc(sized(img, 360)) + '" alt="">' : "") +
        "<span>" + esc(p.name) + "</span><small>" + priceOf(p) + "</small></button>";
    }).join("") + "</div>";
  });
  $("search-out").addEventListener("click", function (e) {
    var b = e.target.closest("[data-id]");
    if (!b) return;
    var id = b.getAttribute("data-id");
    closeLayers();
    setTimeout(function () { openProduct(id); }, reduceMotion ? 0 : 400);
  });

  /* ---------------- capas ---------------- */
  var openId = null;
  var lastFocus = null;
  function openLayer(id) {
    if (openId && openId !== id) closeLayers(true);
    lastFocus = document.activeElement;
    openId = id;
    var el = $(id);
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    if (id !== "menu" && id !== "search") $("scrim").classList.add("show");
    document.body.classList.add("locked");
    setTimeout(function () {
      var f = id === "search" ? $("search-input") : el.querySelector("[data-close]");
      if (f) f.focus();
    }, 60);
  }
  function closeLayers(keepFocus) {
    ["menu", "search", "product", "cart"].forEach(function (id) {
      var el = $(id);
      el.classList.remove("open");
      el.setAttribute("aria-hidden", "true");
    });
    $("scrim").classList.remove("show");
    document.body.classList.remove("locked");
    openId = null;
    if (!keepFocus && lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $("open-menu").addEventListener("click", function () { openLayer("menu"); });
  $("open-search").addEventListener("click", function () { openLayer("search"); });
  $("open-cart").addEventListener("click", function () { openLayer("cart"); });
  document.querySelectorAll("[data-open-cart]").forEach(function (b) { b.addEventListener("click", function () { openLayer("cart"); }); });
  $("scrim").addEventListener("click", function () { closeLayers(); });
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) closeLayers();
  });
  $("menu").addEventListener("click", function (e) {
    if (e.target.closest("nav a")) closeLayers(true);
  });
  $("product").addEventListener("click", function (e) {
    if (e.target === $("product")) closeLayers();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && openId) closeLayers();
  });

  /* ---------------- animaciones ---------------- */
  // Título letra a letra, como tinta que aparece.
  (function () {
    var t = $("hero-title");
    var text = t.textContent;
    t.textContent = "";
    var i = 0;
    text.split("").forEach(function (ch) {
      var s = document.createElement("span");
      s.className = "ch";
      s.setAttribute("aria-hidden", "true");
      s.style.setProperty("--i", i++);
      s.textContent = ch === " " ? String.fromCharCode(160) : ch;
      t.appendChild(s);
    });
  })();

  // Destellos dorados que suben lentamente.
  if (!reduceMotion) {
    var motes = $("motes");
    var n = window.innerWidth < 760 ? 10 : 22;
    for (var m = 0; m < n; m++) {
      var d = document.createElement("span");
      d.className = "mote";
      var size = 2 + Math.random() * 4;
      d.style.left = (Math.random() * 100) + "%";
      d.style.width = size + "px";
      d.style.height = size + "px";
      d.style.animationDuration = (14 + Math.random() * 16) + "s";
      d.style.animationDelay = (-Math.random() * 24) + "s";
      d.style.setProperty("--dx", ((Math.random() - .5) * 120) + "px");
      motes.appendChild(d);
    }
  }

  // Paralaje suave con el ratón y con el scroll.
  if (!reduceMotion) {
    var par = $("parallax");
    var mx = 0, my = 0, sy = 0;
    function applyParallax() {
      par.style.transform = "translate3d(" + (mx * -14) + "px," + (my * -10 + sy) + "px,0)";
    }
    window.addEventListener("mousemove", function (e) {
      mx = e.clientX / window.innerWidth - .5;
      my = e.clientY / window.innerHeight - .5;
      applyParallax();
    }, { passive: true });
    window.addEventListener("scroll", function () {
      sy = Math.min(window.scrollY, window.innerHeight) * .25;
      applyParallax();
    }, { passive: true });
  }

  // Cabecera sólida al bajar y enlace activo según la sección.
  var header = $("header");
  var spyLinks = document.querySelectorAll("[data-spy]");
  function onScroll() {
    header.classList.toggle("solid", window.scrollY > 60);
    var pos = window.scrollY + window.innerHeight * .35;
    var currentId = "inicio";
    ["colecciones", "nosotros", "tarjeta-regalo", "contacto"].forEach(function (id) {
      var s = $(id);
      if (s && s.offsetTop <= pos) currentId = id;
    });
    spyLinks.forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-spy") === currentId); });
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Aparición escalonada al hacer scroll.
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    var shown = entries.filter(function (e) { return e.isIntersecting; });
    shown.forEach(function (entry, i) {
      entry.target.style.animationDelay = (i * 90) + "ms";
      entry.target.classList.add("in");
      io.unobserve(entry.target);
    });
  }, { threshold: .12, rootMargin: "0px 0px -50px 0px" }) : null;
  function observeReveals(root) {
    (root || document).querySelectorAll(".reveal:not(.in)").forEach(function (el) {
      if (!io) { el.classList.add("done"); return; }
      el.addEventListener("animationend", function () {
        el.classList.add("done");
        el.style.animationDelay = "";
      }, { once: true });
      io.observe(el);
    });
  }
  observeReveals(document);

  $("year").textContent = String(new Date().getFullYear());

  requestAnimationFrame(function () {
    requestAnimationFrame(function () { document.documentElement.classList.add("loaded"); });
  });

  loadProducts();
  // Enlaces de la web a una pieza concreta: /tienda/#p=<id del producto>.
  var wanted = /^#p=([\w-]+)$/.exec(location.hash);
  if (wanted && findProduct(wanted[1])) {
    document.getElementById("colecciones").scrollIntoView();
    openProduct(wanted[1]);
  }
  renderCart();
  renderWho();
  if (!reg) showGate();
})();
