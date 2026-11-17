var assert = require("assert");
var api = require("../assets/js/api.js");

var kingCounty = api.buildSearchParams({
  region: "kc",
  species: "Dog",
  sex: "Female",
  age: "Adult",
  size: "Large",
  breed: "labrador",
  page: 2
});
assert.strictEqual(kingCounty.get("near"), "98101");
assert.strictEqual(kingCounty.get("miles"), "50");
assert.strictEqual(kingCounty.get("species"), "Dog");
assert.strictEqual(kingCounty.get("sex"), "Female");
assert.strictEqual(kingCounty.get("age"), "Adult");
assert.strictEqual(kingCounty.get("size"), "Large");
assert.strictEqual(kingCounty.get("q"), "labrador");
assert.strictEqual(kingCounty.get("sort"), "distance");
assert.strictEqual(kingCounty.get("page"), "2");
assert.strictEqual(kingCounty.get("found"), "exclude");
assert.strictEqual(kingCounty.get("lang"), "en");

var spain = api.buildSearchParams({ region: "es" });
assert.strictEqual(spain.get("country"), "ES");
assert.strictEqual(spain.get("sort"), "photo");
assert.strictEqual(spain.get("near"), null);

assert.throws(function () {
  api.buildSearchParams({ region: "zip", zip: "902" });
}, function (err) {
  return err.code === "ZIP";
});

var zip = api.buildSearchParams({ region: "zip", zip: " 98101 " });
assert.strictEqual(zip.get("near"), "98101");

var pet = api.normalize({
  id: "es-zgz-1",
  name: "Kiara",
  species: "Dog",
  breeds: ["Podenco", ""],
  sex: "Female",
  age_group: "Adult",
  summary: "Loves walks.",
  photos: [{ small: "https://example.com/a.avif", large: "https://example.com/b.avif" }],
  listing_url: "https://example.com/list",
  rescue: {
    name: "City shelter",
    phone: "+34 976 72 62 72",
    email: "shelter@example.com",
    place: { street: "Calle del Romero 22", city: "Zaragoza", region: "Aragón", lat: 41.58, lon: -0.83 }
  }
});
assert.strictEqual(pet.photo, "https://example.com/a.avif");
assert.deepStrictEqual(pet.breeds, ["Podenco"]);
assert.strictEqual(pet.rescue.city, "Zaragoza");
assert.deepStrictEqual(api.addressLines(pet.rescue), ["Calle del Romero 22", "Zaragoza, Aragón"]);
var map = api.mapEmbed(pet.rescue);
assert.ok(map.embed.indexOf("openstreetmap.org") !== -1);
assert.ok(map.link.indexOf("mlat=41.58") !== -1);
assert.strictEqual(api.mapEmbed({ lat: null, lon: null }), null);

var memory = {
  store: {},
  getItem: function (key) { return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null; },
  setItem: function (key, value) { this.store[key] = value; }
};
var favorites = api.createFavorites(memory);
assert.strictEqual(favorites.toggle(pet), true);
assert.strictEqual(favorites.has("es-zgz-1"), true);
assert.strictEqual(favorites.all().length, 1);
assert.strictEqual(favorites.toggle(pet), false);
assert.strictEqual(favorites.all().length, 0);
favorites.save(pet);
memory.setItem("purrfect.favorites.v1", "{");
assert.deepStrictEqual(favorites.all(), []);

var blank = api.normalize({ id: "x", photos: [] });
assert.strictEqual(blank.name, "Unnamed pet");
assert.strictEqual(blank.photo, "");

console.log("api tests passed");
