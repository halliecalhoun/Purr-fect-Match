(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.Purrfect = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  var API = "https://petnecto.com/api/v1";

  var REGIONS = [
    { id: "es", label: "Zaragoza, Spain" },
    { id: "kc", label: "King County, Washington" },
    { id: "mc", label: "Montgomery County, Maryland" },
    { id: "tw", label: "Taiwan" },
    { id: "zip", label: "A US ZIP code" }
  ];

  function buildSearchParams(input) {
    var params = new URLSearchParams();
    var region = input.region || "es";
    var near = false;

    params.set("lang", "en");
    params.set("found", "exclude");
    params.set("limit", String(input.limit || 24));
    params.set("page", String(input.page || 1));

    if (region === "es") {
      params.set("country", "ES");
    } else if (region === "tw") {
      params.set("country", "TW");
    } else if (region === "kc") {
      params.set("near", "98101");
      params.set("miles", "50");
      near = true;
    } else if (region === "mc") {
      params.set("near", "20850");
      params.set("miles", "40");
      near = true;
    } else if (region === "zip") {
      var zip = String(input.zip || "").trim();
      if (!/^\d{5}$/.test(zip)) {
        var error = new Error("Enter a 5-digit US ZIP code.");
        error.code = "ZIP";
        throw error;
      }
      params.set("near", zip);
      params.set("miles", "50");
      near = true;
    }

    params.set("sort", near ? "distance" : "photo");
    if (input.species) params.set("species", input.species);
    if (input.sex) params.set("sex", input.sex);
    if (input.age) params.set("age", input.age);
    if (input.size) params.set("size", input.size);

    var breed = String(input.breed || "").trim();
    if (breed) params.set("q", breed.slice(0, 80));
    return params;
  }

  function photoOf(pet) {
    var photos = pet && pet.photos;
    if (!photos || !photos.length) return "";
    var first = photos[0] || {};
    return first.small || first.large || first.original || "";
  }

  function normalize(pet, extra) {
    var rescue = pet.rescue || {};
    var place = rescue.place || pet.place || {};
    var breeds = pet.breeds || (pet.display && pet.display.breeds) || [];
    var id = pet.id;
    return {
      id: id,
      name: pet.name || "Unnamed pet",
      species: pet.species || "",
      breeds: breeds.filter(Boolean),
      sex: pet.sex || "",
      ageGroup: pet.age_group || "",
      ageText: pet.age_text || "",
      size: pet.size || "",
      color: pet.color || "",
      coat: pet.coat || "",
      summary: pet.summary || "",
      fee: pet.fee || "",
      photo: photoOf(pet),
      listingUrl: pet.listing_url || "",
      petnectoUrl: (extra && extra.petnectoUrl) || (id ? "https://petnecto.com/pets/" + id : ""),
      listed: pet.listed || "",
      rescue: {
        name: rescue.name || "",
        phone: rescue.phone || "",
        email: rescue.email || "",
        website: rescue.website || rescue.adoption_url || "",
        street: place.street || "",
        city: place.city || "",
        region: place.region || "",
        postalCode: place.postal_code || "",
        country: place.country || "",
        lat: typeof place.lat === "number" ? place.lat : null,
        lon: typeof place.lon === "number" ? place.lon : null
      }
    };
  }

  function fetchJson(url) {
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (data) {
        if (!response.ok) {
          var error = new Error((data && data.error) || "The pet listing service did not respond.");
          error.status = response.status;
          throw error;
        }
        return data;
      });
    });
  }

  function searchPets(input) {
    var params = buildSearchParams(input);
    return fetchJson(API + "/pets?" + params.toString()).then(function (data) {
      var urls = data.pet_urls || {};
      return {
        pets: (data.pets || []).map(function (pet) {
          return normalize(pet, { petnectoUrl: urls[pet.id] });
        }),
        total: data.total || 0,
        page: data.page || 1,
        pages: data.pages || 1
      };
    });
  }

  function getPet(id) {
    if (!/^[A-Za-z0-9-]{1,40}$/.test(id)) {
      var error = new Error("That pet link is not valid.");
      error.status = 400;
      return Promise.reject(error);
    }
    return fetchJson(API + "/pets/" + encodeURIComponent(id) + "?lang=en").then(function (data) {
      if (!data.pet) {
        var missing = new Error("That pet is no longer listed.");
        missing.status = 404;
        throw missing;
      }
      return normalize(data.pet, { petnectoUrl: data.url });
    });
  }

  function suggestBreeds(query, species) {
    var params = new URLSearchParams();
    params.set("q", String(query || "").slice(0, 80));
    if (species) params.set("species", species);
    return fetchJson(API + "/breeds?" + params.toString()).then(function (data) {
      return (data.breeds || []).map(function (breed) {
        return breed.label;
      }).filter(Boolean);
    });
  }

  function createFavorites(storage) {
    var key = "purrfect.favorites.v1";

    function read() {
      try {
        var parsed = JSON.parse(storage.getItem(key) || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return parsed;
      } catch (err) {
        return {};
      }
    }

    function write(all) {
      storage.setItem(key, JSON.stringify(all));
    }

    return {
      all: function () {
        var saved = read();
        return Object.keys(saved).map(function (id) { return saved[id]; });
      },
      has: function (id) {
        return Boolean(read()[id]);
      },
      save: function (pet) {
        var all = read();
        all[pet.id] = pet;
        write(all);
      },
      remove: function (id) {
        var all = read();
        delete all[id];
        write(all);
      },
      toggle: function (pet) {
        if (this.has(pet.id)) {
          this.remove(pet.id);
          return false;
        }
        this.save(pet);
        return true;
      }
    };
  }

  function addressLines(rescue) {
    var cityLine = [rescue.city, rescue.region, rescue.postalCode].filter(Boolean).join(", ");
    return [rescue.street, cityLine].filter(Boolean);
  }

  function mapEmbed(rescue) {
    if (typeof rescue.lat !== "number" || typeof rescue.lon !== "number") return null;
    var lat = rescue.lat;
    var lon = rescue.lon;
    var pad = 0.02;
    var bbox = [lon - pad, lat - pad, lon + pad, lat + pad].join(",");
    return {
      embed: "https://www.openstreetmap.org/export/embed.html?bbox=" +
        encodeURIComponent(bbox) + "&layer=mapnik&marker=" + encodeURIComponent(lat + "," + lon),
      link: "https://www.openstreetmap.org/?mlat=" + encodeURIComponent(lat) +
        "&mlon=" + encodeURIComponent(lon) + "#map=14/" + lat + "/" + lon
    };
  }

  return {
    API: API,
    REGIONS: REGIONS,
    buildSearchParams: buildSearchParams,
    normalize: normalize,
    searchPets: searchPets,
    getPet: getPet,
    suggestBreeds: suggestBreeds,
    createFavorites: createFavorites,
    addressLines: addressLines,
    mapEmbed: mapEmbed
  };
});
