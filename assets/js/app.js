(function () {
  var api = window.Purrfect;
  var favorites = api.createFavorites(window.localStorage);
  var petsById = new Map();
  var searchState = { page: 1, pages: 1, total: 0 };
  var breedTimer = 0;
  var searched = false;
  var firstRoute = true;

  var form = document.querySelector("#search-form");
  var results = document.querySelector("#results");
  var status = document.querySelector("#status");
  var dialog = document.querySelector("#pet-dialog");
  var views = {
    search: document.querySelector("#view-search"),
    pet: document.querySelector("#view-pet"),
    favorites: document.querySelector("#view-favorites")
  };

  function el(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      var value = props[key];
      if (value == null || value === false) return;
      if (key === "class") node.className = value;
      else node.setAttribute(key, value === true ? "" : String(value));
    });
    var list = Array.isArray(children) ? children : [children];
    list.forEach(function (child) {
      if (child == null || child === false) return;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return node;
  }

  function heartSvg() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("heart-icon");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M12 21s-6.7-4.3-9.3-8.2C.8 10.2 1.4 6.6 4.4 5.2 6.4 4.3 8.6 4.8 10 6.4 11.4 4.8 13.6 4.3 15.6 5.2c3 1.4 3.6 5 1.7 7.6C18.7 16.7 12 21 12 21z");
    svg.append(path);
    return svg;
  }

  function announce(message) {
    status.textContent = "";
    window.setTimeout(function () { status.textContent = message; }, 30);
  }

  function remember(pet) {
    petsById.set(pet.id, pet);
    if (favorites.has(pet.id)) favorites.save(pet);
  }

  function updateNav(route) {
    document.querySelectorAll("[data-route]").forEach(function (link) {
      if (link.getAttribute("data-route") === route) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    var count = favorites.all().length;
    var badge = document.querySelector("#fav-count");
    badge.textContent = count ? String(count) : "";
    badge.hidden = count === 0;
    document.querySelector("#fav-link").setAttribute("aria-label", "Favorites, " + count + " saved");
  }

  function refreshHearts() {
    document.querySelectorAll("[data-fav-id]").forEach(function (button) {
      var id = button.getAttribute("data-fav-id");
      var pet = petsById.get(id);
      var saved = favorites.has(id);
      var name = pet ? pet.name : "this pet";
      button.setAttribute("aria-pressed", String(saved));
      button.setAttribute("aria-label", saved ? "Remove " + name + " from favorites" : "Save " + name + " to favorites");
    });
    updateNav(currentRoute());
  }

  function favoriteButton(pet) {
    var button = el("button", {
      type: "button",
      class: "heart",
      "data-fav-id": pet.id,
      "aria-pressed": String(favorites.has(pet.id)),
      "aria-label": favorites.has(pet.id) ? "Remove " + pet.name + " from favorites" : "Save " + pet.name + " to favorites"
    });
    button.append(heartSvg());
    button.addEventListener("click", function () {
      var saved = favorites.toggle(pet);
      announce(saved ? pet.name + " saved to favorites." : pet.name + " removed from favorites.");
      if (currentRoute() === "favorites") renderFavorites();
      else refreshHearts();
    });
    return button;
  }

  function metaLine(pet) {
    return [pet.species, pet.sex, pet.ageText || pet.ageGroup, pet.size].filter(Boolean).join(" · ");
  }

  function columnIsPadding(pixels, w, h, x) {
    var dark = 0;
    var samples = 0;
    for (var y = 0; y < h; y += 3) {
      var i = (y * w + x) * 4;
      samples++;
      if (pixels[i] < 12 && pixels[i + 1] < 12 && pixels[i + 2] < 12) dark++;
    }
    return samples > 0 && dark / samples > 0.97;
  }

  function trimLetterbox(image) {
    if (image.getAttribute("data-trimmed") || !image.naturalWidth) return;
    var w = image.naturalWidth;
    var h = image.naturalHeight;
    if (w < 40 || h < 40) return;
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    var pixels;
    try {
      ctx.drawImage(image, 0, 0);
      pixels = ctx.getImageData(0, 0, w, h).data;
    } catch (err) {
      return;
    }
    var left = 0;
    var right = w - 1;
    while (left < right && columnIsPadding(pixels, w, h, left)) left++;
    while (right > left && columnIsPadding(pixels, w, h, right)) right--;
    var cropped = right - left + 1;
    if (cropped > w * 0.9 || cropped < w * 0.25) return;
    var out = document.createElement("canvas");
    out.width = cropped;
    out.height = h;
    out.getContext("2d").drawImage(canvas, left, 0, cropped, h, 0, 0, cropped, h);
    image.setAttribute("data-trimmed", "1");
    image.src = out.toDataURL("image/jpeg", 0.86);
  }

  function photo(pet, className) {
    var remote = safeHttp(pet.photo);
    var image = el("img", {
      src: remote || "assets/img/no-photo.svg",
      alt: remote ? pet.name + ", " + (pet.species || "pet") : "No photo available for " + pet.name
    });
    if (remote) image.crossOrigin = "anonymous";
    if (className) image.className = className;
    image.addEventListener("load", function () {
      if (image.getAttribute("data-fallback") || image.src.indexOf("data:") === 0) return;
      trimLetterbox(image);
    });
    image.addEventListener("error", function () {
      if (image.getAttribute("data-fallback")) return;
      if (remote && image.crossOrigin) {
        image.crossOrigin = null;
        image.removeAttribute("crossorigin");
        image.src = remote;
        return;
      }
      image.setAttribute("data-fallback", "1");
      image.src = "assets/img/no-photo.svg";
      image.alt = "No photo available for " + pet.name;
    });
    return image;
  }

  function safeHttp(href) {
    try {
      var url = new URL(href);
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch (err) {
      return "";
    }
    return "";
  }

  function externalLink(href, label) {
    var safe = safeHttp(href);
    if (!safe) return null;
    return el("a", { href: safe, target: "_blank", rel: "noopener noreferrer" }, label);
  }

  function facts(pet) {
    var rows = [
      ["Breed", pet.breeds.join(", ")],
      ["Sex", pet.sex],
      ["Age", pet.ageText || pet.ageGroup],
      ["Size", pet.size],
      ["Color", pet.color],
      ["Coat", pet.coat],
      ["Adoption fee", pet.fee]
    ].filter(function (row) { return row[1]; });
    if (!rows.length) return null;
    var list = el("dl", { class: "facts" });
    rows.forEach(function (row) {
      list.append(el("dt", {}, row[0]), el("dd", {}, row[1]));
    });
    return list;
  }

  function formatDate(value) {
    if (!value) return "";
    var date = new Date(value + (value.length === 10 ? "T00:00:00" : ""));
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  function telHref(phone) {
    var compact = String(phone).replace(/[^\d+]/g, "");
    return compact ? "tel:" + compact : "";
  }

  function renderCard(pet) {
    var quick = el("button", { type: "button", class: "text-button" }, "Quick look");
    quick.addEventListener("click", function () { openDialog(pet); });
    var profile = el("a", { class: "text-button", href: "#/pet/" + encodeURIComponent(pet.id) }, "Profile");
    return el("li", { class: "card" }, [
      photo(pet),
      el("div", { class: "card-body" }, [
        el("h3", {}, pet.name),
        el("p", { class: "meta" }, metaLine(pet)),
        pet.summary ? el("p", { class: "summary" }, pet.summary) : null,
        el("div", { class: "card-actions" }, [quick, profile, favoriteButton(pet)])
      ])
    ]);
  }

  function openDialog(pet) {
    var close = el("button", { type: "button", class: "text-button" }, "Close");
    close.addEventListener("click", function () { dialog.close(); });
    var profile = el("a", { class: "button", href: "#/pet/" + encodeURIComponent(pet.id) }, "Shelter and map");
    profile.addEventListener("click", function () { dialog.close(); });
    var shelter = externalLink(pet.listingUrl, "Shelter listing");
    dialog.replaceChildren(el("div", { class: "dialog-body" }, [
      photo(pet, "dialog-photo"),
      el("div", { class: "dialog-toolbar" }, [el("h2", { id: "dialog-title" }, pet.name), close]),
      el("div", { class: "dialog-copy" }, [
        el("p", { class: "meta" }, metaLine(pet)),
        facts(pet),
        pet.summary ? el("p", {}, pet.summary) : el("p", {}, "The shelter has not added a description yet."),
        el("div", { class: "dialog-actions" }, [profile, shelter, favoriteButton(pet)])
      ])
    ]));
    if (!dialog.open) dialog.showModal();
  }

  function readForm() {
    var data = new FormData(form);
    return {
      region: data.get("region"),
      zip: data.get("zip"),
      species: data.get("species"),
      breed: data.get("breed"),
      sex: data.get("sex"),
      age: data.get("age"),
      size: data.get("size")
    };
  }

  function syncZipField() {
    var isZip = document.querySelector("#region").value === "zip";
    document.querySelector("#zip-field").hidden = !isZip;
    document.querySelector("#zip").required = isZip;
  }

  function coverageEmpty() {
    var box = el("div", { class: "empty" }, [
      el("h2", {}, "No listings in that area yet"),
      el("p", {}, "Public shelter data in this demo covers King County, WA (98101), Montgomery County, MD (20850), Zaragoza, and Taiwan. Try one of those, or loosen the filters.")
    ]);
    var actions = el("div", { class: "empty-actions" });
    [
      ["es", "Show Zaragoza"],
      ["kc", "Show King County"],
      ["mc", "Show Montgomery County"]
    ].forEach(function (choice) {
      var button = el("button", { type: "button", class: "text-button" }, choice[1]);
      button.addEventListener("click", function () {
        document.querySelector("#region").value = choice[0];
        syncZipField();
        runSearch(1, false);
      });
      actions.append(button);
    });
    box.append(actions);
    return box;
  }

  function renderResults(payload, append) {
    searchState.page = payload.page;
    searchState.pages = payload.pages;
    searchState.total = payload.total;
    payload.pets.forEach(remember);

    var list = append ? results.querySelector(".results") : null;
    if (!append) results.replaceChildren();

    if (!payload.total) {
      var region = document.querySelector("#region").value;
      results.append(region === "zip" || region === "kc" || region === "mc" ? coverageEmpty() : el("div", { class: "empty" }, [
        el("h2", {}, "No pets match"),
        el("p", {}, "Try another breed, age, or area. Zaragoza and Taiwan have the largest sets of photos.")
      ]));
      announce("No pets match this search.");
      return;
    }

    if (!list) {
      results.append(el("div", { class: "result-bar" }, [
        el("h2", {}, "Pets"),
        el("p", {}, payload.pets.length + " shown of " + payload.total + " matching")
      ]));
      list = el("ul", { class: "results" });
      results.append(list);
    } else {
      var count = results.querySelector(".result-bar p");
      if (count) count.textContent = list.children.length + payload.pets.length + " shown of " + payload.total + " matching";
    }

    payload.pets.forEach(function (pet) { list.append(renderCard(pet)); });

    var existingPager = results.querySelector(".pager");
    if (existingPager) existingPager.remove();
    if (payload.page < payload.pages) {
      var more = el("button", { type: "button", class: "button" }, "Load more");
      more.addEventListener("click", function () { runSearch(payload.page + 1, true); });
      results.append(el("div", { class: "pager" }, more));
    }
    announce(payload.pets.length + " pets shown. " + payload.total + " match this search.");
  }

  function runSearch(page, append) {
    var input = readForm();
    input.page = page;
    searched = true;

    var button = document.querySelector("#search-button");
    button.disabled = true;
    results.setAttribute("aria-busy", "true");
    if (!append) {
      results.replaceChildren(el("p", { class: "status-block" }, "Searching shelter listings…"));
    }

    var pending;
    try {
      pending = api.searchPets(input);
    } catch (err) {
      pending = Promise.reject(err);
    }

    pending.then(function (payload) {
      renderResults(payload, append);
    }).catch(function (err) {
      var message = err.code === "ZIP" ? err.message : (err.status === 429 ? "The listing service is busy. Wait a moment and search again." : err.message);
      var title = err.code === "ZIP" ? "Check the ZIP code" : "Search didn't finish";
      results.replaceChildren(el("div", { class: "empty", role: "alert" }, [
        el("h2", {}, title),
        el("p", {}, message)
      ]));
      announce(message);
    }).then(function () {
      button.disabled = false;
      results.setAttribute("aria-busy", "false");
    });
  }

  function contactBlock(pet) {
    var rescue = pet.rescue;
    var lines = api.addressLines(rescue);
    var map = api.mapEmbed(rescue);
    var phone = rescue.phone ? el("p", {}, ["Phone: ", el("a", { href: telHref(rescue.phone) }, rescue.phone)]) : null;
    var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rescue.email || "");
    var email = emailOk ? el("p", {}, ["Email: ", el("a", { href: "mailto:" + rescue.email }, rescue.email)]) : null;
    var website = externalLink(rescue.website, "Shelter website");
    var listing = externalLink(pet.listingUrl, "View this pet on the shelter site");
    var record = externalLink(pet.petnectoUrl, "Open the public listing record");
    var card = el("section", { class: "org-card" }, [
      el("h2", {}, "Where to find " + pet.name),
      rescue.name ? el("p", {}, el("strong", {}, rescue.name)) : null,
      lines.length ? el("address", {}, lines.join(", ")) : null,
      phone,
      email,
      website ? el("p", {}, website) : null,
      listing ? el("p", {}, listing) : null,
      record ? el("p", {}, record) : null,
      pet.listed ? el("p", { class: "meta" }, "Listed " + formatDate(pet.listed) + ". Confirm the details with the shelter before you visit.") : el("p", { class: "meta" }, "Confirm the details with the shelter before you visit.")
    ]);
    if (map) {
      card.append(
        el("iframe", {
          class: "map-frame",
          title: "Map showing " + (rescue.name || "the shelter"),
          referrerpolicy: "no-referrer-when-downgrade",
          src: map.embed
        }),
        el("p", {}, el("a", { href: map.link, target: "_blank", rel: "noopener noreferrer" }, "Open this map in OpenStreetMap"))
      );
    } else if (lines.length) {
      card.append(el("p", { class: "meta" }, "This listing does not include map coordinates."));
    }
    return card;
  }

  function renderPet(pet) {
    var heading = el("h1", { tabindex: "-1" }, pet.name);
    views.pet.replaceChildren(el("div", {}, [
      el("a", { class: "back", href: "#/" }, "Back to search"),
      el("div", { class: "profile" }, [
        el("div", { class: "profile-photo" }, photo(pet)),
        el("div", { class: "profile-copy" }, [
          heading,
          el("p", { class: "meta" }, metaLine(pet)),
          facts(pet),
          pet.summary ? el("p", {}, pet.summary) : el("p", {}, "The shelter has not added a description yet."),
          !pet.photo ? el("p", { class: "meta" }, "Photos for this listing stay on the shelter site.") : null,
          el("div", { class: "profile-actions" }, [favoriteButton(pet)])
        ])
      ]),
      contactBlock(pet)
    ]));
    document.title = pet.name + " · Purr-fect Match";
    heading.focus();
  }

  function showPet(id) {
    showView("pet");
    updateNav("pet");
    views.pet.replaceChildren(el("p", { class: "status-block" }, "Loading pet profile…"));
    document.title = "Pet profile · Purr-fect Match";
    api.getPet(id).then(function (pet) {
      remember(pet);
      renderPet(pet);
      updateNav("pet");
    }).catch(function (err) {
      views.pet.replaceChildren(
        el("a", { class: "back", href: "#/" }, "Back to search"),
        el("div", { class: "empty", role: "alert" }, [
          el("h1", {}, "Pet unavailable"),
          el("p", {}, err.message)
        ])
      );
    });
  }

  function renderFavorites() {
    var saved = favorites.all().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    saved.forEach(remember);
    var heading = el("h1", { tabindex: "-1" }, "Saved pets");
    if (!saved.length) {
      views.favorites.replaceChildren(
        heading,
        el("div", { class: "empty" }, [
          el("p", {}, "You have not saved any pets on this device yet."),
          el("p", {}, el("a", { href: "#/" }, "Search listings"))
        ])
      );
    } else {
      views.favorites.replaceChildren(
        heading,
        el("p", { class: "meta" }, "Saved in this browser only. Clearing site data removes them."),
        el("ul", { class: "results" }, saved.map(renderCard))
      );
    }
    document.title = "Favorites · Purr-fect Match";
    updateNav("favorites");
    heading.focus();
  }

  function showView(name) {
    Object.keys(views).forEach(function (key) {
      views[key].hidden = key !== name;
    });
    if (dialog.open) dialog.close();
  }

  function currentRoute() {
    var hash = window.location.hash || "#/";
    if (hash.indexOf("#/pet/") === 0) return "pet";
    if (hash === "#/favorites") return "favorites";
    return "search";
  }

  function renderRoute() {
    var hash = window.location.hash || "#/";
    if (hash.indexOf("#/pet/") === 0) {
      firstRoute = false;
      showPet(decodeURIComponent(hash.slice("#/pet/".length)));
      return;
    }
    if (hash === "#/favorites") {
      firstRoute = false;
      showView("favorites");
      renderFavorites();
      return;
    }
    showView("search");
    document.title = "Purr-fect Match";
    updateNav("search");
    if (!searched) runSearch(1, false);
    if (!firstRoute) {
      var heading = document.querySelector(".hero h1");
      heading.tabIndex = -1;
      heading.focus();
    }
    firstRoute = false;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (window.location.hash && window.location.hash !== "#/" && window.location.hash !== "#/search") {
      window.location.hash = "#/";
    }
    runSearch(1, false);
  });

  document.querySelector("#region").addEventListener("change", syncZipField);

  document.querySelector("#breed").addEventListener("input", function (event) {
    var value = event.target.value.trim();
    window.clearTimeout(breedTimer);
    if (value.length < 2) return;
    breedTimer = window.setTimeout(function () {
      api.suggestBreeds(value, document.querySelector("#species").value).then(function (labels) {
        var list = document.querySelector("#breed-list");
        list.replaceChildren.apply(list, labels.slice(0, 12).map(function (label) {
          return el("option", { value: label });
        }));
      }).catch(function () {});
    }, 250);
  });

  window.addEventListener("hashchange", renderRoute);
  syncZipField();
  updateNav(currentRoute());
  renderRoute();
})();
